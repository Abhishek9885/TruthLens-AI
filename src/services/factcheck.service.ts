import "server-only";
import {
  searchFactCheckClaims,
  type FactCheckSearchParams,
} from "@/lib/factcheck";
import type {
  NormalizedClaimReview,
  NormalizedFactCheckResult,
  RawGoogleClaimReview,
  RawGoogleFactCheckResponse,
} from "@/types/evidence";

/**
 * Validates whether a string is a well-formed http:// or https:// URL.
 */
export function isValidHttpUrl(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== "string") return false;
  try {
    const parsed = new URL(candidate.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalizes a single raw claim review from Google Fact Check API.
 * Guarantees that publisher, title, URL, and ratings are strictly preserved without alteration.
 */
export function normalizeClaimReview(
  raw: RawGoogleClaimReview
): NormalizedClaimReview | null {
  const url = (raw.url || "").trim();
  if (!isValidHttpUrl(url)) {
    // Drop reviews with missing or malformed URLs to prevent invalid citations
    return null;
  }

  // Determine publisher name, falling back to site or hostname if missing
  let publisherName = (raw.publisher?.name || "").trim();
  let publisherSite = (raw.publisher?.site || "").trim() || null;

  if (!publisherName) {
    if (publisherSite) {
      publisherName = publisherSite.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    } else {
      try {
        const parsedUrl = new URL(url);
        publisherName = parsedUrl.hostname.replace(/^www\./i, "");
        publisherSite = parsedUrl.hostname;
      } catch {
        publisherName = "Fact-Check Publisher";
      }
    }
  }

  // Preserve publisher's exact rating without alteration
  const textualRating = (raw.textualRating || "").trim() || null;

  // Title of the fact-check article
  const title = (raw.title || "").trim() || `${publisherName} Fact Check`;

  return {
    publisher: publisherName,
    publisherSite,
    title,
    url,
    reviewDate: raw.reviewDate ? String(raw.reviewDate).trim() : null,
    textualRating,
    languageCode: raw.languageCode ? String(raw.languageCode).trim() : null,
  };
}

/**
 * Normalizes an entire raw Google Fact Check response into structured results.
 */
export function normalizeFactCheckResponse(
  rawResponse: RawGoogleFactCheckResponse
): NormalizedFactCheckResult[] {
  if (!rawResponse || !Array.isArray(rawResponse.claims)) {
    return [];
  }

  const results: NormalizedFactCheckResult[] = [];

  for (const rawClaim of rawResponse.claims) {
    const claimText = (rawClaim.text || "").trim();
    if (!claimText) continue;

    const rawReviews = Array.isArray(rawClaim.claimReview)
      ? rawClaim.claimReview
      : [];

    const normalizedReviews: NormalizedClaimReview[] = [];
    for (const r of rawReviews) {
      const normalized = normalizeClaimReview(r);
      if (normalized) {
        normalizedReviews.push(normalized);
      }
    }

    if (normalizedReviews.length > 0) {
      results.push({
        claimText,
        claimant: rawClaim.claimant ? String(rawClaim.claimant).trim() : null,
        claimDate: rawClaim.claimDate ? String(rawClaim.claimDate).trim() : null,
        claimReview: normalizedReviews,
      });
    }
  }

  return results;
}

/**
 * Executes a search against Google Fact Check Tools API and returns normalized results.
 */
export async function searchAndNormalizeFactChecks(
  params: FactCheckSearchParams
): Promise<NormalizedFactCheckResult[]> {
  const rawResponse = await searchFactCheckClaims(params);
  return normalizeFactCheckResponse(rawResponse);
}
