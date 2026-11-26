import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { getClientIp, recordAuditLog } from "@/lib/audit";
import {
  SIGNED_IMAGE_TTL_SECONDS,
  buildAiAssessmentSummary,
} from "@/lib/submissions/enrich";
import { reviewSubmissionSchema } from "@/lib/validation/submission";
import type { Claim, Review, Submission } from "@/types/database";

const uuidSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid submission ID format." },
      { status: 400 }
    );
  }

  const { supabase } = auth;
  const { data: submission, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load submission.", details: error.message },
      { status: 500 }
    );
  }

  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  let imageSignedUrl: string | null = null;
  if (submission.submission_type === "image" && submission.image_path) {
    const { data: signed } = await supabase.storage
      .from("submission-images")
      .createSignedUrl(submission.image_path, SIGNED_IMAGE_TTL_SECONDS);
    imageSignedUrl = signed?.signedUrl ?? null;
  }

  const [{ data: reviews }, { data: claims }] = await Promise.all([
    supabase
      .from("reviews")
      .select("*")
      .eq("submission_id", id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("claims")
      .select("id, submission_id, verdict, confidence_score, created_at")
      .eq("submission_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const typedSubmission = submission as Submission;
  const typedReviews = (reviews ?? []) as Review[];
  const typedClaims = (claims ?? []) as Pick<
    Claim,
    "id" | "submission_id" | "verdict" | "confidence_score" | "created_at"
  >[];

  return NextResponse.json({
    submission: {
      ...typedSubmission,
      image_signed_url: imageSignedUrl,
      latest_review: typedReviews[0] ?? null,
      ai_assessment: buildAiAssessmentSummary(typedSubmission, typedClaims),
    },
    reviews: typedReviews,
    claims: typedClaims,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { supabase, user, profile } = auth;
  if (!isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: Administrator role required to review submissions." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid submission ID format." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parsed = reviewSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid review payload.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  const { decision, notes, status } = parsed.data;
  const cleanNotes =
    typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null;

  // Check if an active review record already exists for this submission
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("*")
    .eq("submission_id", id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let review: Review | null = null;
  let reviewAction: "review.created" | "review.updated" = "review.created";
  const previousDecision = existingReview
    ? (existingReview as Review).decision
    : null;

  if (existingReview) {
    const { data: updatedReview, error: reviewUpdateError } = await supabase
      .from("reviews")
      .update({
        reviewer_id: user.id,
        decision,
        notes: cleanNotes,
      })
      .eq("id", existingReview.id)
      .select("*")
      .single();

    if (reviewUpdateError || !updatedReview) {
      return NextResponse.json(
        {
          error: "Failed to update review record.",
          details: reviewUpdateError?.message,
        },
        { status: 500 }
      );
    }

    review = updatedReview as Review;
    reviewAction = "review.updated";
  } else {
    const { data: insertedReview, error: reviewInsertError } = await supabase
      .from("reviews")
      .insert({
        submission_id: id,
        reviewer_id: user.id,
        decision,
        notes: cleanNotes,
      })
      .select("*")
      .single();

    if (reviewInsertError || !insertedReview) {
      return NextResponse.json(
        {
          error: "Failed to save review record.",
          details: reviewInsertError?.message,
        },
        { status: 500 }
      );
    }

    review = insertedReview as Review;
    reviewAction = "review.created";
  }

  const nextStatus =
    status ??
    (decision === "needs_more_evidence" ? "in_review" : "completed");

  // Strictly update workflow status only — never touch metadata, claims, or AI verdict fields
  const { data: updatedSubmission, error: updateError } = await supabase
    .from("submissions")
    .update({ status: nextStatus })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updatedSubmission) {
    return NextResponse.json(
      {
        error: "Review saved, but failed to update submission status.",
        details: updateError?.message,
      },
      { status: 500 }
    );
  }

  const { data: claims } = await supabase
    .from("claims")
    .select("id, submission_id, verdict, confidence_score, created_at")
    .eq("submission_id", id)
    .order("created_at", { ascending: false });

  const typedSubmission = updatedSubmission as Submission;
  const typedClaims = (claims ?? []) as Pick<
    Claim,
    "id" | "submission_id" | "verdict" | "confidence_score" | "created_at"
  >[];
  const aiSummary = buildAiAssessmentSummary(typedSubmission, typedClaims);

  await recordAuditLog({
    supabase,
    actorId: user.id,
    action: reviewAction,
    entityType: "review",
    entityId: review.id,
    details: {
      submission_id: id,
      reviewer_id: user.id,
      reviewed_at: review.updated_at,
      previous_decision: previousDecision,
      decision,
      notes: cleanNotes,
      next_status: nextStatus,
      ai_assessment_preserved: true,
      preserved_ai_verdict: aiSummary.verdict,
    },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({
    submission: {
      ...typedSubmission,
      latest_review: review,
      ai_assessment: aiSummary,
    },
    review,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid submission ID format." },
      { status: 400 }
    );
  }

  const { supabase, user, profile } = auth;
  const { data: submission, error: fetchError } = await supabase
    .from("submissions")
    .select("id, user_id, image_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to look up submission." },
      { status: 500 }
    );
  }

  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  if (submission.user_id !== user.id && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: You cannot delete this submission." },
      { status: 403 }
    );
  }

  if (submission.image_path) {
    await supabase.storage
      .from("submission-images")
      .remove([submission.image_path]);
  }

  const { error: deleteError } = await supabase
    .from("submissions")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete submission.", details: deleteError.message },
      { status: 500 }
    );
  }

  await recordAuditLog({
    supabase,
    actorId: user.id,
    action: "submission.deleted",
    entityType: "submission",
    entityId: id,
    details: {},
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ success: true });
}
