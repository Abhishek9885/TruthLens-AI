import "server-only";
import type { RetrievedEvidenceItem } from "@/types/evidence";
import type { Claim } from "@/types/database";

export interface EvaluatedEvidenceItem extends RetrievedEvidenceItem {
  quality: {
    sourceTier: "primary_official" | "secondary_investigative" | "secondary_news" | "other";
    isSyndicated: boolean;
    syndicationClusterId?: string;
    temporalRelevance: "contemporary" | "outdated" | "unspecified";
    geographicRelevance: "matched" | "unmatched" | "unspecified";
    directness: "direct_fact_check" | "contextual_background" | "unrelated";
  };
}

export interface EvidenceQualityAudit {
  claimId: string;
  totalSources: number;
  independentSourceCount: number;
  hasPrimarySources: boolean;
  hasSyndicatedDuplicates: boolean;
  hasTemporalMismatch: boolean;
  hasGeographicMismatch: boolean;
  qualityLimitations: string[];
  evaluatedEvidence: EvaluatedEvidenceItem[];
}

/**
 * Normalizes text for similarity comparison.
 */
function normalizeForComparison(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
}

/**
 * Evaluates the quality, independence, temporal relevance, and directness
 * of a collection of retrieved evidence for a specific claim.
 */
export function auditEvidenceQuality(
  claim: Claim,
  evidenceList: RetrievedEvidenceItem[]
): EvidenceQualityAudit {
  const claimYear = claim.date ? claim.date.match(/\b(20\d\d)\b/)?.[1] : null;
  const claimLocation = claim.location ? claim.location.toLowerCase() : null;

  const evaluated: EvaluatedEvidenceItem[] = [];
  const limitations: string[] = [];

  // 1. Detect Syndication / Echo-Chamber Repetition
  // If multiple items share very similar titles or wire text, cluster them together.
  const titleClusters = new Map<string, string[]>();

  for (const item of evidenceList) {
    const normTitle = normalizeForComparison(item.title).slice(0, 45);
    const existing = titleClusters.get(normTitle) || [];
    existing.push(item.id || item.sourceUrl);
    titleClusters.set(normTitle, existing);
  }

  let syndicatedClusterCount = 0;
  for (const [, cluster] of titleClusters.entries()) {
    if (cluster.length > 1) syndicatedClusterCount++;
  }

  // 2. Evaluate each evidence item
  let primaryCount = 0;

  for (const item of evidenceList) {
    const normTitle = normalizeForComparison(item.title).slice(0, 45);
    const cluster = titleClusters.get(normTitle) || [];
    const isSyndicated = cluster.length > 1;

    // Source Tier
    let sourceTier: EvaluatedEvidenceItem["quality"]["sourceTier"] = "other";
    if (
      item.sourceType === "election_commission" ||
      item.sourceType === "government" ||
      item.sourceType === "legal_record"
    ) {
      sourceTier = "primary_official";
      primaryCount++;
    } else if (item.sourceType === "fact_check") {
      sourceTier = "secondary_investigative";
    } else if (item.sourceType === "news") {
      sourceTier = "secondary_news";
    }

    // Temporal Relevance
    let temporalRelevance: EvaluatedEvidenceItem["quality"]["temporalRelevance"] = "unspecified";
    if (item.publishedAt && claimYear) {
      const pubYear = item.publishedAt.match(/\b(20\d\d)\b/)?.[1];
      if (pubYear) {
        const diff = Math.abs(parseInt(pubYear, 10) - parseInt(claimYear, 10));
        temporalRelevance = diff > 2 ? "outdated" : "contemporary";
      }
    }

    // Geographic Relevance
    let geographicRelevance: EvaluatedEvidenceItem["quality"]["geographicRelevance"] = "unspecified";
    if (claimLocation) {
      const textToSearch = (
        item.title +
        " " +
        item.summary +
        " " +
        (item.metadata.factCheckClaimText || "")
      ).toLowerCase();

      // Check if any significant word of location appears
      const locWords = claimLocation.split(/[\s,]+/).filter((w) => w.length > 3);
      const matches = locWords.some((w) => textToSearch.includes(w));
      geographicRelevance = matches ? "matched" : "unmatched";
    }

    // Directness
    let directness: EvaluatedEvidenceItem["quality"]["directness"] = "direct_fact_check";
    if (item.evidenceType === "contextual") {
      directness = "contextual_background";
    } else if (item.evidenceType === "unclassified") {
      directness = "unrelated";
    }

    evaluated.push({
      ...item,
      quality: {
        sourceTier,
        isSyndicated,
        syndicationClusterId: isSyndicated ? normTitle : undefined,
        temporalRelevance,
        geographicRelevance,
        directness,
      },
    });
  }

  // 3. Independent source calculation
  // Distinct clusters + unclustered items
  const uniqueClusters = new Set<string>();
  let independentSourceCount = 0;

  for (const item of evaluated) {
    if (item.quality.isSyndicated && item.quality.syndicationClusterId) {
      if (!uniqueClusters.has(item.quality.syndicationClusterId)) {
        uniqueClusters.add(item.quality.syndicationClusterId);
        independentSourceCount++;
      }
    } else {
      independentSourceCount++;
    }
  }

  // 4. Formulate explicit quality limitations
  if (syndicatedClusterCount > 0) {
    limitations.push(
      `Detected syndicated reporting: ${evidenceList.length} articles represent ${independentSourceCount} independent investigations.`
    );
  }

  const outdatedCount = evaluated.filter((e) => e.quality.temporalRelevance === "outdated").length;
  if (outdatedCount > 0 && outdatedCount === evaluated.length) {
    limitations.push(
      "All retrieved articles predate or postdate the specific election timeline in the claim."
    );
  }

  const geoMismatchCount = evaluated.filter((e) => e.quality.geographicRelevance === "unmatched").length;
  if (claimLocation && geoMismatchCount > 0 && geoMismatchCount === evaluated.length) {
    limitations.push(
      `Retrieved sources do not explicitly address the designated geographic region (${claim.location}).`
    );
  }

  if (evidenceList.length === 0) {
    limitations.push(
      "Zero matching evidence sources catalogued in registered fact-check registries."
    );
  }

  return {
    claimId: claim.id,
    totalSources: evidenceList.length,
    independentSourceCount,
    hasPrimarySources: primaryCount > 0,
    hasSyndicatedDuplicates: syndicatedClusterCount > 0,
    hasTemporalMismatch: outdatedCount > 0,
    hasGeographicMismatch: geoMismatchCount > 0,
    qualityLimitations: limitations,
    evaluatedEvidence: evaluated,
  };
}
