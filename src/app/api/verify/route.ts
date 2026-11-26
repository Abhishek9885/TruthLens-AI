import { NextResponse } from "next/server";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { getClientIp, recordAuditLog } from "@/lib/audit";
import {
  GeminiApiError,
  GeminiConfigurationError,
  GeminiRateLimitError,
  GeminiTimeoutError,
} from "@/lib/gemini";
import { verifySubmission } from "@/services/verification.service";
import {
  verifySubmissionRequestSchema,
  type ClaimVerificationResult,
  type SubmissionVerificationReport,
  type VerdictCounts,
  type VerifyApiResponse,
} from "@/types/verification";
import type { Claim, Report, Submission } from "@/types/database";

/**
 * POST /api/verify
 *
 * Runs evidence-based verification reasoning across claims in a submission.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { supabase, user, profile } = auth;
  const ipAddress = getClientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request payload." },
      { status: 400 }
    );
  }

  const parsed = verifySubmissionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request payload.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const { submissionId, claimIds, forceReverify } = parsed.data;

  // Retrieve submission from database
  const { data: submissionRow, error: fetchError } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to look up submission.", details: fetchError.message },
      { status: 500 }
    );
  }

  if (!submissionRow) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  const submission = submissionRow as Submission;

  // Server-side authorization check: author or confirmed admin only
  if (submission.user_id !== user.id && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to verify this submission." },
      { status: 403 }
    );
  }

  try {
    const report = await verifySubmission({
      supabase,
      userId: user.id,
      submissionId: submission.id,
      claimIds,
      forceReverify,
    });

    // Record audit log entry
    await recordAuditLog({
      supabase,
      actorId: user.id,
      action: "verification_completed",
      entityType: "submission",
      entityId: submission.id,
      ipAddress,
      details: {
        totalClaims: report.totalClaims,
        counts: report.counts,
        forceReverify,
      },
    });

    return NextResponse.json<VerifyApiResponse>({
      success: true,
      submissionId: submission.id,
      report,
      cached: false,
    });
  } catch (err: unknown) {
    if (err instanceof GeminiRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof GeminiTimeoutError) {
      return NextResponse.json({ error: err.message }, { status: 504 });
    }
    if (err instanceof GeminiConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof GeminiApiError) {
      return NextResponse.json({ error: err.message, details: err.details }, { status: 502 });
    }

    const message = err instanceof Error ? err.message : "Verification failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/verify?submissionId=<id>
 *
 * Retrieves the existing verification report and claim assessments for a submission.
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { supabase, user, profile } = auth;
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submissionId");

  if (!submissionId) {
    return NextResponse.json(
      { error: "submissionId query parameter is required." },
      { status: 400 }
    );
  }

  // Verify submission ownership or admin
  const { data: submissionRow, error: subError } = await supabase
    .from("submissions")
    .select("id, user_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (subError || !submissionRow) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (submissionRow.user_id !== user.id && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to view verification results for this submission." },
      { status: 403 }
    );
  }

  // Fetch report
  const { data: reportRow } = await supabase
    .from("reports")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle();

  // Fetch claims
  const { data: claimsRows, error: claimsErr } = await supabase
    .from("claims")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  if (claimsErr) {
    return NextResponse.json({ error: claimsErr.message }, { status: 500 });
  }

  const claims = (claimsRows || []) as Claim[];
  const report = reportRow as Report | null;

  if (!report && claims.every((c) => !c.ai_verdict)) {
    return NextResponse.json({
      success: false,
      submissionId,
      message: "No verification report has been generated for this submission yet.",
    });
  }

  const counts: VerdictCounts = {
    verified: 0,
    false: 0,
    misleading: 0,
    partially_true: 0,
    unverified: 0,
  };

  const claimVerifications: ClaimVerificationResult[] = [];
  for (const c of claims) {
    if (c.ai_structured_result && typeof c.ai_structured_result === "object") {
      const res = c.ai_structured_result as unknown as ClaimVerificationResult;
      claimVerifications.push(res);
      if (typeof counts[res.verdict] === "number") counts[res.verdict]++;
    }
  }

  const structuredReport: SubmissionVerificationReport = {
    submissionId,
    reportId: report?.id || null,
    totalClaims: claims.length,
    counts,
    claimVerifications,
    overallSynthesis: report?.summary || "Verification assessment completed.",
    methodology: report?.methodology || "TruthLens AI Multi-Source Synthesis Engine",
    modelUsed: (report?.ai_model as string) || "gemini-2.5-flash",
    verifiedAt: report?.updated_at || report?.created_at || new Date().toISOString(),
    requiresHumanReview: true,
  };

  return NextResponse.json<VerifyApiResponse>({
    success: true,
    submissionId,
    report: structuredReport,
    cached: true,
  });
}
