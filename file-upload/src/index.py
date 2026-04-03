# @radzor/file-upload — Server-side file upload to S3-compatible storage, local disk, or Cloudflare R2

from __future__ import annotations

import hashlib
import hmac
import os
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, BinaryIO, Callable, Literal
from urllib.parse import quote
from urllib.request import Request, urlopen


@dataclass
class FileUploadConfig:
    provider: Literal["s3", "local", "r2"]
    bucket: str = ""
    region: str = "us-east-1"
    access_key_id: str = ""
    secret_access_key: str = ""
    endpoint: str = ""
    local_dir: str = "./uploads"
    max_size_bytes: int = 50 * 1024 * 1024  # 50MB
    allowed_mime_types: list[str] = field(default_factory=lambda: [
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
        "application/pdf", "text/plain", "text/csv",
        "application/json", "application/zip",
    ])
    path_prefix: str = ""


@dataclass
class UploadResult:
    id: str
    url: str
    path: str
    size: int
    mime_type: str
    original_name: str


class FileUpload:
    def __init__(self, config: FileUploadConfig) -> None:
        self._config = config
        self._listeners: dict[str, list[Callable]] = {}

        if config.provider == "local":
            os.makedirs(config.local_dir, exist_ok=True)

        if config.provider in ("s3", "r2") and not config.bucket:
            raise ValueError(f'"bucket" is required for provider "{config.provider}"')

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def upload(self, data: bytes | BinaryIO, *, file_name: str, mime_type: str) -> UploadResult:
        """Upload a file from bytes or a file-like object."""
        if mime_type not in self._config.allowed_mime_types:
            err = {"code": "INVALID_MIME_TYPE", "message": f'MIME type "{mime_type}" not allowed.'}
            self._emit("onError", err)
            raise ValueError(err["message"])

        if hasattr(data, "read"):
            buffer = data.read()  # type: ignore[union-attr]
        else:
            buffer = data  # type: ignore[assignment]

        if len(buffer) > self._config.max_size_bytes:
            err = {"code": "FILE_TOO_LARGE", "message": f"File size {len(buffer)} exceeds max {self._config.max_size_bytes} bytes"}
            self._emit("onError", err)
            raise ValueError(err["message"])

        file_id = str(uuid.uuid4())
        ext = os.path.splitext(file_name)[1] or self._mime_to_ext(mime_type)
        storage_path = f"{self._config.path_prefix}{file_id}{ext}"

        self._emit("onProgress", {"bytesUploaded": 0, "totalBytes": len(buffer), "percent": 0})

        if self._config.provider == "local":
            url = self._upload_local(storage_path, buffer)
        else:
            url = self._upload_s3(storage_path, buffer, mime_type)

        self._emit("onProgress", {"bytesUploaded": len(buffer), "totalBytes": len(buffer), "percent": 100})

        result = UploadResult(
            id=file_id, url=url, path=storage_path,
            size=len(buffer), mime_type=mime_type, original_name=file_name,
        )
        self._emit("onComplete", result)
        return result

    def delete(self, path: str) -> None:
        """Delete a previously uploaded file."""
        if self._config.provider == "local":
            self._delete_local(path)
        else:
            self._delete_s3(path)

    def get_presigned_url(self, file_name: str, mime_type: str, expires_in: int = 3600) -> dict[str, Any]:
        """Generate a pre-signed URL for direct browser upload (S3/R2 only)."""
        if self._config.provider == "local":
            raise ValueError("Pre-signed URLs not supported for local provider")

        file_id = str(uuid.uuid4())
        ext = os.path.splitext(file_name)[1] or self._mime_to_ext(mime_type)
        path = f"{self._config.path_prefix}{file_id}{ext}"
        url = self._generate_presigned_put_url(path, mime_type, expires_in)
        return {"url": url, "fields": {"Content-Type": mime_type}, "path": path}

    # ─── Local Storage ──────────────────────────────────────

    def _upload_local(self, path: str, data: bytes) -> str:
        full_path = os.path.join(self._config.local_dir, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)
        return f"/uploads/{path}"

    def _delete_local(self, path: str) -> None:
        full_path = os.path.join(self._config.local_dir, path)
        if os.path.exists(full_path):
            os.unlink(full_path)

    # ─── S3 / R2 ────────────────────────────────────────────

    def _get_s3_endpoint(self) -> str:
        if self._config.endpoint:
            return f"{self._config.endpoint}/{self._config.bucket}"
        if self._config.provider == "r2":
            raise ValueError("R2 requires an explicit endpoint URL")
        return f"https://{self._config.bucket}.s3.{self._config.region}.amazonaws.com"

    def _upload_s3(self, path: str, data: bytes, mime_type: str) -> str:
        endpoint = self._get_s3_endpoint()
        url = f"{endpoint}/{path}"
        headers = self._sign_s3_request("PUT", path, {
            "Content-Type": mime_type,
            "Content-Length": str(len(data)),
        })

        req = Request(url, data=data, headers=headers, method="PUT")
        with urlopen(req) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"S3 upload failed ({resp.status}): {resp.read().decode()}")
        return url

    def _delete_s3(self, path: str) -> None:
        endpoint = self._get_s3_endpoint()
        url = f"{endpoint}/{path}"
        headers = self._sign_s3_request("DELETE", path, {})
        req = Request(url, headers=headers, method="DELETE")
        try:
            with urlopen(req):
                pass
        except Exception:
            pass  # 404 is fine for delete

    def _generate_presigned_put_url(self, path: str, mime_type: str, expires_in: int) -> str:
        endpoint = self._get_s3_endpoint()
        now = datetime.now(timezone.utc)
        timestamp = now.strftime("%Y%m%dT%H%M%SZ")
        date = now.strftime("%Y%m%d")

        params = (
            f"X-Amz-Algorithm=AWS4-HMAC-SHA256"
            f"&X-Amz-Credential={quote(self._config.access_key_id)}/{date}/{self._config.region}/s3/aws4_request"
            f"&X-Amz-Date={timestamp}"
            f"&X-Amz-Expires={expires_in}"
            f"&X-Amz-SignedHeaders=content-type;host"
            f"&Content-Type={quote(mime_type)}"
        )
        return f"{endpoint}/{path}?{params}"

    def _sign_s3_request(self, method: str, path: str, headers: dict[str, str]) -> dict[str, str]:
        now = datetime.now(timezone.utc)
        timestamp = now.strftime("%Y%m%dT%H%M%SZ")
        date = now.strftime("%Y%m%d")
        region = self._config.region
        service = "s3"

        endpoint = self._get_s3_endpoint()
        from urllib.parse import urlparse
        host = urlparse(endpoint).netloc

        all_headers = {**headers, "host": host, "x-amz-date": timestamp, "x-amz-content-sha256": "UNSIGNED-PAYLOAD"}
        signed_headers_list = sorted(all_headers.keys())
        signed_headers = ";".join(signed_headers_list)
        canonical_headers = "".join(f"{k}:{all_headers[k]}\n" for k in signed_headers_list)

        canonical_request = f"{method}\n/{path}\n\n{canonical_headers}\n{signed_headers}\nUNSIGNED-PAYLOAD"
        cr_hash = hashlib.sha256(canonical_request.encode()).hexdigest()

        scope = f"{date}/{region}/{service}/aws4_request"
        string_to_sign = f"AWS4-HMAC-SHA256\n{timestamp}\n{scope}\n{cr_hash}"

        def _hmac_sha256(key: bytes, msg: str) -> bytes:
            return hmac.new(key, msg.encode(), hashlib.sha256).digest()

        k_date = _hmac_sha256(f"AWS4{self._config.secret_access_key}".encode(), date)
        k_region = _hmac_sha256(k_date, region)
        k_service = _hmac_sha256(k_region, service)
        k_signing = _hmac_sha256(k_service, "aws4_request")

        signature = hmac.new(k_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()

        auth = (
            f"AWS4-HMAC-SHA256 Credential={self._config.access_key_id}/{scope},"
            f"SignedHeaders={signed_headers},"
            f"Signature={signature}"
        )

        return {**all_headers, "Authorization": auth}

    # ─── Utils ──────────────────────────────────────────────

    @staticmethod
    def _mime_to_ext(mime: str) -> str:
        mapping = {
            "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
            "image/webp": ".webp", "application/pdf": ".pdf",
            "text/plain": ".txt", "text/csv": ".csv",
            "application/json": ".json", "application/zip": ".zip",
        }
        return mapping.get(mime, ".bin")
