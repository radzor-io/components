# How to integrate @radzor/captcha-verify

## Overview
Server-side CAPTCHA verification supporting Cloudflare Turnstile, Google reCAPTCHA, and hCaptcha.

## Integration Steps

### TypeScript

1. **Configure**:
```typescript
import { CaptchaVerify } from "@radzor/captcha-verify";

const captcha = new CaptchaVerify({
  provider: "turnstile",
  secretKey: process.env.TURNSTILE_SECRET_KEY!,
});
```

2. **Verify in your API route**:
```typescript
app.post("/api/signup", async (req, res) => {
  const result = await captcha.verify(req.body.captchaToken, req.ip);
  if (!result.success) {
    return res.status(400).json({ error: "CAPTCHA verification failed" });
  }
  // proceed with signup
});
```

### Python

1. **Configure**:
```python
from captcha_verify import CaptchaVerify, CaptchaVerifyConfig
import os

captcha = CaptchaVerify(CaptchaVerifyConfig(
    provider="turnstile",
    secret_key=os.environ["TURNSTILE_SECRET_KEY"],
))
```

2. **Verify** (Flask):
```python
@app.route("/api/signup", methods=["POST"])
def signup():
    result = captcha.verify(request.json["captchaToken"], request.remote_addr)
    if not result.success:
        return jsonify({"error": "CAPTCHA failed"}), 400
    # proceed
```

## Environment Variables Required
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile
- `RECAPTCHA_SECRET_KEY` — Google reCAPTCHA
- `HCAPTCHA_SECRET_KEY` — hCaptcha

## Constraints
- Server-side only. Tokens are single-use and expire quickly.
- reCAPTCHA v3 returns a score (0.0-1.0) — configure `scoreThreshold` accordingly.
