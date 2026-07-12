import { existsSync, readFileSync } from "node:fs";
import { dotProduct, termCounts, tfidfVector, tokenizeText, vectorNorm } from "./text-scoring.js";
import type { ChatMessage, LocalRagSearchOptions, RagEvidenceSnippet, RehabConsultCategory } from "./types.js";

type LocalRagChunk = {
  id: string;
  source: string;
  text: string;
  metadata?: Record<string, unknown>;
};

type LoadedLocalRagIndex = {
  chunks: LocalRagChunk[];
  chunkVectors: Map<string, number>[];
  chunkNorms: number[];
  docFreq: Map<string, number>;
};

const loadedRagIndexes = new Map<string, LoadedLocalRagIndex>();
const warnedMissingRagIndexes = new Set<string>();

function warnMissingRagIndexOnce(message: string): void {
  if (warnedMissingRagIndexes.has(message)) {
    return;
  }
  warnedMissingRagIndexes.add(message);
  console.warn(`[mentis-api] ${message}`);
}

export function buildChatRagContext(
  messages: ChatMessage[],
  category?: RehabConsultCategory,
  options: LocalRagSearchOptions = {},
): RagEvidenceSnippet[] {
  if (category !== "knee") {
    return [];
  }
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const query = [
    latestUserMessage?.content ?? "",
    "knee patellofemoral pain extension extensor load exercise rehabilitation",
  ]
    .join(" ")
    .trim();
  return searchLocalRag(query, options);
}

export function searchLocalRag(query: string, options: LocalRagSearchOptions = {}): RagEvidenceSnippet[] {
  const topK = options.topK ?? 4;
  if (topK <= 0 || !query.trim()) {
    return [];
  }
  const indexPath = options.indexPath ?? process.env.MENTIS_RAG_INDEX_PATH?.trim();
  if (!indexPath) {
    warnMissingRagIndexOnce("MENTIS_RAG_INDEX_PATH is not set; RAG evidence lookup is disabled.");
    return [];
  }
  if (!existsSync(indexPath)) {
    warnMissingRagIndexOnce(`RAG index file not found at ${indexPath}; RAG evidence lookup is disabled.`);
    return [];
  }

  const index = loadLocalRagIndex(indexPath);
  const queryTerms = termCounts(tokenizeText(query));
  const queryVector = tfidfVector(queryTerms, index.docFreq, index.chunks.length);
  const queryNorm = vectorNorm(queryVector);
  if (queryNorm === 0) {
    return [];
  }

  return index.chunks
    .map((chunk, indexNumber) => {
      const chunkNorm = index.chunkNorms[indexNumber];
      const score =
        chunkNorm === 0 ? 0 : dotProduct(queryVector, index.chunkVectors[indexNumber]) / (queryNorm * chunkNorm);
      return { chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({
      source: String(chunk.metadata?.file ?? chunk.source),
      page: typeof chunk.metadata?.page === "string" || typeof chunk.metadata?.page === "number" ? chunk.metadata.page : undefined,
      text: chunk.text,
      score,
      evidenceType: typeof chunk.metadata?.evidence_type === "string" ? chunk.metadata.evidence_type : undefined,
    }));
}

function loadLocalRagIndex(indexPath: string): LoadedLocalRagIndex {
  const cached = loadedRagIndexes.get(indexPath);
  if (cached) {
    return cached;
  }
  const payload = JSON.parse(readFileSync(indexPath, "utf-8")) as { chunks?: LocalRagChunk[] };
  const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
  const docFreq = new Map<string, number>();
  const chunkTerms = chunks.map((chunk) => {
    const terms = termCounts(tokenizeText(searchableRagChunkText(chunk)));
    for (const term of terms.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
    return terms;
  });
  const chunkVectors = chunkTerms.map((terms) => tfidfVector(terms, docFreq, chunks.length));
  const chunkNorms = chunkVectors.map((vector) => vectorNorm(vector));
  const loaded: LoadedLocalRagIndex = { chunks, chunkVectors, chunkNorms, docFreq };
  loadedRagIndexes.set(indexPath, loaded);
  return loaded;
}

function searchableRagChunkText(chunk: LocalRagChunk): string {
  const metadataText = Object.values(chunk.metadata ?? {})
    .filter(Boolean)
    .join(" ");
  return `${chunk.source}\n${metadataText}\n${chunk.text}`;
}

