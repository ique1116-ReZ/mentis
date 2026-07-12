import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  acceptConsultationPlan,
  appendCaseMessages,
  authenticateDemoUser,
  badRequest,
  bookConsultationFromAvailability,
  chatWithQwen,
  createClinicianPlanForConsultation,
  createClinicianAvailabilitySlot,
  createConsultationSession,
  createPlatformDemo,
  deleteRememberedCase,
  declineConsultationPlan,
  forbidden,
  getClinicianConsultations,
  getConsultationSnapshot,
  getPatientConsultations,
  getUserMemory,
  HttpError,
  joinConsultationSession,
  listAdminClinicianReviews,
  listActionLibrary,
  listCaseMessages,
  listClinicianAvailability,
  listClinicians,
  registerDemoUser,
  rememberCase,
  rememberTrainingPlan,
  reviewClinicianCredential,
  resolveRecommendedActions,
  resolveAuthenticatedActor,
  resolveCorsOrigin,
  runAssessmentWorkflow,
  sendConsultationMessage,
  unauthorized,
  UpstreamChatError,
  type AssessmentWorkflowInput,
  type AuthenticatedActor,
  type ChatMessage,
  type ConsultationPaymentInput,
  type ConsultationSnapshot,
  type LoginInput,
  type MemoryCaseSummary,
  type MemoryTrainingPlanInput,
  type RegistrationInput,
  type RehabConsultCategory,
  type StoredCaseMessage,
} from "./index.js";
import { flushPersist, hydrateFromDisk, schedulePersist } from "./storage.js";

const platform = createPlatformDemo();
hydrateFromDisk(platform);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";
  const corsOrigin = resolveCorsOrigin(request.headers.origin);
  response.setHeader("Access-Control-Allow-Origin", corsOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Vary", "Origin");

  if (method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (method === "GET" && url.pathname === "/health") {
    response.end(JSON.stringify({ ok: true, service: "mentis-api" }));
    return;
  }

  try {
    // Public routes: everything else requires a valid bearer/demo session token.
    if (method === "POST" && url.pathname === "/v1/auth/login") {
      const body = await readJson(request);
      const result = authenticateDemoUser(platform, body as unknown as LoginInput);
      finish(response, method, result);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/auth/register") {
      const body = await readJson(request);
      const result = registerDemoUser(platform, body as unknown as RegistrationInput);
      finish(response, method, result);
      return;
    }

    const actor: AuthenticatedActor = resolveRequestActor(request, url, {
      allowQueryToken: url.pathname.endsWith("/events"),
    });

    if (method === "GET" && url.pathname === "/v1/clinicians") {
      finish(response, method, listClinicians(platform));
      return;
    }

    if (method === "GET" && url.pathname === "/v1/admin/clinicians") {
      finish(response, method, listAdminClinicianReviews(platform, actor));
      return;
    }

    const adminClinicianReviewMatch = url.pathname.match(/^\/v1\/admin\/clinicians\/([^/]+)\/review$/);
    if (method === "POST" && adminClinicianReviewMatch) {
      const body = await readJson(request);
      const result = reviewClinicianCredential(platform, decodeURIComponent(adminClinicianReviewMatch[1]), actor, {
        credentialStatus: requireCredentialStatus(body.credentialStatus),
        publicDirectoryVisible: optionalBoolean(body.publicDirectoryVisible),
        reviewedAt: optionalString(body.reviewedAt),
        reviewNote: optionalString(body.reviewNote),
      });
      finish(response, method, result);
      return;
    }

    const clinicianConsultationsMatch = url.pathname.match(/^\/v1\/clinicians\/([^/]+)\/consultations$/);
    if (method === "GET" && clinicianConsultationsMatch) {
      const clinicianId = decodeURIComponent(clinicianConsultationsMatch[1]);
      if (actor.role !== "clinician" || actor.id !== clinicianId) {
        throw forbidden("Clinician access denied");
      }
      finish(response, method, getClinicianConsultations(platform, clinicianId));
      return;
    }

    const clinicianAvailabilityMatch = url.pathname.match(/^\/v1\/clinicians\/([^/]+)\/availability$/);
    if (method === "GET" && clinicianAvailabilityMatch) {
      const clinicianId = decodeURIComponent(clinicianAvailabilityMatch[1]);
      const includeBooked = actor.role === "clinician" && actor.id === clinicianId;
      finish(
        response,
        method,
        listClinicianAvailability(platform, clinicianId, {
          includeBooked,
          publicOnly: actor.role === "user",
        }),
      );
      return;
    }

    if (method === "POST" && clinicianAvailabilityMatch) {
      const clinicianId = decodeURIComponent(clinicianAvailabilityMatch[1]);
      const body = await readJson(request);
      const result = createClinicianAvailabilitySlot(platform, clinicianId, actor, {
        startsAt: requireString(body.startsAt, "startsAt"),
        endsAt: requireString(body.endsAt, "endsAt"),
        createdAt: optionalString(body.createdAt),
      });
      finish(response, method, result);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/consultations") {
      if (actor.role !== "user") {
        throw forbidden("Only patients can create consultations");
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
      finish(response, method, result);
      return;
    }

    const patientConsultationsMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/consultations$/);
    if (method === "GET" && patientConsultationsMatch) {
      const patientUserId = decodeURIComponent(patientConsultationsMatch[1]);
      if (actor.role !== "user" || actor.id !== patientUserId) {
        throw forbidden("Patient access denied");
      }
      finish(response, method, getPatientConsultations(platform, patientUserId));
      return;
    }

    const consultationMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)$/);
    if (method === "GET" && consultationMatch) {
      const result = getConsultationSnapshot(platform, decodeURIComponent(consultationMatch[1]), actor);
      finish(response, method, result);
      return;
    }

    const consultationJoinMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/join$/);
    if (method === "POST" && consultationJoinMatch) {
      const body = await readJson(request);
      const result = joinConsultationSession(
        platform,
        decodeURIComponent(consultationJoinMatch[1]),
        actor,
        optionalString(body.joinedAt) ?? new Date().toISOString(),
      );
      finish(response, method, result);
      return;
    }

    const consultationMessagesMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/messages$/);
    if (method === "GET" && consultationMessagesMatch) {
      const snapshot = getConsultationSnapshot(platform, decodeURIComponent(consultationMessagesMatch[1]), actor);
      finish(response, method, snapshot.messages);
      return;
    }

    if (method === "POST" && consultationMessagesMatch) {
      const body = await readJson(request);
      const result = sendConsultationMessage(platform, decodeURIComponent(consultationMessagesMatch[1]), actor, {
        content: requireString(body.content, "content"),
        createdAt: optionalString(body.createdAt),
      });
      finish(response, method, result);
      return;
    }

    const consultationPlansMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/plans$/);
    if (method === "POST" && consultationPlansMatch) {
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
      finish(response, method, result);
      return;
    }

    if (method === "GET" && url.pathname === "/v1/action-library") {
      finish(response, method, listActionLibrary(platform));
      return;
    }

    const acceptPlanMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/accept$/);
    if (method === "POST" && acceptPlanMatch) {
      const body = await readJson(request);
      const result = acceptConsultationPlan(
        platform,
        decodeURIComponent(acceptPlanMatch[1]),
        actor,
        optionalString(body.acceptedAt) ?? new Date().toISOString(),
      );
      finish(response, method, result);
      return;
    }

    const declinePlanMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/decline$/);
    if (method === "POST" && declinePlanMatch) {
      const result = declineConsultationPlan(platform, decodeURIComponent(declinePlanMatch[1]), actor);
      finish(response, method, result);
      return;
    }

    const consultationEventsMatch = url.pathname.match(/^\/v1\/consultations\/([^/]+)\/events$/);
    if (method === "GET" && consultationEventsMatch) {
      const sessionId = decodeURIComponent(consultationEventsMatch[1]);
      response.removeHeader("Content-Type");
      response.writeHead(200, {
        "Access-Control-Allow-Origin": corsOrigin,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        Vary: "Origin",
      });

      let lastPayload = "";
      const pushSnapshot = () => {
        const snapshot = getConsultationSnapshot(platform, sessionId, actor);
        const liveSnapshot = omitActionLibrary(snapshot);
        const serialized = JSON.stringify(liveSnapshot);
        if (serialized === lastPayload) {
          return;
        }
        lastPayload = serialized;
        writeSse(response, "snapshot", liveSnapshot);
      };

      try {
        pushSnapshot();
      } catch (error) {
        writeSse(response, "error", {
          message: error instanceof Error ? error.message : "Unknown consultation stream error",
        });
        response.end();
        return;
      }

      const interval = setInterval(() => {
        try {
          pushSnapshot();
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
    if (method === "GET" && memoryMatch) {
      const userId = decodeURIComponent(memoryMatch[1]);
      requireMemoryAccess(actor, userId);
      finish(response, method, getUserMemory(platform, userId));
      return;
    }

    const caseMemoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory\/cases$/);
    if (method === "POST" && caseMemoryMatch) {
      const userId = decodeURIComponent(caseMemoryMatch[1]);
      requireMemoryAccess(actor, userId);
      const body = await readJson(request);
      const result = rememberCase(platform, userId, body as unknown as MemoryCaseSummary);
      finish(response, method, result);
      return;
    }

    const deleteCaseMemoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory\/cases\/([^/]+)$/);
    if (method === "DELETE" && deleteCaseMemoryMatch) {
      const userId = decodeURIComponent(deleteCaseMemoryMatch[1]);
      requireMemoryAccess(actor, userId);
      const result = deleteRememberedCase(platform, userId, decodeURIComponent(deleteCaseMemoryMatch[2]));
      finish(response, method, result);
      return;
    }

    const caseMessagesMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/cases\/([^/]+)\/messages$/);
    if (caseMessagesMatch) {
      const userId = decodeURIComponent(caseMessagesMatch[1]);
      const caseId = decodeURIComponent(caseMessagesMatch[2]);
      requireMemoryAccess(actor, userId);

      if (method === "GET") {
        finish(response, method, listCaseMessages(platform, caseId));
        return;
      }

      if (method === "POST") {
        const body = await readJson(request);
        if (!Array.isArray(body.messages)) {
          throw badRequest("messages must be an array");
        }
        const incoming = (body.messages as StoredCaseMessage[]).map((entry) => ({
          ...entry,
          createdAt: entry.createdAt || new Date().toISOString(),
        }));
        finish(response, method, appendCaseMessages(platform, caseId, incoming));
        return;
      }
    }

    const trainingPlanMemoryMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/memory\/training-plans$/);
    if (method === "POST" && trainingPlanMemoryMatch) {
      const userId = decodeURIComponent(trainingPlanMemoryMatch[1]);
      requireMemoryAccess(actor, userId);
      const body = await readJson(request);
      const result = rememberTrainingPlan(platform, userId, body as unknown as MemoryTrainingPlanInput);
      finish(response, method, result);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/assessments") {
      if (actor.role !== "user") {
        throw forbidden("Only patients can submit assessments");
      }
      const body = await readJson(request);
      const result = await runAssessmentWorkflow(platform, {
        ...(body as unknown as AssessmentWorkflowInput),
        userId: actor.id,
      });
      finish(response, method, result);
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat") {
      if (actor.role !== "user") {
        throw forbidden("Only patients can use the rehab chat");
      }
      const body = await readJson(request);
      const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
      const category = typeof body.category === "string" ? (body.category as RehabConsultCategory) : undefined;
      const userMemory = getUserMemory(platform, actor.id);
      const result = await chatWithQwen(messages, { category, actionLibrary: platform.actionLibrary, userMemory });
      const recommendedActions =
        result.recommendedActions && result.recommendedActions.length > 0
          ? resolveRecommendedActions(platform, result.recommendedActions, category)
          : undefined;
      if (recommendedActions) {
        result.recommendedActions = recommendedActions;
      }
      finish(response, method, result);
      return;
    }
  } catch (error) {
    if (response.headersSent) {
      response.end();
      return;
    }
    const status = statusForError(error);
    response.statusCode = status;
    response.end(
      JSON.stringify({
        error: errorCodeForStatus(status),
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

function shutdown(): void {
  flushPersist();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function finish(response: ServerResponse, method: string, payload: unknown): void {
  response.end(JSON.stringify(payload));
  if (method !== "GET") {
    schedulePersist(platform);
  }
}

function omitActionLibrary(snapshot: ConsultationSnapshot): Omit<ConsultationSnapshot, "actionLibrary"> {
  const { actionLibrary: _actionLibrary, ...liveSnapshot } = snapshot;
  return liveSnapshot;
}

function statusForError(error: unknown): number {
  if (error instanceof HttpError) {
    return error.status;
  }
  if (error instanceof UpstreamChatError) {
    return 502;
  }
  return 400;
}

function errorCodeForStatus(status: number): string {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 502:
      return "upstream_chat_failed";
    default:
      return "bad_request";
  }
}

const MAX_BODY_BYTES = 512 * 1024;

function readJson(request: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) {
        return;
      }
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        rejected = true;
        reject(badRequest("Request body too large"));
        return;
      }
      raw += chunk;
    });
    request.on("end", () => {
      if (rejected) {
        return;
      }
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(badRequest("Invalid JSON body"));
      }
    });
    request.on("error", (error) => {
      if (!rejected) {
        reject(error);
      }
    });
  });
}

function resolveRequestActor(
  request: IncomingMessage,
  url: URL,
  options: { allowQueryToken?: boolean } = {},
): AuthenticatedActor {
  const token = readAuthToken(request, url, options);
  if (!token) {
    throw unauthorized("Authentication required");
  }
  return resolveAuthenticatedActor(platform, token);
}

function requireMemoryAccess(actor: AuthenticatedActor, userId: string): void {
  if (actor.role === "admin") {
    return;
  }
  if (actor.role === "user" && actor.id === userId) {
    return;
  }
  throw forbidden("Memory access denied");
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
    throw badRequest(`${fieldName} is required`);
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
  throw badRequest("credentialStatus is invalid");
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
    throw badRequest(`${fieldName} is required`);
  }
  return result;
}

function optionalStringArray(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw badRequest("Expected an array of strings");
  }
  return value.map((entry) => requireString(entry, "array item"));
}

function writeSse(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}
