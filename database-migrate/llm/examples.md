# @radzor/database-migrate — Usage Examples

## Run all pending migrations

```typescript
import { DatabaseMigrate } from "@radzor/database-migrate";

const migrator = new DatabaseMigrate({
  databaseUrl: process.env.DATABASE_URL!,
  migrationsDir: "./migrations",
});

const { applied, durationMs } = await migrator.migrate();
console.log(`Applied ${applied.length} migrations in ${durationMs}ms:`);
applied.forEach((name) => console.log(`  ✓ ${name}`));
```

## Create a new migration

```typescript
const { filePath, name } = await migrator.createMigration("add-users-table");
console.log(`Created migration: ${filePath}`);

// Now edit the file:
// migrations/20250410120000_add-users-table.ts
```

```typescript
// Example migration file content:
export function up(): string {
  return `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX idx_users_email ON users(email);
  `;
}

export function down(): string {
  return `
    DROP TABLE IF EXISTS users;
  `;
}
```

## Check migration status

```typescript
const status = await migrator.getStatus();
console.log(`Applied: ${status.applied.length}`);
console.log(`Pending: ${status.pending.length}`);
console.log(`Current: ${status.current || "(none)"}`);

status.pending.forEach((name) => console.log(`  ⏳ ${name}`));
```

## Roll back the last migration

```typescript
const { rolledBack, durationMs } = await migrator.rollback();
console.log(`Rolled back ${rolledBack.length} migrations in ${durationMs}ms`);
rolledBack.forEach((name) => console.log(`  ↩ ${name}`));
```

## Roll back multiple steps

```typescript
const { rolledBack } = await migrator.rollback(3); // undo last 3 migrations
console.log(`Rolled back: ${rolledBack.join(", ")}`);
```

## Migrate to a specific version

```typescript
const { applied } = await migrator.migrate("20250401000000_add-orders-table");
// Only runs migrations up to and including the named one
console.log(`Applied: ${applied.join(", ")}`);
```

## Event-driven migration monitoring

```typescript
migrator.on("onMigrationComplete", ({ name, direction, durationMs }) => {
  console.log(`[${direction.toUpperCase()}] ${name} completed in ${durationMs}ms`);
});

migrator.on("onMigrationFailed", ({ name, direction, error }) => {
  console.error(`[FAILED] ${direction} ${name}: ${error}`);
  // Alert ops team, roll back, etc.
});

await migrator.migrate();
```

---

## Python Examples

### Run migrations

```python
from database_migrate import DatabaseMigrate, MigrateConfig
import os

migrator = DatabaseMigrate(MigrateConfig(
    database_url=os.environ["DATABASE_URL"],
    migrations_dir="./migrations",
))

result = migrator.migrate()
print(f"Applied {len(result.applied)} migrations in {result.duration_ms}ms")
```

### Check status

```python
status = migrator.get_status()
print(f"Applied: {len(status.applied)}, Pending: {len(status.pending)}")
print(f"Current: {status.current}")
```

### Create a migration

```python
result = migrator.create_migration("add-orders-table")
print(f"Created: {result.file_path}")
```

### Roll back

```python
result = migrator.rollback(steps=1)
print(f"Rolled back: {result.rolled_back}")
```
