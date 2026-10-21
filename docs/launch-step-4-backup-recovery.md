# Step 4 — backup, isolated recovery and disaster procedure

## Scope and storage

The owner chose encrypted downloads to their own device on 2026-10-21. No object-storage account, new paid service, public database access or permanent maintenance credential is added.

The site-admin Backups section exports either all public application tables or selected groups with transitive foreign-key parent dependencies. The catalogue is read from PostgreSQL, so new application tables enter full backups automatically. This is a **versioned application-data archive**, not a portable `pg_dump` of arbitrary database objects. Restore requires the same reviewed application release/schema version and recreates its schema from migrations. Render's independent native logical export remains available for PostgreSQL-native schema recovery.

The archive does not contain source code, uploaded files outside database columns, external images/URLs, Discord messages/members/current server state, Render configuration, PostgreSQL roles, or the other Diskoko AI project's files. Pin the release commit alongside every retained archive. Preserve required OAuth, SMTP, billing, bot and infrastructure configuration separately through trusted platform access. Never paste credentials into chat or commit them.

Optionally include the application's ENCRYPTION_KEY **inside the encrypted full archive**. This is necessary to recover encrypted bot tokens and project secrets if the original environment is lost. Do not rotate that key during recovery. Other environment credentials and session secrets are not exported. Sessions should be invalidated when promoting a recovery database.

Archives use scrypt (N=32768,r=8,p=1, random 16-byte salt), gzip and AES-256-GCM with a random 12-byte nonce and authenticated header. Password: at least 16 characters, at most 256 UTF-8 bytes. There is no password recovery service. Save the password separately in a password manager.

Downloads are staged in a private temporary directory, mode 0600, and removed on success/failure. They are **not durable server-side backups**. Hard process termination can leave encrypted temporary remnants until the ephemeral instance is replaced; they are not web-accessible. Keep only the archive and required keys in controlled storage. The log records metadata, not passwords, data rows or keys. `sent` confirms server delivery, not local disk persistence. A prepared-only/started-only entry is not a completed backup.

## Resource and access boundaries

- Existing site-admin identity + recent authentication (15 minutes for download), CSRF, active account checks and no-store responses apply.
- One application backup globally using a PostgreSQL advisory lock; a local gate bounds password derivations and waiting connections. No background unbounded queue.
- Consistent REPEATABLE READ, READ ONLY snapshot; one cursor row at a time, row limit 8 MiB, raw archive limit 512 MiB, encrypted file limit 128 MiB, preparation deadline 120 seconds. Oversize/timeout fails rather than truncating the archive.
- Download shares the application's heavy-request and one-large-memory-operation admission limits. No pool/role/security elevation and no new schema needed.
- Browser keeps up to 128 MiB while handing the file to the download manager. For data beyond these limits, use native Render export and arrange dedicated external storage; do not raise limits blindly on the 512 MiB service.

## Operator verification and recovery

Use a trusted operator host / authenticated Render Shell on the private network. Never reopen public database access just for recovery. Install dependencies for the exact recorded release. The verification command does not contact a database:

```text
BACKUP_PASSWORD_FILE=<private password file> node scripts/restore-backup.mjs <archive.dkbackup> --verify
```

Authentication, decompression limits, record types, whole-file checksum and per-table counts must pass **before** any database writes. Wrong passwords, altered files and incomplete downloads fail. The private password file must be readable only by the operator. Remove temporary plaintext recovery material after use; on Windows use restrictive ACLs, as Unix mode bits alone are insufficient.

For an isolated drill, create a **new empty** database called `diskoko_restore_<unique suffix>` using trusted maintenance access. Configure the operator's temporary DATABASE_URL and existing strict DB_TLS_* settings for this target, not production. Set DB_SCHEMA_OWNER to the original schema owner where required. Then:

```text
RESTORE_ACK=ISOLATED_EMPTY_DATABASE_NO_WORKERS BACKUP_PASSWORD_FILE=<private file> node scripts/restore-backup.mjs <archive.dkbackup> --restore-isolated
```

The tool refuses ordinary database names, existing public tables and other active target connections. It migrates the empty target, loads data atomically, validates original foreign keys, preserves serial sequence watermarks (including deleted IDs) and compares actual restored row values using bounded per-table multiset checksums and counts. Constraint definitions come from trusted target migrations, never executable SQL in the archive. Failed data loads roll back; the isolated schema can remain for diagnosis. There is no production restore HTTP endpoint.

If the encryption key is needed, use `--extract-recovery-key` with RECOVERY_KEY_OUTPUT pointing to a **new private file**, then install it through trusted environment management. The tool refuses to overwrite an existing file and never prints the key. Do not expose that file or keep it in the repository.

`scripts/backup-recovery-drill.mjs` automates the same full export/verification/isolated restore, verifies a recovered encrypted token where present, logs safe timing/count metadata, then drops **only its newly created disposable database**. It requires temporary RESTORE_ADMIN_DATABASE_URL, RESTORE_ACK and optional DB_SCHEMA_OWNER. The limited application URL is used only for reading source data and recording drill metadata. No bot/AI worker is started on the restored target. Same-host logical restore verifies archive recovery, **not physical host loss or platform PITR**.

## Promotion after a real incident

1. Declare incident, record UTC time/symptoms and stop write-producing services/workers through trusted operations. Preserve current evidence and an additional snapshot if possible. Do not change encryption keys.
2. Choose native Render PITR for recent corruption, or a verified retained full application archive with its exact release. Native PITR creates a new instance. Never restore over production.
3. Verify target completeness, customer isolation, key decryptability, indexes/constraints/sequences and schema stamp. Inspect pending Discord jobs, project jobs, role sync, scheduled messages, admin reviews and changes before re-enabling execution. A stale backup must not blindly replay external actions that already happened.
4. Invalidate restored sessions/OAuth attempts, transient resource leases, worker heartbeats and expired interaction sessions. Reconcile pending jobs with Discord rather than mass-resending. These deliberate promotion edits happen after the value-preserving drill, against the isolated recovery target.
5. Provision a separate limited runtime account and grants, preserving Step 3 protections. If the host/certificate changed, acquire a new trusted pin through authenticated platform access. Update web and worker connection settings together; do not use maintenance credentials in runtime services.
6. Start the exact compatible release with writes disabled first; check health and read-only customer flows. Re-enable one worker and bounded writes, then verify Discord actions once. Keep original database for controlled rollback until acceptance.
7. If deployment rollback is needed, confirm the previous release is schema-compatible. Do not point an older release at an incompatible migrated schema. Restore a matching isolated database when necessary. Preserve new transactions before switching back.

## Retention, recovery objectives and evidence

- Live Render Recovery was checked on 2026-10-21: **3-day PITR window**, native logical exports retained at least 7 days. The native export `2026-10-21T04:59Z.dir.tar.gz` completed and its download became available; no signed download URL is stored in this runbook.
- Owner-managed recommendation: encrypted daily download before customer writes/major changes, 7 daily + 4 weekly copies, stored on two controlled devices/locations; monthly isolated drill and after schema/encryption changes. This is a recommended manual routine, **not an implemented automatic offsite schedule**. Review retention against actual privacy obligations and deletion requests.
- Manual archive RPO equals time since its recorded snapshot. Do not advertise a fixed RPO unless someone actually performs and monitors the routine. Platform PITR availability is not a measured RTO or a guarantee of zero loss.
- Record drill release, completion time, rows/tables, value verification, key verification, export and total recovery timings. Native new-instance PITR/cutover is a separate exercise and can incur platform cost; this implementation does not claim it has been tested.
- Publish only after local audit and CI PostgreSQL recovery test pass. Production same-host drill evidence belongs in the release report and admin history; no customer rows/tokens are included in that report.

Sources checked 2026-10-21: [Render backups](https://render.com/docs/postgresql-backups), [PostgreSQL 18 backup and restore](https://www.postgresql.org/docs/18/backup-dump.html).
