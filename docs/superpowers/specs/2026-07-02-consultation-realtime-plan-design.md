# Paid Consultation And Clinician Plan Design

Date: 2026-07-02

## Goal

Add a first version of paid, time-limited patient-to-clinician consultation while preserving an architecture that can grow into scheduling, payment, clinician operations, plan versioning, audit, and care-team collaboration.

The first version should be intentionally small: patients can reserve a 15-minute consultation, chat with an online clinician during the allowed window, and receive a clinician-created training plan for confirmation. The architecture must not assume there is only one plan source or that clinicians can browse all patients.

## Product Principles

- AI can generate a rehab plan draft.
- Clinicians can create and push custom plans.
- Patient acceptance is explicit. A pushed clinician plan appears as a message or notification and does not automatically replace the AI plan.
- Clinicians only see patients and cases tied to their own consultations.
- A consultation is a bounded paid service, not an always-open support chat.
- Registration can create different account roles, but clinician or doctor privileges require credential review.
- Login uses one entry point and then routes each role to a different workspace.
- The first implementation may mock payment, availability, and online presence, but the data model should leave room for real integrations.

## Recommended Approach

Use a platform-owned consultation model with scoped case authorization, plan lifecycle records, and a real-time message channel.

First phase:

- Add consultation sessions with fixed 15-minute duration.
- Treat payment as a simulated `paid` state.
- Store clinician online state in memory or demo server state.
- Use Server-Sent Events for first-phase real-time updates, with REST polling as fallback if needed. Keep the transport boundary narrow so WebSocket can replace it later.
- Add a clinician workbench that lists only assigned consultations.
- Add an action library and plan editor with a small seeded exercise set.
- Add patient-side plan notifications and accept or decline actions.

Long-term architecture:

- Replace simulated payment with a payment provider.
- Replace demo scheduling with clinician calendars and capacity rules.
- Store messages, plans, audit events, and authorizations in a persistent database.
- Support plan versions, clinician-reviewed AI plans, follow-up sessions, and multi-clinician organizations without changing the core domain vocabulary.

## Domain Model

### ConsultationSession

Represents one paid time-limited consultation between one patient and one clinician.

Fields:

- `id`
- `patientUserId`
- `clinicianId`
- `caseId`
- `status`: `scheduled`, `waiting_clinician`, `active`, `expired`, `closed`, `cancelled`
- `paymentStatus`: `unpaid`, `paid`, `refunded`
- `scheduledStartAt`
- `scheduledEndAt`
- `activatedAt`
- `closedAt`
- `durationMinutes`, initially `15`
- `createdAt`

Rules:

- A patient can only chat after payment is paid and the session window is open.
- The active chat window ends at `activatedAt + 15 minutes`.
- A paid session can be activated only during its scheduled window or a short grace period.
- If neither party activates the paid session during the allowed window, the session expires without opening chat.
- If the clinician is not online at the scheduled time, the session enters `waiting_clinician`.
- First phase should start the 15-minute timer when both parties are present. This is friendlier to patients while still preserving a hard bounded service.

### CaseAuthorization

Grants a clinician limited access to one case through one consultation.

Fields:

- `id`
- `caseId`
- `patientUserId`
- `clinicianId`
- `consultationSessionId`
- `scope`: `profile`, `assessment_summary`, `case_timeline`, `reports`, `current_plans`, `chat_history`
- `accessMode`: `read`, `comment`, `plan_create`
- `startsAt`
- `endsAt`
- `revokedAt`
- `createdAt`

Rules:

- A clinician cannot list all registered patients.
- A clinician can list only consultation sessions where `clinicianId` matches their own id.
- A clinician can read only the patient data granted by an active or historical authorization.
- After a consultation closes, the clinician may retain read-only access to that consultation record and sent plans, but cannot browse unrelated patient history.

### ConsultationThread And Message

Messages belong to a consultation, not to a global user inbox.

Message fields:

- `id`
- `consultationSessionId`
- `senderId`
- `senderRole`: `user`, `clinician`, `system`
- `content`
- `kind`: `text`, `system_notice`, `plan_offer`
- `createdAt`
- `readAt`

Rules:

- Text messages can be sent only while the session is active.
- System notices can be created before or after the active window.
- Plan offer messages can be sent by the clinician during the session or as a post-session summary action.

### TrainingPlan

Represents a plan visible to the patient.

Fields:

- `id`
- `caseId`
- `patientUserId`
- `source`: `ai_generated`, `clinician_custom`, `clinician_reviewed_ai`
- `authorId`
- `authorRole`: `assistant`, `clinician`
- `status`: `draft`, `sent_to_patient`, `accepted`, `declined`, `archived`
- `title`
- `dayLabel`
- `items`
- `stage`
- `precautions`
- `progressionCriteria`
- `createdAt`
- `sentAt`
- `acceptedAt`

Rules:

- AI plans and clinician plans can coexist.
- Patient acceptance controls whether a plan becomes an active execution plan.
- Accepting a clinician plan does not delete or overwrite the AI plan.
- Later implementations can add `parentPlanId` and `version` to support review and iteration.

### ActionLibraryItem

Reusable exercise action selected by a clinician or AI planner.

Fields:

- `id`
- `title`
- `bodyRegion`
- `phase`
- `defaultDosage`
- `instructions`
- `contraindications`
- `progressionCriteria`
- `mediaUrl`
- `tags`

First phase can seed a small knee-focused library and expand later.

## Registration And Role Routing

The app should keep one login entry point, but registration has an account-type choice.

Patient registration:

- User chooses "患者".
- User enters username, password, invite code, display name, height, and weight.
- The account is created with `role = user`.
- After login or registration, the user enters the patient workspace.

Clinician or doctor registration:

- User chooses "康复师/医生".
- User enters username, password, invite code, display name, discipline, credential summary, specialties, and optional organization.
- The account is created with `role = clinician` and `credentialStatus = pending`.
- A pending clinician cannot be booked by patients and cannot access patient records.
- After login, a pending clinician sees a credential-review waiting page.
- A verified clinician enters the clinician workbench.
- A rejected clinician sees a credential-rejected page with next steps.

First phase can seed one verified demo clinician for testing. This is not a substitute for the role model; it is only a local demo path.

Post-login routing:

- `user` -> patient workspace.
- `clinician` + `credentialStatus = verified` -> clinician workbench.
- `clinician` + `credentialStatus = pending` -> credential-review waiting page.
- `clinician` + `credentialStatus = rejected` -> credential-rejected page.
- `organization` -> future organization workspace.
- `admin` -> future admin/audit workspace.

## Patient Experience

### Appointment

The patient starts from an AI assessment, case page, or support card.

Flow:

1. Patient chooses a clinician or accepts the recommended clinician.
2. Patient selects an available 15-minute slot.
3. Payment is simulated as successful in first phase.
4. A consultation card appears with scheduled time, clinician name, countdown, and linked case.
5. Before the session opens, the chat composer is locked.

### Live Consultation

Before start:

- Show countdown.
- Show clinician online state if known.
- Allow patient to review the linked case and AI summary.

At start:

- If clinician is online, mark session `active`.
- If clinician is not online, mark session `waiting_clinician` and show a waiting state.
- Start the 15-minute timer once both parties are present in first phase.

During session:

- Enable real-time chat.
- Show remaining time.
- Show medical disclaimer and emergency escalation language.

After time expires:

- Lock the chat composer.
- Keep the transcript readable.
- Show any clinician plan offers or consultation summary.

### Plan Offer

When a clinician sends a plan:

- Patient receives an in-app notification and a message in the consultation thread.
- Patient sees plan source as "康复师定制".
- Patient can choose "接受并加入我的计划" or "暂不接受".
- The accepted plan appears in "我的计划" without deleting AI-generated plans.

## Clinician Experience

### Workbench

Clinician home shows:

- Today's consultations.
- Waiting sessions.
- Active sessions.
- Recently closed sessions.

It does not show a global patient directory.

### Patient Case Panel

Inside a consultation, the clinician can see only authorized data:

- Basic patient profile.
- Main complaint.
- AI assessment summary.
- Case timeline.
- Uploaded reports that belong to the linked case.
- Existing AI plan and accepted plans for that case.
- Consultation transcript.

Each access should create an audit event.

### Live Chat

The clinician chat page shows:

- Session status.
- Patient and case summary.
- Countdown timer.
- Online presence.
- Message thread.
- Quick clinical note snippets.
- Button to create a plan.

### Plan Editor

The first phase editor should support:

- Starting from a default template.
- Selecting actions from the library.
- Editing title, stage, frequency, dosage, precautions, and progression criteria.
- Sending the plan to the patient for confirmation.

The editor creates a `TrainingPlan` with `source = clinician_custom` and `status = sent_to_patient`.

## API Surface

First-phase REST endpoints:

- `GET /v1/clinicians/:clinicianId/consultations`
- `POST /v1/consultations`
- `GET /v1/consultations/:sessionId`
- `POST /v1/consultations/:sessionId/join`
- `POST /v1/consultations/:sessionId/close`
- `GET /v1/consultations/:sessionId/messages`
- `POST /v1/consultations/:sessionId/messages`
- `GET /v1/action-library`
- `POST /v1/consultations/:sessionId/plans`
- `POST /v1/plans/:planId/accept`
- `POST /v1/plans/:planId/decline`

Real-time channel:

- `consultation:{sessionId}:messages`
- `consultation:{sessionId}:presence`
- `consultation:{sessionId}:timer`
- `patient:{patientUserId}:notifications`

All endpoints must verify actor identity and session-scoped authorization.

## Frontend Changes

Patient side:

- Add account-type choice during registration.
- Add consultation entry point from current case and support panel.
- Add appointment and countdown states.
- Add live consultation chat view.
- Add notification for clinician-pushed plans.
- Update "我的计划" to show multiple plan sources and accepted state.

Clinician side:

- Route verified clinician users to a clinician workbench after login.
- Route pending clinician users to a credential-review waiting page.
- Route rejected clinician users to a credential-rejected page.
- Add consultation list.
- Add consultation detail with patient case panel and chat.
- Add plan editor with seeded action library.

Current project fit:

- Existing `AuthRole` already includes `clinician`.
- Existing `CaseRecord` already contains authorized clinician ids.
- Existing AI `planPatch` can become an `ai_generated` plan.
- Existing "我的计划" page can evolve from single memory plan into source-aware plan list.

## Safety, Privacy, And Audit

Audit events should be created for:

- Consultation created.
- Payment marked paid.
- Clinician joined session.
- Patient data viewed.
- Message sent.
- Plan sent.
- Plan accepted or declined.
- Authorization changed or revoked.

Safety boundaries:

- Chat and plans remain medical guidance, not diagnosis.
- Red-flag language remains visible.
- The session can display emergency guidance outside the paid chat window.
- Clinicians cannot access unlinked cases or global patient lists.

## First-Phase Scope

Included:

- Demo consultation model.
- Simulated paid appointment.
- 15-minute session state machine.
- Patient and clinician chat UI.
- Basic online state.
- Clinician-only assigned consultation list.
- Scoped patient case view.
- Seeded action library.
- Clinician custom plan send flow.
- Patient accept or decline flow.

Deferred:

- Real payment integration.
- Full clinician calendar management.
- Push notifications outside the app.
- Video or voice calls.
- Persistent production database migration.
- Organization-level care teams.
- Multi-session package pricing.
- Full exercise media library.

## Testing

Domain tests:

- Clinician cannot access a case without session authorization.
- Patient can access their own session and plans.
- Chat messages are rejected outside an active session.
- Session transitions from scheduled to waiting or active correctly.
- Expired sessions reject new text messages.
- Accepting a clinician plan does not delete AI plans.

API tests:

- Clinician consultation list returns only assigned sessions.
- Plan creation requires clinician authorization for the session.
- Patient accept and decline endpoints require plan ownership.
- Unauthorized actors receive errors for session messages and case data.

Frontend checks:

- Patient chat composer is locked before session start and after expiry.
- Clinician workbench hides unrelated patients.
- Plan offer notification renders and can be accepted.
- "我的计划" displays plan source and status.

## Real-Time Transport

The first implementation should use Server-Sent Events for receiving messages, presence changes, timer ticks, and plan notifications. Sending messages can remain a normal authenticated `POST`.

This fits the current Node HTTP server without adding a large dependency. The message and session domain model should not depend on SSE, so a later WebSocket upgrade only changes the transport layer.
