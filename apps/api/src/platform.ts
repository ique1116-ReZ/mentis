import type { ActionLibraryItem, ClinicianAvailabilitySlot } from "@mentis/domain";
import { hashPassword } from "./helpers.js";
import { kneeRehabActionLibrary } from "./action-library.seed.js";
import type {
  DemoCredential,
  PlatformDemo,
  RehabConsultCategory,
  RehabConsultCategoryConfig,
} from "./types.js";

const DEFAULT_WEB_ORIGIN = "http://127.0.0.1:5173";

export const REHAB_CONSULT_CATEGORIES: Record<RehabConsultCategory, RehabConsultCategoryConfig> = {
  knee: {
    id: "knee",
    label: "膝盖",
    scope: "膝关节、髌股疼痛、跑步膝、髌腱/髌下区域不适、膝关节负荷管理与康复训练",
    examples: ["跑步后膝前痛", "上下楼疼", "深蹲时膝盖不舒服"],
  },
  ankle: {
    id: "ankle",
    label: "脚踝",
    scope: "踝关节扭伤、跑步后踝部疼痛、跟腱周围不适、踝稳定性与活动度训练",
    examples: ["崴脚后多久能跑", "跑步后外踝疼", "跟腱附近紧"],
  },
  shoulder: {
    id: "shoulder",
    label: "肩膀",
    scope: "肩关节疼痛、肩袖相关不适、过顶动作疼痛、肩胛控制与上肢训练调整",
    examples: ["卧推肩痛", "举手疼", "游泳后肩膀不舒服"],
  },
  lower_back: {
    id: "lower_back",
    label: "腰背",
    scope: "腰背疼痛、训练后腰部不适、髋腰控制、核心负荷管理与恢复建议",
    examples: ["硬拉后腰酸", "久坐腰痛", "跑步后下背紧"],
  },
  hip: {
    id: "hip",
    label: "髋部",
    scope: "髋部疼痛、臀肌/髋屈肌相关不适、跑步髋部负荷、髋活动度与力量训练",
    examples: ["跑步髋外侧疼", "臀部深处痛", "髋前侧夹挤感"],
  },
};

export function resolveCorsOrigin(
  requestOrigin?: string | null,
  configuredOrigin = process.env.WEB_ORIGINS ?? process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN,
): string {
  const allowedOrigins = configuredOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const fallbackOrigin = allowedOrigins[0] ?? DEFAULT_WEB_ORIGIN;

  if (!requestOrigin) {
    return fallbackOrigin;
  }
  if (allowedOrigins.includes("*")) {
    return "*";
  }
  if (allowedOrigins.includes(requestOrigin) || isLocalDevOrigin(requestOrigin)) {
    return requestOrigin;
  }
  return fallbackOrigin;
}

function isLocalDevOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function createPlatformDemo(): PlatformDemo {
  return {
    users: [{ id: "user_1", role: "user", displayName: "张运动" }],
    admins: [{ id: "admin_1", role: "admin", displayName: "平台管理员" }],
    clinicians: [
      {
        id: "clinician_1",
        role: "clinician",
        displayName: "李康复师",
        credentialStatus: "verified",
        specialties: ["knee", "running"],
        discipline: "运动康复师",
        credentialSummary: "跑步损伤与膝关节负荷管理",
        organizationName: "Mentis Rehab",
        publicDirectoryVisible: false,
      },
    ],
    demoCredentials: [
      ...getDemoCredentials(),
      resolveSeedCredential({
        envUsernameKey: "MENTIS_CLINICIAN_DEMO_USERNAME",
        envPasswordKey: "MENTIS_CLINICIAN_DEMO_PASSWORD",
        devUsername: "clinician_demo",
        devPassword: "mentis_clinician",
        actorId: "clinician_1",
        actorRole: "clinician",
      }),
      resolveSeedCredential({
        envUsernameKey: "MENTIS_ADMIN_DEMO_USERNAME",
        envPasswordKey: "MENTIS_ADMIN_DEMO_PASSWORD",
        devUsername: "admin_demo",
        devPassword: "mentis_admin",
        actorId: "admin_1",
        actorRole: "admin",
      }),
    ],
    userMemories: {
      user_1: {
        userId: "user_1",
        profileSummary: "中级跑者，每周训练 4-5 次，目标是安全恢复跑步。",
        clinicalSummary: "",
        activePlanSummary: "",
        recentEvents: [],
        cases: [],
        trainingPlans: [],
        notes: ["中级跑者，每周训练 4-5 次，目标是安全恢复跑步。"],
        updatedAt: new Date().toISOString(),
      },
    },
    consultations: [],
    caseAuthorizations: [],
    consultationMessages: [],
    trainingPlans: [],
    actionLibrary: buildSeedActionLibrary(),
    clinicianAvailabilitySlots: buildSeedAvailabilitySlots("clinician_1"),
    clinicianPresence: {
      clinician_1: {
        isOnline: true,
        lastSeenAt: new Date().toISOString(),
      },
    },
    presence: {},
    demoSessions: {},
    auditEvents: [],
    caseMessages: {},
  };
}

function buildSeedAvailabilitySlots(clinicianId: string): ClinicianAvailabilitySlot[] {
  const now = new Date();
  const slotStarts = [1, 3, 26].map((hoursAhead) => new Date(now.getTime() + hoursAhead * 60 * 60 * 1000));
  return slotStarts.map((startsAt, index) => ({
    id: `slot_seed_${index + 1}`,
    clinicianId,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000).toISOString(),
    status: "available",
    createdAt: now.toISOString(),
  }));
}

function buildSeedActionLibrary(): ActionLibraryItem[] {
  return kneeRehabActionLibrary;
}

function getDemoCredentials(): DemoCredential[] {
  const username = process.env.MENTIS_DEMO_USERNAME?.trim();
  const password = process.env.MENTIS_DEMO_PASSWORD?.trim();

  if (!username || !password) {
    return [];
  }

  return [{ username, password: hashPassword(password), actorId: "user_1", actorRole: "user" }];
}

function resolveSeedCredential(options: {
  envUsernameKey: string;
  envPasswordKey: string;
  devUsername: string;
  devPassword: string;
  actorId: string;
  actorRole: "clinician" | "admin";
}): DemoCredential {
  const envUsername = process.env[options.envUsernameKey]?.trim();
  const envPassword = process.env[options.envPasswordKey]?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && (!envUsername || !envPassword)) {
    throw new Error(
      `${options.envUsernameKey} and ${options.envPasswordKey} must be set in production; refusing to fall back to built-in demo credentials.`,
    );
  }

  return {
    username: envUsername || options.devUsername,
    password: hashPassword(envPassword || options.devPassword),
    actorId: options.actorId,
    actorRole: options.actorRole,
  };
}
