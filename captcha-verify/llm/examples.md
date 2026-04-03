# @radzor/captcha-verify — Usage Examples

## TypeScript

### Turnstile on signup form
```typescript
import { CaptchaVerify } from "@radzor/captcha-verify";

const captcha = new CaptchaVerify({
  provider: "turnstile",
  secretKey: process.env.TURNSTILE_SECRET_KEY!,
});

app.post("/api/signup", async (req, res) => {
  const { email, password, captchaToken } = req.body;
  const result = await captcha.verify(captchaToken, req.ip);
  if (!result.success) {
    return res.status(400).json({ error: "CAPTCHA failed", codes: result.errorCodes });
  }
  await createUser(email, password);
  res.json({ success: true });
});
```

### reCAPTCHA v3 with score
```typescript
const captcha = new CaptchaVerify({
  provider: "recaptcha",
  secretKey: process.env.RECAPTCHA_SECRET_KEY!,
  scoreThreshold: 0.7,
});

const result = await captcha.verify(token);
console.log(`Score: ${result.score}`); // 0.9 = likely human
```

### hCaptcha
```typescript
const captcha = new CaptchaVerify({
  provider: "hcaptcha",
  secretKey: process.env.HCAPTCHA_SECRET_KEY!,
});

const result = await captcha.verify(token);
if (result.success) console.log("Human verified");
```

## Python

### Turnstile (Flask)
```python
from flask import Flask, request, jsonify
from captcha_verify import CaptchaVerify, CaptchaVerifyConfig
import os

app = Flask(__name__)
captcha = CaptchaVerify(CaptchaVerifyConfig(
    provider="turnstile",
    secret_key=os.environ["TURNSTILE_SECRET_KEY"],
))

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json()
    result = captcha.verify(data["captchaToken"], request.remote_addr)
    if not result.success:
        return jsonify({"error": "CAPTCHA failed"}), 400
    return jsonify({"success": True})
```

### reCAPTCHA v3 with score (FastAPI)
```python
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()
captcha = CaptchaVerify(CaptchaVerifyConfig(
    provider="recaptcha",
    secret_key=os.environ["RECAPTCHA_SECRET_KEY"],
    score_threshold=0.7,
))

@app.post("/api/contact")
async def contact(request: Request):
    data = await request.json()
    result = captcha.verify(data["token"], request.client.host)
    if not result.success:
        raise HTTPException(400, "CAPTCHA failed")
    return {"ok": True}
```
