import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  acceptConsultationPlan,
  authenticateDemoUser,
  buildChatSystemPrompt,
  buildUserMemoryContext,
  buildChatRagContext,
  buildGuidedChatResponse,
  bookConsultationFromAvailability,
  chatWithQwen,
  createClinicianAvailabilitySlot,
  createClinicianPlanForConsultation,
  createConsultationSession,
  createPlatformDemo,
  deleteRememberedCase,
  declineConsultationPlan,
  getClinicianConsultations,
  getConsultationSnapshot,
  joinConsultationSession,
  listAdminClinicianReviews,
  listActionLibrary,
  listClinicianAvailability,
  listClinicians,
  rememberCase,
  rememberTrainingPlan,
  registerDemoUser,
  resolveRecommendedActions,
  resolveAuthenticatedActor,
  reviewClinicianCredential,
  runAssessmentWorkflow,
  searchLocalRag,
  sendConsultationMessage,
  QwenChatClient,
  resolveCorsOrigin,
  type ActionLibraryItem,
  type RegistrationInput,
  type RehabConsultCategory,
} from "../src/index";

describe("business API orchestration", () => {
  it("routes safe user assessment to AI rehab draft and expert referral option", async () => {
    const platform = createPlatformDemo();

    const result = await runAssessmentWorkflow(platform, {
      userId: "user_1",
      bodyRegion: "knee",
      conditionFocus: "patellofemoral_pain",
      painScore: 4,
      durationDays: 28,
      symptoms: ["跑步下坡痛"],
      trainingLoad: "每周跑量 35km",
    });

    expect(result.triage.level).toBe("self_management_with_review_option");
    expect(result.aiDraft.plan.stages[0].name).toBe("镇痛与负荷管理");
    expect(result.referral.available).toBe(true);
    expect(result.auditEvents.map((event) => event.action)).toEqual([
      "assessment_submitted",
      "ai_rehab_draft_created",
    ]);
  });

  it("blocks rehab plan generation when urgent red flags are present", async () => {
    const platform = createPlatformDemo();

    const result = await runAssessmentWorkflow(platform, {
      userId: "user_1",
      bodyRegion: "knee",
      conditionFocus: "running_knee_pain",
      painScore: 9,
      durationDays: 0,
      symptoms: ["严重外伤", "无法承重"],
      trainingLoad: "比赛摔倒后",
    });

    expect(result.triage.level).toBe("urgent_referral");
    expect(result.aiDraft).toBeNull();
    expect(result.referral.reason).toContain("红旗");
    expect(result.auditEvents.map((event) => event.action)).toEqual([
      "assessment_submitted",
      "urgent_referral_triggered",
    ]);
  });

  it("exposes the knee rehab action library", () => {
    const platform = createPlatformDemo();
    const library = listActionLibrary(platform);

    expect(library.length).toBeGreaterThan(40);
    expect(library.every((action) => action.source === "seed")).toBe(true);
    expect(library.some((action) => action.id === "action_seated_hamstring_stretch")).toBe(true);
    expect(library.some((action) => action.id.startsWith("exercise_"))).toBe(false);
  });
});

describe("auth and registration", () => {
  it("allows registration for any username with the invite code and basic body metrics", () => {
    const platform = createPlatformDemo();

    const session = registerDemoUser(platform, {
      username: "new_runner",
      password: "secret",
      displayName: "ReZ",
      inviteCode: "ique1116",
      heightCm: "175",
      weightKg: "68",
    });

    expect(session.user.id).toBe("user_new_runner");
    expect(session.user.displayName).toBe("ReZ");
    expect(session.user.profile).toMatchObject({
      heightCm: "175",
      weightKg: "68",
    });
    expect(session.user.profile).not.toHaveProperty("sportLevel");
    expect(session.user.profile).not.toHaveProperty("weeklyFrequency");
    expect(session.user.profile).not.toHaveProperty("primaryGoal");
    expect(session.memory.notes).toEqual([]);

    const loginSession = authenticateDemoUser(platform, { username: "new_runner", password: "secret" });
    expect(loginSession.user.id).toBe("user_new_runner");
    expect(resolveAuthenticatedActor(platform, session.token).id).toBe("user_new_runner");
  });

  it("rejects registration without the required invite code", () => {
    const platform = createPlatformDemo();

    expect(() =>
      registerDemoUser(platform, {
        username: "someone",
        password: "secret",
        displayName: "Other",
        inviteCode: "wrong-code",
        heightCm: "180",
        weightKg: "72",
      }),
    ).toThrow("Invalid invite code");
  });

  it("rejects runtime-shaped registration input with a controlled missing invite error", () => {
    const platform = createPlatformDemo();

    expect(() =>
      registerDemoUser(platform, {
        username: "missing_invite",
        password: "secret",
        displayName: "No Invite",
        heightCm: "180",
        weightKg: "72",
      } as RegistrationInput),
    ).toThrow("Invalid invite code");
  });
});

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
    expect(session.memory.cases).toEqual([]);
    expect(session.memory.trainingPlans).toEqual([]);
  });

  it("resolves demo tokens to fresh actors and rejects unknown tokens", () => {
    const platform = createPlatformDemo();
    const session = authenticateDemoUser(platform, {
      username: "clinician_demo",
      password: "mentis_clinician",
    });

    expect(resolveAuthenticatedActor(platform, session.token)).toMatchObject({
      id: "clinician_1",
      credentialStatus: "verified",
    });

    platform.clinicians = platform.clinicians.map((clinician) =>
      clinician.id === "clinician_1"
        ? { ...clinician, displayName: "已更新康复师", credentialStatus: "rejected" }
        : clinician,
    );

    expect(resolveAuthenticatedActor(platform, session.token)).toMatchObject({
      id: "clinician_1",
      displayName: "已更新康复师",
      credentialStatus: "rejected",
    });
    expect(() => resolveAuthenticatedActor(platform, "demo_missing")).toThrow("Invalid or expired demo session");
  });

  it("registers patients and pending clinicians through the same auth endpoint", () => {
    const platform = createPlatformDemo();

    const patient = registerDemoUser(platform, {
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
      specialties: [" knee ", "running", ""],
      organizationName: "个人执业",
    });

    expect(patient.user.role).toBe("user");
    expect(clinician.user.role).toBe("clinician");
    expect(clinician.user).toMatchObject({
      credentialStatus: "pending",
      publicDirectoryVisible: false,
      specialties: ["knee", "running"],
    });
    expect(clinician.memory.notes).toEqual([]);
    expect(getClinicianConsultations(platform, clinician.user.id)).toHaveLength(0);
  });

  it("does not assign consultations to pending clinicians", () => {
    const platform = createPlatformDemo();
    const clinician = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "pending_assignment",
      password: "secret",
      displayName: "待审核康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      specialties: ["knee"],
    });
    platform.clinicians = platform.clinicians.map((candidate) =>
      candidate.id === clinician.user.id ? { ...candidate, credentialStatus: "pending" as const } : candidate,
    );

    expect(() =>
      createConsultationSession(platform, {
        patientUserId: "user_1",
        clinicianId: clinician.user.id,
        caseId: "case_demo",
        scheduledStartAt: "2026-07-02T02:00:00.000Z",
        scheduledEndAt: "2026-07-02T02:30:00.000Z",
      }),
    ).toThrow("Consultation clinician must be verified");
  });

  it("lets admins review clinicians before they appear in the patient directory", () => {
    const platform = createPlatformDemo();
    const clinician = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "review_target",
      password: "secret",
      displayName: "待审核真实康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      discipline: "运动康复师",
      credentialSummary: "跑步损伤康复",
      specialties: ["knee", "running"],
      organizationName: "个人执业",
    });
    const adminSession = authenticateDemoUser(platform, {
      username: "admin_demo",
      password: "mentis_admin",
    });
    const adminActor = resolveAuthenticatedActor(platform, adminSession.token);

    expect(adminActor.role).toBe("admin");
    expect(listClinicians(platform).map((candidate) => candidate.id)).not.toContain(clinician.user.id);
    expect(listAdminClinicianReviews(platform, adminActor)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: clinician.user.id,
          credentialStatus: "pending",
          publicDirectoryVisible: false,
        }),
      ]),
    );

    const reviewed = reviewClinicianCredential(platform, clinician.user.id, adminActor, {
      credentialStatus: "verified",
      publicDirectoryVisible: true,
      reviewedAt: "2026-07-02T02:00:00.000Z",
      reviewNote: "资料完整，允许测试接诊。",
    });

    expect(reviewed).toMatchObject({
      credentialStatus: "verified",
      publicDirectoryVisible: true,
      reviewedBy: "admin_1",
    });
    expect(listClinicians(platform).map((candidate) => candidate.id)).toContain(clinician.user.id);
  });

  it("creates free-test sessions and shows clinicians only their assigned consultations", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    expect(session.paymentMode).toBe("free_test");
    expect(session.paymentStatus).toBe("waived");
    expect(session.durationMinutes).toBe(15);
    expect(getClinicianConsultations(platform, "clinician_1").map((candidate) => candidate.id)).toEqual([
      session.id,
    ]);
    expect(getClinicianConsultations(platform, "clinician_missing")).toHaveLength(0);
  });

  it("lists real clinicians with online state and available slots", () => {
    const platform = createPlatformDemo();

    expect(listClinicians(platform, "2026-07-02T02:00:00.000Z").map((clinician) => clinician.id)).not.toContain(
      "clinician_1",
    );
    expect(() =>
      listClinicianAvailability(platform, "clinician_1", {
        publicOnly: true,
        at: "2026-07-02T02:00:00.000Z",
      }),
    ).toThrow("Unknown public clinician");
    expect(listClinicianAvailability(platform, "clinician_1", {
      at: "2026-07-02T02:00:00.000Z",
    }).every((slot) => slot.status === "available")).toBe(true);

    const registered = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "public_clinician",
      password: "secret",
      displayName: "真实康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      discipline: "运动康复师",
      credentialSummary: "跑步损伤康复",
      specialties: ["knee", "running"],
      organizationName: "个人执业",
    });
    platform.clinicians = platform.clinicians.map((clinician) =>
      clinician.id === registered.user.id
        ? { ...clinician, credentialStatus: "verified" as const, publicDirectoryVisible: true }
        : clinician,
    );
    const publicClinician = platform.clinicians.find((clinician) => clinician.id === registered.user.id)!;
    platform.clinicianPresence[publicClinician.id] = {
      isOnline: true,
      lastSeenAt: "2026-07-02T02:00:00.000Z",
    };
    createClinicianAvailabilitySlot(platform, publicClinician.id, publicClinician, {
      startsAt: "2026-07-02T12:00:00.000Z",
      endsAt: "2026-07-02T12:30:00.000Z",
      createdAt: "2026-07-02T02:00:00.000Z",
    });

    const clinicians = listClinicians(platform, "2026-07-02T02:00:00.000Z");
    const slots = listClinicianAvailability(platform, publicClinician.id, {
      publicOnly: true,
      at: "2026-07-02T02:00:00.000Z",
    });
    expect(clinicians).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: publicClinician.id,
          displayName: "真实康复师",
          isOnline: true,
        }),
      ]),
    );
    expect(slots.every((slot) => slot.status === "available")).toBe(true);
  });

  it("lets verified clinicians create non-overlapping availability and patients book a slot once", () => {
    const platform = createPlatformDemo();
    const registered = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "bookable_clinician",
      password: "secret",
      displayName: "可预约康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      discipline: "运动康复师",
      credentialSummary: "膝关节康复",
      specialties: ["knee"],
      organizationName: "个人执业",
    });
    platform.clinicians = platform.clinicians.map((clinician) =>
      clinician.id === registered.user.id
        ? { ...clinician, credentialStatus: "verified" as const, publicDirectoryVisible: true }
        : clinician,
    );
    const clinicianActor = platform.clinicians.find((clinician) => clinician.id === registered.user.id)!;
    const slot = createClinicianAvailabilitySlot(platform, clinicianActor.id, clinicianActor, {
      startsAt: "2026-07-02T12:00:00.000Z",
      endsAt: "2026-07-02T12:30:00.000Z",
      createdAt: "2026-07-02T02:00:00.000Z",
    });

    expect(() =>
      createClinicianAvailabilitySlot(platform, clinicianActor.id, clinicianActor, {
        startsAt: "2026-07-02T12:15:00.000Z",
        endsAt: "2026-07-02T12:45:00.000Z",
        createdAt: "2026-07-02T02:00:00.000Z",
      }),
    ).toThrow("Availability slot overlaps existing schedule");

    const session = bookConsultationFromAvailability(platform, {
      patientUserId: "user_1",
      caseId: "case_slot_booking",
      availabilitySlotId: slot.id,
      createdAt: "2026-07-02T02:05:00.000Z",
    });

    expect(session.clinicianId).toBe(clinicianActor.id);
    expect(session.scheduledStartAt).toBe(slot.startsAt);
    expect(platform.clinicianAvailabilitySlots.find((candidate) => candidate.id === slot.id)).toMatchObject({
      status: "booked",
      bookedConsultationSessionId: session.id,
    });
    expect(() =>
      bookConsultationFromAvailability(platform, {
        patientUserId: "user_1",
        caseId: "case_slot_booking",
        availabilitySlotId: slot.id,
      }),
    ).toThrow("Availability slot is not bookable");
  });

  it("uses resolved token actors for route-facing joins, messages, and snapshots", () => {
    const platform = createPlatformDemo();
    const patientSession = registerDemoUser(platform, {
      username: "route_patient",
      password: "secret",
      displayName: "路由患者",
      inviteCode: "ique1116",
      heightCm: "176",
      weightKg: "70",
    });
    const clinicianSession = authenticateDemoUser(platform, {
      username: "clinician_demo",
      password: "mentis_clinician",
    });
    const patientActor = resolveAuthenticatedActor(platform, patientSession.token);
    const clinicianActor = resolveAuthenticatedActor(platform, clinicianSession.token);
    const session = createConsultationSession(platform, {
      patientUserId: patientActor.id,
      clinicianId: clinicianActor.id,
      caseId: "case_route_actor",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    expect(joinConsultationSession(platform, session.id, patientActor, "2026-07-02T02:01:00.000Z").status).toBe(
      "waiting_clinician",
    );
    expect(joinConsultationSession(platform, session.id, clinicianActor, "2026-07-02T02:02:00.000Z").status).toBe(
      "active",
    );

    const patientMessage = sendConsultationMessage(platform, session.id, patientActor, {
      content: "我今天走路有点疼。",
      createdAt: "2026-07-02T02:03:00.000Z",
    });
    const clinicianMessage = sendConsultationMessage(platform, session.id, clinicianActor, {
      content: "先把下楼量降下来。",
      createdAt: "2026-07-02T02:04:00.000Z",
    });
    const patientSnapshot = getConsultationSnapshot(
      platform,
      session.id,
      patientActor,
      "2026-07-02T02:05:00.000Z",
    );
    const clinicianSnapshot = getConsultationSnapshot(
      platform,
      session.id,
      clinicianActor,
      "2026-07-02T02:05:00.000Z",
    );

    expect(patientMessage.senderId).toBe(patientActor.id);
    expect(clinicianMessage.senderId).toBe(clinicianActor.id);
    expect(patientSnapshot.session.id).toBe(session.id);
    expect(clinicianSnapshot.messages.map((message) => message.id)).toEqual(
      expect.arrayContaining([patientMessage.id, clinicianMessage.id]),
    );
  });

  it("activates chat only after clinician and patient join, then validates message timestamps", () => {
    const platform = createPlatformDemo();
    const patientActor = platform.users[0];
    const clinicianActor = platform.clinicians[0];
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    const patientWaiting = joinConsultationSession(platform, session.id, patientActor, "2026-07-02T02:01:00.000Z");
    expect(patientWaiting.status).toBe("waiting_clinician");
    expect(() =>
      sendConsultationMessage(platform, session.id, patientActor, {
        content: "先发一条会被拦截。",
        createdAt: "2026-07-02T02:01:30.000Z",
      }),
    ).toThrow("Consultation chat is not active");

    const active = joinConsultationSession(
      platform,
      session.id,
      clinicianActor,
      "2026-07-02T02:02:00.000Z",
    );
    expect(active.status).toBe("active");
    expect(active.expiresAt).toBe("2026-07-02T02:17:00.000Z");

    const message = sendConsultationMessage(platform, session.id, patientActor, {
      content: "我今天下楼还是疼。",
      senderId: "clinician_1",
      senderRole: "clinician",
      createdAt: "2026-07-02T02:03:00.000Z",
    } as { content: string; createdAt: string });
    expect(message.content).toContain("下楼");
    expect(message.senderId).toBe("user_1");
    expect(message.senderRole).toBe("user");

    expect(() =>
      sendConsultationMessage(platform, session.id, clinicianActor, {
        content: "超时消息不应发送。",
        createdAt: "2026-07-02T02:17:00.000Z",
      }),
    ).toThrow("Consultation chat is not active");
  });

  it("does not keep clinician presence when early activation fails", () => {
    const platform = createPlatformDemo();
    const patientActor = platform.users[0];
    const clinicianActor = platform.clinicians[0];
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    const patientEarly = joinConsultationSession(
      platform,
      session.id,
      patientActor,
      "2026-07-02T01:58:00.000Z",
    );
    expect(patientEarly.status).toBe("waiting_clinician");

    expect(() =>
      joinConsultationSession(platform, session.id, clinicianActor, "2026-07-02T01:59:00.000Z"),
    ).toThrow("Consultation can only be activated within its scheduled window");
    expect(platform.presence[session.id].clinicianPresent).toBe(false);

    const patientOnlyLater = joinConsultationSession(
      platform,
      session.id,
      patientActor,
      "2026-07-02T02:01:00.000Z",
    );
    expect(patientOnlyLater.status).toBe("waiting_clinician");
  });

  it("does not expose system notices through public message creation", () => {
    const platform = createPlatformDemo();
    const patientActor = platform.users[0];
    const clinicianActor = platform.clinicians[0];
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });

    joinConsultationSession(platform, session.id, patientActor, "2026-07-02T02:01:00.000Z");
    joinConsultationSession(platform, session.id, clinicianActor, "2026-07-02T02:02:00.000Z");

    expect(() =>
      sendConsultationMessage(platform, session.id, {
        id: "system",
        role: "system",
        displayName: "System",
      } as never, {
        content: "伪造系统消息",
        createdAt: "2026-07-02T02:03:00.000Z",
      }),
    ).toThrow("Invalid consultation actor");
  });

  it("denies downgraded clinicians after booking across consultation actions", () => {
    const platform = createPlatformDemo();
    const patientActor = platform.users[0];
    const clinicianSession = authenticateDemoUser(platform, {
      username: "clinician_demo",
      password: "mentis_clinician",
    });
    const clinicianActor = resolveAuthenticatedActor(platform, clinicianSession.token);
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_downgrade",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });
    joinConsultationSession(platform, session.id, patientActor, "2026-07-02T02:01:00.000Z");
    joinConsultationSession(platform, session.id, clinicianActor, "2026-07-02T02:02:00.000Z");
    platform.clinicians = platform.clinicians.map((clinician) =>
      clinician.id === "clinician_1" ? { ...clinician, credentialStatus: "rejected" } : clinician,
    );
    const rejectedClinician = resolveAuthenticatedActor(platform, clinicianSession.token);
    const [action] = listActionLibrary(platform);

    expect(rejectedClinician).toMatchObject({ id: "clinician_1", credentialStatus: "rejected" });
    expect(() =>
      getConsultationSnapshot(platform, session.id, rejectedClinician, "2026-07-02T02:03:00.000Z"),
    ).toThrow("Clinician credential is not verified");
    expect(() =>
      joinConsultationSession(platform, session.id, rejectedClinician, "2026-07-02T02:03:00.000Z"),
    ).toThrow("Clinician credential is not verified");
    expect(() =>
      sendConsultationMessage(platform, session.id, rejectedClinician, {
        content: "降级后不能发消息。",
        createdAt: "2026-07-02T02:03:00.000Z",
      }),
    ).toThrow("Clinician credential is not verified");
    expect(() =>
      createClinicianPlanForConsultation(platform, session.id, rejectedClinician, {
        title: "降级后计划",
        dayLabel: "第 1 天",
        actionIds: [action.id],
        precautions: [],
        progressionCriteria: [],
        createdAt: "2026-07-02T02:12:00.000Z",
      }),
    ).toThrow("Clinician cannot create plan for consultation");
  });

  it("denies default snapshot access after authorization ends", () => {
    const platform = createPlatformDemo();
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_historical",
      scheduledStartAt: "2000-01-01T00:00:00.000Z",
      scheduledEndAt: "2000-01-01T00:30:00.000Z",
    });
    const authorization = platform.caseAuthorizations.find((candidate) => candidate.consultationSessionId === session.id);
    if (!authorization) {
      throw new Error("Expected authorization fixture");
    }
    authorization.endsAt = "2000-01-02T00:00:00.000Z";

    expect(() => getConsultationSnapshot(platform, session.id, platform.users[0])).toThrow(
      "Consultation access denied",
    );
  });

  it("lets a clinician send, accept, and decline plans without deleting source-separated plans", () => {
    const platform = createPlatformDemo();
    const patientActor = platform.users[0];
    const clinicianActor = platform.clinicians[0];
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });
    joinConsultationSession(platform, session.id, patientActor, "2026-07-02T02:01:00.000Z");
    joinConsultationSession(platform, session.id, clinicianActor, "2026-07-02T02:02:00.000Z");

    platform.trainingPlans.push({
      id: "plan_ai_existing",
      caseId: "case_demo",
      patientUserId: "user_1",
      source: "ai_generated",
      authorId: "assistant",
      authorRole: "assistant",
      status: "accepted",
      title: "AI 膝盖保守计划",
      dayLabel: "第 1 天",
      items: [{ title: "等长伸膝", meta: "3 组 x 30 秒", state: "todo" }],
      stage: {
        name: "镇痛与负荷管理",
        progressLabel: "第 1 周",
        progressPercent: 10,
        goals: ["疼痛可控"],
      },
      precautions: ["疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:00:00.000Z",
      acceptedAt: "2026-07-02T02:01:00.000Z",
    });

    const [action, declineAction] = listActionLibrary(platform);
    expect(action.bodyRegion).toBe("knee");

    const plan = createClinicianPlanForConsultation(platform, session.id, clinicianActor, {
      title: "康复师定制膝前痛计划",
      dayLabel: "第 1 天",
      actionIds: [action.id],
      precautions: ["训练中疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:12:00.000Z",
    });
    const declinedPlan = createClinicianPlanForConsultation(platform, session.id, clinicianActor, {
      title: "可选负荷进阶计划",
      dayLabel: "第 2 天",
      actionIds: [declineAction.id],
      precautions: ["急性肿胀时暂停"],
      progressionCriteria: ["可完成 4 组且次日无加重"],
      createdAt: "2026-07-02T02:13:00.000Z",
    });

    expect(plan.status).toBe("sent_to_patient");
    expect(plan.source).toBe("clinician_custom");
    expect(declineConsultationPlan(platform, declinedPlan.id, patientActor).status).toBe("declined");

    const accepted = acceptConsultationPlan(platform, plan.id, patientActor, "2026-07-02T02:20:00.000Z");
    const snapshot = getConsultationSnapshot(
      platform,
      session.id,
      patientActor,
      "2026-07-04T02:20:00.000Z",
    );

    expect(accepted.status).toBe("accepted");
    expect(snapshot.plans.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(["plan_ai_existing", plan.id, declinedPlan.id]),
    );
    expect(snapshot.plans.find((candidate) => candidate.id === "plan_ai_existing")?.source).toBe("ai_generated");
    expect(snapshot.plans.find((candidate) => candidate.id === plan.id)?.source).toBe("clinician_custom");
    expect(snapshot.messages.some((message) => message.kind === "plan_offer")).toBe(true);
    expect(snapshot.actionLibrary.length).toBeGreaterThan(40);
    expect(snapshot.actionLibrary.every((action) => action.source === "seed")).toBe(true);
    expect(snapshot.actionLibrary.some((action) => action.id === "action_quad_iso")).toBe(true);
    expect(snapshot.actionLibrary.some((action) => action.id === "action_seated_hamstring_stretch")).toBe(true);
    expect(snapshot.actionLibrary.some((action) => action.id.startsWith("exercise_"))).toBe(false);
  });

  it("denies plan offers before activation and from pending clinicians", () => {
    const platform = createPlatformDemo();
    const clinicianActor = platform.clinicians[0];
    const session = createConsultationSession(platform, {
      patientUserId: "user_1",
      clinicianId: "clinician_1",
      caseId: "case_demo",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
    });
    const [action] = listActionLibrary(platform);

    expect(() =>
      createClinicianPlanForConsultation(platform, session.id, clinicianActor, {
        title: "未激活计划",
        dayLabel: "第 1 天",
        actionIds: [action.id],
        precautions: [],
        progressionCriteria: [],
        createdAt: "2026-07-02T02:01:00.000Z",
      }),
    ).toThrow("Consultation has not been activated");

    const pending = registerDemoUser(platform, {
      accountRole: "clinician",
      username: "pending_planner",
      password: "secret",
      displayName: "待审核康复师",
      inviteCode: "ique1116",
      heightCm: "",
      weightKg: "",
      specialties: ["knee"],
    });
    platform.clinicians = platform.clinicians.map((candidate) =>
      candidate.id === pending.user.id ? { ...candidate, credentialStatus: "pending" as const } : candidate,
    );
    const pendingActor = platform.clinicians.find((candidate) => candidate.id === pending.user.id)!;
    platform.consultations.push({
      id: "consult_pending_fixture",
      patientUserId: "user_1",
      clinicianId: pending.user.id,
      caseId: "case_pending",
      status: "active",
      paymentStatus: "paid",
      scheduledStartAt: "2026-07-02T02:00:00.000Z",
      scheduledEndAt: "2026-07-02T02:30:00.000Z",
      activatedAt: "2026-07-02T02:02:00.000Z",
      expiresAt: "2026-07-02T02:17:00.000Z",
      durationMinutes: 15,
      createdAt: "2026-07-02T01:50:00.000Z",
    });
    platform.caseAuthorizations.push({
      id: "auth_pending_fixture",
      caseId: "case_pending",
      patientUserId: "user_1",
      clinicianId: pending.user.id,
      consultationSessionId: "consult_pending_fixture",
      scope: ["profile", "assessment_summary", "current_plans"],
      accessMode: ["read", "plan_create"],
      startsAt: "2026-07-02T02:00:00.000Z",
      endsAt: "2026-07-09T02:30:00.000Z",
      createdAt: "2026-07-02T01:50:00.000Z",
    });

    expect(() =>
      createClinicianPlanForConsultation(platform, "consult_pending_fixture", pendingActor, {
        title: "待审核康复师计划",
        dayLabel: "第 1 天",
        actionIds: [action.id],
        precautions: [],
        progressionCriteria: [],
        createdAt: "2026-07-02T02:12:00.000Z",
      }),
    ).toThrow("Clinician cannot create plan for consultation");
  });

  it("only lets patients accept or decline plans awaiting confirmation", () => {
    const platform = createPlatformDemo();
    const basePlan = {
      caseId: "case_demo",
      patientUserId: "user_1",
      source: "clinician_custom" as const,
      authorId: "clinician_1",
      authorRole: "clinician" as const,
      title: "状态保护计划",
      dayLabel: "第 1 天",
      items: [{ title: "靠墙静蹲", meta: "4 组 x 20 秒", state: "todo" as const }],
      stage: {
        name: "负荷控制",
        progressLabel: "第 1 周",
        progressPercent: 10,
        goals: ["下楼疼痛下降"],
      },
      precautions: ["疼痛超过 3/10 时停止"],
      progressionCriteria: ["24 小时内无明显加重"],
      createdAt: "2026-07-02T02:12:00.000Z",
    };
    platform.trainingPlans.push(
      { ...basePlan, id: "plan_declined", status: "declined" },
      { ...basePlan, id: "plan_draft", status: "draft" },
      { ...basePlan, id: "plan_accepted", status: "accepted", acceptedAt: "2026-07-02T02:20:00.000Z" },
    );

    expect(() => acceptConsultationPlan(platform, "plan_declined", platform.users[0], "2026-07-02T02:21:00.000Z")).toThrow(
      "Plan is not awaiting patient confirmation",
    );
    expect(() => acceptConsultationPlan(platform, "plan_draft", platform.users[0], "2026-07-02T02:21:00.000Z")).toThrow(
      "Plan is not awaiting patient confirmation",
    );
    expect(() => acceptConsultationPlan(platform, "plan_accepted", platform.users[0], "2026-07-02T02:21:00.000Z")).toThrow(
      "Plan is not awaiting patient confirmation",
    );
    expect(() => declineConsultationPlan(platform, "plan_accepted", platform.users[0])).toThrow(
      "Plan is not awaiting patient confirmation",
    );
  });
});

describe("Qwen chat client", () => {
  it("uses concise no-markdown style rules in the rehab chat prompt", () => {
    const prompt = buildChatSystemPrompt({ category: "ankle" });

    expect(prompt).toContain("不要使用 Markdown");
    expect(prompt).toContain("一次只问一个主要问题");
    expect(prompt).toContain("由你根据当前上下文生成");
    expect(prompt).toContain("只返回一个 JSON 对象");
    expect(prompt).toContain("Mentis 特调的 AI 康复模型");
    expect(prompt).toContain("不要提及千问");
  });

  it("parses model-generated JSON options without inventing template fields", () => {
    const guided = buildGuidedChatResponse(
      [{ role: "user", content: "昨天崴脚了，今天有点肿" }],
      { category: "ankle" },
      JSON.stringify({
        content: "**第一步**：先确认有没有需要线下评估的信号。",
        question: "现在能连续走 4 步吗？",
        options: [
          { label: "能连续走 4 步", value: "我现在能连续走 4 步" },
          { label: "不能", value: "我现在不能连续走 4 步" },
          { label: "不确定", value: "我不确定能不能连续走 4 步" },
        ],
      }),
    );

    expect(guided.assessmentStep).toBeUndefined();
    expect(guided.question).toBe("现在能连续走 4 步吗？");
    expect(guided.options?.map((option) => option.label)).toEqual(["能连续走 4 步", "不能", "不确定"]);
    expect(guided.content).not.toMatch(/\*\*|#{1,6}\s|\|/);
    expect(guided.planPatch).toBeUndefined();
  });

  it("does not invent knee assessment options when the model returns plain text", () => {
    const guided = buildGuidedChatResponse(
      [{ role: "user", content: "跑步后膝盖肿了，上下楼疼" }],
      { category: "knee" },
      "我先了解你的膝盖情况。请描述肿胀出现的时间和是否能正常走路。",
    );

    expect(guided.assessmentStep).toBeUndefined();
    expect(guided.question).toBeUndefined();
    expect(guided.options).toBeUndefined();
    expect(guided.content.split("\n").filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it("does not start knee pain-location buttons for a generic greeting", () => {
    const guided = buildGuidedChatResponse(
      [{ role: "user", content: "晚上好" }],
      { category: "knee" },
      "晚上好，我是 Mentis Rehab 的运动康复 AI 助手。请直接告诉我你今天想咨询的不适。",
    );

    expect(guided.assessmentStep).toBeUndefined();
    expect(guided.question).toBeUndefined();
    expect(guided.options).toBeUndefined();
    expect(guided.content).toContain("晚上好");
  });

  it("asks knee pain location first when the complaint is non-traumatic extension pain", () => {
    const guided = buildGuidedChatResponse(
      [{ role: "user", content: "膝盖伸直的时候疼" }],
      { category: "knee" },
      JSON.stringify({
        content: "我先确认伸直时疼痛的具体位置。",
        question: "伸直膝盖时，最明显疼痛位置在哪里？",
        options: ["膝盖前方", "膝盖后方", "内侧", "外侧"],
      }),
    );

    expect(guided.assessmentStep).toBeUndefined();
    expect(guided.question).toBe("伸直膝盖时，最明显疼痛位置在哪里？");
    expect(guided.options?.map((option) => option.label)).toEqual([
      "膝盖前方",
      "膝盖后方",
      "内侧",
      "外侧",
    ]);
  });

  it("uses the model's next question after a selected answer", () => {
    const guided = buildGuidedChatResponse(
      [
        { role: "user", content: "膝盖摔了一下，现在伸直疼" },
        {
          role: "assistant",
          content: "先确认一个安全问题。",
          assessmentStep: "knee_weight_bearing",
          question: "现在能正常承重走路吗？",
        },
        { role: "user", content: "能" },
      ],
      { category: "knee" },
      JSON.stringify({
        content: "能承重是一个相对安心的信号，但摔伤后仍要看疼痛位置和肿胀变化。",
        question: "你现在最明显的疼痛位置在哪里？",
        options: [
          { label: "前方", value: "膝盖前方最疼" },
          { label: "内侧", value: "膝盖内侧最疼" },
        ],
      }),
    );

    expect(guided.assessmentStep).toBeUndefined();
    expect(guided.question).toBe("你现在最明显的疼痛位置在哪里？");
    expect(guided.options?.map((option) => option.label)).toEqual(["前方", "内侧"]);
    expect(guided.options?.map((option) => option.label)).not.toEqual(["能", "不能", "不确定"]);
  });

  it("does not create local plan patches from scripted knee flow", () => {
    const offer = buildGuidedChatResponse(
      [
        { role: "user", content: "膝盖伸直的时候疼" },
        { role: "assistant", content: "位置在哪里？", assessmentStep: "knee_pain_location" },
        { role: "user", content: "膝盖前方" },
        { role: "assistant", content: "疼痛评分？", assessmentStep: "knee_pain_score" },
        { role: "user", content: "4-6 分" },
        { role: "assistant", content: "哪些动作诱发？", assessmentStep: "knee_trigger" },
        { role: "user", content: "伸直和下楼疼" },
        { role: "assistant", content: "最近训练量？", assessmentStep: "knee_training_load" },
        { role: "user", content: "最近跑量增加了" },
      ],
      { category: "knee" },
      JSON.stringify({
        content: "这些信息提示需要先做保守负荷管理，我会先给出低风险调整建议。",
        question: "你希望现在生成一个保守训练建议吗？",
        options: ["生成建议", "先继续问诊"],
      }),
    );

    expect(offer.assessmentStep).toBeUndefined();
    expect(offer.question).toBe("你希望现在生成一个保守训练建议吗？");
    expect(offer.options?.map((option) => option.label)).toEqual(["生成建议", "先继续问诊"]);
    expect(offer.planPatch).toBeUndefined();
  });

  it("does not create plan patches when red flag answers require offline assessment", () => {
    const guided = buildGuidedChatResponse(
      [
        { role: "user", content: "昨天崴脚了，今天有点肿" },
        { role: "assistant", content: "先确认能不能走。" },
        { role: "user", content: "不能" },
      ],
      { category: "ankle" },
      "这个情况需要先排除骨折或较重韧带损伤。请暂停训练，尽快做线下评估。",
    );

    expect(guided.assessmentStep).toBeUndefined();
    expect(guided.content).toContain("线下评估");
    expect(guided.planPatch).toBeUndefined();
  });

  it("calls DashScope compatible chat API without exposing the API key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "先把跑步暂停到可耐受范围，并观察 24 小时疼痛反应。" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const client = new QwenChatClient({
      apiKey: "secret-key",
      model: "qwen3.7-plus",
      fetcher,
    });

    const result = await client.chat([
      { role: "user", content: "膝盖跑步后疼，今天还能跑吗？" },
    ]);

    expect(result.content).toContain("24 小时");
    expect(calls[0].url).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    expect(calls[0].init.body).not.toContain("secret-key");
    expect(calls[0].init.body).toContain("qwen3.7-plus");
  });

  it("fails safely when the DashScope key is missing", async () => {
    const client = new QwenChatClient({ apiKey: "" });

    await expect(client.chat([{ role: "user", content: "你好" }])).rejects.toThrow("DASHSCOPE_API_KEY");
  });

  it("scopes answers to the selected rehab category and uses provided RAG evidence", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { content: "请描述膝盖症状。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const client = new QwenChatClient({ apiKey: "secret-key", fetcher });

    await client.chat([{ role: "user", content: "肩膀也疼，可以一起问吗？" }], {
      category: "knee",
      ragContext: [
        {
          source: "Patellofemoral Pain 2019 LOGO.pdf",
          page: 20,
          text: "Exercise therapy and load management are recommended.",
        },
      ],
    });

    const body = JSON.parse(String(calls[0].init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages[0].content;
    expect(systemPrompt).toContain("当前咨询类别：膝盖");
    expect(systemPrompt).toContain("只围绕膝盖");
    expect(systemPrompt).toContain("可用 RAG 证据");
    expect(systemPrompt).toContain("Patellofemoral Pain 2019 LOGO.pdf, page 20");
  });

  it("can receive future RAG snippets in the chat context", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { content: "可先降低负荷。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const client = new QwenChatClient({ apiKey: "secret-key", fetcher });

    await client.chat([{ role: "user", content: "还能跑吗？" }], {
      category: "knee",
      ragContext: [
        {
          source: "Patellofemoral Pain 2019 LOGO.pdf",
          page: 20,
          text: "Monitor pain during and 24 hours after activity.",
        },
      ],
    });

    const body = JSON.parse(String(calls[0].init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0].content).toContain("Patellofemoral Pain 2019 LOGO.pdf, page 20");
    expect(body.messages[0].content).toContain("Monitor pain during and 24 hours after activity.");
  });

  it("passes model-generated structured options through to the chat UI", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "**第一步**：先确认脚踝能不能承重。",
                  question: "现在能连续走 4 步吗？",
                  options: ["能连续走 4 步", "不能", "不确定"],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "跑步后脚踝外侧疼" }],
      { category: "ankle" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(1);
    expect(result.content).not.toContain("**");
    expect(result.question).toBe("现在能连续走 4 步吗？");
    expect(result.options?.length).toBe(3);
    expect(result.planPatch).toBeUndefined();
  });

  it("calls the model for acute ankle screening instead of using local options", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "崴脚后肿胀需要先排除不能承重等信号。",
                  question: "现在能连续走 4 步吗？",
                  options: ["能", "不能", "不确定"],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "昨天崴脚了，今天有点肿" }],
      { category: "ankle" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(1);
    expect(result.assessmentStep).toBeUndefined();
    expect(result.question).toBe("现在能连续走 4 步吗？");
    expect(result.options?.map((option) => option.label)).toEqual(["能", "不能", "不确定"]);
  });

  it("calls the model for normal knee assessment and uses model-generated options", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "伸直时疼痛需要先看位置和是否伴随肿胀。",
                  question: "伸直膝盖时，最明显疼痛位置在哪里？",
                  options: ["膝盖前方", "膝盖后方", "内侧", "外侧"],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "膝盖伸直的时候疼" }],
      { category: "knee" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(1);
    expect(result.content).toContain("位置");
    expect(result.assessmentStep).toBeUndefined();
    expect(result.question).toBe("伸直膝盖时，最明显疼痛位置在哪里？");
    expect(result.options?.map((option) => option.label)).toContain("膝盖前方");
  });

  it("parses structured rehab action recommendations from model output", () => {
    const result = buildGuidedChatResponse(
      [{ role: "user", content: "我想先试两个简单动作" }],
      { category: "knee" },
      JSON.stringify({
        content: "可以先做低刺激激活动作。",
        recommendedActions: [
          {
            title: "坐姿伸膝",
            bodyRegion: "knee",
            phase: "镇痛与激活",
            defaultDosage: "2 组 x 10 次",
            instructions: ["坐稳后慢慢伸直膝盖", "停 2 秒再放下"],
            contraindications: ["伸膝时疼痛超过 3/10"],
            progressionCriteria: ["次日无明显加重"],
            tags: ["膝盖", "股四头肌"],
            reason: "帮助温和激活大腿前侧。",
          },
        ],
      }),
    );

    expect(result.recommendedActions?.[0]).toMatchObject({
      title: "坐姿伸膝",
      bodyRegion: "knee",
      defaultDosage: "2 组 x 10 次",
      reason: "帮助温和激活大腿前侧。",
    });
  });

  it("adds generated rehab actions to the action library without a needs-video tag", () => {
    const platform = createPlatformDemo();
    const beforeCount = platform.actionLibrary.length;

    const resolved = resolveRecommendedActions(
      platform,
      [
        {
          title: "坐姿伸膝",
          bodyRegion: "knee",
          phase: "镇痛与激活",
          defaultDosage: "2 组 x 10 次",
          instructions: ["坐稳后慢慢伸直膝盖", "停 2 秒再放下"],
          contraindications: ["伸膝时疼痛超过 3/10"],
          progressionCriteria: ["次日无明显加重"],
          tags: ["膝盖", "股四头肌"],
          reason: "帮助温和激活大腿前侧。",
        },
      ],
      "knee",
    );

    expect(platform.actionLibrary).toHaveLength(beforeCount + 1);
    expect(resolved[0].actionId).toBeTruthy();
    const stored = platform.actionLibrary.find((action) => action.id === resolved[0].actionId);
    expect(stored).toMatchObject({
      title: "坐姿伸膝",
      bodyRegion: "knee",
      phase: "镇痛与激活",
      defaultDosage: "2 组 x 10 次",
    });
    expect(stored?.tags).toContain("ai-generated");
    expect(stored?.tags).toContain("rehab");
    expect(stored?.tags).not.toContain("needs-video");
  });

  it("does not advance a knee guided flow when the user asks an unrelated question", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "我无法提供实时天气。我们可以继续膝盖问诊，或你先查看天气应用。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [
        { role: "user", content: "膝盖前方疼" },
        { role: "assistant", content: "位置先记下。现在用疼痛分数判断刺激强度。", assessmentStep: "knee_pain_score" },
        { role: "user", content: "明天天气如何" },
      ],
      { category: "knee" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(1);
    expect(result.content).toContain("天气");
    expect(result.assessmentStep).toBeUndefined();
    expect(result.question).toBeUndefined();
    expect(result.options).toBeUndefined();
  });

  it("calls the model for knee option replies before adding the next structured question", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  content: "收到，4-6 分属于中等刺激。下一步看诱发动作。",
                  question: "哪个动作最容易诱发这次膝盖疼？",
                  options: ["伸直膝盖", "上下楼", "深蹲", "跑步", "运动后"],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const result = await chatWithQwen(
      [
        { role: "user", content: "膝盖前方疼" },
        { role: "assistant", content: "按 0-10 分算，现在或诱发时大概几分？", assessmentStep: "knee_pain_score" },
        { role: "user", content: "4-6 分" },
      ],
      { category: "knee" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(1);
    expect(result.content).toContain("4-6 分");
    expect(result.assessmentStep).toBeUndefined();
    expect(result.question).toBe("哪个动作最容易诱发这次膝盖疼？");
  });

  it("calls the model for red flag option answers so safety guidance uses full context", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "不能连续走 4 步需要先排除骨折或较重韧带损伤，请暂停训练并尽快线下评估。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [
        { role: "user", content: "昨天崴脚了，今天有点肿" },
        { role: "assistant", content: "现在能连续走 4 步吗？" },
        { role: "user", content: "不能" },
      ],
      { category: "ankle" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(1);
    expect(result.assessmentStep).toBeUndefined();
    expect(result.content).toContain("线下评估");
    expect(result.planPatch).toBeUndefined();
  });

  it("answers model identity questions locally without exposing the provider", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "不应调用模型" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "你用的是什么大模型？" }],
      { category: "knee" },
      { apiKey: "secret-key", fetcher },
    );

    expect(fetchCalls).toBe(0);
    expect(result.content).toBe("我使用的是 Mentis 特调的 AI 康复模型。");
    expect(result.content).not.toMatch(/千问|Qwen|DashScope|OpenAI|DeepSeek/);
  });

  it("aborts slow DashScope requests instead of hanging the chat UI", async () => {
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")));
      });
    const client = new QwenChatClient({ apiKey: "secret-key", fetcher, timeoutMs: 1 });

    await expect(client.chat([{ role: "user", content: "你好" }], { category: "ankle" })).rejects.toThrow(
      "DashScope chat timed out",
    );
  });
});

describe("local RAG integration", () => {
  it("retrieves knee evidence from a local RAG index for chat context", () => {
    const dir = mkdtempSync(join(tmpdir(), "mentis-rag-"));
    const indexPath = join(dir, "index.json");
    writeFileSync(
      indexPath,
      JSON.stringify({
        version: 1,
        chunks: [
          {
            id: "ankle",
            source: "NATA ankle.pdf",
            text: "Acute ankle sprain should screen weight bearing.",
            start: 0,
            end: 52,
            metadata: { file: "NATA ankle.pdf", page: "4", title: "Ankle Guideline" },
          },
          {
            id: "knee",
            source: "Patellofemoral Pain 2019 LOGO.pdf",
            text: "Knee patellofemoral pain management uses exercise therapy and load management.",
            start: 0,
            end: 82,
            metadata: {
              file: "Patellofemoral Pain 2019 LOGO.pdf",
              page: "20",
              title: "Patellofemoral Pain Guideline",
              evidence_type: "clinical_practice_guideline",
            },
          },
        ],
      }),
      "utf-8",
    );

    const results = searchLocalRag("膝盖前方疼痛 exercise load", { indexPath, topK: 1 });

    expect(results[0]).toMatchObject({
      source: "Patellofemoral Pain 2019 LOGO.pdf",
      page: "20",
    });
    expect(results[0].text).toContain("load management");
  });

  it("builds chat RAG context from the latest user knee question", () => {
    const dir = mkdtempSync(join(tmpdir(), "mentis-rag-"));
    const indexPath = join(dir, "index.json");
    writeFileSync(
      indexPath,
      JSON.stringify({
        version: 1,
        chunks: [
          {
            id: "knee",
            source: "Front_Rehabil_Sci_2025_patellofemoral_pain_knee_extensor_training_review.pdf",
            text: "Knee extensor training can improve patellofemoral pain when progressed by symptoms.",
            start: 0,
            end: 95,
            metadata: { file: "knee_extensor_review.pdf", page: "3" },
          },
        ],
      }),
      "utf-8",
    );

    const context = buildChatRagContext([{ role: "user", content: "膝盖伸直的时候疼" }], "knee", {
      indexPath,
      topK: 1,
    });

    expect(context).toHaveLength(1);
    expect(context[0].text).toContain("Knee extensor training");
  });
});

describe("case memory deletion", () => {
  it("allows deleting draft consultation cases but locks accepted prescription cases", () => {
    const platform = createPlatformDemo();
    const userId = "user_1";
    platform.userMemories[userId].cases = [
      {
        id: "draft_case",
        categoryId: "knee",
        title: "伸直膝盖疼",
        summary: "待评估",
        status: "咨询中",
        createdAt: "07/01 10:21",
      },
      {
        id: "accepted_case",
        categoryId: "knee",
        title: "膝前痛计划",
        summary: "已接受运动处方",
        status: "运动处方已接受",
        createdAt: "07/01 10:30",
      },
    ];

    const afterDelete = deleteRememberedCase(platform, userId, "draft_case");
    expect(afterDelete.cases.map((patientCase) => patientCase.id)).toEqual(["accepted_case"]);

    expect(() => deleteRememberedCase(platform, userId, "accepted_case")).toThrow(
      "Accepted prescription cases cannot be deleted",
    );
  });
});

describe("training plan memory", () => {
  it("stores accepted exercise prescriptions in backend memory and locks the source case", () => {
    const platform = createPlatformDemo();
    const userId = "user_1";

    rememberCase(platform, userId, {
      id: "case_knee_1",
      categoryId: "knee",
      title: "膝盖伸直疼",
      summary: "膝盖前方疼，4-6 分",
      status: "咨询中",
      createdAt: "07/02 11:10",
    });

    const memory = rememberTrainingPlan(platform, userId, {
      id: "plan_case_knee_1",
      caseId: "case_knee_1",
      categoryId: "knee",
      title: "膝盖保守恢复计划",
      status: "active",
      dayLabel: "第 1 天",
      completionPercent: 0,
      items: [{ title: "温和膝关节活动", meta: "2 组 x 10 次", state: "todo" }],
      stage: {
        name: "镇痛与负荷管理",
        progressLabel: "起步观察期",
        progressPercent: 12,
        goals: ["疼痛不超过 3/10"],
      },
    });

    expect(memory.trainingPlans).toHaveLength(1);
    expect(memory.trainingPlans[0]).toMatchObject({
      id: "plan_case_knee_1",
      caseId: "case_knee_1",
      title: "膝盖保守恢复计划",
      status: "active",
    });
    expect(memory.cases.find((patientCase) => patientCase.id === "case_knee_1")?.status).toBe(
      "运动处方已接受",
    );
    expect(() => deleteRememberedCase(platform, userId, "case_knee_1")).toThrow(
      "Accepted prescription cases cannot be deleted",
    );
  });
});

describe("compressed user memory", () => {
  it("builds a bounded prompt context from summaries instead of full memory history", () => {
    const memory = {
      userId: "user_1",
      profileSummary: "中级跑者，每周跑步 4 次。",
      clinicalSummary: "右膝前痛，上下楼 3/10，无明显肿胀。",
      activePlanSummary: "今日训练：坐姿伸膝 2 组 x 10 次。",
      recentEvents: Array.from({ length: 8 }, (_, index) => ({
        id: `event_${index}`,
        type: "case_updated" as const,
        summary: `事件 ${index}`,
        createdAt: `2026-07-0${index}T00:00:00.000Z`,
      })),
      cases: Array.from({ length: 30 }, (_, index) => ({
        id: `case_${index}`,
        categoryId: "knee" as const,
        title: `很久以前的完整病例 ${index}`,
        summary: "这段很长的原始病例不应该进入 prompt。",
        status: "咨询中",
        createdAt: `2026-06-${String(index + 1).padStart(2, "0")}`,
      })),
      trainingPlans: [],
      notes: ["这条原始 note 不应该在有 profileSummary 时重复注入。"],
      updatedAt: "2026-07-04T00:00:00.000Z",
    };

    const context = buildUserMemoryContext(memory);

    expect(context).toContain("中级跑者");
    expect(context).toContain("右膝前痛");
    expect(context).toContain("坐姿伸膝");
    expect(context).toContain("事件 7");
    expect(context).not.toContain("很久以前的完整病例 0");
    expect(context).not.toContain("这段很长的原始病例");
    expect(context.length).toBeLessThanOrEqual(1200);
  });

  it("keeps memory summaries fresh when cases and plans are remembered", () => {
    const platform = createPlatformDemo();
    const userId = "user_1";

    rememberCase(platform, userId, {
      id: "case_new",
      categoryId: "knee",
      title: "上楼膝前痛",
      summary: "无肿胀，疼痛 3/10",
      status: "咨询中",
      createdAt: "07/04 21:40",
    });
    const memory = rememberTrainingPlan(platform, userId, {
      id: "plan_case_new",
      caseId: "case_new",
      categoryId: "knee",
      title: "膝前痛低刺激训练",
      status: "active",
      dayLabel: "今日训练",
      completionPercent: 0,
      items: [{ title: "坐姿伸膝", meta: "2 组 x 10 次", state: "todo" }],
      stage: {
        name: "镇痛与激活",
        progressLabel: "第 1 天",
        progressPercent: 0,
        goals: ["次日无明显加重"],
      },
    });

    expect(memory.clinicalSummary).toContain("上楼膝前痛");
    expect(memory.activePlanSummary).toContain("坐姿伸膝");
    expect(memory.recentEvents[0].summary).toContain("膝前痛低刺激训练");
    expect(memory.recentEvents.length).toBeLessThanOrEqual(5);
  });

  it("injects compressed user memory into the chat prompt", () => {
    const prompt = buildChatSystemPrompt({
      category: "knee",
      userMemory: {
        userId: "user_1",
        profileSummary: "中级跑者，每周训练 4 次。",
        clinicalSummary: "膝前痛，久坐后加重。",
        activePlanSummary: "",
        recentEvents: [],
        cases: [],
        trainingPlans: [],
        notes: [],
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    });

    expect(prompt).toContain("用户记忆摘要");
    expect(prompt).toContain("中级跑者");
    expect(prompt).toContain("膝前痛");
  });
});

describe("chat orchestration", () => {
  it("passes category context into the chat client", async () => {
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(body.messages[0].content).toContain("当前咨询类别：脚踝");
      return new Response(JSON.stringify({ choices: [{ message: { content: "先记录脚踝疼痛位置。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await chatWithQwen(
      [{ role: "user", content: "跑步后脚踝疼" }],
      { category: "ankle" satisfies RehabConsultCategory },
      { apiKey: "secret-key", fetcher },
    );

    expect(result.content).toContain("脚踝");
  });
});

describe("CORS origin resolution", () => {
  it("allows localhost dev server ports without opening arbitrary origins", () => {
    expect(resolveCorsOrigin("http://127.0.0.1:5174")).toBe("http://127.0.0.1:5174");
    expect(resolveCorsOrigin("http://localhost:5179")).toBe("http://localhost:5179");
    expect(resolveCorsOrigin("https://example.com")).toBe("http://127.0.0.1:5173");
  });
});

describe("chat action library prompt", () => {
  const library: ActionLibraryItem[] = [
    {
      id: "action_hamstring_stretch",
      title: "坐姿腘绳肌拉伸",
      bodyRegion: "knee",
      bodyRegions: ["knee", "hip"],
      actionType: "stretch",
      targetMuscles: ["腘绳肌"],
      source: "seed",
      phase: "活动度与拉伸",
      defaultDosage: "3 组 x 30 秒",
      instructions: ["坐在椅子边缘"],
      contraindications: ["疼痛加重立即停止"],
      progressionCriteria: ["牵拉感可耐受"],
      tags: ["膝盖"],
    },
  ];

  it("injects action type and target muscles so the model knows what each action stretches", () => {
    const prompt = buildChatSystemPrompt(
      { category: "knee", actionLibrary: library },
      [{ role: "user", content: "膝盖后方紧" }],
    );
    expect(prompt).toContain("action_hamstring_stretch");
    expect(prompt).toContain("腘绳肌");
    expect(prompt).toContain("stretch");
  });

  it("tells the model to invent a new action rather than force-fit a mismatched actionId", () => {
    const prompt = buildChatSystemPrompt({ category: "knee", actionLibrary: library }, []);
    expect(prompt).toContain("直接生成新动作");
    expect(prompt).not.toContain("优先使用可用动作库里的 actionId");
  });

  it("lets the model choose how many actions to recommend", () => {
    const prompt = buildChatSystemPrompt({ category: "knee", actionLibrary: library }, []);
    expect(prompt).toContain("1-5 个");
  });

  it("tells the model to respect the patient's recovery stage and to ask before guessing", () => {
    const prompt = buildChatSystemPrompt({ category: "knee", actionLibrary: library }, []);
    expect(prompt).toContain("康复阶段");
    expect(prompt).toContain("保守");
  });

  it("parses actionType and targetMuscles out of the model response", () => {
    const result = buildGuidedChatResponse(
      [{ role: "user", content: "膝盖后方紧" }],
      { category: "knee" },
      JSON.stringify({
        content: "试试拉伸大腿后侧。",
        recommendedActions: [
          {
            title: "坐姿腘绳肌拉伸",
            bodyRegion: "knee",
            actionType: "stretch",
            targetMuscles: ["腘绳肌"],
            phase: "活动度与拉伸",
            defaultDosage: "3 组 x 30 秒",
            instructions: ["坐在椅子边缘"],
            contraindications: ["疼痛加重立即停止"],
            progressionCriteria: ["牵拉感可耐受"],
            tags: ["膝盖"],
          },
        ],
      }),
    );
    expect(result.recommendedActions?.[0].actionType).toBe("stretch");
    expect(result.recommendedActions?.[0].targetMuscles).toEqual(["腘绳肌"]);
  });

  it("keeps up to five recommended actions", () => {
    const actions = Array.from({ length: 6 }, (_unused, index) => ({
      title: `动作${index}`,
      bodyRegion: "knee",
      actionType: "strength",
      targetMuscles: ["股四头肌"],
      phase: "力量",
      defaultDosage: "3 组 x 10 次",
      instructions: ["步骤"],
      contraindications: ["疼痛加重立即停止"],
      progressionCriteria: ["无痛完成"],
      tags: ["膝盖"],
    }));
    const result = buildGuidedChatResponse([], {}, JSON.stringify({ content: "计划", recommendedActions: actions }));
    expect(result.recommendedActions).toHaveLength(5);
  });
});
