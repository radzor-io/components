# How to integrate @radzor/rbac

## Overview
This component provides role-based access control with hierarchical role inheritance, wildcard permission matching, and user-role assignment management. Permissions are hierarchical strings (e.g. `posts:write`) and support wildcards (`posts:*`).

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create the RBAC instance with roles**:
```typescript
import { Rbac } from "@radzor/rbac";

const rbac = new Rbac({
  roles: [
    { name: "viewer", permissions: ["posts:read", "comments:read"] },
    { name: "editor", permissions: ["posts:write", "posts:delete", "comments:write"], inherits: ["viewer"] },
    { name: "admin", permissions: ["*"], inherits: ["editor"] },
  ],
});
```

3. **Assign roles to users**:
```typescript
rbac.assignRole("user-1", "viewer");
rbac.assignRole("user-2", "editor");
rbac.assignRole("user-3", "admin");
```

4. **Check permissions**:
```typescript
const result = rbac.checkPermission("user-1", "posts:read");
console.log(result.allowed); // true

const denied = rbac.checkPermission("user-1", "posts:write");
console.log(denied.allowed); // false
```

5. **Listen for access denials**:
```typescript
rbac.on("onAccessDenied", ({ userId, permission, roles }) => {
  console.warn(`Access denied: ${userId} tried ${permission} with roles [${roles}]`);
  auditLog.write({ event: "access_denied", userId, permission });
});
```

6. **Use in middleware**:
```typescript
function requirePermission(permission: string) {
  return (req, res, next) => {
    const result = rbac.checkPermission(req.user.id, permission);
    if (!result.allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

app.delete("/api/posts/:id", requirePermission("posts:delete"), deletePost);
```

7. **Python equivalent**:
```python
from rbac import Rbac

rbac = Rbac(roles=[
    {"name": "viewer", "permissions": ["posts:read"]},
    {"name": "editor", "permissions": ["posts:write"], "inherits": ["viewer"]},
])

rbac.assign_role("user-1", "viewer")
result = rbac.check_permission("user-1", "posts:read")
print(result["allowed"])  # True
```

## Environment Variables Required
None. This component has no external dependencies.

## Constraints
- Roles and user assignments are stored in-memory. Persist to a database for production.
- Wildcard permissions (`*` or `posts:*`) match all sub-permissions at that level.
- Circular role inheritance is detected and raises an error at definition time.
- Permission strings use a configurable separator (default `:`).

## Composability
- Use with `@radzor/jwt-auth` — decode the JWT, then check permissions via RBAC.
- Combine with `@radzor/session-manager` to load roles from session data.
- Feed `onAccessDenied` events into `@radzor/log-aggregator` for security auditing.
