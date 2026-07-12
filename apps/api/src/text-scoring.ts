export function tokenizeText(text: string): string[] {
  const rawTokens = text.toLowerCase().match(/[a-zA-Z0-9_]+|[一-鿿]/gu) ?? [];
  const cjkChars = rawTokens.filter((token) => token.length === 1 && token >= "一" && token <= "鿿");
  const cjkBigrams = cjkChars.slice(0, -1).map((token, index) => `${token}${cjkChars[index + 1]}`);
  return [...rawTokens, ...cjkBigrams];
}

export function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function tfidfVector(
  terms: Map<string, number>,
  docFreq: Map<string, number>,
  docCount: number,
): Map<string, number> {
  const total = Array.from(terms.values()).reduce((sum, value) => sum + value, 0);
  const vector = new Map<string, number>();
  if (total === 0) {
    return vector;
  }
  for (const [term, count] of terms.entries()) {
    const tf = count / total;
    const idf = Math.log((docCount + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;
    vector.set(term, tf * idf);
  }
  return vector;
}

export function vectorNorm(vector: Map<string, number>): number {
  return Math.sqrt(Array.from(vector.values()).reduce((sum, value) => sum + value * value, 0));
}

export function dotProduct(left: Map<string, number>, right: Map<string, number>): number {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let total = 0;
  for (const [term, value] of small.entries()) {
    total += value * (large.get(term) ?? 0);
  }
  return total;
}
