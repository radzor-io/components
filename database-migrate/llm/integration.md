# How to integrate @radzor/database-migrate

## Overview
Run SQL database migrations with up/down support, transaction safety, and status tracking. Connects to PostgreSQL using a raw TCP wire protocol implementation. Migration files export `up()` and `down()` functions that return SQL strings.

## Integration Steps

### TypeScript

1. **No external dependencies required.** Uses Node.js `net` and `fs` modules.

2. **Create an instance:**
```typescript
import { DatabaseMigrate } from "@radzor/database-migrate";

const migrator = new DatabaseMigrate({
  databaseUrl: process.env.DATABASE_URL!,
  migrationsDir: "./migrations",
  tableName: "_migrations", // optional
});
```

3. **Create a migration file:**
```typescript
const { filePath, name } = await migrator.createMigration("add-users-table");
console.log(`Created: ${filePath}`);
// Edit the generated file to add your SQL
```

4. **Run pending migrations:**
```typescript
const { applied, durationMs } = await migrator.migrate();
console.log(`Applied ${applied.length} migrations in ${durationMs}ms`);
```

5. **Roll back:**
```typescript
const { rolledBack } = await migrator.rollback(1); // roll back 1 step
console.log(`Rolled back: ${rolledBack.join(", ")}`);
```

6. **Check status:**
```typescript
const status = await migrator.getStatus();
console.log(`Applied: ${status.applied.length}, Pending: ${status.pending.length}`);
```

7. **Listen for events:**
```typescript
migrator.on("onMigrationComplete", (e) => {
  console.log(`${e.direction}: ${e.name} (${e.durationMs}ms)`);
});
migrator.on("onMigrationFailed", (e) => {
  console.error(`Failed ${e.direction} ${e.name}: ${e.error}`);
});
```

### Python

```python
from database_migrate import DatabaseMigrate, MigrateConfig
import os

migrator = DatabaseMigrate(MigrateConfig(
    database_url=os.environ["DATABASE_URL"],
    migrations_dir="./migrations",
))

result = migrator.migrate()
print(f"Applied: {result.applied}")

status = migrator.get_status()
print(f"Pending: {status.pending}")
```

## Environment Variables Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URL (postgres://user:pass@host:5432/db) |

## Constraints

- Migration files must be TypeScript or JavaScript exporting `up()` and `down()` functions that return SQL strings.
- File naming convention: `YYYYMMDDHHMMSS_name.ts` (timestamp prefix for ordering).
- Each migration runs inside a transaction — a failure rolls back that migration only.
- The migration tracking table is created automatically on first use.
- Currently supports PostgreSQL only (raw wire protocol).
- Cleartext password authentication is supported; MD5/SCRAM-SHA-256 requires extending the auth handler.

## Composability

Migration events can trigger notifications or CI/CD pipelines. Connections will be configured in a future pass.
