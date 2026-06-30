# Mentis Rehab Architecture

## Platform Shape

Mentis Rehab is a three-sided SaaS platform:

- Personal users start with AI assessment, report upload, rehab education, plan drafts, homework and symptom tracking.
- Clinicians review AI summaries, validate risk, provide formal opinions, assign homework and manage follow-ups.
- Organizations join later as tenants that manage authorized customers, staff, service packages and offline rehabilitation workflows.

## Services

- **Business API (`apps/api`)**: account, case record, consent, clinician referral, consultation order, organization tenancy, audit logging.
- **AI Service (`apps/ai-service`)**: red-flag triage, RAG evidence retrieval, model routing, report explanation, rehab draft generation, evaluation harness.
- **Domain Package (`packages/domain`)**: shared types and business invariants used by API and Web.
- **Web App (`apps/web`)**: responsive product workspace for user-first MVP and future clinician/organization surfaces.

## Data Defaults

- PostgreSQL for structured users, clinicians, organizations, case records, assessments, plans, tasks, consultations and audit logs.
- Object storage for reports, images and future DICOM files.
- Existing local RAG project remains the first evidence source through `EvidenceRagService`; vector retrieval can replace TF-IDF later behind the same service boundary.

## Safety Invariants

- Red flags block rehab plan generation and trigger urgent referral.
- AI drafts must include non-diagnostic disclaimers.
- Organization access requires explicit user authorization.
- Medical-health data access and changes produce audit events.
- Qwen and DeepSeek are behind an LLM gateway so provider choice stays outside product logic.

