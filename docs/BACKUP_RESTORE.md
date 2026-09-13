# Backup And Restore

Install PostgreSQL client tools on the machine running the scripts.

- Create a compressed backup: `npm run db:backup`. Files are written to ignored `backups/` by default.
- Override the destination with `BACKUP_DIR=/secure/path npm run db:backup`.
- Restore into an empty database: `BACKUP_FILE=/secure/path/file.dump npm run db:restore`.

Back up daily, encrypt or restrict access to backup storage, retain at least seven daily copies, and test a restore monthly. Sermon audio in the `sermon_data` volume is separate from PostgreSQL and must also be backed up or stored in durable object storage.
