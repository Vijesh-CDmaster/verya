# Verya Operations Runbook

## Health checks

`GET /health` reports the authentication mode, whether persistence is using Postgres or the development store, and whether Redis queue access is healthy. Treat `ok: false` or `queue.healthy: false` as an incident signal.

The endpoint is intentionally not a substitute for external uptime monitoring. Configure a monitor to request `/health` over HTTPS and alert on non-2xx responses, `ok: false`, or a stale response.

## Database backup

The backup command uses PostgreSQL's `pg_dump` custom format and never prints the connection string:

```text
cd backend
npm run backup
```

Set `BACKUP_DIR` to choose another output directory. The host running the command must have `pg_dump` installed and `DATABASE_URL` configured.

Backups must be copied to storage outside the application host. Do not commit `.dump` files or place them under `public/`.

## Restore drill

Use a disposable Postgres database for every restore test:

```text
createdb verya_restore_test
pg_restore --clean --if-exists --dbname verya_restore_test path/to/verya-YYYY-MM-DD.dump
```

Then run the migration command against the restored database and verify the application health endpoint, ledger verification endpoint, and a representative dashboard request. Record the date, dump name, restore duration, and result in the operations log. Never test restoration by overwriting production.

## Production prerequisites

- Configure an external uptime monitor for `/health`.
- Store backups in a separate encrypted location with an explicit retention policy.
- Run and record a restore drill before launch and on a recurring schedule.
- Add an error-tracking provider and alert routing before relying on logs as the only incident signal.
