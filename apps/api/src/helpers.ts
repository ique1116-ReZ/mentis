import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { DemoClinician } from "./types.js";

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function unauthorized(message: string): HttpError {
  return new HttpError(message, 401);
}

export function forbidden(message: string): HttpError {
  return new HttpError(message, 403);
}

export function notFound(message: string): HttpError {
  return new HttpError(message, 404);
}

export function badRequest(message: string): HttpError {
  return new HttpError(message, 400);
}

export function conflict(message: string): HttpError {
  return new HttpError(message, 409);
}

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateEntityId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function trimRegistrationField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function truncateForMemory(content: string, maxLength: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

export function requireCanonicalIso(value: string, label: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw badRequest(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

export function rangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return (
    new Date(leftStart).getTime() < new Date(rightEnd).getTime() &&
    new Date(rightStart).getTime() < new Date(leftEnd).getTime()
  );
}

export function addDaysIso(value: string, days: number): string {
  const date = new Date(value);
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isPublicDirectoryClinician(clinician: DemoClinician): boolean {
  return clinician.credentialStatus === "verified" && clinician.publicDirectoryVisible !== false;
}

export function sanitizeActionText(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 120);
}
