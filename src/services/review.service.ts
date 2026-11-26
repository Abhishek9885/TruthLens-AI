import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAuditEvent } from "./audit.service";
import { isAdminRole } from "@/lib/auth";
import type {
  Claim,
  Evidence,
  Profile,
  Report,
  Review,
  Submission,
} from "@/types/database";
import type {
  ReviewWorkspaceData,
  SubmitReviewDecisionInput,
} from "@/types/review";

const SIGNED_IMAGE_TTL_SECONDS = 3600;

export interface GetReviewDataOptions {
  supabase: SupabaseClient;
  submissionId: string;
  reviewerId: string;
  isAdmin: boolean;
}

export interface SubmitReviewOptions {
  supabase: SupabaseClient;
  submissionId: string;
  reviewerId: string;
  input: SubmitReviewDecisionInput;
  ipAddress?: string | null;
}

/**
 * Loads all submission data, extracted claims, catalogued evidence,
 * immutable AI assessment reports, and previous review decisions for the Review workspace.
 */
export async function getReviewWorkspaceData({
  supabase,
  submissionId,
  reviewerId,
  isAdmin,
}: GetReviewDataOptions): Promise<ReviewWorkspaceData> {
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

  // Authorization check: only submission owner or admin can view
  if (!isAdmin && submission.user_id !== reviewerId) {
    throw new Error("Forbidden: You do not have permission to view this review workspace.");
  }

  // 2. Fetch submitter profile (if admin)
  let submitterProfile: Pick<Profile, "id" | "email" | "full_name" | "role"> | undefined;
  if (isAdmin) {
    const { data: profRow } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", submission.user_id)
      .maybeSingle();
    if (profRow) {
      submitterProfile = profRow as Pick<Profile, "id" | "email" | "full_name" | "role">;
    }
  }

  // 3. Generate signed URL for image submissions
  let signedImageUrl: string | null = null;
  if (submission.submission_type === "image" && submission.image_path) {
    const { data: signedData } = await supabase.storage
      .from("submission-images")
      .createSignedUrl(submission.image_path, SIGNED_IMAGE_TTL_SECONDS);
    signedImageUrl = signedData?.signedUrl ?? null;
  }

  // 4. Fetch claims
  const { data: claimsRows, error: claimsErr } = await supabase
    .from("claims")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  if (claimsErr) {
    console.error("[ReviewService] Failed to load claims:", claimsErr.message);
  }
  const claims = (claimsRows || []) as Claim[];

  // 5. Fetch evidence
  const claimIds = claims.map((c) => c.id);
  let evidence: Evidence[] = [];
  if (claimIds.length > 0) {
    const { data: evidenceRows, error: evErr } = await supabase
      .from("evidence")
      .select("*")
      .in("claim_id", claimIds);

    if (evErr) {
      console.error("[ReviewService] Failed to load evidence:", evErr.message);
    }
    evidence = (evidenceRows || []) as Evidence[];
  }

  // 6. Fetch existing report
  const { data: reportRow, error: repErr } = await supabase
    .from("reports")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (repErr && repErr.code !== "PGRST116") {
    console.error("[ReviewService] Failed to load report:", repErr.message);
  }
  const report = (reportRow as Report) || null;

  // 7. Fetch previous review decisions (chronological history)
  const { data: reviewRows, error: revErr } = await supabase
    .from("reviews")
    .select(`
      id,
      submission_id,
      reviewer_id,
      decision,
      notes,
      previous_verdict,
      final_verdict,
      evidence_inspected,
      evidence_references,
      unresolved_issues,
      created_at,
      updated_at
    `)
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  if (revErr) {
    console.error("[ReviewService] Failed to load review history:", revErr.message);
  }

  // Enrich reviews with reviewer profile info
  const enrichedReviews = [];
  for (const r of (reviewRows || []) as Review[]) {
    let reviewerInfo: Pick<Profile, "id" | "email" | "full_name"> | undefined;
    if (r.reviewer_id) {
      const { data: revProf } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", r.reviewer_id)
        .maybeSingle();
      if (revProf) reviewerInfo = revProf;
    }
    enrichedReviews.push({
      ...r,
      reviewer: reviewerInfo,
    });
  }

  // 8. Extract AI assessment summary
  let aiAssessment: ReviewWorkspaceData["aiAssessment"] = null;
  const subMeta = submission.metadata as Record<string, unknown>;

  // Derive initial AI verdict
  const aiVerdict =
    (claims.find((c) => c.ai_verdict)?.ai_verdict as string) ||
    (report?.overall_verdict === "verified_true"
      ? "verified"
      : report?.overall_verdict || "unverified");

  const aiConfidence =
    claims.find((c) => typeof c.ai_confidence === "number")?.ai_confidence ??
    (typeof claims[0]?.confidence_score === "number" ? Number(claims[0].confidence_score) : 75);

  const aiExplanation =
    claims.find((c) => c.ai_explanation)?.ai_explanation ||
    report?.summary ||
    "Preliminary algorithmic verification report generated based on catalogued evidence.";

  aiAssessment = {
    verdict: aiVerdict,
    confidence: aiConfidence,
    explanation: aiExplanation,
    modelUsed: report?.ai_model || (subMeta?.ai_model as string) || "gemini-2.5-flash",
    assessedAt: (claims[0]?.verified_at as string) || report?.created_at || null,
    limitations: (report?.limitations as string[]) || [
      "AI-generated preliminary assessment.",
      "Pending human certification.",
    ],
    missingInformation: [],
  };

  // If this is an admin viewing a pending review for the first time, log 'review_started'
  if (isAdmin && (submission.status === "in_review" || submission.status === "pending_review")) {
    await logAuditEvent({
      supabase,
      actorId: reviewerId,
      action: "review_started",
      entityType: "submission",
      entityId: submissionId,
      metadata: {
        report_id: report?.id,
        current_status: submission.status,
      },
    });

    // Mark as under_review
    await supabase
      .from("submissions")
      .update({ status: "under_review", updated_at: new Date().toISOString() })
      .eq("id", submissionId);
  }

  return {
    submission: {
      ...submission,
      user: submitterProfile,
      signedImageUrl,
    },
    claims,
    evidence,
    report,
    reviewHistory: enrichedReviews,
    aiAssessment,
  };
}

/**
 * Submits an editorial decision on a report.
 * Preserves AI assessment immutability while recording a full audit trail.
 */
export async function submitHumanReviewDecision({
  supabase,
  submissionId,
  reviewerId,
  input,
  ipAddress = null,
}: SubmitReviewOptions) {
  // 1. Verify reviewer is an administrator
  const { data: profRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", reviewerId)
    .maybeSingle();

  if (!isAdminRole(profRow?.role)) {
    throw new Error("Forbidden: Administrator privileges required to submit review decisions.");
  }

  // 2. Load submission and active report
  const { data: subRow } = await supabase
    .from("submissions")
    .select("id, status, user_id")
    .eq("id", submissionId)
    .single();

  if (!subRow) {
    throw new Error("Submission not found.");
  }

  const { data: reportRow } = await supabase
    .from("reports")
    .select("id, overall_verdict, final_human_verdict")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reportId = reportRow?.id || null;
  const previousVerdict =
    input.previousVerdict ||
    reportRow?.final_human_verdict ||
    reportRow?.overall_verdict ||
    "unverified";

  // 3. Validation: approval requires evidence inspection
  if (input.decision === "approved" && !input.evidenceInspected) {
    throw new Error("Reviewers must inspect associated evidence before approving a report.");
  }

  // 4. Validation: changing verdict requires detailed explanation
  if (
    input.previousVerdict &&
    input.finalVerdict !== input.previousVerdict &&
    (!input.notes || input.notes.trim().length < 10)
  ) {
    throw new Error(
      "A detailed reviewer explanation (at least 10 characters) is required when altering the AI verdict."
    );
  }

  // Map decision to submission status
  let newSubmissionStatus: Submission["status"] = "under_review";
  switch (input.decision) {
    case "approved":
      newSubmissionStatus = "approved";
      break;
    case "flagged":
      newSubmissionStatus = "flagged";
      break;
    case "needs_evidence":
      newSubmissionStatus = "needs_evidence";
      break;
    case "rejected":
      newSubmissionStatus = "rejected";
      break;
  }

  // 5. Try calling the atomic RPC function `submit_human_review`
  const { data: rpcData, error: rpcErr } = await supabase.rpc("submit_human_review", {
    p_submission_id: submissionId,
    p_report_id: reportId,
    p_reviewer_id: reviewerId,
    p_decision: input.decision,
    p_final_verdict: input.finalVerdict,
    p_previous_verdict: previousVerdict,
    p_notes: input.notes,
    p_evidence_inspected: input.evidenceInspected,
    p_evidence_references: input.evidenceReferences || [],
    p_unresolved_issues: input.unresolvedIssues || null,
    p_claim_verdicts: input.claimOverrides || [],
  });

  // If RPC succeeded, return result directly
  if (!rpcErr && rpcData?.success) {
    return {
      success: true,
      reviewId: rpcData.review_id,
      submissionStatus: rpcData.submission_status,
      finalVerdict: rpcData.final_verdict,
    };
  }

  // 6. Direct Fallback if RPC function is not yet loaded in database
  const { data: reviewInsert, error: revInsertErr } = await supabase
    .from("reviews")
    .insert({
      submission_id: submissionId,
      report_id: reportId,
      reviewer_id: reviewerId,
      decision: input.decision,
      previous_verdict: previousVerdict,
      final_verdict: input.finalVerdict,
      notes: input.notes,
      evidence_inspected: input.evidenceInspected,
      evidence_references: input.evidenceReferences || [],
      unresolved_issues: input.unresolvedIssues || null,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (revInsertErr) {
    throw new Error(`Failed to save review decision: ${revInsertErr.message}`);
  }

  const reviewId = reviewInsert.id;

  // Update submission status
  await supabase
    .from("submissions")
    .update({
      status: newSubmissionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  // Update report
  if (reportId) {
    await supabase
      .from("reports")
      .update({
        final_human_verdict: input.finalVerdict,
        human_review_status: input.decision,
        reviewer_notes: input.notes,
        reviewed_at: new Date().toISOString(),
        reviewer_id: reviewerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reportId);
  }

  // Update claim overrides if provided
  if (input.claimOverrides && input.claimOverrides.length > 0) {
    for (const override of input.claimOverrides) {
      await supabase
        .from("claims")
        .update({
          human_verdict: override.humanVerdict,
          human_explanation: override.humanExplanation || input.notes,
          human_reviewer_id: reviewerId,
          human_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", override.claimId)
        .eq("submission_id", submissionId);
    }
  }

  // Write audit log
  await logAuditEvent({
    supabase,
    actorId: reviewerId,
    action: `report_${input.decision}`,
    entityType: "submission",
    entityId: submissionId,
    previousState: { verdict: previousVerdict, status: subRow.status },
    newState: { verdict: input.finalVerdict, status: newSubmissionStatus },
    notes: input.notes,
    metadata: {
      review_id: reviewId,
      report_id: reportId,
      decision: input.decision,
      evidence_inspected: input.evidenceInspected,
    },
    ipAddress,
  });

  return {
    success: true,
    reviewId,
    submissionStatus: newSubmissionStatus,
    finalVerdict: input.finalVerdict,
  };
}
