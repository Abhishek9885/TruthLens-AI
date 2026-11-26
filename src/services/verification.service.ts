import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditEvidenceQuality } from "./evidence-quality.service";
import { reasonClaimVerification } from "./verification-reasoning.service";
import { getGeminiModelName } from "@/lib/gemini";
import type {
  ClaimVerificationResult,
  SubmissionVerificationReport,
  VerdictCounts,
  VerificationVerdict,
} from "@/types/verification";
import type { Claim, Evidence, Submission } from "@/types/database";
import type { RetrievedEvidenceItem } from "@/types/evidence";

export interface VerifySubmissionOptions {
  supabase: SupabaseClient;
  userId: string;
  submissionId: string;
  claimIds?: string[];
  forceReverify?: boolean;
}

/**
 * Maps VerificationVerdict to existing database ClaimVerdict enum values
 * for backward compatibility with schema constraints.
 */
export function mapToDbVerdict(verdict: VerificationVerdict): Claim["verdict"] {
  switch (verdict) {
    case "verified":
      return "verified_true";
    case "false":
      return "false";
    case "misleading":
      return "misleading";
    case "partially_true":
    case "unverified":
    default:
      return "unverified";
  }
}

/**
 * Orchestrates full multi-claim verification reasoning for a submission:
 * 1. Loads claims and evidence from Supabase.
 * 2. Audits evidence quality, independence, and syndication.
 * 3. Synthesizes preliminary AI assessment per claim.
 * 4. Aggregates overall verification counts and report findings.
 * 5. Persists claims and reports to Supabase while preserving human review separation.
 */
export async function verifySubmission(
  options: VerifySubmissionOptions
): Promise<SubmissionVerificationReport> {
  const { supabase, userId, submissionId, claimIds, forceReverify = false } = options;
  const modelName = getGeminiModelName();

  // 1. Fetch submission
  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr || !subRow) {
    throw new Error(subErr?.message || "Submission not found.");
  }
  const submission = subRow as Submission;

  // 2. Fetch claims
  let claimsQuery = supabase
    .from("claims")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  if (claimIds && claimIds.length > 0) {
    claimsQuery = claimsQuery.in("id", claimIds);
  }

  const { data: claimsRows, error: claimsErr } = await claimsQuery;
  if (claimsErr) {
    throw new Error(`Failed to load claims: ${claimsErr.message}`);
  }

  const claims = (claimsRows || []) as Claim[];
  if (claims.length === 0) {
    throw new Error("No extracted claims found for this submission.");
  }

  // 3. Fetch all evidence records for these claims
  const claimIdsList = claims.map((c) => c.id);
  const { data: evidenceRows, error: evErr } = await supabase
    .from("evidence")
    .select("*")
    .in("claim_id", claimIdsList);

  if (evErr) {
    throw new Error(`Failed to load evidence: ${evErr.message}`);
  }

  // Group evidence by claim ID
  const evidenceMap = new Map<string, RetrievedEvidenceItem[]>();
  for (const row of (evidenceRows || []) as Evidence[]) {
    const list = evidenceMap.get(row.claim_id) || [];
    list.push({
      id: row.id,
      claimId: row.claim_id,
      sourceName: row.source_name || row.source_title,
      sourceUrl: row.source_url || "",
      sourceType: (row.source_type || "fact_check") as RetrievedEvidenceItem["sourceType"],
      evidenceType: (row.evidence_type || "contextual") as RetrievedEvidenceItem["evidenceType"],
      title: row.title || row.source_title,
      summary: row.summary || row.excerpt || "",
      originalRating: row.original_rating || null,
      publishedAt: row.published_at || null,
      retrievedAt: row.retrieved_at || row.created_at,
      relevanceExplanation: row.relevance_explanation || row.summary || "",
      metadata: row.metadata || {},
    });
    evidenceMap.set(row.claim_id, list);
  }

  // 4. Run Verification Reasoning for each claim
  const claimVerifications: ClaimVerificationResult[] = [];
  const counts: VerdictCounts = {
    verified: 0,
    false: 0,
    misleading: 0,
    partially_true: 0,
    unverified: 0,
  };

  const allLimitations: string[] = [];
  const now = new Date().toISOString();

  for (const claim of claims) {
    // If claim was already verified and forceReverify is false, reuse existing result
    if (
      !forceReverify &&
      claim.ai_verdict &&
      claim.ai_structured_result &&
      typeof claim.ai_structured_result === "object"
    ) {
      const cachedResult = claim.ai_structured_result as unknown as ClaimVerificationResult;
      claimVerifications.push(cachedResult);
      const v = cachedResult.verdict as VerificationVerdict;
      if (typeof counts[v] === "number") counts[v]++;
      continue;
    }

    const claimEvidence = evidenceMap.get(claim.id) || [];
    const qualityAudit = auditEvidenceQuality(claim, claimEvidence);
    const verificationResult = await reasonClaimVerification(claim, qualityAudit);

    claimVerifications.push(verificationResult);
    const v = verificationResult.verdict;
    if (typeof counts[v] === "number") counts[v]++;
    allLimitations.push(...verificationResult.limitations);

    // Persist claim-level AI verification to database
    const dbVerdict = mapToDbVerdict(verificationResult.verdict);
    const updatePayload = {
      ai_verdict: verificationResult.verdict,
      ai_confidence: verificationResult.confidence,
      ai_explanation: verificationResult.explanation,
      ai_reasoning: verificationResult.reasoningSummary,
      ai_structured_result: verificationResult,
      verified_at: now,
      verdict: dbVerdict,
      confidence_score: verificationResult.confidence,
    };

    // Update claim with extended Day 5 fields (fallback to legacy fields if migration not applied yet)
    const { error: claimUpdateErr } = await supabase
      .from("claims")
      .update(updatePayload)
      .eq("id", claim.id);

    if (claimUpdateErr) {
      // Legacy fallback: update standard verdict and confidence
      await supabase
        .from("claims")
        .update({
          verdict: dbVerdict,
          confidence_score: verificationResult.confidence,
        })
        .eq("id", claim.id);
    }
  }

  // 5. Build Overall Report Synthesis
  const uniqueLimitations = Array.from(new Set(allLimitations));
  let overallSynthesis = `Investigated ${claims.length} claim(s): `;
  const parts: string[] = [];
  if (counts.verified > 0) parts.push(`${counts.verified} verified`);
  if (counts.false > 0) parts.push(`${counts.false} false`);
  if (counts.misleading > 0) parts.push(`${counts.misleading} misleading`);
  if (counts.partially_true > 0) parts.push(`${counts.partially_true} partially true`);
  if (counts.unverified > 0) parts.push(`${counts.unverified} unverified`);
  overallSynthesis += parts.join(", ") + ". Preliminary AI assessment pending human moderation.";

  // Determine overall verdict for legacy reports table
  let legacyOverallVerdict: Claim["verdict"] = "unverified";
  if (counts.false > 0) {
    legacyOverallVerdict = "false";
  } else if (counts.misleading > 0) {
    legacyOverallVerdict = "misleading";
  } else if (counts.verified === claims.length && claims.length > 0) {
    legacyOverallVerdict = "verified_true";
  }

  // 6. Persist Report to public.reports
  let reportId: string | null = null;
  const { data: existingReport } = await supabase
    .from("reports")
    .select("id")
    .eq("submission_id", submissionId)
    .maybeSingle();

  const reportPayload = {
    submission_id: submissionId,
    author_id: userId,
    summary: overallSynthesis,
    methodology: `TruthLens AI Multi-Source Synthesis Engine (${modelName})`,
    overall_verdict: legacyOverallVerdict,
    findings: claimVerifications,
    overall_stats: counts,
    limitations: uniqueLimitations,
    ai_model: modelName,
    updated_at: now,
  };

  if (existingReport?.id) {
    reportId = existingReport.id;
    const { error: repUpdateErr } = await supabase
      .from("reports")
      .update(reportPayload)
      .eq("id", existingReport.id);

    if (repUpdateErr) {
      // Legacy fallback without extended columns
      await supabase
        .from("reports")
        .update({
          summary: overallSynthesis,
          methodology: reportPayload.methodology,
          overall_verdict: legacyOverallVerdict,
          updated_at: now,
        })
        .eq("id", existingReport.id);
    }
  } else {
    const { data: insertedReport, error: repInsertErr } = await supabase
      .from("reports")
      .insert({
        ...reportPayload,
        is_published: false,
      })
      .select("id")
      .maybeSingle();

    if (repInsertErr) {
      // Legacy fallback insert
      const { data: fallbackRep } = await supabase
        .from("reports")
        .insert({
          submission_id: submissionId,
          author_id: userId,
          summary: overallSynthesis,
          methodology: reportPayload.methodology,
          overall_verdict: legacyOverallVerdict,
          is_published: false,
        })
        .select("id")
        .maybeSingle();
      reportId = fallbackRep?.id || null;
    } else {
      reportId = insertedReport?.id || null;
    }
  }

  // 7. Update Submission status to in_review (pending human review)
  if (submission.status === "pending" || submission.status === "extracted") {
    await supabase
      .from("submissions")
      .update({ status: "in_review", updated_at: now })
      .eq("id", submission.id);
  }

  return {
    submissionId,
    reportId,
    totalClaims: claims.length,
    counts,
    claimVerifications,
    overallSynthesis,
    methodology: `TruthLens AI Multi-Source Synthesis Engine (${modelName})`,
    modelUsed: modelName,
    verifiedAt: now,
    requiresHumanReview: true,
  };
}
