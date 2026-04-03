# How to integrate @radzor/auth-oauth

## Overview
OAuth 2.0 authentication supporting Google, GitHub, and Discord. Handles authorization URL generation, token exchange, user profile normalization, session management, and JWT creation.

## Integration Steps

### TypeScript

1. **Install dependency**: `npm install jose`

2. **Configure the component**:
```typescript
import { AuthOAuth } from "@radzor/auth-oauth";

const auth = new AuthOAuth({
  providers: ["google", "github"],
  redirectUrl: "https://myapp.com/auth/callback",
  sessionDuration: 86400, // 24 hours
  jwtSecret: process.env.JWT_SECRET!,
  clientCredentials: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
```

3. **Login flow** (redirect-based):
```typescript
// Step 1: Redirect user to provider
const authUrl = await auth.login("google");
// Redirect the user to authUrl

// Step 2: Handle callback (on your /auth/callback route)
const session = await auth.handleCallback("google", codeFromQuery);
const user = auth.getUser();
```

4. **Session management**:
```typescript
const session = auth.getSession(); // null if expired
if (!session) {
  // redirect to login
}
```

5. **JWT for cookies/headers**:
```typescript
const jwt = await auth.createSessionToken();
// Set as httpOnly cookie

// Later, verify:
const payload = await auth.verifySessionToken(jwt);
```

### Python

No external dependencies — uses only the standard library (`hmac`, `hashlib`, `urllib`).

1. **Configure the component**:
```python
from auth_oauth import AuthOAuth, AuthOAuthConfig, ClientCredentials
import os

auth = AuthOAuth(AuthOAuthConfig(
    providers=["google", "github"],
    redirect_url="https://myapp.com/auth/callback",
    session_duration=86400,  # 24 hours
    jwt_secret=os.environ["JWT_SECRET"],
    client_credentials={
        "google": ClientCredentials(
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        ),
        "github": ClientCredentials(
            client_id=os.environ["GITHUB_CLIENT_ID"],
            client_secret=os.environ["GITHUB_CLIENT_SECRET"],
        ),
    },
))
```

2. **Login flow** (redirect-based):
```python
# Step 1: Redirect user to provider
auth_url = auth.login("google")
# Redirect the user to auth_url

# Step 2: Handle callback (on your /auth/callback route)
session = auth.handle_callback("google", code_from_query)
user = auth.get_user()
```

3. **Session management**:
```python
session = auth.get_session()  # None if expired
if not session:
    # redirect to login
    pass
```

4. **JWT for cookies/headers**:
```python
jwt_token = auth.create_session_token()
# Set as httpOnly cookie

# Later, verify:
payload = auth.verify_session_token(jwt_token)
```

## Environment Variables Required
- `JWT_SECRET` — Secret for signing session JWTs
- `{PROVIDER}_CLIENT_ID` — OAuth client ID per provider
- `{PROVIDER}_CLIENT_SECRET` — OAuth client secret per provider

## Constraints
- Server-side token exchange requires a backend route (client secrets must not be exposed to the browser).
- Each provider needs OAuth app credentials configured in their developer console.

## Composability
- `session.accessToken` can be passed as `@radzor/realtime-chat` `authToken` input for authenticated WebSocket connections.
