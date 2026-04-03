# @radzor/queue-worker — In-memory job queue with workers and retries

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Generic, TypeVar

T = TypeVar("T")


@dataclass
class Job:
    id: str
    data: Any
    attempts: int = 0
    max_retries: int = 3
    status: str = "pending"  # pending | active | completed | failed
    error: str | None = None
    created_at: float = 0.0
    completed_at: float | None = None


class QueueWorker:
    def __init__(
        self,
        concurrency: int = 1,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ) -> None:
        self._concurrency = concurrency
        self._max_retries = max_retries
        self._retry_delay = retry_delay
        self._queue: list[Job] = []
        self._dead_letter: list[Job] = []
        self._active_count = 0
        self._running = False
        self._processor: Callable[[Any], None] | None = None
        self._id_counter = 0
        self._lock = threading.Lock()
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def add_job(self, data: Any) -> Job:
        with self._lock:
            self._id_counter += 1
            job = Job(
                id=f"job_{self._id_counter}_{int(time.time() * 1000)}",
                data=data,
                max_retries=self._max_retries,
                created_at=time.time(),
            )
            self._queue.append(job)

        if self._running:
            self._tick()
        return job

    def process(self, handler: Callable[[Any], None]) -> None:
        self._processor = handler

    def start(self) -> None:
        self._running = True
        self._tick()

    def stop(self) -> None:
        self._running = False

    def get_queue(self) -> list[Job]:
        return list(self._queue)

    def get_dead_letter(self) -> list[Job]:
        return list(self._dead_letter)

    def _tick(self) -> None:
        if not self._running or not self._processor:
            return

        with self._lock:
            while self._active_count < self._concurrency:
                job = next((j for j in self._queue if j.status == "pending"), None)
                if not job:
                    break
                job.status = "active"
                self._active_count += 1
                thread = threading.Thread(target=self._process_job, args=(job,), daemon=True)
                thread.start()

    def _process_job(self, job: Job) -> None:
        try:
            job.attempts += 1
            self._processor(job.data)
            job.status = "completed"
            job.completed_at = time.time()
            self._emit("onJobComplete", job)
        except Exception as e:
            job.error = str(e)
            if job.attempts < job.max_retries:
                job.status = "pending"
                time.sleep(self._retry_delay)
            else:
                job.status = "failed"
                self._dead_letter.append(job)
                self._emit("onJobFailed", job)
        finally:
            with self._lock:
                self._active_count -= 1
            self._tick()
