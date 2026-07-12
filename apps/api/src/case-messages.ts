import type { PlatformDemo, StoredCaseMessage } from "./types.js";

export const MAX_CASE_MESSAGES = 200;

export function listCaseMessages(platform: PlatformDemo, caseId: string): StoredCaseMessage[] {
  return platform.caseMessages[caseId] ?? [];
}

export function appendCaseMessages(
  platform: PlatformDemo,
  caseId: string,
  messages: StoredCaseMessage[],
): StoredCaseMessage[] {
  const existing = platform.caseMessages[caseId] ?? [];
  const next = [...existing, ...messages];
  platform.caseMessages[caseId] = next.slice(-MAX_CASE_MESSAGES);
  return platform.caseMessages[caseId];
}
