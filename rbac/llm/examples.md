# @radzor/rbac — Usage Examples

## Define roles and check permissions
```typescript
import { Rbac } from "@radzor/rbac";

const rbac = new Rbac({
  roles: [
    { name: "viewer", permissions: ["posts:read", "comments:read"] },
    { name: "editor", permissions: ["posts:write", "posts:delete", "comments:write"], inherits: ["viewer"] },
    { name: "admin", permissions: ["*"] },
  ],
});

rbac.assignRole("alice", "editor");
rbac.assignRole("bob", "viewer");

const result = rbac.checkPermission("alice", "posts:write");
console.log(result.allowed); // true
console.log(result.role);    // "editor"

const denied = rbac.checkPermission("bob", "posts:write");
console.log(denied.allowed); // false
```

## Wildcard permissions
```typescript
const rbac = new Rbac({
  roles: [
    { name: "post-manager", permissions: ["posts:*"] },
    { name: "superadmin", permissions: ["*"] },
  ],
});

rbac.assignRole("user-1", "post-manager");

console.log(rbac.checkPermission("user-1", "posts:read").allowed);   // true
console.log(rbac.checkPermission("user-1", "posts:delete").allowed); // true
console.log(rbac.checkPermission("user-1", "users:read").allowed);   // false

rbac.assignRole("user-2", "superadmin");
console.log(rbac.checkPermission("user-2", "anything:here").allowed); // true
```

## Role inheritance hierarchy
```typescript
const rbac = new Rbac();

rbac.defineRole("basic", ["dashboard:view"]);
rbac.defineRole("support", ["tickets:read", "tickets:write"], ["basic"]);
rbac.defineRole("manager", ["tickets:assign", "reports:view"], ["support"]);
rbac.defineRole("director", ["reports:export", "team:manage"], ["manager"]);

rbac.assignRole("dave", "director");

// Director inherits: manager → support → basic
const perms = rbac.listPermissions("dave");
console.log(perms);
// ["dashboard:view", "reports:export", "reports:view",
//  "team:manage", "tickets:assign", "tickets:read", "tickets:write"]
```

## Express middleware for route protection
```typescript
import { Rbac } from "@radzor/rbac";

const rbac = new Rbac({
  roles: [
    { name: "user", permissions: ["posts:read"] },
    { name: "author", permissions: ["posts:read", "posts:write"], inherits: ["user"] },
    { name: "admin", permissions: ["*"] },
  ],
});

function requirePermission(permission: string) {
  return (req: any, res: any, next: any) => {
    const result = rbac.checkPermission(req.user.id, permission);
    if (!result.allowed) {
      return res.status(403).json({ error: "Forbidden", required: permission });
    }
    next();
  };
}

app.get("/api/posts", requirePermission("posts:read"), listPosts);
app.post("/api/posts", requirePermission("posts:write"), createPost);
app.delete("/api/posts/:id", requirePermission("posts:delete"), deletePost);
```

## Auditing access denials
```typescript
const rbac = new Rbac({
  roles: [
    { name: "viewer", permissions: ["read"] },
  ],
});

rbac.on("onAccessDenied", ({ userId, permission, roles }) => {
  console.warn(`ACCESS DENIED: user=${userId} permission=${permission} roles=[${roles}]`);
  // Write to audit log
  auditLog.append({
    event: "access_denied",
    userId,
    permission,
    roles,
    timestamp: new Date().toISOString(),
  });
});

rbac.assignRole("user-1", "viewer");
rbac.checkPermission("user-1", "admin:panel"); // triggers onAccessDenied
```

## Dynamic role management
```typescript
const rbac = new Rbac();

// Define roles at runtime
rbac.defineRole("free", ["api:read"]);
rbac.defineRole("pro", ["api:read", "api:write", "export:csv"], ["free"]);

rbac.assignRole("user-1", "free");
console.log(rbac.checkPermission("user-1", "api:write").allowed); // false

// Upgrade user
rbac.removeRole("user-1", "free");
rbac.assignRole("user-1", "pro");
console.log(rbac.checkPermission("user-1", "api:write").allowed); // true
```

---

## Python Examples

### Basic RBAC setup
```python
from rbac import Rbac

rbac = Rbac(roles=[
    {"name": "viewer", "permissions": ["posts:read"]},
    {"name": "editor", "permissions": ["posts:write"], "inherits": ["viewer"]},
    {"name": "admin", "permissions": ["*"]},
])

rbac.assign_role("alice", "editor")

result = rbac.check_permission("alice", "posts:read")
print(result["allowed"])  # True (inherited from viewer)
```

### Role inheritance
```python
rbac = Rbac()
rbac.define_role("basic", ["read"])
rbac.define_role("power", ["write", "delete"], inherits=["basic"])

rbac.assign_role("user-1", "power")
print(rbac.list_permissions("user-1"))  # ["delete", "read", "write"]
```

### Middleware pattern (FastAPI)
```python
from fastapi import Depends, HTTPException

def require_permission(permission: str):
    def checker(user = Depends(get_current_user)):
        result = rbac.check_permission(user.id, permission)
        if not result["allowed"]:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker

@app.get("/posts")
async def list_posts(user = Depends(require_permission("posts:read"))):
    return get_posts()
```
