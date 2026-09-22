-- 003_mmis.sql
-- MMIS core operational registers (layer 3: fiscal agent / MMIS domain) plus the real claims
-- model backing the deterministic adjudication engine.

CREATE TABLE IF NOT EXISTS "op_provider"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_npi" TEXT NOT NULL,
  "data_specialty" TEXT NOT NULL,
  "data_screeningDate" DATE NOT NULL,
  "data_sitesEnrolled" NUMERIC(16,2) NOT NULL,
  "data_credentialNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_provider_due ON "op_provider"(due_date);

CREATE TABLE IF NOT EXISTS "op_claims"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_memberReference" TEXT NOT NULL,
  "data_providerReference" TEXT NOT NULL,
  "data_procedureCode" TEXT NOT NULL,
  "data_serviceDate" DATE NOT NULL,
  "data_decisionNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_claims_due ON "op_claims"(due_date);

CREATE TABLE IF NOT EXISTS "op_payment"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_checkNumber" TEXT NOT NULL,
  "data_providerReference" TEXT NOT NULL,
  "data_remitDate" DATE NOT NULL,
  "data_serviceLines" NUMERIC(16,2) NOT NULL,
  "data_remitNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_payment_due ON "op_payment"(due_date);

CREATE TABLE IF NOT EXISTS "op_priorauth"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_authorizationNumber" TEXT NOT NULL,
  "data_procedureCode" TEXT NOT NULL,
  "data_requestDate" DATE NOT NULL,
  "data_units" NUMERIC(16,2) NOT NULL,
  "data_clinicalNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_priorauth_due ON "op_priorauth"(due_date);

CREATE TABLE IF NOT EXISTS "op_tpl"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_otherPayer" TEXT NOT NULL,
  "data_policyNumber" TEXT NOT NULL,
  "data_cobOrder" NUMERIC(16,2) NOT NULL,
  "data_liabilityDate" DATE NOT NULL,
  "data_coordinationNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_tpl_due ON "op_tpl"(due_date);

CREATE TABLE IF NOT EXISTS "op_pharmacy"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_ndcCode" TEXT NOT NULL,
  "data_drugName" TEXT NOT NULL,
  "data_daysSupply" NUMERIC(16,2) NOT NULL,
  "data_prescriberNpi" TEXT NOT NULL,
  "data_pharmacyNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_pharmacy_due ON "op_pharmacy"(due_date);

CREATE TABLE IF NOT EXISTS "op_encounter"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_encounterType" TEXT NOT NULL,
  "data_managedCarePlan" TEXT NOT NULL,
  "data_encounterDate" DATE NOT NULL,
  "data_validationUnits" NUMERIC(16,2) NOT NULL,
  "data_validationNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_encounter_due ON "op_encounter"(due_date);

CREATE TABLE IF NOT EXISTS "op_fwa"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_caseType" TEXT NOT NULL,
  "data_detectionRule" TEXT NOT NULL,
  "data_alertScore" NUMERIC(16,2) NOT NULL,
  "data_lastReview" DATE NOT NULL,
  "data_investigationNotes" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_fwa_due ON "op_fwa"(due_date);

CREATE TABLE IF NOT EXISTS "op_provider_master"(
  id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,status TEXT NOT NULL,owner TEXT NOT NULL,risk TEXT NOT NULL,due_date DATE NOT NULL,amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  "data_recordId" TEXT NOT NULL,
  "data_name" TEXT NOT NULL,
  "data_status" TEXT NOT NULL,
  "data_effectiveDate" DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_provider_master_due ON "op_provider_master"(due_date);

-- Real claims model for the deterministic adjudication engine (X12 837/835 lifecycle).
CREATE TABLE IF NOT EXISTS mmis_claims(
  id BIGSERIAL PRIMARY KEY,
  icn TEXT UNIQUE NOT NULL,
  member_reference TEXT NOT NULL,
  member_id TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  procedure_code TEXT NOT NULL,
  service_date DATE NOT NULL,
  total_billed NUMERIC(16,2) NOT NULL DEFAULT 0,
  allowed NUMERIC(16,2) NOT NULL DEFAULT 0,
  paid NUMERIC(16,2) NOT NULL DEFAULT 0,
  patient_responsibility NUMERIC(16,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
  decision TEXT,
  denial_code TEXT,
  trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_837 TEXT,
  raw_835 TEXT,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mmis_claims_member ON mmis_claims(member_reference, service_date);
CREATE INDEX IF NOT EXISTS idx_mmis_claims_provider ON mmis_claims(provider_reference, service_date);
CREATE INDEX IF NOT EXISTS idx_mmis_claims_created ON mmis_claims(created_at DESC);
