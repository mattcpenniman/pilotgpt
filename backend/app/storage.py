from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from threading import RLock
from typing import Any


COLLECTIONS = ("pilots", "aircraft", "trips", "flights", "fuel_logs", "reschedule_requests")


class JsonStore:
    """Small, thread-safe JSON collection store for demo use."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        for collection in COLLECTIONS:
            path = self._path(collection)
            if not path.exists():
                self._write(collection, [])

    def _path(self, collection: str) -> Path:
        if collection not in COLLECTIONS:
            raise ValueError(f"Unknown collection: {collection}")
        return self.data_dir / f"{collection}.json"

    def _read(self, collection: str) -> list[dict[str, Any]]:
        path = self._path(collection)
        try:
            with path.open(encoding="utf-8") as handle:
                value = json.load(handle)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid JSON in {path}") from exc
        if not isinstance(value, list):
            raise RuntimeError(f"Expected a JSON array in {path}")
        return value

    def _write(self, collection: str, records: list[dict[str, Any]]) -> None:
        path = self._path(collection)
        fd, temp_name = tempfile.mkstemp(prefix=f".{collection}-", suffix=".tmp", dir=self.data_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(records, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def all(self, collection: str) -> list[dict[str, Any]]:
        with self._lock:
            return self._read(collection)

    def get(self, collection: str, record_id: str) -> dict[str, Any] | None:
        with self._lock:
            return next((item for item in self._read(collection) if item["id"] == record_id), None)

    def create(self, collection: str, record: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            records = self._read(collection)
            records.append(record)
            self._write(collection, records)
            return record

    def replace(self, collection: str, record_id: str, record: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            records = self._read(collection)
            for index, existing in enumerate(records):
                if existing["id"] == record_id:
                    records[index] = record
                    self._write(collection, records)
                    return record
            return None

    def delete(self, collection: str, record_id: str) -> bool:
        with self._lock:
            records = self._read(collection)
            remaining = [item for item in records if item["id"] != record_id]
            if len(records) == len(remaining):
                return False
            self._write(collection, remaining)
            return True
