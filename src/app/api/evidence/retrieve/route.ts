import { NextResponse } from "next/server";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { getClientIp, recordAuditLog } from "@/lib/audit";
import {
  FactCheckApiError,
  FactCheckConfigurationError,
  FactCheckRateLimitError,
  FactCheckTimeoutError,
} from "@/lib/factcheck";
import { retrieveAndStoreEvidence } from "@/services/evidence-retrieval.service";
import {
  retrieveEvidenceRequestSchema,
  type ClaimEvidenceSummary,
  type RetrievedEvidenceItem,
  type RetrieveEvidenceApiResponse,
} from "@/types/evidence";
import type { Claim, Evidence, Submission } from "@/types/database";

/**
 * POST /api/evidence/retrieve
 *
 * Initiates discovery and retrieval of fact-check evidence for claims in a submission.
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

  const parsed = retrieveEvidenceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request payload.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const { submissionId, claimIds, forceRefresh, maxClaimsToProcess } = parsed.data;

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

  // Server-side ownership check: Author or confirmed Admin only
  if (submission.user_id !== user.id && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to retrieve evidence for this submission." },
      { status: 403 }
    );
  }

  try {
    const result = await retrieveAndStoreEvidence({
      supabase,
      userId: user.id,
      submissionId: submission.id,
      claimIds,
      forceRefresh,
      maxClaimsToProcess,
    });

    // Record audit log
    await recordAuditLog({
      supabase,
      actorId: user.id,
      action: "evidence_retrieval_completed",
      entityType: "submission",
      entityId: submission.id,
      ipAddress,
      details: {
        totalClaimsProcessed: result.totalClaimsProcessed,
        totalEvidenceRetrieved: result.totalEvidenceRetrieved,
        forceRefresh,
      },
    });

    return NextResponse.json<RetrieveEvidenceApiResponse>(result);
  } catch (err: unknown) {
    if (err instanceof FactCheckRateLimitError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429 }
      );
    }

    if (err instanceof FactCheckTimeoutError) {
      return NextResponse.json(
        { error: err.message },
        { status: 504 }
      );
    }

    if (err instanceof FactCheckConfigurationError) {
      return NextResponse.json(
        { error: err.message },
        { status: 503 }
      );
    }

    if (err instanceof FactCheckApiError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 }
      );
    }

    const message =
      err instanceof Error ? err.message : "Evidence retrieval failed.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evidence/retrieve?submissionId=<id>
 *
 * Retrieves currently saved evidence records for a submission, grouped by claim.
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
  const claimId = searchParams.get("claimId");

  if (!submissionId && !claimId) {
    return NextResponse.json(
      { error: "submissionId or claimId query parameter is required." },
      { status: 400 }
    );
  }

  let targetSubmissionId = submissionId;

  // If claimId provided without submissionId, resolve submissionId
  if (!targetSubmissionId && claimId) {
    const { data: claimRow } = await supabase
      .from("claims")
      .select("submission_id")
      .eq("id", claimId)
      .maybeSingle();

    if (!claimRow) {
      return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    }
    targetSubmissionId = claimRow.submission_id;
  }

  if (!targetSubmissionId) {
    return NextResponse.json({ error: "Could not resolve submission ID." }, { status: 400 });
  }

  // Verify submission ownership or admin
  const { data: submissionRow, error: subError } = await supabase
    .from("submissions")
    .select("id, user_id")
    .eq("id", targetSubmissionId)
    .maybeSingle();

  if (subError || !submissionRow) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (submissionRow.user_id !== user.id && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to view evidence for this submission." },
      { status: 403 }
    );
  }

  // Fetch claims
  let claimsQuery = supabase
    .from("claims")
    .select("*")
    .eq("submission_id", targetSubmissionId)
    .order("created_at", { ascending: true });

  if (claimId) {
    claimsQuery = claimsQuery.eq("id", claimId);
  }

  const { data: claimsData, error: claimsErr } = await claimsQuery;
  if (claimsErr) {
    return NextResponse.json({ error: claimsErr.message }, { status: 500 });
  }

  const claims = (claimsData || []) as Claim[];
  if (claims.length === 0) {
    return NextResponse.json<RetrieveEvidenceApiResponse>({
      success: true,
      submissionId: targetSubmissionId,
      totalClaimsProcessed: 0,
      totalEvidenceRetrieved: 0,
      claimsEvidence: [],
      cached: true,
    });
  }

  const claimIdsList = claims.map((c) => c.id);

  // Fetch evidence records for these claims
  const { data: evidenceData, error: evErr } = await supabase
    .from("evidence")
    .select("*")
    .in("claim_id", claimIdsList)
    .order("created_at", { ascending: false });

  if (evErr) {
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }

  const evidenceRows = (evidenceData || []) as Evidence[];

  // Group evidence by claim ID
  const evidenceByClaimId = new Map<string, RetrievedEvidenceItem[]>();
  for (const row of evidenceRows) {
    const list = evidenceByClaimId.get(row.claim_id) || [];
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
    evidenceByClaimId.set(row.claim_id, list);
  }

  let totalCount = 0;
  const summaries: ClaimEvidenceSummary[] = claims.map((claim) => {
    const items = evidenceByClaimId.get(claim.id) || [];
    totalCount += items.length;
    return {
      claimId: claim.id,
      claimText: claim.claim_text,
      normalizedText: claim.normalized_text,
      category: claim.category,
      factChecksCount: items.length,
      evidenceItems: items,
      status: items.length > 0 ? "evidence_found" : "no_fact_checks_found",
    };
  });

  return NextResponse.json<RetrieveEvidenceApiResponse>({
    success: true,
    submissionId: targetSubmissionId,
    totalClaimsProcessed: claims.length,
    totalEvidenceRetrieved: totalCount,
    claimsEvidence: summaries,
    cached: true,
  });
}
