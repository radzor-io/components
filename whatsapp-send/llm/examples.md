# @radzor/whatsapp-send — Usage Examples

## Send a text message

```typescript
import { WhatsAppSend } from "@radzor/whatsapp-send";

const wa = new WhatsAppSend({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
});

const { messageId } = await wa.sendText("14155552671", "Your order has been shipped!");
console.log(`Sent: ${messageId}`);
```

## Send a text message with URL preview

```typescript
const { messageId } = await wa.sendText(
  "14155552671",
  "Check out our new product: https://example.com/product/123",
  true // enable URL preview
);
```

## Send a template message with parameters

```typescript
const { messageId } = await wa.sendTemplate(
  "14155552671",
  "order_update",
  "en_US",
  [
    {
      type: "body",
      parameters: [
        { type: "text", text: "ORDER-456" },
        { type: "text", text: "March 15, 2025" },
      ],
    },
    {
      type: "header",
      parameters: [
        { type: "image", image: { link: "https://example.com/receipt.png" } },
      ],
    },
  ]
);
console.log(`Template sent: ${messageId}`);
```

## Send media messages

```typescript
// Image
await wa.sendMedia("14155552671", "image", "https://example.com/photo.jpg", undefined, "Look at this!");

// Document
await wa.sendMedia("14155552671", "document", "https://example.com/invoice.pdf", undefined, "Your invoice");

// Audio
await wa.sendMedia("14155552671", "audio", "https://example.com/voice.ogg");

// Video with media ID (previously uploaded)
await wa.sendMedia("14155552671", "video", undefined, "media-id-123", "Check this out");
```

## Process webhook for delivery tracking

```typescript
import express from "express";

const app = express();
app.use(express.json());

wa.on("onMessageDelivered", ({ messageId, recipientPhone, timestamp }) => {
  console.log(`Message ${messageId} delivered to ${recipientPhone} at ${timestamp}`);
});

wa.on("onMessageRead", ({ messageId, recipientPhone }) => {
  console.log(`Message ${messageId} was read by ${recipientPhone}`);
});

app.post("/webhook/whatsapp", (req, res) => {
  wa.processWebhook(req.body);
  res.sendStatus(200);
});

// Meta webhook verification
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
```

## Mark incoming messages as read

```typescript
// When you receive a message via webhook, mark it as read
app.post("/webhook/whatsapp", async (req, res) => {
  const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
  for (const msg of messages) {
    await wa.markAsRead(msg.id);
    console.log(`Marked ${msg.id} as read`);
  }
  res.sendStatus(200);
});
```

---

## Python Examples

### Send text

```python
from whatsapp_send import WhatsAppSend, WhatsAppConfig
import os

wa = WhatsAppSend(WhatsAppConfig(
    access_token=os.environ["WHATSAPP_ACCESS_TOKEN"],
    phone_number_id=os.environ["WHATSAPP_PHONE_NUMBER_ID"],
))

result = wa.send_text("14155552671", "Your order has been shipped!")
print(f"Message ID: {result.message_id}")
```

### Send a template

```python
result = wa.send_template(
    "14155552671",
    "order_update",
    "en_US",
    [{"type": "body", "parameters": [{"type": "text", "text": "ORDER-456"}]}],
)
```

### Send an image

```python
result = wa.send_media(
    "14155552671",
    "image",
    media_url="https://example.com/photo.jpg",
    caption="Check this out!",
)
```

### Event handling

```python
wa.on("onMessageDelivered", lambda e: print(f"Delivered: {e['message_id']}"))
wa.on("onMessageRead", lambda e: print(f"Read: {e['message_id']}"))
```
