# @radzor/pdf-generate — PDF generation

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class PdfGenerateConfig:
    page_size: str = "A4"
    margin: str = "20mm"
    landscape: bool = False


@dataclass
class PdfOptions:
    page_size: str | None = None
    margin: str | None = None
    landscape: bool | None = None


_PAGE_SIZES: dict[str, tuple[int, int]] = {
    "A4": (595, 842),
    "Letter": (612, 792),
    "Legal": (612, 1008),
}


class PdfGenerate:
    def __init__(self, config: PdfGenerateConfig | None = None) -> None:
        cfg = config or PdfGenerateConfig()
        self._page_size = cfg.page_size
        self._margin = cfg.margin
        self._landscape = cfg.landscape
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def from_html(self, html: str, options: PdfOptions | None = None) -> bytes:
        """Generate a PDF from HTML content."""
        try:
            opts = options or PdfOptions()
            page_size = opts.page_size or self._page_size
            landscape = opts.landscape if opts.landscape is not None else self._landscape
            w, h = _PAGE_SIZES[page_size]
            if landscape:
                w, h = h, w

            text = self._strip_html(html)
            lines = self._wrap_text(text, 80)
            pdf_bytes = self._build_pdf(lines, w, h)

            pages = max(1, len(lines) // 50 + (1 if len(lines) % 50 else 0))
            self._emit("onGenerated", {"pages": pages, "size": len(pdf_bytes)})
            return pdf_bytes

        except Exception as e:
            self._emit("onError", {"code": "GENERATION_FAILED", "message": str(e)})
            raise

    def from_template(self, template: str, data: dict[str, Any], options: PdfOptions | None = None) -> bytes:
        """Generate a PDF from an HTML template with variable substitution."""
        html = template
        for key, value in data.items():
            html = re.sub(r"\{\{\s*" + re.escape(key) + r"\s*\}\}", str(value), html)
        return self.from_html(html, options)

    def to_file(self, html: str, output_path: str, options: PdfOptions | None = None) -> None:
        """Generate a PDF and save to a file."""
        pdf = self.from_html(html, options)
        with open(output_path, "wb") as f:
            f.write(pdf)

    # ─── PDF Builder ────────────────────────────────────────

    def _build_pdf(self, lines: list[str], page_width: int, page_height: int) -> bytes:
        margin = 56
        font_size = 10
        line_height = 14
        usable_height = page_height - margin * 2
        lines_per_page = usable_height // line_height

        page_groups: list[list[str]] = []
        for i in range(0, max(1, len(lines)), max(1, lines_per_page)):
            page_groups.append(lines[i:i + lines_per_page])
        if not page_groups:
            page_groups = [[""]]

        objects: list[str] = []
        obj_id = [0]

        def add_obj(content: str) -> int:
            obj_id[0] += 1
            objects.append(content)
            return obj_id[0]

        # Catalog
        add_obj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj")
        # Pages placeholder
        pages_idx = add_obj("")

        page_obj_ids: list[int] = []
        for page_lines in page_groups:
            stream = f"BT\n/F1 {font_size} Tf\n"
            y = page_height - margin
            for line in page_lines:
                escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
                stream += f"{margin} {y} Td\n({escaped}) Tj\n0 {-line_height} Td\n"
                y -= line_height
            stream += "ET"

            stream_id = add_obj(
                f"{obj_id[0]+1} 0 obj\n<< /Length {len(stream)} >>\nstream\n{stream}\nendstream\nendobj"
            )
            page_id = add_obj(
                f"{obj_id[0]+1} 0 obj\n<< /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {page_width} {page_height}] "
                f"/Contents {stream_id} 0 R "
                f"/Resources << /Font << /F1 FONTREF >> >> >>\nendobj"
            )
            objects[stream_id - 1] = f"{stream_id} 0 obj\n<< /Length {len(stream)} >>\nstream\n{stream}\nendstream\nendobj"
            objects[page_id - 1] = (
                f"{page_id} 0 obj\n<< /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {page_width} {page_height}] "
                f"/Contents {stream_id} 0 R "
                f"/Resources << /Font << /F1 FONTREF >> >> >>\nendobj"
            )
            page_obj_ids.append(page_id)

        # Font
        font_id = add_obj(
            f"{obj_id[0]+1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj"
        )

        # Fix font refs
        for pid in page_obj_ids:
            objects[pid - 1] = objects[pid - 1].replace("FONTREF", f"{font_id} 0 R")

        # Pages
        kids = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
        objects[pages_idx - 1] = f"2 0 obj\n<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_ids)} >>\nendobj"

        # Assemble
        pdf = "%PDF-1.4\n"
        offsets: list[int] = []
        for obj in objects:
            offsets.append(len(pdf))
            pdf += obj + "\n"

        xref_offset = len(pdf)
        pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
        for offset in offsets:
            pdf += f"{str(offset).zfill(10)} 00000 n \n"
        pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF"

        return pdf.encode("latin-1")

    def _strip_html(self, html: str) -> str:
        text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
        text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</div>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</h[1-6]>", "\n\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</li>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<li[^>]*>", "  • ", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " ")
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _wrap_text(self, text: str, max_chars: int) -> list[str]:
        result: list[str] = []
        for paragraph in text.split("\n"):
            if len(paragraph) <= max_chars:
                result.append(paragraph)
                continue
            words = paragraph.split(" ")
            line = ""
            for word in words:
                if len((line + " " + word).strip()) > max_chars:
                    if line:
                        result.append(line)
                    line = word
                else:
                    line = (line + " " + word).strip()
            if line:
                result.append(line)
        return result
