// @radzor/rbac — Role-Based Access Control with permissions, roles, and hierarchies

export interface RoleDefinition {
  name: string;
  permissions: string[];
  inherits?: string[];
}

export interface AuthorizationResult {
  allowed: boolean;
  role: string | null;
  permissions: string[];
}

export interface RbacConfig {
  roles?: RoleDefinition[];
  separator?: string;
}

export type EventMap = {
  onAccessDenied: { userId: string; permission: string; roles: string[] };
};

type Listener<T> = (event: T) => void;

export class Rbac {
  private roles = new Map<string, { permissions: Set<string>; inherits: string[] }>();
  private userRoles = new Map<string, Set<string>>();
  private separator: string;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: RbacConfig = {}) {
    this.separator = config.separator ?? ":";
    if (config.roles) {
      for (const role of config.roles) {
        this.defineRole(role.name, role.permissions, role.inherits);
      }
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  defineRole(name: string, permissions: string[], inherits?: string[]): void {
    const parentRoles = inherits ?? [];

    // Detect circular inheritance
    if (parentRoles.length > 0) {
      this.checkCircularInheritance(name, parentRoles, new Set());
    }

    this.roles.set(name, {
      permissions: new Set(permissions),
      inherits: parentRoles,
    });
  }

  private checkCircularInheritance(roleName: string, parents: string[], visited: Set<string>): void {
    for (const parent of parents) {
      if (parent === roleName) {
        throw new Error(`Circular inheritance detected: role '${roleName}' inherits from itself`);
      }
      if (visited.has(parent)) continue;
      visited.add(parent);

      const parentRole = this.roles.get(parent);
      if (parentRole && parentRole.inherits.length > 0) {
        this.checkCircularInheritance(roleName, parentRole.inherits, visited);
      }
    }
  }

  assignRole(userId: string, role: string): void {
    if (!this.roles.has(role)) {
      throw new Error(`Role '${role}' is not defined`);
    }
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }
    this.userRoles.get(userId)!.add(role);
  }

  removeRole(userId: string, role: string): void {
    const roles = this.userRoles.get(userId);
    if (roles) {
      roles.delete(role);
      if (roles.size === 0) this.userRoles.delete(userId);
    }
  }

  private getEffectivePermissions(roleName: string, visited: Set<string> = new Set()): Set<string> {
    if (visited.has(roleName)) return new Set();
    visited.add(roleName);

    const role = this.roles.get(roleName);
    if (!role) return new Set();

    const permissions = new Set(role.permissions);

    for (const parent of role.inherits) {
      const parentPerms = this.getEffectivePermissions(parent, visited);
      for (const perm of parentPerms) {
        permissions.add(perm);
      }
    }

    return permissions;
  }

  private permissionMatches(granted: string, requested: string): boolean {
    if (granted === "*") return true;
    if (granted === requested) return true;

    const sep = this.separator;
    const grantedParts = granted.split(sep);
    const requestedParts = requested.split(sep);

    for (let i = 0; i < grantedParts.length; i++) {
      if (grantedParts[i] === "*") return true;
      if (i >= requestedParts.length) return false;
      if (grantedParts[i] !== requestedParts[i]) return false;
    }

    return grantedParts.length === requestedParts.length;
  }

  checkPermission(userId: string, permission: string): AuthorizationResult {
    const userRoleSet = this.userRoles.get(userId);
    if (!userRoleSet || userRoleSet.size === 0) {
      this.emit("onAccessDenied", { userId, permission, roles: [] });
      return { allowed: false, role: null, permissions: [] };
    }

    const roleNames = Array.from(userRoleSet);
    const allPermissions = new Set<string>();

    for (const roleName of roleNames) {
      const perms = this.getEffectivePermissions(roleName);
      for (const perm of perms) {
        allPermissions.add(perm);
        if (this.permissionMatches(perm, permission)) {
          return {
            allowed: true,
            role: roleName,
            permissions: Array.from(allPermissions),
          };
        }
      }
    }

    // Check remaining permissions for the response
    for (const roleName of roleNames) {
      const perms = this.getEffectivePermissions(roleName);
      for (const perm of perms) allPermissions.add(perm);
    }

    this.emit("onAccessDenied", { userId, permission, roles: roleNames });
    return {
      allowed: false,
      role: null,
      permissions: Array.from(allPermissions),
    };
  }

  listPermissions(userId: string): string[] {
    const userRoleSet = this.userRoles.get(userId);
    if (!userRoleSet) return [];

    const allPermissions = new Set<string>();
    for (const roleName of userRoleSet) {
      const perms = this.getEffectivePermissions(roleName);
      for (const perm of perms) allPermissions.add(perm);
    }

    return Array.from(allPermissions).sort();
  }

  getUserRoles(userId: string): string[] {
    const roles = this.userRoles.get(userId);
    return roles ? Array.from(roles) : [];
  }

  getRoleDefinition(roleName: string): RoleDefinition | null {
    const role = this.roles.get(roleName);
    if (!role) return null;
    return {
      name: roleName,
      permissions: Array.from(role.permissions),
      inherits: [...role.inherits],
    };
  }
}

export default Rbac;
