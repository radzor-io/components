# @radzor/csv-export — CSV generation and parsing

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class CsvConfig:
    delimiter: str = ","
    include_headers: bool = True
    quote_all: bool = False


class CsvExport:
    def __init__(self, config: CsvConfig | None = None) -> None:
        cfg = config or CsvConfig()
        self._delimiter = cfg.delimiter
        self._include_headers = cfg.include_headers
        self._quote_all = cfg.quote_all
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def generate(self, data: list[dict[str, Any]]) -> str:
        try:
            if not data:
                return ""

            headers = list(data[0].keys())
            lines: list[str] = []

            if self._include_headers:
                lines.append(self._delimiter.join(self._escape(h) for h in headers))

            for row in data:
                values = [self._escape(str(row.get(h, ""))) for h in headers]
                lines.append(self._delimiter.join(values))

            csv = "\n".join(lines)
            self._emit("onGenerated", {"rows": len(data), "size": len(csv)})
            return csv
        except Exception as e:
            self._emit("onError", {"code": "GENERATE_ERROR", "message": str(e)})
            raise

    def generate_from_arrays(self, headers: list[str], rows: list[list[Any]]) -> str:
        try:
            lines: list[str] = []

            if self._include_headers:
                lines.append(self._delimiter.join(self._escape(h) for h in headers))

            for row in rows:
                values = [self._escape(str(v if v is not None else "")) for v in row]
                lines.append(self._delimiter.join(values))

            csv = "\n".join(lines)
            self._emit("onGenerated", {"rows": len(rows), "size": len(csv)})
            return csv
        except Exception as e:
            self._emit("onError", {"code": "GENERATE_ERROR", "message": str(e)})
            raise

    def parse(self, csv: str) -> list[dict[str, str]]:
        try:
            lines = self._parse_lines(csv)
            if not lines:
                return []

            headers = lines[0]
            result: list[dict[str, str]] = []

            for i in range(1, len(lines)):
                row: dict[str, str] = {}
                for j, h in enumerate(headers):
                    row[h] = lines[i][j] if j < len(lines[i]) else ""
                result.append(row)

            return result
        except Exception as e:
            self._emit("onError", {"code": "PARSE_ERROR", "message": str(e)})
            raise

    def to_file(self, file_path: str, data: list[dict[str, Any]]) -> None:
        csv = self.generate(data)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(csv)

    def _escape(self, value: str) -> str:
        needs_quoting = self._quote_all or self._delimiter in value or '"' in value or "\n" in value
        if needs_quoting:
            return '"' + value.replace('"', '""') + '"'
        return value

    def _parse_lines(self, csv: str) -> list[list[str]]:
        result: list[list[str]] = []
        current: list[str] = []
        field = ""
        in_quotes = False
        i = 0

        while i < len(csv):
            char = csv[i]

            if in_quotes:
                if char == '"':
                    if i + 1 < len(csv) and csv[i + 1] == '"':
                        field += '"'
                        i += 1
                    else:
                        in_quotes = False
                else:
                    field += char
            else:
                if char == '"':
                    in_quotes = True
                elif char == self._delimiter:
                    current.append(field)
                    field = ""
                elif char == "\n" or (char == "\r" and i + 1 < len(csv) and csv[i + 1] == "\n"):
                    current.append(field)
                    result.append(current)
                    current = []
                    field = ""
                    if char == "\r":
                        i += 1
                else:
                    field += char
            i += 1

        current.append(field)
        if any(f for f in current):
            result.append(current)

        return result
