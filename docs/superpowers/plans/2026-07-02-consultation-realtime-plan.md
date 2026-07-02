# Consultation Realtime Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first small but extensible paid consultation loop: scheduled 15-minute clinician chat, scoped patient access, clinician custom plan push, and patient accept/decline.

**Architecture:** Add durable domain vocabulary first, then wire it into the demo API state, then expose patient and clinician screens. First phase uses in-memory demo data and REST plus Server-Sent Events; the types and service functions are transport-agnostic so payment, database persistence, and WebSocket can be added in a future phase.

**Tech Stack:** TypeScript, Vitest, Node HTTP server, React 19, Vite, existing `@mentis/domain`, `@mentis/api`, and `@mentis/web` workspaces.

---

## File Structure

- Modify `packages/domain/src/index.ts`: add consultation, authorization, training plan, action library, and helper functions.
- Modify `packages/domain/test/clinical-safety.test.ts`: add domain access, session, and plan lifecycle tests.
- Modify `apps/api/src/index.ts`: extend demo platform state with consultations, messages, plans, action library, and service functions.
- Modify `apps/api/src/server.ts`: add REST routes and an SSE route for consultation updates.
- Modify `apps/api/test/orchestrator.test.ts`: add API-level orchestration tests for scoped access, active chat, and plan acceptance.
- Modify `apps/web/src/App.tsx`: add patient consultation UX and clinician workbench UX inside the existing single-page app.
- Modify `apps/web/src/styles.css`: add responsive styles for consultation cards, clinician workbench, chat status, and plan offers.
- Keep React changes in `App.tsx` for this first phase to match the current project style. Do not split components in this implementation pass.

## Task 1: Domain Types And Rules

**Files:**
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/test/clinical-safety.test.ts`

- [ ] **Step 1: Add failing domain tests**

Append these tests to `packages/domain/test/clinical-safety.test.ts` inside the existing `describe("clinical safety and case access", () => { ... })` block. Also add the imported symbols shown below to the import list from `../src/index`.

```ts
  buildCaseAuthorization,
  canAccessAuthorizedCase,
  canSendConsultationMessage,
  createTrainingPlan,
  activateConsultationSession,
  expireConsultationSession,
  type CaseAuthorization,
  type ConsultationSession,
```

```ts
  it("limits clinician case access to explicit consultation authorization", () => {
    const authorization = buildCaseAuthorization({
      caseId: "case_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      consultationSessionId: "consult_1",
      scope: ["profile", "assessment_summary", "current_plans"],
      accessMode: ["read", "plan_create"],
      startsAt: "2026-07-02T02:00:00.000Z",
      endsAt: "2026-07-02T03:00:00.000Z",
    });

    const clinician: Clinician = {
      id: "clinician_1",
      role: "clinician",
      displayName: "李康复师",
      credentialStatus: "verified",
      specialties: ["knee"],
    };
    const otherClinician: Clinician = {
      id: "clinician_2",
      role: "clinician",
      displayName: "王医生",
      credentialStatus: "verified",
      specialties: ["shoulder"],
    };

    expect(canAccessAuthorizedCase(clinician, authorization, "case_1")).toBe(true);
    expect(canAccessAuthorizedCase(otherClinician, authorization, "case_1")).toBe(false);
    expect(canAccessAuthorizedCase(clinician, authorization, "case_2")).toBe(false);
  });

  it("opens a 15 minute consultation when both parties are present", () => {
    const session: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "scheduled",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    const active = activateConsultationSession(session, "2026-07-02T02:03:00.000Z");

    expect(active.status).toBe("active");
    expect(active.activatedAt).toBe("2026-07-02T02:03:00.000Z");
    expect(active.expiresAt).toBe("2026-07-02T02:18:00.000Z");
    expect(canSendConsultationMessage(active, "2026-07-02T02:17:59.000Z")).toBe(true);
    expect(canSendConsultationMessage(active, "2026-07-02T02:18:00.000Z")).toBe(false);
  });

  it("expires inactive or elapsed consultations and rejects chat", () => {
    const active: ConsultationSession = {
      id: "consult_1",
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_1",
      status: "active",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      activatedAt: "2026-07-02T02:03:00.000Z",
      expiresAt: "2026-07-02T02:18:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    };

    const expired = expireConsultationSession(active, "2026-07-02T02:20:00.000Z");

    expect(expired.status).toBe("expired");
    expect(expired.closedAt).toBe("2026-07-02T02:20:00.000Z");
    expect(canSendConsultationMessage(expired, "2026-07-02T02:20:01.000Z")).toBe(false);
  });

  it("keeps AI and clinician plans as separate patient-confirmed records", () => {
    const aiPlan = createTrainingPlan({
      id: "plan_ai",
      caseId: "case_1",
      patientUserId: "user_1",
      source: "ai_generated",
      authorId: "assistant",
      authorRole: "assistant",
      status: "accepted",
      title: "AI 膝盖保守计划",
      dayLabel: "第 1 天",
      items: [{ title: "等长伸膝", meta: "3 组 x 30 秒", state: "todo" }],
      stage: { name: "镇痛与负荷管理", progressLabel: "第 1 周", progressPercent: 10, goals: ["疼痛可控"] },
      precautions: ["疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:00:00.000Z",
      acceptedAt: "2026-07-02T02:01:00.000Z",
    });
    const clinicianPlan = createTrainingPlan({
      id: "plan_clinician",
      caseId: "case_1",
      patientUserId: "user_1",
      source: "clinician_custom",
      authorId: "clinician_1",
      authorRole: "clinician",
      status: "sent_to_patient",
      title: "康复师定制膝前痛计划",
      dayLabel: "第 1 天",
      items: [{ title: "靠墙静蹲", meta: "4 组 x 20 秒", state: "todo" }],
      stage: { name: "负荷控制", progressLabel: "第 1 周", progressPercent: 15, goals: ["恢复下楼耐受"] },
      precautions: ["不做跳跃"],
      progressionCriteria: ["下楼疼痛不超过 3/10"],
      createdAt: "2026-07-02T02:10:00.000Z",
      sentAt: "2026-07-02T02:12:00.000Z",
    });

    expect(aiPlan.source).toBe("ai_generated");
    expect(clinicianPlan.source).toBe("clinician_custom");
    expect(aiPlan.id).not.toBe(clinicianPlan.id);
    expect(clinicianPlan.status).toBe("sent_to_patient");
  });
```

- [ ] **Step 2: Run the domain tests and verify failure**

Run:

```bash
npm run test -w @mentis/domain
```

Expected: FAIL with missing exports such as `buildCaseAuthorization`, `ConsultationSession`, and `createTrainingPlan`.

- [ ] **Step 3: Implement domain types and helpers**

Add these exports to `packages/domain/src/index.ts` after the existing `CaseRecord` interface and before evidence types.

```ts
export type ConsultationStatus = "scheduled" | "waiting_clinician" | "active" | "expired" | "closed" | "cancelled";
export type ConsultationPaymentStatus = "unpaid" | "paid" | "refunded";

export interface ConsultationSession {
  id: string;
  patientUserId: string;
  clinicianId: string;
  caseId: string;
  status: ConsultationStatus;
  paymentStatus: ConsultationPaymentStatus;
  scheduledStartAt: string;
  scheduledEndAt: string;
  activatedAt?: string;
  expiresAt?: string;
  closedAt?: string;
  durationMinutes: number;
  createdAt: string;
}

export type CaseAuthorizationScope =
  | "profile"
  | "assessment_summary"
  | "case_timeline"
  | "reports"
  | "current_plans"
  | "chat_history";

export type CaseAuthorizationAccessMode = "read" | "comment" | "plan_create";

export interface CaseAuthorization {
  id: string;
  caseId: string;
  patientUserId: string;
  clinicianId: string;
  consultationSessionId: string;
  scope: CaseAuthorizationScope[];
  accessMode: CaseAuthorizationAccessMode[];
  startsAt: string;
  endsAt: string;
  revokedAt?: string;
  createdAt: string;
}

export type ConsultationMessageKind = "text" | "system_notice" | "plan_offer";

export interface ConsultationMessage {
  id: string;
  consultationSessionId: string;
  senderId: string;
  senderRole: "user" | "clinician" | "system";
  content: string;
  kind: ConsultationMessageKind;
  createdAt: string;
  readAt?: string;
}

export type TrainingPlanSource = "ai_generated" | "clinician_custom" | "clinician_reviewed_ai";
export type TrainingPlanStatus = "draft" | "sent_to_patient" | "accepted" | "declined" | "archived";

export interface TrainingPlanItem {
  title: string;
  meta: string;
  state: "done" | "todo";
}

export interface TrainingPlanStage {
  name: string;
  progressLabel: string;
  progressPercent: number;
  goals: string[];
}

export interface TrainingPlan {
  id: string;
  caseId: string;
  patientUserId: string;
  source: TrainingPlanSource;
  authorId: string;
  authorRole: "assistant" | "clinician";
  status: TrainingPlanStatus;
  title: string;
  dayLabel: string;
  items: TrainingPlanItem[];
  stage: TrainingPlanStage;
  precautions: string[];
  progressionCriteria: string[];
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
}

export interface ActionLibraryItem {
  id: string;
  title: string;
  bodyRegion: Assessment["bodyRegion"];
  phase: string;
  defaultDosage: string;
  instructions: string[];
  contraindications: string[];
  progressionCriteria: string[];
  mediaUrl?: string;
  tags: string[];
}
```

Add these helper functions near `canAccessCase`.

```ts
export function buildCaseAuthorization(
  input: Omit<CaseAuthorization, "id" | "createdAt"> & { id?: string; createdAt?: string },
): CaseAuthorization {
  return {
    ...input,
    id: input.id ?? `auth_${cryptoSafeId()}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function canAccessAuthorizedCase(
  actor: PlatformActor,
  authorization: CaseAuthorization,
  caseId: string,
): boolean {
  if (actor.role === "admin") {
    return true;
  }
  if (authorization.revokedAt) {
    return false;
  }
  if (caseId !== authorization.caseId) {
    return false;
  }
  if (actor.role === "user") {
    return actor.id === authorization.patientUserId;
  }
  if (actor.role === "clinician") {
    return actor.id === authorization.clinicianId;
  }
  return false;
}

export function activateConsultationSession(
  session: ConsultationSession,
  activatedAt = new Date().toISOString(),
): ConsultationSession {
  if (session.paymentStatus !== "paid") {
    throw new Error("Consultation must be paid before activation");
  }
  if (session.status === "cancelled" || session.status === "closed" || session.status === "expired") {
    throw new Error(`Cannot activate consultation with status ${session.status}`);
  }

  const expiresAt = new Date(new Date(activatedAt).getTime() + session.durationMinutes * 60_000).toISOString();
  return {
    ...session,
    status: "active",
    activatedAt,
    expiresAt,
  };
}

export function expireConsultationSession(
  session: ConsultationSession,
  closedAt = new Date().toISOString(),
): ConsultationSession {
  if (session.status === "closed" || session.status === "cancelled") {
    return session;
  }
  return {
    ...session,
    status: "expired",
    closedAt,
  };
}

export function canSendConsultationMessage(
  session: ConsultationSession,
  at = new Date().toISOString(),
): boolean {
  if (session.status !== "active" || !session.expiresAt) {
    return false;
  }
  return new Date(at).getTime() < new Date(session.expiresAt).getTime();
}

export function createTrainingPlan(input: TrainingPlan): TrainingPlan {
  return {
    ...input,
    stage: {
      ...input.stage,
      progressPercent: clamp(input.stage.progressPercent, 0, 100),
    },
  };
}
```

- [ ] **Step 4: Run the domain tests and verify pass**

Run:

```bash
npm run test -w @mentis/domain
```

Expected: PASS.

- [ ] **Step 5: Commit domain changes**

Run:

```bash
git add packages/domain/src/index.ts packages/domain/test/clinical-safety.test.ts
git commit -m "feat: add consultation domain model"
```

Expected: commit succeeds with only the domain files staged.

## Task 2: API Consultation State And Service Functions

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/test/orchestrator.test.ts`

- [ ] **Step 1: Add failing API service tests**

Extend the imports in `apps/api/test/orchestrator.test.ts` with:

```ts
  acceptConsultationPlan,
  createConsultationSession,
  createClinicianPlanForConsultation,
  getClinicianConsultations,
  getConsultationSnapshot,
  joinConsultationSession,
  listActionLibrary,
  sendConsultationMessage,
```

Append this test block:

```ts
describe("consultation orchestration", () => {
  it("authenticates a demo clinician into the clinician role", () => {
    const platform = createPlatformDemo();

    const session = authenticateDemoUser(platform, {
      username: "clinician_demo",
      password: "mentis_clinician",
    });

    expect(session.user.id).toBe("clinician_1");
    expect(session.user.role).toBe("clinician");
    expect(session.user.displayName).toBe("李康复师");
  });

  it("registers patients and pending clinicians through the same auth endpoint", () => {
    const platform = createPlatformDemo();

    const patient = registerDemoUser(platform, {
      accountRole: "user",
      username: "patient_new",
      password: "secret",
      displayName: "新患者",
      inviteCode: "ique1116",
      heightCm: "176",
      weightKg: "70",
    });

    const clinician = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "clinician_new",
      password: "secret",
      displayName: "新康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      discipline: "运动康复师",
      credentialSummary: "三年跑步损伤康复经验",
      specialties: ["knee", "running"],
      organizationName: "个人执业",
    });

    expect(patient.user.role).toBe("user");
    expect(clinician.user.role).toBe("clinician");
    expect(clinician.user).toMatchObject({
      credentialStatus: "pending",
      specialties: ["knee", "running"],
    });
    expect(getClinicianConsultations(platform, clinician.user.id)).toHaveLength(0);
  });

  it("shows clinicians only their assigned consultations", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    expect(session.paymentStatus).toBe("paid");
    expect(getClinicianConsultations(platform, "clinician_1")).toHaveLength(1);
    expect(getClinicianConsultations(platform, "clinician_missing")).toHaveLength(0);
  });

  it("activates chat only after clinician and patient join", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    const patientWaiting = joinConsultationSession(platform, session.id, "user_1", "user", "2026-07-02T02:01:00.000Z");
    expect(patientWaiting.status).toBe("waiting_clinician");

    const active = joinConsultationSession(platform, session.id, "clinician_1", "clinician", "2026-07-02T02:02:00.000Z");
    expect(active.status).toBe("active");

    const message = sendConsultationMessage(platform, session.id, {
      senderId: "user_1",
      senderRole: "user",
      content: "我今天下楼还是疼。",
      createdAt: "2026-07-02T02:03:00.000Z",
    });
    expect(message.content).toContain("下楼");
  });

  it("lets a clinician send a plan offer and patient accept it without removing AI plans", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    const action = listActionLibrary(platform)[0];
    const plan = createClinicianPlanForConsultation(platform, session.id, "clinician_1", {
      title: "康复师定制膝前痛计划",
      dayLabel: "第 1 天",
      actionIds: [action.id],
      precautions: ["训练中疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
    });

    expect(plan.status).toBe("sent_to_patient");
    expect(plan.source).toBe("clinician_custom");

    const accepted = acceptConsultationPlan(platform, plan.id, "user_1", "2026-07-02T02:20:00.000Z");
    const snapshot = getConsultationSnapshot(platform, session.id, "user_1", "user");

    expect(accepted.status).toBe("accepted");
    expect(snapshot.plans.map((candidate) => candidate.id)).toContain(plan.id);
    expect(snapshot.messages.some((message) => message.kind === "plan_offer")).toBe(true);
  });
});
```

- [ ] **Step 2: Run API tests and verify failure**

Run:

```bash
npm run test -w @mentis/api
```

Expected: FAIL with missing service exports.

- [ ] **Step 3: Extend API imports and platform interfaces**

Modify the import from `@mentis/domain` in `apps/api/src/index.ts` to include:

```ts
  activateConsultationSession,
  buildCaseAuthorization,
  canAccessAuthorizedCase,
  canSendConsultationMessage,
  createTrainingPlan,
  expireConsultationSession,
  type ActionLibraryItem,
  type CaseAuthorization,
  type ConsultationMessage,
  type ConsultationSession,
  type TrainingPlan,
```

Extend `PlatformDemo`:

```ts
export interface PlatformDemo {
  users: User[];
  clinicians: Clinician[];
  demoCredentials: DemoCredential[];
  userMemories: Record<string, UserMemory>;
  consultations: ConsultationSession[];
  caseAuthorizations: CaseAuthorization[];
  consultationMessages: ConsultationMessage[];
  trainingPlans: TrainingPlan[];
  actionLibrary: ActionLibraryItem[];
  presence: Record<string, { patientPresent: boolean; clinicianPresent: boolean }>;
}
```

Change the authentication types in `apps/api/src/index.ts` so demo credentials can point to either a patient or a clinician.

```ts
export type AuthenticatedActor = ProfiledUser | Clinician;

export interface DemoCredential {
  username: string;
  password: string;
  actorId: string;
  actorRole: "user" | "clinician";
}

export interface AuthenticatedSession {
  token: string;
  user: AuthenticatedActor;
  memory: UserMemory;
}

export interface RegistrationInput {
  accountRole: "user" | "clinician";
  username: string;
  password: string;
  displayName: string;
  inviteCode: string;
  heightCm: string;
  weightKg: string;
  discipline?: string;
  credentialSummary?: string;
  specialties?: string[];
  organizationName?: string;
}
```

Replace `authenticateDemoUser` with this version:

```ts
export function authenticateDemoUser(platform: PlatformDemo, input: LoginInput): AuthenticatedSession {
  const credential = platform.demoCredentials.find(
    (candidate) => candidate.username === input.username && candidate.password === input.password,
  );
  if (!credential) {
    throw new Error("Invalid username or password");
  }

  if (credential.actorRole === "clinician") {
    const clinician = platform.clinicians.find((candidate) => candidate.id === credential.actorId);
    if (!clinician) {
      throw new Error(`Unknown clinician: ${credential.actorId}`);
    }
    return {
      token: `demo_${clinician.id}_${demoTokenId()}`,
      user: clinician,
      memory: emptyUserMemory(clinician.id),
    };
  }

  const user = platform.users.find((candidate) => candidate.id === credential.actorId) as ProfiledUser | undefined;
  if (!user) {
    throw new Error(`Unknown user: ${credential.actorId}`);
  }

  return {
    token: `demo_${user.id}_${demoTokenId()}`,
    user,
    memory: getUserMemory(platform, user.id),
  };
}
```

Add this helper near `getUserMemory`:

```ts
function emptyUserMemory(userId: string): UserMemory {
  return {
    userId,
    cases: [],
    trainingPlans: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
}
```

Update `registerDemoUser` credential creation to use the new fields:

```ts
export function registerDemoUser(platform: PlatformDemo, input: RegistrationInput): AuthenticatedSession {
  const username = input.username.trim();
  if (!username) {
    throw new Error("Username is required");
  }
  if (input.inviteCode.trim() !== "ique1116") {
    throw new Error("Invalid invite code");
  }
  if (!input.password.trim()) {
    throw new Error("Password is required");
  }

  if (input.accountRole === "clinician") {
    const clinicianId = `clinician_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const clinician: Clinician = {
      id: clinicianId,
      role: "clinician",
      displayName: input.displayName.trim() || "待审核康复师",
      credentialStatus: "pending",
      specialties: normalizeSpecialties(input.specialties, input.discipline),
    };
    platform.clinicians = [clinician, ...platform.clinicians.filter((candidate) => candidate.id !== clinician.id)];
    platform.demoCredentials = [
      { username, password: input.password, actorId: clinician.id, actorRole: "clinician" },
      ...platform.demoCredentials.filter((candidate) => candidate.username !== username),
    ];
    return {
      token: `demo_${clinician.id}_${demoTokenId()}`,
      user: clinician,
      memory: emptyUserMemory(clinician.id),
    };
  }

  const userId = `user_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const user: ProfiledUser = {
    id: userId,
    role: "user",
    displayName: input.displayName.trim() || "ique1116",
    profile: {
      heightCm: input.heightCm.trim(),
      weightKg: input.weightKg.trim(),
    },
  };

  platform.users = [user, ...platform.users.filter((candidate) => candidate.id !== user.id)];
  platform.demoCredentials = [
    { username, password: input.password, actorId: user.id, actorRole: "user" },
    ...platform.demoCredentials.filter((candidate) => candidate.username !== username),
  ];
  platform.userMemories[user.id] = emptyUserMemory(user.id);

  return {
    token: `demo_${user.id}_${demoTokenId()}`,
    user,
    memory: getUserMemory(platform, user.id),
  };
}

function normalizeSpecialties(specialties: string[] | undefined, discipline: string | undefined): string[] {
  const normalized = (specialties ?? [])
    .map((specialty) => specialty.trim())
    .filter(Boolean);
  if (normalized.length > 0) {
    return normalized;
  }
  return discipline?.trim() ? [discipline.trim()] : [];
}
```

- [ ] **Step 4: Seed consultations infrastructure in `createPlatformDemo`**

Inside the returned object from `createPlatformDemo`, add:

```ts
    consultations: [],
    caseAuthorizations: [],
    consultationMessages: [],
    trainingPlans: [],
    actionLibrary: buildSeedActionLibrary(),
    presence: {},
```

Also change the `demoCredentials` value in `createPlatformDemo` to include a stable clinician login:

```ts
    demoCredentials: [
      ...getDemoCredentials(),
      {
        username: "clinician_demo",
        password: "mentis_clinician",
        actorId: "clinician_1",
        actorRole: "clinician",
      },
    ],
```

Update `getDemoCredentials` to return the new credential shape:

```ts
  return [{ username, password, actorId: "user_1", actorRole: "user" }];
```

Add this helper near `createPlatformDemo`:

```ts
function buildSeedActionLibrary(): ActionLibraryItem[] {
  return [
    {
      id: "action_quad_iso",
      title: "股四头肌等长收缩",
      bodyRegion: "knee",
      phase: "镇痛与激活",
      defaultDosage: "3 组 x 30 秒",
      instructions: ["坐位或仰卧位伸直膝盖", "轻轻绷紧大腿前侧", "保持呼吸，不要憋气"],
      contraindications: ["训练中疼痛明显加重", "术后限制未确认"],
      progressionCriteria: ["完成后 24 小时无明显加重"],
      tags: ["膝盖", "等长", "低刺激"],
    },
    {
      id: "action_wall_sit",
      title: "靠墙静蹲",
      bodyRegion: "knee",
      phase: "负荷控制",
      defaultDosage: "4 组 x 20 秒",
      instructions: ["背靠墙缓慢下蹲到可耐受角度", "膝盖对齐脚尖", "保持疼痛不超过 3/10"],
      contraindications: ["明显肿胀", "无法承重", "急性外伤后未评估"],
      progressionCriteria: ["可完成 4 组且次日无加重"],
      tags: ["膝盖", "股四头肌", "静态"],
    },
  ];
}
```

- [ ] **Step 5: Implement consultation service functions**

Add these exports after `rememberTrainingPlan`.

```ts
export interface ConsultationCreateInput {
  patientUserId: string;
  clinicianId: string;
  caseId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
}

export interface ConsultationSnapshot {
  session: ConsultationSession;
  authorization: CaseAuthorization;
  messages: ConsultationMessage[];
  plans: TrainingPlan[];
  actionLibrary: ActionLibraryItem[];
}

export function createConsultationSession(platform: PlatformDemo, input: ConsultationCreateInput): ConsultationSession {
  const patient = platform.users.find((candidate) => candidate.id === input.patientUserId);
  const clinician = platform.clinicians.find((candidate) => candidate.id === input.clinicianId);
  if (!patient) {
    throw new Error(`Unknown patient: ${input.patientUserId}`);
  }
  if (!clinician) {
    throw new Error(`Unknown clinician: ${input.clinicianId}`);
  }

  const now = new Date().toISOString();
  const session: ConsultationSession = {
    id: `consult_${demoTokenId()}`,
    patientUserId: input.patientUserId,
    clinicianId: input.clinicianId,
    caseId: input.caseId,
    status: "scheduled",
    paymentStatus: "paid",
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt: input.scheduledEndAt,
    durationMinutes: 15,
    createdAt: now,
  };
  const authorization = buildCaseAuthorization({
    caseId: input.caseId,
    patientUserId: input.patientUserId,
    clinicianId: input.clinicianId,
    consultationSessionId: session.id,
    scope: ["profile", "assessment_summary", "case_timeline", "current_plans", "chat_history"],
    accessMode: ["read", "plan_create"],
    startsAt: input.scheduledStartAt,
    endsAt: input.scheduledEndAt,
  });

  platform.consultations = [session, ...platform.consultations];
  platform.caseAuthorizations = [authorization, ...platform.caseAuthorizations];
  platform.presence[session.id] = { patientPresent: false, clinicianPresent: false };
  platform.consultationMessages = [
    {
      id: `msg_${demoTokenId()}`,
      consultationSessionId: session.id,
      senderId: "system",
      senderRole: "system",
      content: "问诊已预约成功，双方进入后开启 15 分钟实时聊天。",
      kind: "system_notice",
      createdAt: now,
    },
    ...platform.consultationMessages,
  ];
  return session;
}

export function getClinicianConsultations(platform: PlatformDemo, clinicianId: string): ConsultationSession[] {
  return platform.consultations.filter((session) => session.clinicianId === clinicianId);
}

export function getConsultationSnapshot(
  platform: PlatformDemo,
  sessionId: string,
  actorId: string,
  actorRole: "user" | "clinician",
): ConsultationSnapshot {
  const session = requireConsultation(platform, sessionId);
  const authorization = requireAuthorization(platform, sessionId);
  const actor = actorRole === "user"
    ? platform.users.find((candidate) => candidate.id === actorId)
    : platform.clinicians.find((candidate) => candidate.id === actorId);
  if (!actor || !canAccessAuthorizedCase(actor, authorization, session.caseId)) {
    throw new Error("Consultation access denied");
  }

  return {
    session,
    authorization,
    messages: platform.consultationMessages
      .filter((message) => message.consultationSessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    plans: platform.trainingPlans.filter((plan) => plan.caseId === session.caseId && plan.patientUserId === session.patientUserId),
    actionLibrary: platform.actionLibrary,
  };
}

export function joinConsultationSession(
  platform: PlatformDemo,
  sessionId: string,
  actorId: string,
  actorRole: "user" | "clinician",
  joinedAt = new Date().toISOString(),
): ConsultationSession {
  const session = requireConsultation(platform, sessionId);
  if (actorRole === "user" && actorId !== session.patientUserId) {
    throw new Error("Patient is not assigned to consultation");
  }
  if (actorRole === "clinician" && actorId !== session.clinicianId) {
    throw new Error("Clinician is not assigned to consultation");
  }

  const presence = platform.presence[sessionId] ?? { patientPresent: false, clinicianPresent: false };
  const nextPresence = {
    patientPresent: presence.patientPresent || actorRole === "user",
    clinicianPresent: presence.clinicianPresent || actorRole === "clinician",
  };
  platform.presence[sessionId] = nextPresence;

  const nextSession = nextPresence.patientPresent && nextPresence.clinicianPresent
    ? activateConsultationSession(session, joinedAt)
    : { ...session, status: "waiting_clinician" as const };
  replaceConsultation(platform, nextSession);
  return nextSession;
}

export function sendConsultationMessage(
  platform: PlatformDemo,
  sessionId: string,
  input: Pick<ConsultationMessage, "senderId" | "senderRole" | "content"> & { createdAt?: string },
): ConsultationMessage {
  const session = requireConsultation(platform, sessionId);
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (input.senderRole !== "system" && !canSendConsultationMessage(session, createdAt)) {
    throw new Error("Consultation chat is not active");
  }
  const message: ConsultationMessage = {
    id: `msg_${demoTokenId()}`,
    consultationSessionId: sessionId,
    senderId: input.senderId,
    senderRole: input.senderRole,
    content: input.content.trim(),
    kind: input.senderRole === "system" ? "system_notice" : "text",
    createdAt,
  };
  platform.consultationMessages = [...platform.consultationMessages, message];
  return message;
}

export function listActionLibrary(platform: PlatformDemo): ActionLibraryItem[] {
  return platform.actionLibrary;
}

export interface ClinicianPlanInput {
  title: string;
  dayLabel: string;
  actionIds: string[];
  precautions: string[];
  progressionCriteria: string[];
}

export function createClinicianPlanForConsultation(
  platform: PlatformDemo,
  sessionId: string,
  clinicianId: string,
  input: ClinicianPlanInput,
): TrainingPlan {
  const session = requireConsultation(platform, sessionId);
  const authorization = requireAuthorization(platform, sessionId);
  if (session.clinicianId !== clinicianId || !authorization.accessMode.includes("plan_create")) {
    throw new Error("Clinician cannot create plan for consultation");
  }
  const actions = input.actionIds.map((id) => {
    const action = platform.actionLibrary.find((candidate) => candidate.id === id);
    if (!action) {
      throw new Error(`Unknown action: ${id}`);
    }
    return action;
  });
  const now = new Date().toISOString();
  const plan = createTrainingPlan({
    id: `plan_${demoTokenId()}`,
    caseId: session.caseId,
    patientUserId: session.patientUserId,
    source: "clinician_custom",
    authorId: clinicianId,
    authorRole: "clinician",
    status: "sent_to_patient",
    title: input.title,
    dayLabel: input.dayLabel,
    items: actions.map((action) => ({ title: action.title, meta: action.defaultDosage, state: "todo" })),
    stage: {
      name: actions[0]?.phase ?? "康复训练",
      progressLabel: input.dayLabel,
      progressPercent: 10,
      goals: actions.flatMap((action) => action.progressionCriteria).slice(0, 3),
    },
    precautions: input.precautions,
    progressionCriteria: input.progressionCriteria,
    createdAt: now,
    sentAt: now,
  });
  platform.trainingPlans = [plan, ...platform.trainingPlans];
  platform.consultationMessages = [
    ...platform.consultationMessages,
    {
      id: `msg_${demoTokenId()}`,
      consultationSessionId: sessionId,
      senderId: clinicianId,
      senderRole: "clinician",
      content: `我给你发送了一份定制计划：${plan.title}`,
      kind: "plan_offer",
      createdAt: now,
    },
  ];
  return plan;
}

export function acceptConsultationPlan(
  platform: PlatformDemo,
  planId: string,
  patientUserId: string,
  acceptedAt = new Date().toISOString(),
): TrainingPlan {
  const plan = platform.trainingPlans.find((candidate) => candidate.id === planId);
  if (!plan || plan.patientUserId !== patientUserId) {
    throw new Error("Plan access denied");
  }
  const accepted = { ...plan, status: "accepted" as const, acceptedAt };
  platform.trainingPlans = platform.trainingPlans.map((candidate) => candidate.id === planId ? accepted : candidate);
  rememberTrainingPlan(platform, patientUserId, {
    id: accepted.id,
    caseId: accepted.caseId,
    categoryId: "knee",
    title: accepted.title,
    status: "active",
    dayLabel: accepted.dayLabel,
    completionPercent: accepted.stage.progressPercent,
    items: accepted.items,
    stage: accepted.stage,
    updatedAt: acceptedAt,
  });
  return accepted;
}

export function declineConsultationPlan(platform: PlatformDemo, planId: string, patientUserId: string): TrainingPlan {
  const plan = platform.trainingPlans.find((candidate) => candidate.id === planId);
  if (!plan || plan.patientUserId !== patientUserId) {
    throw new Error("Plan access denied");
  }
  const declined = { ...plan, status: "declined" as const };
  platform.trainingPlans = platform.trainingPlans.map((candidate) => candidate.id === planId ? declined : candidate);
  return declined;
}

function requireConsultation(platform: PlatformDemo, sessionId: string): ConsultationSession {
  const session = platform.consultations.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error(`Unknown consultation: ${sessionId}`);
  }
  if (session.status === "active" && session.expiresAt && Date.now() >= new Date(session.expiresAt).getTime()) {
    const expired = expireConsultationSession(session);
    replaceConsultation(platform, expired);
    return expired;
  }
  return session;
}

function requireAuthorization(platform: PlatformDemo, sessionId: string): CaseAuthorization {
  const authorization = platform.caseAuthorizations.find((candidate) => candidate.consultationSessionId === sessionId);
  if (!authorization) {
    throw new Error(`Missing authorization for consultation: ${sessionId}`);
  }
  return authorization;
}

function replaceConsultation(platform: PlatformDemo, session: ConsultationSession): void {
  platform.consultations = platform.consultations.map((candidate) => candidate.id === session.id ? session : candidate);
}
```

- [ ] **Step 6: Run API tests and verify pass**

Run:

```bash
npm run test -w @mentis/api
```

Expected: PASS.

- [ ] **Step 7: Commit API service changes**

Run:

```bash
git add apps/api/src/index.ts apps/api/test/orchestrator.test.ts
git commit -m "feat: add consultation orchestration"
```

Expected: commit succeeds with only API service and test files staged.

## Task 3: REST And SSE Routes

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/orchestrator.test.ts`

- [ ] **Step 1: Add route-level helper tests for snapshots**

Add one more API test to `apps/api/test/orchestrator.test.ts` in the consultation block:

```ts
  it("returns snapshots only to consultation participants", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    expect(getConsultationSnapshot(platform, session.id, "clinician_1", "clinician").session.id).toBe(session.id);
    expect(() => getConsultationSnapshot(platform, session.id, "clinician_2", "clinician")).toThrow("Consultation access denied");
  });
```

- [ ] **Step 2: Run API tests**

Run:

```bash
npm run test -w @mentis/api
```

Expected: PASS if Task 2 is complete.

- [ ] **Step 3: Import route functions in server**

In `apps/api/src/server.ts`, extend the import from `./index.js` with:

```ts
  acceptConsultationPlan,
  createClinicianPlanForConsultation,
  createConsultationSession,
  declineConsultationPlan,
  getClinicianConsultations,
  getConsultationSnapshot,
  joinConsultationSession,
  listActionLibrary,
  sendConsultationMessage,
```

- [ ] **Step 4: Add REST routes before the `/v1/assessments` route**

Insert this route block in `apps/api/src/server.ts` after the memory routes.

```ts
    const clinicianConsultationsMatch = url.pathname.match(/^\/v1\/clinicians\/([^/]+)\/consultations$/);
    if (request.method === "GET" && clinicianConsultationsMatch) {
      const result = getClinicianConsultations(platform, decodeURIComponent(clinicianConsultationsMatch[1]));
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/consultations") {
      const body = await readJson(request);
      const result = createConsultationSession(platform, {
        patientUserId: String(body.patientUserId ?? ""),
        clinicianId: String(body.clinicianId ?? ""),
        caseId: String(body.caseId ?? ""),
        scheduledStartAt: String(body.scheduledStartAt ?? ""),
        scheduledEndAt: String(body.scheduledEndAt ?? ""),
      });
      response.end(JSON.stringify(result));
      return;
    }

    const consultationMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)$/);
    if (request.method === "GET" && consultationMatch) {
      const actorId = String(url.searchParams.get("actorId") ?? "");
      const actorRole = String(url.searchParams.get("actorRole") ?? "user") as "user" | "clinician";
      const result = getConsultationSnapshot(platform, decodeURIComponent(consultationMatch[1]), actorId, actorRole);
      response.end(JSON.stringify(result));
      return;
    }

    const consultationJoinMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/join$/);
    if (request.method === "POST" && consultationJoinMatch) {
      const body = await readJson(request);
      const result = joinConsultationSession(
        platform,
        decodeURIComponent(consultationJoinMatch[1]),
        String(body.actorId ?? ""),
        String(body.actorRole ?? "user") as "user" | "clinician",
      );
      response.end(JSON.stringify(result));
      return;
    }

    const consultationMessagesMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/messages$/);
    if (request.method === "GET" && consultationMessagesMatch) {
      const actorId = String(url.searchParams.get("actorId") ?? "");
      const actorRole = String(url.searchParams.get("actorRole") ?? "user") as "user" | "clinician";
      const snapshot = getConsultationSnapshot(platform, decodeURIComponent(consultationMessagesMatch[1]), actorId, actorRole);
      response.end(JSON.stringify(snapshot.messages));
      return;
    }
    if (request.method === "POST" && consultationMessagesMatch) {
      const body = await readJson(request);
      const result = sendConsultationMessage(platform, decodeURIComponent(consultationMessagesMatch[1]), {
        senderId: String(body.senderId ?? ""),
        senderRole: String(body.senderRole ?? "user") as "user" | "clinician" | "system",
        content: String(body.content ?? ""),
      });
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/action-library") {
      response.end(JSON.stringify(listActionLibrary(platform)));
      return;
    }

    const consultationPlansMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/plans$/);
    if (request.method === "POST" && consultationPlansMatch) {
      const body = await readJson(request);
      const result = createClinicianPlanForConsultation(
        platform,
        decodeURIComponent(consultationPlansMatch[1]),
        String(body.clinicianId ?? ""),
        {
          title: String(body.title ?? ""),
          dayLabel: String(body.dayLabel ?? "第 1 天"),
          actionIds: Array.isArray(body.actionIds) ? body.actionIds.map(String) : [],
          precautions: Array.isArray(body.precautions) ? body.precautions.map(String) : [],
          progressionCriteria: Array.isArray(body.progressionCriteria) ? body.progressionCriteria.map(String) : [],
        },
      );
      response.end(JSON.stringify(result));
      return;
    }

    const acceptPlanMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/accept$/);
    if (request.method === "POST" && acceptPlanMatch) {
      const body = await readJson(request);
      const result = acceptConsultationPlan(platform, decodeURIComponent(acceptPlanMatch[1]), String(body.patientUserId ?? ""));
      response.end(JSON.stringify(result));
      return;
    }

    const declinePlanMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/decline$/);
    if (request.method === "POST" && declinePlanMatch) {
      const body = await readJson(request);
      const result = declineConsultationPlan(platform, decodeURIComponent(declinePlanMatch[1]), String(body.patientUserId ?? ""));
      response.end(JSON.stringify(result));
      return;
    }
```

- [ ] **Step 5: Add SSE route before JSON content-type is forced**

At the top of the request handler in `apps/api/src/server.ts`, move the JSON `Content-Type` header so it is set after the SSE route check. Insert this before `response.setHeader("Content-Type", "application/json; charset=utf-8");`:

```ts
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const consultationEventsMatch = requestUrl.pathname.match(/^\/v1\/consultations\/([^/]+)\/events$/);
  if (request.method === "GET" && consultationEventsMatch) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": resolveCorsOrigin(request.headers.origin),
      Vary: "Origin",
    });
    const sessionId = decodeURIComponent(consultationEventsMatch[1]);
    const actorId = String(requestUrl.searchParams.get("actorId") ?? "");
    const actorRole = String(requestUrl.searchParams.get("actorRole") ?? "user") as "user" | "clinician";
    const writeSnapshot = () => {
      try {
        const snapshot = getConsultationSnapshot(platform, sessionId, actorId, actorRole);
        response.write(`event: snapshot\n`);
        response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      } catch (error) {
        response.write(`event: error\n`);
        response.write(`data: ${JSON.stringify({ message: error instanceof Error ? error.message : "Unknown SSE error" })}\n\n`);
      }
    };
    writeSnapshot();
    const interval = setInterval(writeSnapshot, 3000);
    request.on("close", () => clearInterval(interval));
    return;
  }
```

Remove the later duplicate `const url = new URL(...)` line inside the `try` block and replace references to `url` with `requestUrl`, or assign `const url = requestUrl;` at the top of the `try` block.

- [ ] **Step 6: Build API**

Run:

```bash
npm run build -w @mentis/api
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit route changes**

Run:

```bash
git add apps/api/src/server.ts apps/api/test/orchestrator.test.ts
git commit -m "feat: expose consultation API routes"
```

Expected: commit succeeds with server route files staged.

## Task 4: Patient Consultation UX

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add frontend auth and consultation types**

In `apps/web/src/App.tsx`, update the existing auth/register local types so role selection and credential status are represented on the client.

```ts
type AuthRole = "user" | "clinician" | "organization" | "admin";

type AuthUser = {
  id: string;
  role: AuthRole;
  displayName: string;
  profile?: UserProfile;
  credentialStatus?: "pending" | "verified" | "rejected";
  specialties?: string[];
};

type RegisterInput = UserProfile & {
  accountRole: "user" | "clinician";
  username: string;
  password: string;
  displayName: string;
  inviteCode: string;
  discipline?: string;
  credentialSummary?: string;
  specialties?: string[];
  organizationName?: string;
};
```

Then add these consultation types near the existing local types.

```ts
type ConsultationStatus = "scheduled" | "waiting_clinician" | "active" | "expired" | "closed" | "cancelled";

type ConsultationSession = {
  id: string;
  patientUserId: string;
  clinicianId: string;
  caseId: string;
  status: ConsultationStatus;
  paymentStatus: "unpaid" | "paid" | "refunded";
  scheduledStartAt: string;
  scheduledEndAt: string;
  activatedAt?: string;
  expiresAt?: string;
  closedAt?: string;
  durationMinutes: number;
  createdAt: string;
};

type ConsultationMessage = {
  id: string;
  consultationSessionId: string;
  senderId: string;
  senderRole: "user" | "clinician" | "system";
  content: string;
  kind: "text" | "system_notice" | "plan_offer";
  createdAt: string;
};

type ActionLibraryItem = {
  id: string;
  title: string;
  bodyRegion: string;
  phase: string;
  defaultDosage: string;
  instructions: string[];
  contraindications: string[];
  progressionCriteria: string[];
  tags: string[];
};

type ConsultationPlan = {
  id: string;
  caseId: string;
  patientUserId: string;
  source: "ai_generated" | "clinician_custom" | "clinician_reviewed_ai";
  authorId: string;
  authorRole: "assistant" | "clinician";
  status: "draft" | "sent_to_patient" | "accepted" | "declined" | "archived";
  title: string;
  dayLabel: string;
  items: CasePlanItem[];
  stage: CasePlan["stage"];
  precautions: string[];
  progressionCriteria: string[];
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
};

type ConsultationSnapshot = {
  session: ConsultationSession;
  messages: ConsultationMessage[];
  plans: ConsultationPlan[];
  actionLibrary: ActionLibraryItem[];
};
```

- [ ] **Step 2: Add registration role selection**

In `LoginScreen`, add clinician registration state next to the existing registration state:

```ts
  const [accountRole, setAccountRole] = useState<"user" | "clinician">("user");
  const [discipline, setDiscipline] = useState("运动康复师");
  const [credentialSummary, setCredentialSummary] = useState("");
  const [specialtiesText, setSpecialtiesText] = useState("knee, running");
  const [organizationName, setOrganizationName] = useState("");
```

Inside the registration branch of the form submit payload, include role-specific fields:

```ts
              ? onRegister({
                  accountRole,
                  username: username.trim(),
                  password,
                  inviteCode: inviteCode.trim(),
                  displayName: displayName.trim(),
                  heightCm: accountRole === "user" ? heightCm.trim() : "",
                  weightKg: accountRole === "user" ? weightKg.trim() : "",
                  discipline: accountRole === "clinician" ? discipline.trim() : undefined,
                  credentialSummary: accountRole === "clinician" ? credentialSummary.trim() : undefined,
                  specialties: accountRole === "clinician"
                    ? specialtiesText.split(",").map((item) => item.trim()).filter(Boolean)
                    : undefined,
                  organizationName: accountRole === "clinician" ? organizationName.trim() : undefined,
                })
```

Under the login/register segmented control, render a second segmented control only while registering:

```tsx
        {isRegistering ? (
          <div className="role-switch account-role-switch" aria-label="注册身份">
            <button className={accountRole === "user" ? "active" : ""} onClick={() => setAccountRole("user")} type="button">
              患者
            </button>
            <button className={accountRole === "clinician" ? "active" : ""} onClick={() => setAccountRole("clinician")} type="button">
              康复师/医生
            </button>
          </div>
        ) : null}
```

In the registration field block, show height and weight only for patients and clinician credential fields only for clinicians:

```tsx
              {accountRole === "user" ? (
                <div className="form-pair">
                  <label>
                    身高 cm
                    <input value={heightCm} onChange={(event) => setHeightCm(event.target.value)} inputMode="numeric" />
                  </label>
                  <label>
                    体重 kg
                    <input value={weightKg} onChange={(event) => setWeightKg(event.target.value)} inputMode="decimal" />
                  </label>
                </div>
              ) : (
                <>
                  <label>
                    身份/职称
                    <input value={discipline} onChange={(event) => setDiscipline(event.target.value)} />
                  </label>
                  <label>
                    资质摘要
                    <input value={credentialSummary} onChange={(event) => setCredentialSummary(event.target.value)} />
                  </label>
                  <label>
                    专长标签
                    <input value={specialtiesText} onChange={(event) => setSpecialtiesText(event.target.value)} />
                  </label>
                  <label>
                    所属机构
                    <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
                  </label>
                </>
              )}
```

Change the submit button label to:

```tsx
            {isLoggingIn ? "处理中..." : isRegistering ? "保存并进入" : "登录"}
```

- [ ] **Step 3: Add patient consultation state**

Inside `App`, add:

```ts
  const [consultation, setConsultation] = useState<ConsultationSnapshot | null>(null);
  const [consultationInput, setConsultationInput] = useState("");
  const [consultationError, setConsultationError] = useState("");
```

- [ ] **Step 4: Add patient consultation functions**

Inside `App`, before the `if (!session)` return, add:

```ts
  async function bookDemoConsultation() {
    if (!session || !activeCase) {
      return;
    }
    setConsultationError("");
    const now = new Date();
    const scheduledStartAt = now.toISOString();
    const scheduledEndAt = new Date(now.getTime() + 30 * 60_000).toISOString();
    try {
      const response = await fetch(`${API_BASE}/v1/consultations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientUserId: session.user.id,
          clinicianId: "clinician_1",
          caseId: activeCase.id,
          scheduledStartAt,
          scheduledEndAt,
        }),
      });
      if (!response.ok) {
        throw new Error("book_failed");
      }
      const created = (await response.json()) as ConsultationSession;
      await loadConsultation(created.id, session.user.id, "user");
    } catch {
      setConsultationError("预约暂时失败，请稍后再试。");
    }
  }

  async function loadConsultation(sessionId: string, actorId: string, actorRole: "user" | "clinician") {
    const response = await fetch(
      `${API_BASE}/v1/consultations/${encodeURIComponent(sessionId)}?actorId=${encodeURIComponent(actorId)}&actorRole=${actorRole}`,
    );
    if (!response.ok) {
      throw new Error("consultation_snapshot_failed");
    }
    setConsultation((await response.json()) as ConsultationSnapshot);
  }

  async function joinActiveConsultation() {
    if (!session || !consultation) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(consultation.session.id)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorId: session.user.id, actorRole: "user" }),
    });
    if (response.ok) {
      await loadConsultation(consultation.session.id, session.user.id, "user");
    }
  }

  async function sendConsultationChat() {
    const content = consultationInput.trim();
    if (!session || !consultation || !content) {
      return;
    }
    setConsultationInput("");
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(consultation.session.id)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: session.user.id, senderRole: "user", content }),
    });
    if (response.ok) {
      await loadConsultation(consultation.session.id, session.user.id, "user");
    } else {
      setConsultationError("当前问诊未开启或已结束，暂时不能发送消息。");
    }
  }

  async function acceptPlanOffer(plan: ConsultationPlan) {
    if (!session) {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/plans/${encodeURIComponent(plan.id)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientUserId: session.user.id }),
    });
    if (response.ok) {
      await refreshMemoryForCurrentUser();
      if (consultation) {
        await loadConsultation(consultation.session.id, session.user.id, "user");
      }
    }
  }
```

- [ ] **Step 5: Render patient consultation panel**

In the right column `Panel title="咨询支持"` area or immediately after it, render:

```tsx
          <Panel title="付费问诊">
            {activeCase ? (
              <div className="consultation-card">
                {consultation ? (
                  <>
                    <div className={`consultation-status ${consultation.session.status}`}>
                      <strong>{consultationStatusLabel(consultation.session.status)}</strong>
                      <span>{consultation.session.durationMinutes} 分钟 · 李康复师</span>
                    </div>
                    <button className="secondary-action" onClick={() => void joinActiveConsultation()} type="button">
                      进入问诊
                    </button>
                    <div className="consultation-thread">
                      {consultation.messages.map((message) => (
                        <div className={`consultation-message ${message.senderRole}`} key={message.id}>
                          <span>{message.senderRole === "clinician" ? "康复师" : message.senderRole === "user" ? "我" : "系统"}</span>
                          <p>{message.content}</p>
                        </div>
                      ))}
                    </div>
                    {consultation.plans
                      .filter((plan) => plan.status === "sent_to_patient")
                      .map((plan) => (
                        <div className="plan-offer" key={plan.id}>
                          <strong>{plan.title}</strong>
                          <span>康复师定制 · 等待确认</span>
                          <button onClick={() => void acceptPlanOffer(plan)} type="button">接受并加入我的计划</button>
                        </div>
                      ))}
                    <form
                      className="consultation-composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendConsultationChat();
                      }}
                    >
                      <input
                        value={consultationInput}
                        onChange={(event) => setConsultationInput(event.target.value)}
                        placeholder={consultation.session.status === "active" ? "输入问诊消息" : "问诊开启后可发送"}
                      />
                      <button type="submit" disabled={consultation.session.status !== "active"}>发送</button>
                    </form>
                  </>
                ) : (
                  <>
                    <strong>预约 15 分钟康复师问诊</strong>
                    <span>康复师只能看到当前病例资料。</span>
                    <button onClick={() => void bookDemoConsultation()} type="button">预约李康复师</button>
                  </>
                )}
                {consultationError ? <p className="login-error">{consultationError}</p> : null}
              </div>
            ) : (
              <div className="empty-case compact">
                <span>选择病例后可预约问诊。</span>
              </div>
            )}
          </Panel>
```

Add this helper near other helpers:

```ts
function consultationStatusLabel(status: ConsultationStatus): string {
  const labels: Record<ConsultationStatus, string> = {
    scheduled: "已预约",
    waiting_clinician: "等待康复师",
    active: "问诊中",
    expired: "已结束",
    closed: "已关闭",
    cancelled: "已取消",
  };
  return labels[status];
}
```

- [ ] **Step 6: Add patient styles**

Append to `apps/web/src/styles.css`:

```css
.consultation-card,
.consultation-thread,
.plan-offer,
.consultation-composer {
  display: grid;
  gap: 10px;
}

.consultation-status {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fffdf7;
}

.consultation-status.active {
  border-color: rgba(111, 125, 84, 0.45);
  background: var(--green-soft);
}

.consultation-thread {
  max-height: 220px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(255, 253, 247, 0.7);
}

.consultation-message {
  padding: 8px;
  border-radius: 7px;
  background: #fffdf7;
}

.consultation-message span,
.plan-offer span {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.consultation-message p {
  margin: 4px 0 0;
  line-height: 1.5;
}

.plan-offer {
  padding: 10px;
  border: 1px solid rgba(217, 119, 87, 0.35);
  border-radius: 7px;
  background: #fff7f1;
}

.consultation-composer {
  grid-template-columns: minmax(0, 1fr) auto;
}

.consultation-composer input {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fffdf7;
}

.secondary-action,
.consultation-card button,
.plan-offer button {
  min-height: 38px;
  border: 0;
  border-radius: 7px;
  color: white;
  background: var(--green);
  font-weight: 800;
}
```

- [ ] **Step 7: Build web**

Run:

```bash
npm run build -w @mentis/web
```

Expected: PASS.

- [ ] **Step 8: Commit patient UX**

Run:

```bash
git add apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "feat: add patient consultation flow"
```

Expected: commit succeeds with patient UI files staged.

## Task 5: Clinician Workbench UX

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add clinician state**

Inside `App`, add:

```ts
  const [clinicianConsultations, setClinicianConsultations] = useState<ConsultationSession[]>([]);
  const [clinicianSnapshot, setClinicianSnapshot] = useState<ConsultationSnapshot | null>(null);
  const [clinicianMessage, setClinicianMessage] = useState("");
```

- [ ] **Step 2: Add clinician functions**

Inside `App`, before the unauthenticated return, add:

```ts
  async function loadClinicianWorkbench() {
    if (!session || session.user.role !== "clinician") {
      return;
    }
    const response = await fetch(`${API_BASE}/v1/clinicians/${encodeURIComponent(session.user.id)}/consultations`);
    if (response.ok) {
      setClinicianConsultations((await response.json()) as ConsultationSession[]);
    }
  }

  async function openClinicianConsultation(target: ConsultationSession) {
    if (!session) {
      return;
    }
    const joinResponse = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(target.id)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorId: session.user.id, actorRole: "clinician" }),
    });
    if (joinResponse.ok) {
      const snapshotResponse = await fetch(
        `${API_BASE}/v1/consultations/${encodeURIComponent(target.id)}?actorId=${encodeURIComponent(session.user.id)}&actorRole=clinician`,
      );
      if (snapshotResponse.ok) {
        setClinicianSnapshot((await snapshotResponse.json()) as ConsultationSnapshot);
      }
    }
  }

  async function sendClinicianChat() {
    const content = clinicianMessage.trim();
    if (!session || !clinicianSnapshot || !content) {
      return;
    }
    setClinicianMessage("");
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(clinicianSnapshot.session.id)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: session.user.id, senderRole: "clinician", content }),
    });
    if (response.ok) {
      await openClinicianConsultation(clinicianSnapshot.session);
    }
  }

  async function sendDefaultClinicianPlan() {
    if (!session || !clinicianSnapshot) {
      return;
    }
    const actionIds = clinicianSnapshot.actionLibrary.slice(0, 2).map((action) => action.id);
    const response = await fetch(`${API_BASE}/v1/consultations/${encodeURIComponent(clinicianSnapshot.session.id)}/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicianId: session.user.id,
        title: "康复师定制膝前痛计划",
        dayLabel: "第 1 天",
        actionIds,
        precautions: ["训练中疼痛超过 3/10 时停止", "次日明显加重则暂停并反馈"],
        progressionCriteria: ["24 小时内无明显加重", "下楼疼痛不超过 3/10"],
      }),
    });
    if (response.ok) {
      await openClinicianConsultation(clinicianSnapshot.session);
    }
  }
```

- [ ] **Step 3: Load clinician workbench when role is clinician**

Change the React import at the top of `apps/web/src/App.tsx`:

```ts
import { useEffect, useRef, useState } from "react";
```

Add this effect inside `App` after state declarations:

```ts
  useEffect(() => {
    if (session?.user.role === "clinician" && session.user.credentialStatus === "verified") {
      void loadClinicianWorkbench();
    }
  }, [session?.user.id, session?.user.role, session?.user.credentialStatus]);
```

- [ ] **Step 4: Render clinician workbench before patient app shell**

After the unauthenticated return and before the patient `<main className="app-page"...>`, add:

```tsx
  if (session.user.role === "clinician" && session.user.credentialStatus !== "verified") {
    return (
      <RoleStatusPage
        displayName={displayName}
        status={session.user.credentialStatus ?? "pending"}
        onLogout={logout}
      />
    );
  }

  if (session.user.role === "clinician" && session.user.credentialStatus === "verified") {
    return (
      <main className="app-page" data-build-id={clientBuildId}>
        <header className="top-nav">
          <div className="brand">
            <div className="brand-mark">
              <img src={rezLogo} alt="Mentis Rehab" />
            </div>
            <div>
              <strong>康复师工作台</strong>
              <span>只显示已预约授权的患者</span>
            </div>
          </div>
          <div className="user-chip">
            <span className="avatar photo">{displayName.slice(0, 1)}</span>
            <strong>{displayName}</strong>
            <button onClick={logout}>退出</button>
          </div>
        </header>

        <section className="clinician-layout">
          <aside className="clinician-sidebar">
            <Panel title="今日预约">
              {clinicianConsultations.length > 0 ? (
                <div className="case-list">
                  {clinicianConsultations.map((item) => (
                    <button className="clinician-session-row" key={item.id} onClick={() => void openClinicianConsultation(item)} type="button">
                      <strong>{consultationStatusLabel(item.status)}</strong>
                      <span>{item.caseId}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-case compact">
                  <span>暂无预约。患者预约后会出现在这里。</span>
                </div>
              )}
            </Panel>
          </aside>

          <section className="clinician-main">
            {clinicianSnapshot ? (
              <>
                <Panel title="患者授权资料">
                  <div className="authorized-profile">
                    <strong>患者：{clinicianSnapshot.session.patientUserId}</strong>
                    <span>病例：{clinicianSnapshot.session.caseId}</span>
                    <span>可见范围：基础信息、AI评估摘要、当前计划、聊天记录</span>
                  </div>
                </Panel>
                <Panel title="实时问诊">
                  <div className={`consultation-status ${clinicianSnapshot.session.status}`}>
                    <strong>{consultationStatusLabel(clinicianSnapshot.session.status)}</strong>
                    <span>{clinicianSnapshot.session.durationMinutes} 分钟</span>
                  </div>
                  <div className="consultation-thread clinician-thread">
                    {clinicianSnapshot.messages.map((message) => (
                      <div className={`consultation-message ${message.senderRole}`} key={message.id}>
                        <span>{message.senderRole === "clinician" ? "我" : message.senderRole === "user" ? "患者" : "系统"}</span>
                        <p>{message.content}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    className="consultation-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendClinicianChat();
                    }}
                  >
                    <input value={clinicianMessage} onChange={(event) => setClinicianMessage(event.target.value)} placeholder="输入问诊回复" />
                    <button type="submit" disabled={clinicianSnapshot.session.status !== "active"}>发送</button>
                  </form>
                </Panel>
                <Panel title="动作库与计划">
                  <div className="action-library-list">
                    {clinicianSnapshot.actionLibrary.map((action) => (
                      <div className="action-library-item" key={action.id}>
                        <strong>{action.title}</strong>
                        <span>{action.phase} · {action.defaultDosage}</span>
                      </div>
                    ))}
                  </div>
                  <button className="plan-send-button" onClick={() => void sendDefaultClinicianPlan()} type="button">
                    发送默认定制计划
                  </button>
                </Panel>
              </>
            ) : (
              <Panel title="选择预约">
                <div className="empty-case">
                  <strong>请选择一个已预约咨询</strong>
                  <span>这里只会展示与你有关的患者资料。</span>
                </div>
              </Panel>
            )}
          </section>
        </section>
      </main>
    );
  }
```

Add this component near `LoginScreen`:

```tsx
function RoleStatusPage({
  displayName,
  status,
  onLogout,
}: {
  displayName: string;
  status: "pending" | "verified" | "rejected";
  onLogout: () => void;
}) {
  const isRejected = status === "rejected";
  return (
    <main className="login-page" data-build-id={clientBuildId}>
      <section className="login-shell role-status-shell">
        <div className="login-brand">
          <div className="brand-mark">
            <img src={rezLogo} alt="Mentis Rehab" />
          </div>
          <div>
            <strong>{displayName}</strong>
            <span>{isRejected ? "资质未通过" : "资质审核中"}</span>
          </div>
        </div>
        <div className="login-copy">
          <h1>{isRejected ? "暂不能进入康复师工作台" : "康复师/医生账号审核中"}</h1>
          <p>
            {isRejected
              ? "请更新资质信息后重新提交审核。审核通过前不能被患者预约，也不能访问患者病例。"
              : "审核通过后才能被患者预约，并进入只显示授权咨询患者的工作台。"}
          </p>
        </div>
        <button className="login-submit" onClick={onLogout} type="button">退出登录</button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Add clinician styles**

Append:

```css
.clinician-layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 18px;
}

.clinician-sidebar,
.clinician-main,
.authorized-profile,
.action-library-list {
  display: grid;
  gap: 12px;
}

.clinician-session-row {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--ink);
  text-align: left;
  background: #fffdf7;
}

.clinician-session-row span,
.authorized-profile span,
.action-library-item span {
  color: var(--muted);
}

.clinician-thread {
  max-height: 360px;
}

.action-library-item {
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fffdf7;
}

.plan-send-button {
  min-height: 42px;
  border: 0;
  border-radius: 7px;
  color: white;
  background: var(--orange);
  font-weight: 800;
}

.role-status-shell {
  align-content: center;
}

@media (max-width: 860px) {
  .clinician-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Build web**

Run:

```bash
npm run build -w @mentis/web
```

Expected: PASS.

- [ ] **Step 7: Commit clinician UX**

Run:

```bash
git add apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "feat: add clinician consultation workbench"
```

Expected: commit succeeds with clinician UI files staged.

## Task 6: End-To-End Verification

**Files:**
- Modify only if verification exposes a defect: `apps/api/src/index.ts`, `apps/api/src/server.ts`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`

- [ ] **Step 1: Run full JavaScript tests**

Run:

```bash
npm run test:js
```

Expected: PASS for domain and API tests.

- [ ] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: PASS for domain, API, and web builds.

- [ ] **Step 3: Start local dev servers**

Run API:

```bash
npm run dev:api
```

Run web in a second terminal:

```bash
npm run dev:web
```

Expected:

- API prints `Mentis API listening on http://127.0.0.1:3001`.
- Web prints a local Vite URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 4: Manual patient flow**

In the browser:

1. Log in or register as a patient.
2. Create a knee consultation case.
3. Click `预约李康复师`.
4. Click `进入问诊`.
5. Verify the consultation status becomes `等待康复师` until clinician joins.
6. Verify the composer stays locked until the session is `active`.

Expected: patient cannot send chat until active, and no global patient list appears anywhere.

- [ ] **Step 5: Manual clinician flow**

Use the seeded clinician demo login from Task 2.

1. Log in with username `clinician_demo` and password `mentis_clinician`.
2. Verify only assigned consultations appear.
3. Open the consultation.
4. Verify patient authorization panel shows only the current case summary.
5. Send a chat message.
6. Send default custom plan.

Expected: clinician can chat only inside the assigned active consultation and can send a plan offer.

- [ ] **Step 6: Manual plan acceptance**

Return to patient session:

1. Refresh or reopen the consultation panel.
2. Verify the clinician plan offer appears.
3. Click `接受并加入我的计划`.
4. Open `我的计划`.

Expected: accepted clinician plan appears in patient plans, and any AI plan is not deleted.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional implementation files are modified. Do not revert unrelated user changes.

- [ ] **Step 8: Commit verification fixes if any**

If Step 1-6 required fixes, stage only the changed implementation files and commit:

```bash
git add packages/domain/src/index.ts packages/domain/test/clinical-safety.test.ts apps/api/src/index.ts apps/api/src/server.ts apps/api/test/orchestrator.test.ts apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "fix: complete consultation verification"
```

Expected: commit succeeds, or no commit is needed if verification required no fixes.

## Self-Review

- Spec coverage: The plan covers role-aware registration, post-login workspace routing, pending clinician review pages, session scheduling, simulated paid state, scoped authorization, limited verified-clinician workbench, active 15-minute chat, clinician plan offer, patient accept/decline, action library, and first-phase SSE route.
- Scope kept small: Real payments, persistent database, full calendar management, video, push notifications, and organization care teams are not part of the implementation tasks.
- Type consistency: `ConsultationSession`, `ConsultationMessage`, `TrainingPlan`, `ActionLibraryItem`, and plan status/source values match across domain, API, and frontend tasks.
- Transport boundary: SSE is used only in the server route and can be replaced later; the rest of the app talks to snapshots and REST actions.
