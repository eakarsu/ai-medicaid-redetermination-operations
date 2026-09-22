# Medicaid Enterprise Architecture Alignment

This platform is designed against the seven-layer Medicaid Enterprise architecture: Medicaid
Enterprise Systems → CMS/MITA guidance → MMIS/fiscal-agent interfaces → enterprise architecture →
API & integration architecture → cloud infrastructure → HIPAA/NIST security & compliance.

## Layer mapping

| Layer | Implementation in this repository |
|---|---|
| 1. Medicaid Enterprise Systems | Eligibility redetermination domain (renewal population, ex parte, notices, verification documents, outreach, procedural termination prevention, change-in-circumstance, appeals) plus member/provider registries, analytics, federal reporting, and portals (`app.json`, `op_*` tables). |
| 2. CMS / MITA | MITA capability registry, maturity self-assessment, and principles evidence served by `backend/src/mita.mjs` → `GET /api/mita`; rendered in the UI under **MITA & Compliance → MITA Capability Map**. |
| 3. Fiscal Agent / MMIS | Claim pipeline: **837 intake → deterministic adjudication** (eligibility → provider enrollment → coverage → prior auth → duplicate → TPL → fee schedule → payment) → **835 remittance** (`backend/src/adjudication.mjs`). Registers for provider enrollment/credentialing, claims, payments, prior authorization, third-party liability, pharmacy, managed care encounters, and FWA. Authenticated SFTP **834 batch upload and inbound partner 999 ingestion** (`backend/src/batch.mjs`). **T-MSIS federal reporting** and warehouse rollups (`backend/src/reporting.mjs`). Member and provider portals. |
| 4. Enterprise Architecture | Modular capability services (`backend/src/*`) composed by the versioned API (`/api`, `/api/v1`), capability configuration in `app.json`, reference architecture and MITA roadmap artifacts in this document and `/api/mita`. |
| 5. API & Integration Architecture | REST with versioning, rate limiting, and API lifecycle (`/api/v1` alias); ASC X12 v5010: **270/271/834/837/835/999** (`backend/src/x12.mjs`); HL7 **FHIR R4** facade (`backend/src/fhir.mjs`); transactional event outbox with dispatcher (`backend/src/events.mjs`). |
| 6. Cloud Architecture | Docker multi-stage build + compose reference deployment, **Terraform AWS reference stack** (`infra/terraform/main.tf`: multi-AZ VPC, TLS ALB, ECS Fargate, encrypted Multi-AZ RDS, Secrets Manager, CloudWatch), optional node-level **TLS** (`TLS_CERT`/`TLS_KEY`), **backup/restore DR scripts** (`scripts/backup_database.sh`, `scripts/restore_database.sh`). |
| 7. Security & Compliance | RBAC permission matrix (`backend/src/rbac.mjs`), AES-256-GCM field-level ePHI encryption + login lockout + rate limiting (`backend/src/security.mjs`), **RFC 6238 TOTP MFA** (`backend/src/mfa.mjs`, IA-2), **security-event monitoring** (SI-4, `security_events`), **automated access review** (AC-2), transactional audit trail, PHI-masking minimum-necessary portal views, HIPAA §164.312 / NIST CSF control mapping at `GET /api/compliance`. |

## MMIS claim adjudication chain (spec line 27)

The adjudication engine executes the MES decision chain and records every step:

```
Is this person eligible?        → registry status (271-aligned)        ELG-01
Is this doctor enrolled?        → provider registry enrollment         PRV-01
Is the procedure covered?       → Medicaid fee schedule                COV-01
Was authorization required?     → prior-authorization register         PA-01
Is another insurer responsible? → TPL coordination of benefits         TPL-01
Is the claim valid?             → duplicate detection                  DUP-01
What rate should Medicaid pay?  → fee schedule max vs billed           CO-45
How much does the provider get? → allowed − 20% coinsurance            → 835 remittance
```

Outcomes open register rows, write audit rows transactionally, and publish events
(`claims.adjudicated`, `claims.paid`) through the outbox.

## Fraud, waste & abuse (program integrity)

`backend/src/fwa.mjs` evaluates four surveillance rules against the claims ledger — duplicate
patterns, billed-amount outliers vs the fee schedule, billing by non-enrolled providers, and
utilization frequency spikes. Hits open investigation cases in the FWA register with severity,
score, and recommended action; every opening writes audit + event records.

## Event-driven backbone (real Kafka)

Domain decisions publish events **in the same SQL transaction** as the state change
(`event_outbox`), and a dispatcher drains pending events **to a real Apache Kafka broker**
(kafkajs producer → topic `renewalcare.events`) when `KAFKA_BROKERS` is set.
`docker compose` ships a single-node KRaft broker (no ZooKeeper) so the local demo produces
genuine Kafka traffic; without a broker the dispatcher still drains locally, so tests never
require one. Consumers in production: state eligibility system (834), MMIS claims engine
(837/835), federal T-MSIS pipeline, analytics, fair hearing system. (Note: the compose broker
advertises `kafka:9092` for container-to-container traffic; expose a host listener if you want
CLI tools to consume from the host.)

## Real SMTP notice delivery

`docker compose` also ships Mailpit, a real SMTP server (`:1025`, web inbox `:8025`). The
**SMTP notice dispatch** action (MITA & Compliance → Interoperability) sends genuine SMTP mail
via nodemailer for renewal notices; point `SMTP_HOST` at SendGrid/SES in production. Without
`SMTP_HOST`, dispatches are recorded (audit + event) instead of sent, so nothing is lost.

## Interoperability contracts

- **X12 270** — eligibility inquiry generated against a beneficiary registry record.
- **X12 271** — eligibility response parsed into JSON (status, benefits, errors); used to gate
  non-ex-parte renewal decisions.
- **X12 834** — enrollment/maintenance (add `021`, change `024`) transmitting renewal outcomes;
  uploaded to an authenticated SFTP endpoint with host key pinning. Partner-generated **999**
  files are retrieved from the inbound directory and matched to the original 834 controls.
- **X12 837** — professional claim submission (005010X222A1) with service lines.
- **X12 835** — electronic remittance advice (005010X221A1) with adjustment codes (CAS).
- **X12 999** — functional acknowledgment accepting/rejecting received transaction sets.
- **FHIR R4** — `Patient` (member registry), `Coverage` (program enrollment), `Task` (renewal
  work), `CapabilityStatement` at `/api/fhir/metadata`, OperationOutcome errors.

## Member & provider portals

`/api/portal/member` returns a masked-identity beneficiary view (minimum necessary) with claim
history, upcoming renewals, and a FHIR patient link. `/api/portal/provider` returns enrollment
status, claim history, and paid totals. Both are rendered under **Claims & MMIS → Portals**.

## MITA maturity posture

Eight capabilities mapped across business/information/technical perspectives, currently
averaging Level 3 (Managed) targeting Level 4 (Standardized/Interoperable). Gaps and planned
actions are listed at `GET /api/mita` → `assessment.gaps`.

## Data realism

- **Real reference data**: the fee schedule uses the actual CPT/HCPCS code set with AMA-style
  descriptors; pharmacy records use the FDA NDC 5-4-2 format; provider records carry NPIs
  computed with the real NPPES Luhn check-digit algorithm; beneficiary personas are realistic
  but synthetic.
- **Protected boundary**: real Medicaid beneficiary PHI (names, IDs, eligibility files) cannot
  be loaded outside a covered entity engagement — production integrations are the state
  eligibility hub (X12 834/270/271), NPPES (providers), and FDA NDC directory (drugs).

## Cloud target state

`infra/terraform/main.tf` provisions the reference stack:

```
Beneficiaries/Caseworkers → CDN → WAF → TLS ALB (ACM cert)
  → ECS Fargate service (multi-AZ, autoscaled, CloudWatch logs, /api/health checks)
      → RDS PostgreSQL 16 (Multi-AZ, encrypted with KMS, 14-day automated backups, deletion protection)
      → Secrets Manager: SESSION_SECRET / PHI_ENCRYPTION_KEY / DATABASE_URL
      → Event queue (Kafka / EventBridge / Service Bus) fed by the outbox dispatcher
```

DR: nightly `pg_dump` snapshots via `scripts/backup_database.sh` (14-snapshot retention window)
with tested restore via `scripts/restore_database.sh`; RDS automated backups + final snapshots
in the cloud stack. TLS terminates at the ALB (or at the node with `TLS_CERT`/`TLS_KEY` for
smaller deployments).

Local demo posture remains `./start.sh` on 127.0.0.1; `docker compose up --build` exercises the
container path end-to-end.
