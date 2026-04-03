# @radzor/email-send — Send emails via Resend, SendGrid, or SMTP

from __future__ import annotations

import base64
import json
import smtplib
import uuid
from dataclasses import dataclass, field
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from typing import Any, Callable, Literal
from urllib.request import Request, urlopen


@dataclass
class EmailSendConfig:
    provider: Literal["resend", "sendgrid", "smtp"]
    from_addr: str
    api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 0
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_secure: bool = False


@dataclass
class EmailAttachment:
    filename: str
    content: str | bytes
    content_type: str = "application/octet-stream"


@dataclass
class EmailMessage:
    to: str | list[str]
    subject: str
    html: str = ""
    text: str = ""
    cc: str | list[str] | None = None
    bcc: str | list[str] | None = None
    reply_to: str = ""
    attachments: list[EmailAttachment] = field(default_factory=list)


@dataclass
class SendResult:
    id: str
    to: list[str]
    status: Literal["sent", "queued"]


class EmailSend:
    def __init__(self, config: EmailSendConfig) -> None:
        if config.provider != "smtp" and not config.api_key:
            raise ValueError(f'"api_key" is required for provider "{config.provider}"')
        if config.provider == "smtp" and not config.smtp_host:
            raise ValueError('"smtp_host" is required for SMTP provider')
        self._config = config
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def send(self, message: EmailMessage) -> SendResult:
        """Send an email."""
        to_list = message.to if isinstance(message.to, list) else [message.to]

        if not message.html and not message.text:
            err = {"code": "MISSING_CONTENT", "message": "Either html or text content is required", "provider": self._config.provider}
            self._emit("onError", err)
            raise ValueError(err["message"])

        try:
            if self._config.provider == "resend":
                result = self._send_resend(message, to_list)
            elif self._config.provider == "sendgrid":
                result = self._send_sendgrid(message, to_list)
            else:
                result = self._send_smtp(message, to_list)

            self._emit("onSent", result)
            return result
        except Exception as e:
            self._emit("onError", {"code": "SEND_FAILED", "message": str(e), "provider": self._config.provider})
            raise

    def send_batch(self, recipients: list[str], subject: str, html: str = "", text: str = "", **kwargs: Any) -> list[SendResult]:
        """Send the same email to multiple recipients individually."""
        results = []
        for to in recipients:
            msg = EmailMessage(to=to, subject=subject, html=html, text=text, **kwargs)
            results.append(self.send(msg))
        return results

    # ─── Resend ─────────────────────────────────────────────

    def _send_resend(self, message: EmailMessage, to: list[str]) -> SendResult:
        body: dict[str, Any] = {
            "from": self._config.from_addr,
            "to": to,
            "subject": message.subject,
        }
        if message.html:
            body["html"] = message.html
        if message.text:
            body["text"] = message.text
        if message.cc:
            body["cc"] = message.cc if isinstance(message.cc, list) else [message.cc]
        if message.bcc:
            body["bcc"] = message.bcc if isinstance(message.bcc, list) else [message.bcc]
        if message.reply_to:
            body["reply_to"] = message.reply_to
        if message.attachments:
            body["attachments"] = [
                {
                    "filename": a.filename,
                    "content": base64.b64encode(a.content).decode() if isinstance(a.content, bytes) else a.content,
                    "content_type": a.content_type,
                }
                for a in message.attachments
            ]

        req = Request(
            "https://api.resend.com/emails",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self._config.api_key}"},
            method="POST",
        )
        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        return SendResult(id=data["id"], to=to, status="sent")

    # ─── SendGrid ───────────────────────────────────────────

    def _send_sendgrid(self, message: EmailMessage, to: list[str]) -> SendResult:
        personalizations: dict[str, Any] = {"to": [{"email": e} for e in to]}
        if message.cc:
            cc_list = message.cc if isinstance(message.cc, list) else [message.cc]
            personalizations["cc"] = [{"email": e} for e in cc_list]
        if message.bcc:
            bcc_list = message.bcc if isinstance(message.bcc, list) else [message.bcc]
            personalizations["bcc"] = [{"email": e} for e in bcc_list]

        content = []
        if message.text:
            content.append({"type": "text/plain", "value": message.text})
        if message.html:
            content.append({"type": "text/html", "value": message.html})

        body: dict[str, Any] = {
            "personalizations": [personalizations],
            "from": {"email": self._config.from_addr},
            "subject": message.subject,
            "content": content,
        }
        if message.reply_to:
            body["reply_to"] = {"email": message.reply_to}
        if message.attachments:
            body["attachments"] = [
                {
                    "filename": a.filename,
                    "content": base64.b64encode(a.content).decode() if isinstance(a.content, bytes) else a.content,
                    "type": a.content_type,
                    "disposition": "attachment",
                }
                for a in message.attachments
            ]

        req = Request(
            "https://api.sendgrid.com/v3/mail/send",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self._config.api_key}"},
            method="POST",
        )
        with urlopen(req) as resp:
            msg_id = resp.headers.get("x-message-id", str(uuid.uuid4()))
        return SendResult(id=msg_id, to=to, status="queued")

    # ─── SMTP ───────────────────────────────────────────────

    def _send_smtp(self, message: EmailMessage, to: list[str]) -> SendResult:
        port = self._config.smtp_port or (465 if self._config.smtp_secure else 587)

        msg = MIMEMultipart("alternative") if message.html and message.text else MIMEMultipart()
        msg["From"] = self._config.from_addr
        msg["To"] = ", ".join(to)
        msg["Subject"] = message.subject

        if message.cc:
            cc_list = message.cc if isinstance(message.cc, list) else [message.cc]
            msg["Cc"] = ", ".join(cc_list)
            to = to + cc_list
        if message.reply_to:
            msg["Reply-To"] = message.reply_to

        if message.text:
            msg.attach(MIMEText(message.text, "plain", "utf-8"))
        if message.html:
            msg.attach(MIMEText(message.html, "html", "utf-8"))

        for att in message.attachments:
            part = MIMEBase("application", "octet-stream")
            content = att.content if isinstance(att.content, bytes) else att.content.encode()
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f'attachment; filename="{att.filename}"')
            msg.attach(part)

        if self._config.smtp_secure:
            server = smtplib.SMTP_SSL(self._config.smtp_host, port, timeout=30)
        else:
            server = smtplib.SMTP(self._config.smtp_host, port, timeout=30)
            server.starttls()

        try:
            if self._config.smtp_user:
                server.login(self._config.smtp_user, self._config.smtp_pass)
            server.sendmail(self._config.from_addr, to, msg.as_string())
        finally:
            server.quit()

        return SendResult(id=str(uuid.uuid4()), to=to, status="sent")
