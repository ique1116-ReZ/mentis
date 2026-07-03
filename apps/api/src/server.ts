import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  acceptConsultationPlan,
  authenticateDemoUser,
  bookConsultationFromAvailability,
  chatWithQwen,
  createClinicianPlanForConsultation,
  createClinicianAvailabilitySlot,
  createConsultationSession,
  createPlatformDemo,
  deleteRememberedCase,
  declineConsultationPlan,
  getClinicianConsultations,
  getConsultationSnapshot,
  getPatientConsultations,
  getUserMemory,
  joinConsultationSession,
  listAdminClinicianReviews,
  listActionLibrary,
  listClinicianAvailability,
  listClinicians,
  registerDemoUser,
  rememberCase,
  rememberTrainingPlan,
  reviewClinicianCredential,
  resolveAuthenticatedActor,
  resolveCorsOrigin,
  runAssessmentWorkflow,
  sendConsultationMessage,
  type AssessmentWorkflowInput,
  type AuthenticatedActor,
  type ChatMessage,
  type ConsultationPaymentInput,
  type LoginInput,
  type MemoryCaseSummary,
  type MemoryTrainingPlanInput,
  type RegistrationInput,
  type RehabConsultCategory,
} from "./index.js";

const platform = createPlatformDemo();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const corsOrigin = resolveCorsOrigin(request.headers.origin);
  response.setHeader("Access-Control-Allow-Origin", corsOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "GET" && url.pathname === "/health") {
    response.end(JSON.stringify({ ok: true, service: "mentis-api" }));
    return;
  }

  try {
    if (request.method === "POST" && url.pathname === "/v1/auth/login") {
      const body = await readJson(request);
      const result = authenticateDemoUser(platform, body as unknown as LoginInput);
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/auth/register") {
      const body = await readJson(request);
      const result = registerDemoUser(platform, body as unknown as RegistrationInput);
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/clinicians") {
      resolveRequestActor(request, url);
      response.end(JSON.stringify(listClinicians(platform)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/admin/clinicians") {
      const actor = resolveRequestActor(request, url);
      response.end(JSON.stringify(listAdminClinicianReviews(platform, actor)));
      return;
    }

    const adminClinicianReviewMatch = url.pathname.match(/^\/v1\/admin\/clinicians\/([^/]+)\/review$/);
    if (request.method === "POST" && adminClinicianReviewMatch) {
      const actor = resolveRequestActor(request, url);
      const body = await readJson(request);
      const result = reviewClinicianCredential(platform, decodeURIComponent(adminClinicianReviewMatch[1]), actor, {
        credentialStatus: requireCredentialStatus(body.credentialStatus),
        publicDirectoryVisible: optionalBoolean(body.publicDirectoryVisible),
        reviewedAt: optionalString(body.reviewedAt),
        reviewNote: optionalString(body.reviewNote),
      });
      response.end(JSON.stringify(result));
      return;
    }

    const clinicianConsultationsMatch = url.pathname.match(/^\/v1\/clinicians\/([^/]+)\/consultations$/);
    if (request.method === "GET" && clinicianConsultationsMatch) {
      const clinicianId = decodeURIComponent(clinicianConsultationsMatch[1]);
      const actor = resolveRequestActor(request, url);
      if (actor.role !== "clinician" || actor.id !== clinicianId) {
        throw new Error("Clinician access denied");
      }
      response.end(JSON.stringify(getClinicianConsultations(platform, clinicianId)));
      return;
    }

    const clinicianAvailabilityMatch = url.pathname.match(/^\/v1\/clinicians\/([^/]+)\/availability$/);
    if (request.method === "GET" && clinicianAvailabilityMatch) {
      const clinicianId = decodeURIComponent(clinicianAvailabilityMatch[1]);
      const actor = resolveRequestActor(request, url);
      const includeBooked = actor.role === "clinician" && actor.id === clinicianId;
      response.end(JSON.stringify(listClinicianAvailability(platform, clinicianId, {
        includeBooked,
        publicOnly: actor.role === "user",
      })));
      return;
    }

    if (request.method === "POST" && clinicianAvailabilityMatch) {
      const clinicianId = decodeURIComponent(clinicianAvailabilityMatch[1]);
      const actor = resolveRequestActor(request, url);
      const body = await readJson(request);
      const result = createClinicianAvailabilitySlot(platform, clinicianId, actor, {
        startsAt: requireString(body.startsAt, "startsAt"),
        endsAt: requireString(body.endsAt, "endsAt"),
        createdAt: optionalString(body.createdAt),
      });
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/consultations") {
      const actor = resolveRequestActor(request, url);
      if (actor.role !== "user") {
        throw new Error("Only patients can create consultations");
      }
      const body = await readJson(request);
      const availabilitySlotId = optionalString(body.availabilitySlotId);
      const result = availabilitySlotId
        ? bookConsultationFromAvailability(platform, {
            patientUserId: actor.id,
            caseId: requireString(body.caseId, "caseId"),
            availabilitySlotId,
            createdAt: optionalString(body.createdAt),
            payment: readPaymentInput(body),
          })
        : createConsultationSession(platform, {
            patientUserId: actor.id,
            clinicianId: requireString(body.clinicianId, "clinicianId"),
            caseId: requireString(body.caseId, "caseId"),
            scheduledStartAt: requireString(body.scheduledStartAt, "scheduledStartAt"),
            scheduledEndAt: requireString(body.scheduledEndAt, "scheduledEndAt"),
            createdAt: optionalString(body.createdAt),
            payment: readPaymentInput(body),
          });
      response.end(JSON.stringify(result));
      return;
    }

    const patientConsultationsMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/consultations$/);
    if (request.method === "GET" && patientConsultationsMatch) {
      const patientUserId = decodeURIComponent(patientConsultationsMatch[1]);
      const actor = resolveRequestActor(request, url);
      if (actor.role !== "user" || actor.id !== patientUserId) {
        throw new Error("Patient access denied");
      }
      response.end(JSON.stringify(getPatientConsultations(platform, patientUserId)));
      return;
    }

    const consultationMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)$/);
    if (request.method === "GET" && consultationMatch) {
      const actor = resolveRequestActor(request, url);
      const result = getConsultationSnapshot(platform, decodeURIComponent(consultationMatch[1]), actor);
      response.end(JSON.stringify(result));
      return;
    }

    const consultationJoinMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/join$/);
    if (request.method === "POST" && consultationJoinMatch) {
      const actor = resolveRequestActor(request, url);
      const body = await readJson(request);
      const result = joinConsultationSession(
        platform,
        decodeURIComponent(consultationJoinMatch[1]),
        actor,
        optionalString(body.joinedAt) ?? new Date().toISOString(),
      );
      response.end(JSON.stringify(result));
      return;
    }

    const consultationMessagesMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/messages$/);
    if (request.method === "GET" && consultationMessagesMatch) {
      const actor = resolveRequestActor(request, url);
      const snapshot = getConsultationSnapshot(platform, decodeURIComponent(consultationMessagesMatch[1]), actor);
      response.end(JSON.stringify(snapshot.messages));
      return;
    }

    if (request.method === "POST" && consultationMessagesMatch) {
      const actor = resolveRequestActor(request, url);
      const body = await readJson(request);
      const result = sendConsultationMessage(platform, decodeURIComponent(consultationMessagesMatch[1]), actor, {
        content: requireString(body.content, "content"),
        createdAt: optionalString(body.createdAt),
      });
      response.end(JSON.stringify(result));
      return;
    }

    const consultationPlansMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/plans$/);
    if (request.method === "POST" && consultationPlansMatch) {
      const actor = resolveRequestActor(request, url);
      const body = await readJson(request);
      const result = createClinicianPlanForConsultation(
        platform,
        decodeURIComponent(consultationPlansMatch[1]),
        actor,
        {
          title: requireString(body.title, "title"),
          dayLabel: requireString(body.dayLabel, "dayLabel"),
          actionIds: requireStringArray(body.actionIds, "actionIds"),
          precautions: optionalStringArray(body.precautions),
          progressionCriteria: optionalStringArray(body.progressionCriteria),
          createdAt: optionalString(body.createdAt),
        },
      );
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/action-library") {
      resolveRequestActor(request, url);
      response.end(JSON.stringify(listActionLibrary(platform)));
      return;
    }

    const acceptPlanMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/accept$/);
    if (request.method === "POST" && acceptPlanMatch) {
      const actor = resolveRequestActor(request, url);
      const body = await readJson(request);
      const result = acceptConsultationPlan(
        platform,
        decodeURIComponent(acceptPlanMatch[1]),
        actor,
        optionalString(body.acceptedAt) ?? new Date().toISOString(),
      );
      response.end(JSON.stringify(result));
      return;
    }

    const declinePlanMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/decline$/);
    if (request.method === "POST" && declinePlanMatch) {
      const actor = resolveRequestActor(request, url);
      const result = declineConsultationPlan(platform, decodeURIComponent(declinePlanMatch[1]), actor);
      response.end(JSON.stringify(result));
      return;
    }

    const consultationEventsMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/events$/);
    if (request.method === "GET" && consultationEventsMatch) {
      const actor = resolveRequestActor(request, url, { allowQueryToken: true });
      const sessionId = decodeURIComponent(consultationEventsMatch[1]);
      response.removeHeader("Content-Type");
      response.writeHead(200, {
        "Access-Control-Allow-Origin": corsOrigin,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        Vary: "Origin",
      });
      writeSse(response, "snapshot", getConsultationSnapshot(platform, sessionId, actor));
      const interval = setInterval(() => {
        try {
          writeSse(response, "snapshot", getConsultationSnapshot(platform, sessionId, actor));
        } catch (error) {
          writeSse(response, "error", {
            message: error instanceof Error ? error.message : "Unknown consultation stream error",
          });
          clearInterval(interval);
          response.end();
        }
      }, 3000);
      request.on("close", () => clearInterval(interval));
      return;
    }

    const memoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory$/);
    if (request.method === "GET" && memoryMatch) {
      const result = getUserMemory(platform, decodeURIComponent(memoryMatch[1]));
      response.end(JSON.stringify(result));
      return;
    }

    const caseMemoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory\/cases$/);
    if (request.method === "POST" && caseMemoryMatch) {
      const body = await readJson(request);
      const result = rememberCase(
        platform,
        decodeURIComponent(caseMemoryMatch[1]),
        body as unknown as MemoryCaseSummary,
      );
      response.end(JSON.stringify(result));
      return;
    }

    const deleteCaseMemoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory\/cases\/([^/]+)$/);
    if (request.method === "DELETE" && deleteCaseMemoryMatch) {
      const result = deleteRememberedCase(
        platform,
        decodeURIComponent(deleteCaseMemoryMatch[1]),
        decodeURIComponent(deleteCaseMemoryMatch[2]),
      );
      response.end(JSON.stringify(result));
      return;
    }

    const trainingPlanMemoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory\/training-plans$/);
    if (request.method === "POST" && trainingPlanMemoryMatch) {
      const body = await readJson(request);
      const result = rememberTrainingPlan(
        platform,
        decodeURIComponent(trainingPlanMemoryMatch[1]),
        body as unknown as MemoryTrainingPlanInput,
      );
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/assessments") {
      const body = await readJson(request);
      const result = await runAssessmentWorkflow(platform, body as unknown as AssessmentWorkflowInput);
      response.end(JSON.stringify(result));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/chat") {
      const body = await readJson(request);
      const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
      const category = typeof body.category === "string" ? (body.category as RehabConsultCategory) : undefined;
      const result = await chatWithQwen(messages, { category });
      response.end(JSON.stringify(result));
      return;
    }
  } catch (error) {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.statusCode = 502;
    response.end(
      JSON.stringify({
        error: "upstream_chat_failed",
        message: error instanceof Error ? error.message : "Unknown API error",
      }),
    );
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not_found" }));
});

const port = Number(process.env.PORT ?? 3001);
server.listen(port, "127.0.0.1", () => {
  console.log(`Mentis API listening on http://127.0.0.1:${port}`);
});

function readJson(request: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function resolveRequestActor(
  request: IncomingMessage,
  url: URL,
  options: { allowQueryToken?: boolean } = {},
): AuthenticatedActor {
  const token = readAuthToken(request, url, options);
  if (!token) {
    throw new Error("Authentication required");
  }
  return resolveAuthenticatedActor(platform, token);
}

function readAuthToken(
  request: IncomingMessage,
  url: URL,
  options: { allowQueryToken?: boolean },
): string | undefined {
  const authorizationHeader = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  if (authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice("Bearer ".length).trim();
  }
  if (authorizationHeader?.trim()) {
    return authorizationHeader.trim();
  }
  if (options.allowQueryToken) {
    return url.searchParams.get("token")?.trim() || undefined;
  }
  return undefined;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function requireCredentialStatus(value: unknown): "pending" | "verified" | "rejected" | "suspended" {
  if (value === "pending" || value === "verified" || value === "rejected" || value === "suspended") {
    return value;
  }
  throw new Error("credentialStatus is invalid");
}

function readPaymentInput(body: Record<string, unknown>): ConsultationPaymentInput {
  const paymentMode: ConsultationPaymentInput["paymentMode"] =
    body.paymentMode === "paid" || body.paymentMode === "free_test" ? body.paymentMode : undefined;
  const paymentStatus: ConsultationPaymentInput["paymentStatus"] =
    body.paymentStatus === "unpaid" ||
    body.paymentStatus === "paid" ||
    body.paymentStatus === "waived" ||
    body.paymentStatus === "refunded"
      ? body.paymentStatus
      : undefined;
  const paymentAmountCents = typeof body.paymentAmountCents === "number" ? body.paymentAmountCents : undefined;
  const paymentOrderId = optionalString(body.paymentOrderId);
  return {
    paymentMode,
    paymentStatus,
    paymentAmountCents,
    paymentOrderId,
  };
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  const result = optionalStringArray(value);
  if (result.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return result;
}

function optionalStringArray(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of strings");
  }
  return value.map((entry) => requireString(entry, "array item"));
}

function writeSse(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}
