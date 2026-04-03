# How to integrate @radzor/sms-send

## Overview
SMS sending via Twilio or Vonage APIs. Supports single and batch messages with delivery status tracking.

## Integration Steps

### TypeScript

1. **Configure the component**:
```typescript
import { SmsSend } from "@radzor/sms-send";

const sms = new SmsSend({
  provider: "twilio",
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  fromNumber: "+15551234567",
});
```

2. **Send a message**:
```typescript
const result = await sms.send("+15559876543", "Your verification code is 123456");
console.log(result.messageSid);
```

3. **Send batch**:
```typescript
const results = await sms.sendBatch([
  { to: "+15551111111", body: "Hello User 1" },
  { to: "+15552222222", body: "Hello User 2" },
]);
```

### Python

No external dependencies.

1. **Configure the component**:
```python
from sms_send import SmsSend, SmsSendConfig
import os

sms = SmsSend(SmsSendConfig(
    provider="twilio",
    account_sid=os.environ["TWILIO_ACCOUNT_SID"],
    auth_token=os.environ["TWILIO_AUTH_TOKEN"],
    from_number="+15551234567",
))
```

2. **Send a message**:
```python
result = sms.send("+15559876543", "Your verification code is 123456")
print(result.message_sid)
```

## Environment Variables Required
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — For Twilio
- `VONAGE_API_KEY` / `VONAGE_API_SECRET` — For Vonage

## Constraints
- Phone numbers must be in E.164 format (+country code + number).
- Twilio message body limit: 1600 characters.
- Server-side only (API credentials must not be exposed).
