import type { PlatformDemo, StoredCaseMessage } from "./types.js";

export const MAX_CASE_MESSAGES = 200;

export function listCaseMessages(platform: PlatformDemo, userId: string, caseId: string): StoredCaseMessage[] {
  return platform.caseMessages[userId]?.[caseId] ?? [];
}

export function appendCaseMessages(
  platform: PlatformDemo,
  userId: string,
  caseId: string,
  messages: StoredCaseMessage[],
): StoredCaseMessage[] {
  const userCases = platform.caseMessages[userId] ?? {};
  const existing = userCases[caseId] ?? [];
  const next = [...existing, ...messages];
  userCases[caseId] = next.slice(-MAX_CASE_MESSAGES);
  platform.caseMessages[userId] = userCases;
  return userCases[caseId];
}
