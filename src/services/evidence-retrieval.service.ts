import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchAndNormalizeFactChecks, isValidHttpUrl } from "./factcheck.service";
import { classifyEvidence } from "./evidence-classification.service";
import type {
  ClaimEvidenceSummary,
  NormalizedFactCheckResult,
  RetrievedEvidenceItem,
  RetrieveEvidenceApiResponse,
} from "@/types/evidence";
import type { Claim } from "@/types/database";

/**
 * Normalizes a URL for deduplication by trimming trailing slashes,
 * lowercasing scheme/host, and stripping common tracking query parameters.
 */
export function normalizeUrlForDeduplication(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    // Normalize http to https for canonical deduplication
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    // Strip common tracking parameters
    const paramsToStrip = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];
    for (const p of paramsToStrip) {
      parsed.searchParams.delete(p);
    }

    // Strip trailing slash from pathname if present (unless root /)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

export interface RetrieveEvidenceOptions {
  supabase: SupabaseClient;
  userId: string;
  submissionId: string;
  claimIds?: string[];
  forceRefresh?: boolean;
  maxClaimsToProcess?: number;
}

/**
 * Primary Evidence Retrieval Engine
 *
 * 1. Loads claims for a submission.
 * 2. Searches Google Fact Check Tools API for each claim and its generated search queries.
 * 3. Normalizes and validates retrieved fact-check articles.
 * 4. Deduplicates sources.
 * 5. Classifies each piece of evidence (supporting, contradicting, contextual, unclassified).
 * 6. Persists evidence into Supabase.
 * 7. Records empty states when no fact checks are found, explicitly without declaring truth/falsehood.
 */
export async function retrieveAndStoreEvidence(
  options: RetrieveEvidenceOptions
): Promise<RetrieveEvidenceApiResponse> {
  const {
    supabase,
    userId,
    submissionId,
    claimIds,
    forceRefresh = false,
    maxClaimsToProcess = 10,
  } = options;

  // 1. Fetch claims for this submission
  let query = supabase
    .from("claims")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  if (claimIds && claimIds.length > 0) {
    query = query.in("id", claimIds);
  }

  const { data: claimsRows, error: claimsFetchError } = await query;
  if (claimsFetchError) {
    throw new Error(`Failed to load claims: ${claimsFetchError.message}`);
  }

  const claims = (claimsRows || []) as Claim[];
  if (claims.length === 0) {
    return {
      success: true,
      submissionId,
      totalClaimsProcessed: 0,
      totalEvidenceRetrieved: 0,
      claimsEvidence: [],
      message: "No claims found for this submission.",
    };
  }

  const claimsToProcess = claims.slice(0, maxClaimsToProcess);
  const claimSummaries: ClaimEvidenceSummary[] = [];
  let totalEvidenceRetrieved = 0;

  for (const claim of claimsToProcess) {
    // If not forceRefresh, check if we already have evidence stored in Supabase
    if (!forceRefresh) {
      const { data: existingEvidence } = await supabase
        .from("evidence")
        .select("*")
        .eq("claim_id", claim.id);

      if (existingEvidence && existingEvidence.length > 0) {
        const mappedItems: RetrievedEvidenceItem[] = existingEvidence.map((e) => ({
          id: e.id,
          claimId: e.claim_id,
          sourceName: e.source_name || e.source_title,
          sourceUrl: e.source_url || "",
          sourceType: (e.source_type || "fact_check") as RetrievedEvidenceItem["sourceType"],
          evidenceType: (e.evidence_type || "contextual") as RetrievedEvidenceItem["evidenceType"],
          title: e.title || e.source_title,
          summary: e.summary || e.excerpt || "",
          originalRating: e.original_rating || null,
          publishedAt: e.published_at || null,
          retrievedAt: e.retrieved_at || e.created_at,
          relevanceExplanation: e.relevance_explanation || e.summary || "",
          metadata: e.metadata || {},
        }));

        totalEvidenceRetrieved += mappedItems.length;
        claimSummaries.push({
          claimId: claim.id,
          claimText: claim.claim_text,
          normalizedText: claim.normalized_text,
          category: claim.category,
          factChecksCount: mappedItems.length,
          evidenceItems: mappedItems,
          status: mappedItems.length > 0 ? "evidence_found" : "no_fact_checks_found",
        });
        continue;
      }
    }

    // 2. Prepare search queries for this claim
    const searchPhrases: string[] = [];

    // Use normalized text if available, otherwise raw claim text
    const primaryQuery = (claim.normalized_text || claim.claim_text || "").trim();
    if (primaryQuery) {
      searchPhrases.push(primaryQuery);
    }

    // Add generated search queries from claim extraction
    if (Array.isArray(claim.search_queries)) {
      for (const sq of claim.search_queries) {
        if (sq && sq.trim().length > 0 && !searchPhrases.includes(sq.trim())) {
          searchPhrases.push(sq.trim());
        }
      }
    } else if (
      claim.metadata &&
      Array.isArray(claim.metadata.searchQueries)
    ) {
      for (const sq of claim.metadata.searchQueries) {
        if (typeof sq === "string" && sq.trim().length > 0 && !searchPhrases.includes(sq.trim())) {
          searchPhrases.push(sq.trim());
        }
      }
    }

    // 3. Search Google Fact Check Tools API
    const rawFactCheckResults: NormalizedFactCheckResult[] = [];
    const seenUrlsInClaim = new Set<string>();
    let searchError: string | null = null;

    try {
      // Execute primary search
      const primaryResults = await searchAndNormalizeFactChecks({
        query: searchPhrases[0] || claim.claim_text,
        pageSize: 10,
      });

      rawFactCheckResults.push(...primaryResults);

      // If primary search returned 0 results and we have secondary queries, try the top secondary query
      if (rawFactCheckResults.length === 0 && searchPhrases.length > 1) {
        const secondaryResults = await searchAndNormalizeFactChecks({
          query: searchPhrases[1],
          pageSize: 10,
        });
        rawFactCheckResults.push(...secondaryResults);
      }
    } catch (apiErr) {
      searchError =
        apiErr instanceof Error
          ? apiErr.message
          : "Failed to query Google Fact Check Tools API.";
    }

    // 4. Flatten, validate, and deduplicate claim reviews
    const uniqueReviews: Array<{
      factCheckClaimText: string;
      review: NormalizedFactCheckResult["claimReview"][number];
      normalizedUrl: string;
    }> = [];

    for (const fc of rawFactCheckResults) {
      for (const r of fc.claimReview) {
        if (!isValidHttpUrl(r.url)) continue;

        const normalizedUrl = normalizeUrlForDeduplication(r.url);
        if (seenUrlsInClaim.has(normalizedUrl)) {
          continue; // Deduplicate within this claim
        }

        seenUrlsInClaim.add(normalizedUrl);
        uniqueReviews.push({
          factCheckClaimText: fc.claimText,
          review: r,
          normalizedUrl,
        });
      }
    }

    // 5. Classify evidence items
    const classifiedItems: RetrievedEvidenceItem[] = [];
    const claimContext = {
      claimText: claim.claim_text,
      normalizedText: claim.normalized_text,
      date: claim.date,
      location: claim.location,
      category: claim.category,
    };

    for (const item of uniqueReviews) {
      const classification = await classifyEvidence(claimContext, {
        factCheckClaimText: item.factCheckClaimText,
        review: item.review,
      });

      classifiedItems.push({
        claimId: claim.id,
        sourceName: item.review.publisher,
        sourceUrl: item.review.url,
        sourceType: "fact_check",
        evidenceType: classification.evidenceType,
        title: item.review.title,
        summary: classification.relevanceExplanation,
        originalRating: item.review.textualRating ?? null,
        publishedAt: item.review.reviewDate ?? null,
        retrievedAt: new Date().toISOString(),
        relevanceExplanation: classification.relevanceExplanation,
        metadata: {
          publisherSite: item.review.publisherSite ?? null,
          languageCode: item.review.languageCode ?? null,
          factCheckClaimText: item.factCheckClaimText,
          relevanceScore: classification.relevanceScore,
          normalizedUrl: item.normalizedUrl,
          retrievedVia: "google_fact_check_tools_api",
        },
      });
    }

    // 6. Persist to Supabase evidence table
    if (forceRefresh) {
      // Remove prior evidence for this claim to avoid accumulation
      await supabase.from("evidence").delete().eq("claim_id", claim.id);
    }

    if (classifiedItems.length > 0) {
      // Prepare records for database insertion
      const recordsToInsert = classifiedItems.map((item) => ({
        claim_id: claim.id,
        added_by: userId,
        source_title: item.title,
        source_url: item.sourceUrl,
        source_name: item.sourceName,
        source_type: item.sourceType,
        evidence_type: item.evidenceType,
        title: item.title,
        summary: item.summary,
        excerpt: (item.metadata.factCheckClaimText as string) || item.title,
        stance:
          item.evidenceType === "supporting"
            ? "supporting"
            : item.evidenceType === "contradicting"
            ? "refuting"
            : "neutral",
        credibility_rating:
          item.evidenceType === "contradicting" || item.evidenceType === "supporting"
            ? 5
            : 4,
        original_rating: item.originalRating,
        published_at: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
        retrieved_at: item.retrievedAt,
        relevance_explanation: item.relevanceExplanation,
        metadata: item.metadata,
      }));

      // Try inserting with extended evidence columns
      const { data: insertedRows, error: insertError } = await supabase
        .from("evidence")
        .insert(recordsToInsert)
        .select("id, claim_id, source_url");

      if (insertError) {
        // Fallback: If DB migration has not yet run, insert using standard legacy columns
        const fallbackRecords = recordsToInsert.map((r) => ({
          claim_id: r.claim_id,
          added_by: r.added_by,
          source_title: r.source_title,
          source_url: r.source_url,
          excerpt: r.excerpt,
          stance: r.stance,
          credibility_rating: r.credibility_rating,
        }));

        await supabase.from("evidence").insert(fallbackRecords);
      } else if (insertedRows) {
        // Assign inserted database IDs to mapped items
        insertedRows.forEach((row, idx) => {
          if (classifiedItems[idx]) {
            classifiedItems[idx].id = row.id;
          }
        });
      }
    }

    totalEvidenceRetrieved += classifiedItems.length;

    claimSummaries.push({
      claimId: claim.id,
      claimText: claim.claim_text,
      normalizedText: claim.normalized_text,
      category: claim.category,
      factChecksCount: classifiedItems.length,
      evidenceItems: classifiedItems,
      status: searchError
        ? "search_error"
        : classifiedItems.length > 0
        ? "evidence_found"
        : "no_fact_checks_found",
      error: searchError,
    });
  }

  return {
    success: true,
    submissionId,
    totalClaimsProcessed: claimsToProcess.length,
    totalEvidenceRetrieved,
    claimsEvidence: claimSummaries,
    cached: false,
  };
}
