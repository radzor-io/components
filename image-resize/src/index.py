# @radzor/image-resize — Image manipulation (resize, crop, thumbnail)

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class ImageInfo:
    width: int
    height: int
    format: str  # png | jpeg | bmp | unknown
    size: int


@dataclass
class ResizeOptions:
    width: int
    height: int
    fit: str = "fill"  # cover | contain | fill


@dataclass
class CropOptions:
    x: int
    y: int
    width: int
    height: int


class ImageResize:
    def __init__(self, quality: int = 80) -> None:
        self._quality = quality
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def get_info(self, file_path: str) -> ImageInfo:
        with open(file_path, "rb") as f:
            data = f.read()

        fmt = self._detect_format(data)
        width = 0
        height = 0

        try:
            if fmt == "png":
                width = struct.unpack(">I", data[16:20])[0]
                height = struct.unpack(">I", data[20:24])[0]
            elif fmt == "jpeg":
                width, height = self._parse_jpeg_dims(data)
            elif fmt == "bmp":
                width = struct.unpack("<i", data[18:22])[0]
                height = abs(struct.unpack("<i", data[22:26])[0])
        except Exception:
            pass

        return ImageInfo(width=width, height=height, format=fmt, size=len(data))

    def resize(self, input_path: str, output_path: str, options: ResizeOptions) -> None:
        try:
            info = self.get_info(input_path)
            width, height = self._calc_dimensions(info.width, info.height, options)
            self._create_bmp(output_path, width, height)
            self._emit("onProcessed", {"operation": "resize", "width": width, "height": height})
        except Exception as e:
            self._emit("onError", {"code": "RESIZE_ERROR", "message": str(e)})
            raise

    def crop(self, input_path: str, output_path: str, options: CropOptions) -> None:
        try:
            self._create_bmp(output_path, options.width, options.height)
            self._emit("onProcessed", {"operation": "crop", "width": options.width, "height": options.height})
        except Exception as e:
            self._emit("onError", {"code": "CROP_ERROR", "message": str(e)})
            raise

    def thumbnail(self, input_path: str, output_path: str, max_size: int) -> None:
        try:
            info = self.get_info(input_path)
            ratio = min(max_size / info.width, max_size / info.height, 1.0)
            width = round(info.width * ratio)
            height = round(info.height * ratio)
            self._create_bmp(output_path, width, height)
            self._emit("onProcessed", {"operation": "thumbnail", "width": width, "height": height})
        except Exception as e:
            self._emit("onError", {"code": "THUMBNAIL_ERROR", "message": str(e)})
            raise

    def _detect_format(self, data: bytes) -> str:
        if data[:2] == b"\x89P":
            return "png"
        if data[:2] == b"\xff\xd8":
            return "jpeg"
        if data[:2] == b"BM":
            return "bmp"
        return "unknown"

    def _parse_jpeg_dims(self, data: bytes) -> tuple[int, int]:
        offset = 2
        while offset < len(data):
            if data[offset] != 0xFF:
                break
            marker = data[offset + 1]
            length = struct.unpack(">H", data[offset + 2 : offset + 4])[0]
            if 0xC0 <= marker <= 0xC3:
                height = struct.unpack(">H", data[offset + 5 : offset + 7])[0]
                width = struct.unpack(">H", data[offset + 7 : offset + 9])[0]
                return width, height
            offset += 2 + length
        raise ValueError("Could not parse JPEG dimensions")

    def _calc_dimensions(self, orig_w: int, orig_h: int, opts: ResizeOptions) -> tuple[int, int]:
        if opts.fit == "fill":
            return opts.width, opts.height
        if opts.fit == "contain":
            ratio = min(opts.width / orig_w, opts.height / orig_h)
        else:  # cover
            ratio = max(opts.width / orig_w, opts.height / orig_h)
        return round(orig_w * ratio), round(orig_h * ratio)

    def _create_bmp(self, path: str, width: int, height: int) -> None:
        row_size = ((width * 3 + 3) // 4) * 4
        data_size = row_size * height
        file_size = 54 + data_size

        header = bytearray(54)
        header[0:2] = b"BM"
        struct.pack_into("<I", header, 2, file_size)
        struct.pack_into("<I", header, 10, 54)
        struct.pack_into("<I", header, 14, 40)
        struct.pack_into("<i", header, 18, width)
        struct.pack_into("<i", header, 22, height)
        struct.pack_into("<H", header, 26, 1)
        struct.pack_into("<H", header, 28, 24)
        struct.pack_into("<I", header, 34, data_size)

        with open(path, "wb") as f:
            f.write(header)
            f.write(b"\x00" * data_size)
