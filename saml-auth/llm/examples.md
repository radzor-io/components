# @radzor/saml-auth — Usage Examples

## SP-initiated login flow (Express)
```typescript
import { SamlAuth } from "@radzor/saml-auth";

const saml = new SamlAuth({
  entityId: "https://app.example.com",
  acsUrl: "https://app.example.com/auth/saml/acs",
  idpLoginUrl: "https://idp.example.com/sso/saml",
  idpCert: process.env.SAML_IDP_CERT!,
});

// Redirect to IdP
app.get("/auth/saml/login", (req, res) => {
  const url = saml.generateLoginUrl("/dashboard");
  res.redirect(url);
});

// Handle SAML response
app.post("/auth/saml/acs", async (req, res) => {
  try {
    const user = await saml.validateResponse(req.body.SAMLResponse);
    req.session.user = { id: user.nameId, ...user.attributes };
    res.redirect(req.body.RelayState || "/");
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});
```

## Serving SP metadata for IdP configuration
```typescript
app.get("/auth/saml/metadata", (req, res) => {
  res.type("application/xml");
  res.send(saml.getMetadata());
});
// Share this URL with the IdP admin for configuration
```

## Single logout
```typescript
app.post("/auth/saml/logout", (req, res) => {
  const { nameId, sessionIndex } = req.session.user;
  const logoutUrl = saml.logout(nameId, sessionIndex);
  req.session.destroy(() => {
    res.redirect(logoutUrl);
  });
});
```

## Monitoring login events
```typescript
saml.on("onLoginSuccess", ({ nameId, issuer, sessionIndex }) => {
  console.log(`SAML login: ${nameId} from ${issuer} (session: ${sessionIndex})`);
  metrics.increment("saml.login.success");
});

saml.on("onLoginFailed", ({ error, issuer }) => {
  console.error(`SAML login failed from ${issuer}: ${error}`);
  metrics.increment("saml.login.failed");
  alerting.notify("SAML login failure", { error, issuer });
});
```

## Extracting user attributes
```typescript
app.post("/auth/saml/acs", async (req, res) => {
  const user = await saml.validateResponse(req.body.SAMLResponse);

  // Common SAML attributes
  const email = user.attributes["email"] || user.nameId;
  const firstName = user.attributes["firstName"] || user.attributes["givenName"];
  const lastName = user.attributes["lastName"] || user.attributes["sn"];
  const groups = user.attributes["groups"]; // may be string[]

  // Create or update local user
  await db.user.upsert({
    where: { email: email as string },
    create: { email: email as string, firstName: firstName as string, lastName: lastName as string },
    update: { firstName: firstName as string, lastName: lastName as string },
  });

  req.session.user = { email, groups };
  res.redirect("/dashboard");
});
```

## Signed AuthnRequests
```typescript
import { readFileSync } from "node:fs";

const saml = new SamlAuth({
  entityId: "https://app.example.com",
  acsUrl: "https://app.example.com/auth/saml/acs",
  idpLoginUrl: "https://idp.example.com/sso/saml",
  idpCert: readFileSync("/certs/idp.pem", "utf-8"),
  privateKey: readFileSync("/certs/sp-private.pem", "utf-8"),
});

// AuthnRequests will now be signed with the SP private key
const url = saml.generateLoginUrl("/dashboard");
```
