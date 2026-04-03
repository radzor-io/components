# @radzor/cron-scheduler — In-process cron scheduler

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable


@dataclass
class CronSchedulerConfig:
    timezone: str = "UTC"


@dataclass
class CronFields:
    minute: list[int] = field(default_factory=list)
    hour: list[int] = field(default_factory=list)
    day_of_month: list[int] = field(default_factory=list)
    month: list[int] = field(default_factory=list)
    day_of_week: list[int] = field(default_factory=list)


@dataclass
class JobEntry:
    id: str
    expression: str
    handler: Callable
    interval_sec: float | None = None
    cron_fields: CronFields | None = None
    timer: threading.Timer | None = None


class CronScheduler:
    def __init__(self, config: CronSchedulerConfig | None = None) -> None:
        self._timezone = (config or CronSchedulerConfig()).timezone
        self._jobs: dict[str, JobEntry] = {}
        self._running = False
        self._lock = threading.Lock()
        self._check_thread: threading.Thread | None = None
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def schedule(self, job_id: str, expression: str, handler: Callable) -> None:
        """Schedule a recurring job."""
        if job_id in self._jobs:
            self.unschedule(job_id)

        entry = JobEntry(id=job_id, expression=expression, handler=handler)

        # Parse interval expressions: "every 30s", "every 5m", "every 1h"
        match = re.match(r"^every\s+(\d+)(s|m|h)$", expression, re.IGNORECASE)
        if match:
            value = int(match.group(1))
            unit = match.group(2).lower()
            multipliers = {"s": 1, "m": 60, "h": 3600}
            entry.interval_sec = value * multipliers[unit]
        else:
            entry.cron_fields = self._parse_cron(expression)

        with self._lock:
            self._jobs[job_id] = entry

        if self._running and entry.interval_sec:
            self._start_interval_job(entry)

    def unschedule(self, job_id: str) -> None:
        """Remove a scheduled job."""
        with self._lock:
            job = self._jobs.pop(job_id, None)
        if job and job.timer:
            job.timer.cancel()

    def start(self) -> None:
        """Start the scheduler."""
        if self._running:
            return
        self._running = True

        # Start interval jobs
        with self._lock:
            for job in self._jobs.values():
                if job.interval_sec:
                    self._start_interval_job(job)

        # Background thread for cron checking
        self._check_thread = threading.Thread(target=self._cron_loop, daemon=True)
        self._check_thread.start()

    def stop(self) -> None:
        """Stop the scheduler gracefully."""
        self._running = False
        with self._lock:
            for job in self._jobs.values():
                if job.timer:
                    job.timer.cancel()

    def get_jobs(self) -> list[str]:
        with self._lock:
            return list(self._jobs.keys())

    def _start_interval_job(self, job: JobEntry) -> None:
        def run_and_reschedule():
            if not self._running:
                return
            self._execute_job(job)
            if self._running and job.interval_sec:
                job.timer = threading.Timer(job.interval_sec, run_and_reschedule)
                job.timer.daemon = True
                job.timer.start()

        job.timer = threading.Timer(job.interval_sec, run_and_reschedule)
        job.timer.daemon = True
        job.timer.start()

    def _cron_loop(self) -> None:
        last_minute = -1
        while self._running:
            now = datetime.now(timezone.utc)
            current_minute = now.minute

            if current_minute != last_minute and now.second == 0:
                last_minute = current_minute
                with self._lock:
                    jobs = list(self._jobs.values())
                for job in jobs:
                    if job.cron_fields and self._matches_cron(job.cron_fields, now):
                        threading.Thread(target=self._execute_job, args=(job,), daemon=True).start()

            time.sleep(0.5)

    def _execute_job(self, job: JobEntry) -> None:
        start = time.time()
        self._emit("onJobStart", {"jobId": job.id, "scheduledAt": start})
        try:
            job.handler()
            self._emit("onJobComplete", {"jobId": job.id, "duration": time.time() - start})
        except Exception as e:
            self._emit("onJobError", {"jobId": job.id, "error": str(e)})

    def _matches_cron(self, fields: CronFields, dt: datetime) -> bool:
        return (
            dt.minute in fields.minute
            and dt.hour in fields.hour
            and dt.day in fields.day_of_month
            and dt.month in fields.month
            and dt.weekday() in [d % 7 for d in fields.day_of_week]  # convert Sunday=0 to Python Monday=0
        )

    def _parse_cron(self, expr: str) -> CronFields:
        parts = expr.strip().split()
        if len(parts) != 5:
            raise ValueError(f'Invalid cron expression: "{expr}". Expected 5 fields.')
        return CronFields(
            minute=self._parse_field(parts[0], 0, 59),
            hour=self._parse_field(parts[1], 0, 23),
            day_of_month=self._parse_field(parts[2], 1, 31),
            month=self._parse_field(parts[3], 1, 12),
            day_of_week=self._parse_field(parts[4], 0, 6),
        )

    def _parse_field(self, field: str, min_val: int, max_val: int) -> list[int]:
        values: list[int] = []
        for part in field.split(","):
            if part == "*":
                values.extend(range(min_val, max_val + 1))
            elif "/" in part:
                range_part, step_str = part.split("/")
                step = int(step_str)
                start = min_val if range_part == "*" else int(range_part)
                values.extend(range(start, max_val + 1, step))
            elif "-" in part:
                a, b = part.split("-")
                values.extend(range(int(a), int(b) + 1))
            else:
                values.append(int(part))
        return values
