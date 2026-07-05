import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PlatformDemo } from "./index.js";

const DEFAULT_DATA_PATH = "data/platform-state.json";

const PERSISTABLE_KEYS = [
  "users",
  "clinicians",
  "admins",
  "demoCredentials",
  "userMemories",
  "consultations",
  "caseAuthorizations",
  "consultationMessages",
  "trainingPlans",
  "actionLibrary",
  "clinicianAvailabilitySlots",
  "clinicianPresence",
  "demoSessions",
  "auditEvents",
] as const;

type PersistableKey = (typeof PERSISTABLE_KEYS)[number];
type PersistedState = Partial<Pick<PlatformDemo, PersistableKey>>;

function dataFilePath(): string {
  return resolve(process.env.MENTIS_DATA_FILE?.trim() || DEFAULT_DATA_PATH);
}

function loadPersistedState(): PersistedState | null {
  const path = dataFilePath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as PersistedState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error(`[mentis-api] failed to read persisted state from ${path}:`, error);
    return null;
  }
}

function mergeSeedWins<T>(seed: T[], persisted: T[] | undefined, keyOf: (item: T) => string): T[] {
  if (!persisted || persisted.length === 0) {
    return seed;
  }
  const seedKeys = new Set(seed.map(keyOf));
  return [...seed, ...persisted.filter((item) => !seedKeys.has(keyOf(item)))];
}

function mergePersistedWins<T>(seed: T[], persisted: T[] | undefined, keyOf: (item: T) => string): T[] {
  if (!persisted || persisted.length === 0) {
    return seed;
  }
  const persistedKeys = new Set(persisted.map(keyOf));
  return [...persisted, ...seed.filter((item) => !persistedKeys.has(keyOf(item)))];
}

/**
 * Mutates a freshly seeded platform in place, layering persisted disk state on top.
 * Entity collections (users/clinicians/etc.) prefer the persisted copy since it reflects
 * real runtime edits; credentials and the action library prefer the seed copy so env config
 * and code updates keep taking effect, with persisted entries merged in additively.
 */
export function hydrateFromDisk(platform: PlatformDemo): void {
  const persisted = loadPersistedState();
  if (!persisted) {
    return;
  }

  platform.users = mergePersistedWins(platform.users, persisted.users, (item) => item.id);
  platform.clinicians = mergePersistedWins(platform.clinicians, persisted.clinicians, (item) => item.id);
  platform.admins = mergePersistedWins(platform.admins, persisted.admins, (item) => item.id);
  platform.demoCredentials = mergeSeedWins(platform.demoCredentials, persisted.demoCredentials, (item) => item.username);
  platform.actionLibrary = mergeSeedWins(platform.actionLibrary, persisted.actionLibrary, (item) => item.id);
  platform.clinicianAvailabilitySlots = mergePersistedWins(
    platform.clinicianAvailabilitySlots,
    persisted.clinicianAvailabilitySlots,
    (item) => item.id,
  );

  platform.userMemories = { ...platform.userMemories, ...(persisted.userMemories ?? {}) };
  platform.clinicianPresence = { ...platform.clinicianPresence, ...(persisted.clinicianPresence ?? {}) };
  platform.demoSessions = { ...platform.demoSessions, ...(persisted.demoSessions ?? {}) };

  platform.consultations = persisted.consultations ?? platform.consultations;
  platform.caseAuthorizations = persisted.caseAuthorizations ?? platform.caseAuthorizations;
  platform.consultationMessages = persisted.consultationMessages ?? platform.consultationMessages;
  platform.trainingPlans = persisted.trainingPlans ?? platform.trainingPlans;
  platform.auditEvents = persisted.auditEvents ?? platform.auditEvents;
}

function writeStateNow(platform: PlatformDemo): void {
  const path = dataFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const snapshot: PersistedState = {};
  for (const key of PERSISTABLE_KEYS) {
    (snapshot as Record<string, unknown>)[key] = platform[key];
  }
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(snapshot), "utf-8");
  renameSync(tmpPath, path);
}

let pendingPlatform: PlatformDemo | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 500;

export function schedulePersist(platform: PlatformDemo): void {
  pendingPlatform = platform;
  if (debounceTimer) {
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushPersist();
  }, DEBOUNCE_MS);
  debounceTimer.unref?.();
}

export function flushPersist(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!pendingPlatform) {
    return;
  }
  const platform = pendingPlatform;
  pendingPlatform = null;
  try {
    writeStateNow(platform);
  } catch (error) {
    console.error("[mentis-api] failed to persist platform state:", error);
  }
}
