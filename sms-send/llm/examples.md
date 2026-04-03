# @radzor/sms-send — Usage Examples

## TypeScript

### Send verification code
```typescript
import { SmsSend } from "@radzor/sms-send";

const sms = new SmsSend({
  provider: "twilio",
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  fromNumber: "+15551234567",
});

const code = Math.floor(100000 + Math.random() * 900000);
await sms.send(user.phone, `Your code is ${code}. Valid for 5 minutes.`);
```

### Batch notification
```typescript
const users = await db.getActiveUsers();
const messages = users.map((u) => ({
  to: u.phone,
  body: `Hi ${u.name}, your subscription renews tomorrow.`,
}));
const results = await sms.sendBatch(messages);
console.log(`Sent ${results.length} messages`);
```

### Event listeners
```typescript
sms.on("onSent", ({ to, messageSid }) => {
  console.log(`SMS sent to ${to}: ${messageSid}`);
});

sms.on("onError", ({ to, message }) => {
  console.error(`Failed to send to ${to}: ${message}`);
});
```

## Python

### Send verification code
```python
from sms_send import SmsSend, SmsSendConfig
import os, random

sms = SmsSend(SmsSendConfig(
    provider="twilio",
    account_sid=os.environ["TWILIO_ACCOUNT_SID"],
    auth_token=os.environ["TWILIO_AUTH_TOKEN"],
    from_number="+15551234567",
))

code = random.randint(100000, 999999)
sms.send("+15559876543", f"Your code is {code}. Valid for 5 minutes.")
```

### Vonage provider
```python
sms = SmsSend(SmsSendConfig(
    provider="vonage",
    account_sid=os.environ["VONAGE_API_KEY"],
    auth_token=os.environ["VONAGE_API_SECRET"],
    from_number="MyApp",
))

sms.send("+33612345678", "Bienvenue sur notre plateforme !")
```

### Flask endpoint
```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/api/send-sms", methods=["POST"])
def send_sms():
    data = request.get_json()
    result = sms.send(data["to"], data["body"])
    return jsonify({"sid": result.message_sid, "status": result.status})
```
