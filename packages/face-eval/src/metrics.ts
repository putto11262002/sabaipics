export interface SearchResult {
  queryImage: string;
  queryPersonId: number;
  expectedImages: string[];
  results: Array<{ image: string; similarity: number }>;
  durationMs: number;
}

export interface MetricsAtK {
  precision: number;
  recall: number;
  avgFalsePositives: number;
  avgReturned: number;
  fpFreeRate: number;
}

export interface Metrics {
  rank1Accuracy: number;
  rank5Accuracy: number;
  meanReciprocalRank: number;
  avgIndexTimeMs: number;
  avgSearchTimeMs: number;
  retrievalAtK: Record<string, MetricsAtK>;
  emptyResultRate: number;
}

function dedupeOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function calculateMetrics(searchResults: SearchResult[], evalKs: number[]): Metrics {
  if (searchResults.length === 0) {
    return {
      rank1Accuracy: 0,
      rank5Accuracy: 0,
      meanReciprocalRank: 0,
      avgIndexTimeMs: 0,
      avgSearchTimeMs: 0,
      retrievalAtK: {},
      emptyResultRate: 0,
    };
  }

  const ks = Array.from(new Set(evalKs.filter((k) => Number.isFinite(k) && k > 0))).sort(
    (a, b) => a - b,
  );

  let rank1Correct = 0;
  let rank5Correct = 0;
  let reciprocalRankSum = 0;
  let totalSearchTime = 0;
  let emptyResultCount = 0;

  const byK: Record<
    string,
    {
      precisionSum: number;
      recallSum: number;
      falsePositivesSum: number;
      returnedSum: number;
      fpFreeCount: number;
    }
  > = {};

  for (const k of ks) {
    byK[String(k)] = {
      precisionSum: 0,
      recallSum: 0,
      falsePositivesSum: 0,
      returnedSum: 0,
      fpFreeCount: 0,
    };
  }

  function computeAtK(orderedImages: string[], expected: Set<string>, k: number) {
    const topK = orderedImages.slice(0, k);
    if (topK.length === 0) return { precision: 0, recall: 0, falsePositives: 0, returned: 0 };

    let tp = 0;
    let fp = 0;
    for (const img of topK) {
      if (expected.has(img)) tp++;
      else fp++;
    }

    const denom = expected.size;
    return {
      precision: tp / topK.length,
      recall: denom > 0 ? tp / denom : 0,
      falsePositives: fp,
      returned: topK.length,
    };
  }

  for (const result of searchResults) {
    const expected = new Set(result.expectedImages);
    const orderedImages = dedupeOrdered(result.results.map((r) => r.image));

    if (orderedImages.length === 0) emptyResultCount++;

    let correctRank = -1;
    for (let i = 0; i < orderedImages.length; i++) {
      if (expected.has(orderedImages[i])) {
        correctRank = i + 1;
        break;
      }
    }

    if (correctRank === 1) rank1Correct++;
    if (correctRank > 0 && correctRank <= 5) rank5Correct++;
    if (correctRank > 0) reciprocalRankSum += 1 / correctRank;

    for (const k of ks) {
      const key = String(k);
      const agg = byK[key];
      const m = computeAtK(orderedImages, expected, k);
      agg.precisionSum += m.precision;
      agg.recallSum += m.recall;
      agg.falsePositivesSum += m.falsePositives;
      agg.returnedSum += m.returned;
      if (m.falsePositives === 0) agg.fpFreeCount += 1;
    }

    totalSearchTime += result.durationMs;
  }

  return {
    rank1Accuracy: rank1Correct / searchResults.length,
    rank5Accuracy: rank5Correct / searchResults.length,
    meanReciprocalRank: reciprocalRankSum / searchResults.length,
    avgIndexTimeMs: 0,
    avgSearchTimeMs: totalSearchTime / searchResults.length,
    retrievalAtK: Object.fromEntries(
      Object.entries(byK).map(([k, agg]) => [
        k,
        {
          precision: agg.precisionSum / searchResults.length,
          recall: agg.recallSum / searchResults.length,
          avgFalsePositives: agg.falsePositivesSum / searchResults.length,
          avgReturned: agg.returnedSum / searchResults.length,
          fpFreeRate: agg.fpFreeCount / searchResults.length,
        },
      ]),
    ),
    emptyResultRate: emptyResultCount / searchResults.length,
  };
}
