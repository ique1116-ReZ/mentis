export type AuthRole = "user" | "clinician" | "organization" | "admin";

export type AuthUser = {
  id: string;
  role: AuthRole;
  displayName: string;
  profile?: {
    heightCm: string;
    weightKg: string;
  };
  credentialStatus?: "pending" | "verified" | "rejected" | "suspended";
  publicDirectoryVisible?: boolean;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
  memory: {
    userId: string;
    profileSummary: string;
    clinicalSummary: string;
    activePlanSummary: string;
    recentEvents: unknown[];
    cases: unknown[];
    trainingPlans: unknown[];
    notes: string[];
    updatedAt: string;
  };
};

type Fetcher = typeof fetch;

const SESSION_STORAGE_KEY = "mentis_user_session";

export function loadStoredSession<TSession extends AuthSession = AuthSession>(): TSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TSession) : null;
  } catch {
    return null;
  }
}

export function storeSession<TSession extends AuthSession = AuthSession>(session: TSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (session) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export async function validateStoredSession<TSession extends AuthSession = AuthSession>(
  session: TSession,
  options: { apiBase: string; fetcher?: Fetcher },
): Promise<TSession | null> {
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(`${options.apiBase}/v1/action-library`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    return response.ok ? session : null;
  } catch {
    return null;
  }
}
