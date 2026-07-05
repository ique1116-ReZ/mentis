import { randomUUID } from "node:crypto";
import { badRequest, forbidden, hashPassword, trimRegistrationField, unauthorized, verifyPassword } from "./helpers.js";
import { emptyUserMemory, getUserMemory } from "./memory.js";
import type {
  AuthenticatedActor,
  AuthenticatedSession,
  DemoClinician,
  LoginInput,
  PlatformDemo,
  ProfiledUser,
  RegistrationInput,
  UserMemory,
} from "./types.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function authenticateDemoUser(platform: PlatformDemo, input: LoginInput): AuthenticatedSession {
  const credential = platform.demoCredentials.find((candidate) => candidate.username === input.username);
  if (!credential || !verifyPassword(input.password, credential.password)) {
    throw unauthorized("Invalid username or password");
  }

  if (credential.actorRole === "clinician") {
    const clinician = platform.clinicians.find((candidate) => candidate.id === credential.actorId);
    if (!clinician) {
      throw unauthorized(`Unknown clinician: ${credential.actorId}`);
    }

    return createAuthenticatedSession(platform, clinician, emptyUserMemory(clinician.id));
  }

  if (credential.actorRole === "admin") {
    const admin = platform.admins.find((candidate) => candidate.id === credential.actorId);
    if (!admin) {
      throw unauthorized(`Unknown admin: ${credential.actorId}`);
    }

    return createAuthenticatedSession(platform, admin, emptyUserMemory(admin.id));
  }

  const user = platform.users.find((candidate) => candidate.id === credential.actorId) as ProfiledUser | undefined;
  if (!user) {
    throw unauthorized(`Unknown user: ${credential.actorId}`);
  }

  return createAuthenticatedSession(platform, user, getUserMemory(platform, user.id));
}

export function resolveAuthenticatedActor(platform: PlatformDemo, token: string): AuthenticatedActor {
  const session = platform.demoSessions[token];
  if (!session) {
    throw unauthorized("Invalid or expired demo session");
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    delete platform.demoSessions[token];
    throw unauthorized("Demo session has expired");
  }
  return resolveActorById(platform, session.actorId, session.actorRole);
}

export function registerDemoUser(platform: PlatformDemo, input: RegistrationInput): AuthenticatedSession {
  const username = trimRegistrationField(input.username);
  if (!username) {
    throw badRequest("Username is required");
  }
  if (trimRegistrationField(input.inviteCode) !== "ique1116") {
    throw badRequest("Invalid invite code");
  }
  if (!trimRegistrationField(input.password)) {
    throw badRequest("Password is required");
  }

  if ((input.accountRole ?? "user") === "clinician") {
    const clinicianId = `clinician_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const clinician: DemoClinician = {
      id: clinicianId,
      role: "clinician",
      displayName: trimRegistrationField(input.displayName) || "待审核康复师",
      credentialStatus: "pending",
      specialties: normalizeSpecialties(input.specialties, input.discipline),
      discipline: trimRegistrationField(input.discipline) || undefined,
      credentialSummary: trimRegistrationField(input.credentialSummary) || undefined,
      organizationName: trimRegistrationField(input.organizationName) || undefined,
      publicDirectoryVisible: false,
      registeredAt: new Date().toISOString(),
    };

    platform.clinicians = [
      clinician,
      ...platform.clinicians.filter((candidate) => candidate.id !== clinician.id),
    ];
    platform.demoCredentials = [
      { username, password: hashPassword(trimRegistrationField(input.password)), actorId: clinician.id, actorRole: "clinician" },
      ...platform.demoCredentials.filter((candidate) => candidate.username !== username),
    ];

    return createAuthenticatedSession(platform, clinician, emptyUserMemory(clinician.id));
  }

  const userId = `user_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const user: ProfiledUser = {
    id: userId,
    role: "user",
    displayName: trimRegistrationField(input.displayName) || "ique1116",
    profile: {
      heightCm: trimRegistrationField(input.heightCm),
      weightKg: trimRegistrationField(input.weightKg),
    },
  };

  platform.users = [user, ...platform.users.filter((candidate) => candidate.id !== user.id)];
  platform.demoCredentials = [
    { username, password: hashPassword(trimRegistrationField(input.password)), actorId: user.id, actorRole: "user" },
    ...platform.demoCredentials.filter((candidate) => candidate.username !== username),
  ];
  platform.userMemories[user.id] = emptyUserMemory(user.id);

  return createAuthenticatedSession(platform, user, getUserMemory(platform, user.id));
}

function createAuthenticatedSession(
  platform: PlatformDemo,
  actor: AuthenticatedActor,
  memory: UserMemory,
): AuthenticatedSession {
  const token = randomUUID();
  platform.demoSessions[token] = {
    actorId: actor.id,
    actorRole: actor.role,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  return {
    token,
    user: actor,
    memory,
  };
}

function resolveActorById(
  platform: PlatformDemo,
  actorId: string,
  actorRole: "user" | "clinician" | "admin",
): AuthenticatedActor {
  if (actorRole === "clinician") {
    const clinician = platform.clinicians.find((candidate) => candidate.id === actorId);
    if (!clinician) {
      throw unauthorized(`Unknown clinician: ${actorId}`);
    }
    return clinician;
  }

  if (actorRole === "admin") {
    const admin = platform.admins.find((candidate) => candidate.id === actorId);
    if (!admin) {
      throw unauthorized(`Unknown admin: ${actorId}`);
    }
    return admin;
  }

  const user = platform.users.find((candidate) => candidate.id === actorId) as ProfiledUser | undefined;
  if (!user) {
    throw unauthorized(`Unknown user: ${actorId}`);
  }
  return user;
}

function normalizeSpecialties(specialties: string[] | undefined, discipline: string | undefined): string[] {
  const normalized = (specialties ?? [])
    .map((specialty) => specialty.trim())
    .filter(Boolean);
  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }
  const fallback = discipline?.trim();
  return fallback ? [fallback] : [];
}

export function resolveFreshConsultationActor(platform: PlatformDemo, actor: unknown): AuthenticatedActor {
  if (!actor || typeof actor !== "object") {
    throw forbidden("Invalid consultation actor");
  }
  const candidate = actor as { id?: unknown; role?: unknown };
  if (typeof candidate.id !== "string") {
    throw forbidden("Invalid consultation actor");
  }
  if (candidate.role !== "user" && candidate.role !== "clinician") {
    throw forbidden("Invalid consultation actor");
  }
  return resolveActorById(platform, candidate.id, candidate.role);
}

export function requireVerifiedClinicianForConsultation(actor: AuthenticatedActor): void {
  if (actor.role === "clinician" && actor.credentialStatus !== "verified") {
    throw forbidden("Clinician credential is not verified");
  }
}
