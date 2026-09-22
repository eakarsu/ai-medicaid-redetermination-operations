# RenewalCare Medicaid

Eligibility renewal, outreach, verification, procedural termination, and appeal operations — plus a full MMIS fiscal-agent layer (claims adjudication, payments, prior authorization, third-party liability, pharmacy, encounters, program integrity) on one React, Node/Express, PostgreSQL, and OpenRouter platform.

8 native business capabilities, 16 stateful domain decisions, 10 specialized AI workflows, 21 physical domain tables + the MMIS claims ledger (465 seeded records + synthetic claims), reports, clickable audit history, integration controls, three roles with an enforced RBAC matrix, member/provider portals, and three full-field scenario fillers per AI feature.

## Medicaid Enterprise compliance layer

The platform implements the seven-layer Medicaid Enterprise architecture (see `docs/architecture.md`):

- **MITA alignment** — capability registry, maturity self-assessment, and MITA principles at `GET /api/mita`, surfaced in the **MITA & Compliance** view.
- **HIPAA / NIST security** — enforced RBAC permission matrix (admin/operator/reviewer), AES-256-GCM field-level ePHI encryption utilities, login lockout, API rate limiting, and a live control posture at `GET /api/compliance`.
- **MMIS claim pipeline** — adjudicate a professional claim end-to-end: 837 intake → eligibility → provider enrollment → coverage → prior authorization → duplicate detection → third-party liability → fee-schedule pricing → payment and 835 remittance, with a fully auditable step trace in the **Claims & MMIS** studio.
- **Program integrity (FWA)** — surveillance rules (duplicates, billing outliers, non-enrolled providers, utilization spikes) that open investigation cases with audit + event trails.
- **ASC X12 interoperability** — 270 eligibility inquiries, 271 responses (parsed to JSON), 834 enrollment batches uploaded over authenticated SFTP, inbound partner 999 acknowledgments, 837 claims, and 835 remittances. Exchanged files are retained in the transaction ledger (`x12_transactions`).
- **HL7 FHIR R4 facade** — `Patient`, `Coverage`, `Task` resources plus `CapabilityStatement` under `/api/fhir`.
- **Event-driven integration** — transactional outbox (`event_outbox`) published in the same SQL transaction as every decision, with a dispatcher delivering to the interoperability hub; inspect it in the **Event Stream** tab.
- **Federal reporting** — T-MSIS-style submission manifest and warehouse rollups at `/api/reporting/*`.

## Configure and run

```bash
./start.sh
```

Open <http://127.0.0.1:4542>. `start.sh` automatically loads the protected portfolio-level `../.openrouter.env` file, then an optional app-local `.env` override. It creates the local PostgreSQL database when needed, runs migrations, preserves existing seeded data, starts the Node API on `5542`, and starts Vite on `4542`.

## Validate

```bash
node scripts/validate_app.mjs
node scripts/smoke_test.mjs
```

Both `.env` files are ignored. OpenRouter is called only from the backend; the API key is never sent to React.

## SFTP batch exchange

`./start.sh` starts a local OpenSSH SFTP server automatically on `127.0.0.1:2222` with generated keys and shuts it down when the app stops. No Docker step is needed for normal local use.

For the optional Docker Compose deployment:

```bash
./scripts/setup_sftp.sh
docker compose up -d sftp
```

`docker compose up --build` uses that SFTP service. If Docker cannot mount files from this project directory, copy `.local-sftp` to a Docker-shared local directory and set `SFTP_KEY_DIR` to that path before running Compose.

`POST /api/batch/834` uploads an 834 file to `/outbound` with host key verification and reports its remote path, byte count, and SHA-256 hash. A trading partner must place 999 files named `<batch-id>-<sequence>.999` in `/inbound`. `GET /api/batch/<batch-id>/acknowledgments` reads and validates those files, then records each received acknowledgment once. The local SFTP service transports files; it does not pretend to be a state trading partner or generate acknowledgments.

## Container deployment

```bash
docker compose up --build
```

The multi-stage image compiles the React frontend, then the API serves it with an SPA fallback on port `5542`. Migrations and seeding run automatically via `backend/entrypoint.sh` (`scripts/migrate.mjs` + seed). In production set `SESSION_SECRET` and `PHI_ENCRYPTION_KEY` to 32+ random characters — the API refuses to start in `NODE_ENV=production` with default secrets. Node-level TLS is available via `TLS_CERT`/`TLS_KEY`; cloud deployments terminate TLS at the load balancer (see `infra/terraform/main.tf` for the AWS reference stack).

## Backup and restore

```bash
scripts/backup_database.sh                 # gzip snapshot into backups/ (14-snapshot retention)
scripts/restore_database.sh backups/<file> # drop-and-restore from a snapshot
```
