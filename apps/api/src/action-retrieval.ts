import { dotProduct, termCounts, tfidfVector, tokenizeText, vectorNorm } from "./text-scoring.js";
import type { ActionLibraryItem, ChatMessage, RehabConsultCategory } from "./types.js";

export function actionBodyRegionForCategory(category?: RehabConsultCategory): ActionLibraryItem["bodyRegion"] {
  switch (category) {
    case "knee":
      return "knee";
    case "ankle":
      return "ankle_foot";
    case "shoulder":
      return "shoulder";
    case "lower_back":
      return "spine";
    case "hip":
      return "hip";
    default:
      return "other";
  }
}

export function actionMatchesRegion(
  action: ActionLibraryItem,
  region: ActionLibraryItem["bodyRegion"],
): boolean {
  if (region === "other") {
    return true;
  }
  const regions = action.bodyRegions?.length ? action.bodyRegions : [action.bodyRegion];
  return regions.includes(region);
}

function searchableActionText(action: ActionLibraryItem): string {
  return [
    action.title,
    action.actionType ?? "",
    ...(action.targetMuscles ?? []),
    action.phase,
    ...action.tags,
  ].join(" ");
}

export function rankActionsForChat(
  actions: ActionLibraryItem[],
  messages: ChatMessage[],
  category?: RehabConsultCategory,
  topK = 15,
): ActionLibraryItem[] {
  const region = actionBodyRegionForCategory(category);
  const candidates = actions.filter((action) => actionMatchesRegion(action, region));
  if (candidates.length === 0 || topK <= 0) {
    return [];
  }

  const query = [...messages]
    .reverse()
    .filter((message) => message.role === "user")
    .slice(0, 2)
    .map((message) => message.content)
    .join(" ")
    .trim();
  if (!query) {
    return candidates.slice(0, topK);
  }

  const docFreq = new Map<string, number>();
  const docTerms = candidates.map((action) => {
    const terms = termCounts(tokenizeText(searchableActionText(action)));
    for (const term of terms.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
    return terms;
  });
  const docVectors = docTerms.map((terms) => tfidfVector(terms, docFreq, candidates.length));
  const docNorms = docVectors.map((vector) => vectorNorm(vector));

  const queryVector = tfidfVector(termCounts(tokenizeText(query)), docFreq, candidates.length);
  const queryNorm = vectorNorm(queryVector);
  if (queryNorm === 0) {
    return candidates.slice(0, topK);
  }

  return candidates
    .map((action, index) => {
      const norm = docNorms[index];
      const score = norm === 0 ? 0 : dotProduct(queryVector, docVectors[index]) / (queryNorm * norm);
      return { action, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, topK)
    .map((entry) => entry.action);
}
