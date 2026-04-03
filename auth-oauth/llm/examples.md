# @radzor/auth-oauth — Usage Examples

## TypeScript

### Basic Google login
```typescript
import { AuthOAuth } from "@radzor/auth-oauth";

const auth = new AuthOAuth({
  providers: ["google"],
  redirectUrl: "https://myapp.com/auth/callback",
  jwtSecret: process.env.JWT_SECRET!,
  clientCredentials: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});

// Redirect to Google
const url = await auth.login("google");
res.redirect(url);
```

### Handle OAuth callback (Express)
```typescript
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const provider = state.split(":")[0]; // "google", "github", etc.

  const session = await auth.handleCallback(provider, code);
  const user = auth.getUser();
  const jwt = await auth.createSessionToken();

  res.cookie("session", jwt, { httpOnly: true, secure: true, sameSite: "lax" });
  res.redirect("/dashboard");
});
```

### Multi-provider login page
```typescript
const auth = new AuthOAuth({
  providers: ["google", "github", "discord"],
  redirectUrl: "https://myapp.com/auth/callback",
  jwtSecret: process.env.JWT_SECRET!,
  clientCredentials: {
    google: { clientId: "...", clientSecret: "..." },
    github: { clientId: "...", clientSecret: "..." },
    discord: { clientId: "...", clientSecret: "..." },
  },
});

// Generate URLs for each provider
const googleUrl = await auth.login("google");
const githubUrl = await auth.login("github");
const discordUrl = await auth.login("discord");
```

### Verify session middleware
```typescript
async function requireAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = await auth.verifySessionToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}
```

### Event listeners
```typescript
auth.on("onLogin", ({ userId, provider }) => {
  console.log(`User ${userId} logged in via ${provider}`);
  analytics.track("login", { provider });
});

auth.on("onError", ({ code, message }) => {
  console.error(`Auth error [${code}]: ${message}`);
  errorTracker.capture(new Error(message));
});
```

## Python

### Basic Google login (Flask)
```python
from flask import Flask, redirect, request, make_response
from auth_oauth import AuthOAuth, AuthOAuthConfig, ClientCredentials
import os

app = Flask(__name__)

auth = AuthOAuth(AuthOAuthConfig(
    providers=["google"],
    redirect_url="https://myapp.com/auth/callback",
    jwt_secret=os.environ["JWT_SECRET"],
    client_credentials={
        "google": ClientCredentials(
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        ),
    },
))

@app.route("/login/google")
def login_google():
    url = auth.login("google")
    return redirect(url)
```

### Handle OAuth callback (Flask)
```python
@app.route("/auth/callback")
def auth_callback():
    code = request.args.get("code")
    state = request.args.get("state", "")
    provider = state.split(":")[0]

    session = auth.handle_callback(provider, code)
    user = auth.get_user()
    jwt_token = auth.create_session_token()

    resp = make_response(redirect("/dashboard"))
    resp.set_cookie("session", jwt_token, httponly=True, secure=True, samesite="Lax")
    return resp
```

### Handle OAuth callback (FastAPI)
```python
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from auth_oauth import AuthOAuth, AuthOAuthConfig, ClientCredentials
import os

app = FastAPI()

auth = AuthOAuth(AuthOAuthConfig(
    providers=["github"],
    redirect_url="https://myapp.com/auth/callback",
    jwt_secret=os.environ["JWT_SECRET"],
    client_credentials={
        "github": ClientCredentials(
            client_id=os.environ["GITHUB_CLIENT_ID"],
            client_secret=os.environ["GITHUB_CLIENT_SECRET"],
        ),
    },
))

@app.get("/login/github")
def login_github():
    return RedirectResponse(auth.login("github"))

@app.get("/auth/callback")
def callback(code: str, state: str = ""):
    provider = state.split(":")[0]
    auth.handle_callback(provider, code)
    jwt_token = auth.create_session_token()

    response = RedirectResponse("/dashboard")
    response.set_cookie("session", jwt_token, httponly=True, secure=True, samesite="lax")
    return response
```

### Verify session middleware (Flask)
```python
from functools import wraps
from flask import request, jsonify, g

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get("session")
        if not token:
            return jsonify({"error": "Not authenticated"}), 401
        try:
            payload = auth.verify_session_token(token)
            g.user = payload
        except ValueError:
            return jsonify({"error": "Invalid session"}), 401
        return f(*args, **kwargs)
    return decorated

@app.route("/api/profile")
@require_auth
def profile():
    return jsonify({"user": g.user})
```

### Event listeners
```python
def on_login(event):
    print(f"User {event['userId']} logged in via {event['provider']}")

def on_error(event):
    print(f"Auth error [{event['code']}]: {event['message']}")

auth.on("onLogin", on_login)
auth.on("onError", on_error)
```
