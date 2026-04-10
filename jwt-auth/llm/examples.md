# @radzor/jwt-auth — Usage Examples

## Sign and verify tokens
```typescript
import { JwtAuth } from "@radzor/jwt-auth";

const jwt = new JwtAuth({
  secret: process.env.JWT_SECRET!,
  algorithm: "HS256",
  issuer: "myapp.com",
  expiresIn: 3600, // 1 hour
});

const token = jwt.sign({ sub: "user_123", role: "admin" });
console.log("Token:", token);

const payload = jwt.verify(token);
console.log("User:", payload.sub);  // "user_123"
console.log("Role:", payload.role); // "admin"
```

## Express authentication middleware
```typescript
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const token = authHeader.slice(7);
    req.user = jwt.verify(token);
    next();
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

app.get("/api/profile", authMiddleware, (req, res) => {
  res.json({ userId: req.user.sub, role: req.user.role });
});
```

## Login endpoint
```typescript
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.users.findByEmail(email);

  if (!user || !(await passwordHash.verify(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = jwt.sign({ sub: user.id, role: user.role }, 3600);     // 1 hour
  const refreshToken = jwt.sign({ sub: user.id, type: "refresh" }, 604800);  // 7 days

  res.json({ accessToken, refreshToken });
});
```

## Token refresh endpoint
```typescript
app.post("/api/refresh", (req, res) => {
  const { refreshToken } = req.body;

  try {
    const newAccessToken = jwt.refresh(refreshToken, 3600);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});
```

## Decode without verification (inspect claims)
```typescript
const claims = jwt.decode(token);
console.log("Expires:", new Date(claims.exp * 1000));
console.log("Issued:", new Date(claims.iat * 1000));
console.log("Token ID:", claims.jti);
// WARNING: decode() does NOT verify the signature
```

## Event monitoring
```typescript
jwt.on("onSigned", ({ sub, expiresAt }) => {
  console.log(`Token signed for ${sub}, expires ${new Date(expiresAt * 1000)}`);
});

jwt.on("onExpired", ({ sub, expiredAt }) => {
  console.log(`Expired token for ${sub} (expired ${new Date(expiredAt * 1000)})`);
});

jwt.on("onError", ({ code, message }) => {
  console.error(`JWT error [${code}]: ${message}`);
  metrics.increment("jwt_errors", { code });
});
```

---

## Python Examples

### Sign and verify
```python
import os
from jwt_auth import JwtAuth

jwt = JwtAuth(
    secret=os.environ["JWT_SECRET"],
    algorithm="HS256",
    issuer="myapp.com",
    expires_in=3600,
)

token = jwt.sign({"sub": "user_123", "role": "admin"})
payload = jwt.verify(token)
print(f"User: {payload['sub']}, Role: {payload['role']}")
```

### FastAPI middleware
```python
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

app = FastAPI()
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.verify(credentials.credentials)
    except Exception as e:
        raise HTTPException(401, detail=str(e))

@app.get("/profile")
async def profile(user=Depends(get_current_user)):
    return {"user_id": user["sub"], "role": user["role"]}
```

### Login endpoint (Flask)
```python
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    user = db.users.find_by_email(data["email"])
    if not user or not verify_password(data["password"], user.password_hash):
        return jsonify(error="Invalid credentials"), 401

    access_token = jwt.sign({"sub": user.id, "role": user.role}, expires_in=3600)
    return jsonify(access_token=access_token)
```

### Token refresh
```python
new_token = jwt.refresh(old_token, expires_in=3600)
```
