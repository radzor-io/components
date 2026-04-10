# How to integrate @radzor/saml-auth

## Overview
This component handles SAML 2.0 Service Provider-initiated SSO flows. It generates AuthnRequest URLs for redirecting users to an Identity Provider, validates SAML responses, extracts user attributes, and generates SP metadata XML for IdP configuration.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create the SAML auth instance**:
```typescript
import { SamlAuth } from "@radzor/saml-auth";

const saml = new SamlAuth({
  entityId: process.env.SAML_ENTITY_ID!,
  acsUrl: process.env.SAML_ACS_URL!,
  idpLoginUrl: process.env.SAML_IDP_LOGIN_URL!,
  idpCert: process.env.SAML_IDP_CERT!,
  privateKey: process.env.SAML_SP_PRIVATE_KEY, // optional
});
```

3. **Generate a login redirect URL**:
```typescript
app.get("/auth/saml/login", (req, res) => {
  const loginUrl = saml.generateLoginUrl("/dashboard");
  res.redirect(loginUrl);
});
```

4. **Handle the SAML response (ACS endpoint)**:
```typescript
app.post("/auth/saml/acs", async (req, res) => {
  try {
    const user = await saml.validateResponse(req.body.SAMLResponse);
    req.session.user = {
      id: user.nameId,
      attributes: user.attributes,
      sessionIndex: user.sessionIndex,
    };
    const relayState = req.body.RelayState || "/";
    res.redirect(relayState);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});
```

5. **Serve SP metadata for IdP configuration**:
```typescript
app.get("/auth/saml/metadata", (req, res) => {
  res.type("application/xml").send(saml.getMetadata());
});
```

6. **Handle single logout**:
```typescript
app.post("/auth/saml/logout", (req, res) => {
  const logoutUrl = saml.logout(req.session.user.id, req.session.user.sessionIndex);
  req.session.destroy();
  res.redirect(logoutUrl);
});
```

7. **Listen for auth events**:
```typescript
saml.on("onLoginSuccess", ({ nameId, issuer }) => {
  console.log(`SAML login: ${nameId} via ${issuer}`);
});

saml.on("onLoginFailed", ({ error, issuer }) => {
  console.error(`SAML login failed from ${issuer}: ${error}`);
});
```

## Environment Variables Required
| Variable | Description |
|---|---|
| `SAML_ENTITY_ID` | Your SP entity ID (e.g. `https://app.example.com`) |
| `SAML_ACS_URL` | Assertion Consumer Service URL (e.g. `https://app.example.com/auth/saml/acs`) |
| `SAML_IDP_LOGIN_URL` | IdP SSO login endpoint |
| `SAML_IDP_CERT` | IdP X.509 certificate in PEM format |
| `SAML_SP_PRIVATE_KEY` | (Optional) SP private key for signing requests |

## Constraints
- Server-only — uses `node:crypto` for signature validation and XML signing.
- Does not support IdP-initiated (unsolicited) login flows.
- XML parsing uses string matching and regex, not a full XML parser. This works for standard SAML responses but may fail on unusual XML structures.
- The IdP certificate must be provided in PEM format with `-----BEGIN CERTIFICATE-----` headers.

## Composability
- Use with `@radzor/session-manager` to manage the authenticated session after SAML login.
- Combine with `@radzor/rbac` to assign roles based on SAML attributes.
- Feed `onLoginSuccess`/`onLoginFailed` events into `@radzor/log-aggregator` for audit logging.
