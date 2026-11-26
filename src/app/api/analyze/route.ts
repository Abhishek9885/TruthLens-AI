import { NextResponse } from "next/server";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { getClientIp, recordAuditLog } from "@/lib/audit";
import { getGeminiModelName } from "@/lib/gemini";
import { analyzeSubmissionContent } from "@/services/claim-extraction.service";
import {
  analyzeRequestSchema,
  type AnalyzeApiResponse,
  type GeminiAnalysisResponse,
} from "@/types/claim-analysis";
import type { Claim, Submission } from "@/types/database";

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

  const parsedInput = analyzeRequestSchema.safeParse(body);
  if (!parsedInput.success) {
    return NextResponse.json(
      {
        error: parsedInput.error.issues[0]?.message ?? "Invalid request input.",
        issues: parsedInput.error.issues,
      },
      { status: 400 }
    );
  }

  const { submissionId, forceReanalyze } = parsedInput.data;

  // Retrieve submission from Supabase
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

  // Server-side authorization check: verify user owns submission or has admin privileges
  if (submission.user_id !== user.id && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to analyze this submission." },
      { status: 403 }
    );
  }

  // Obtain source content from extracted_text, raw_text, or title
  const sourceContent =
    (submission.extracted_text && submission.extracted_text.trim().length > 0
      ? submission.extracted_text.trim()
      : submission.raw_text && submission.raw_text.trim().length > 0
      ? submission.raw_text.trim()
      : "") || "";

  if (!sourceContent) {
    return NextResponse.json(
      {
        error:
          "Submission has no readable text content or OCR extracted text to analyze. Please verify content was extracted.",
      },
      { status: 400 }
    );
  }

  // Check if existing analysis is already present and forceReanalyze was not requested
  const existingAnalysis = submission.metadata?.ai_analysis as
    | GeminiAnalysisResponse
    | undefined;

  if (existingAnalysis && !forceReanalyze) {
    // Return existing cached analysis
    const { data: existingClaims } = await supabase
      .from("claims")
      .select("*")
      .eq("submission_id", submission.id);

    return NextResponse.json<AnalyzeApiResponse>({
      success: true,
      submissionId: submission.id,
      analysis: existingAnalysis,
      savedClaimsCount: existingClaims?.length ?? 0,
      cached: true,
    });
  }

  // Execute Gemini Content Understanding & Claim Extraction
  let analysis: GeminiAnalysisResponse;
  const modelName = getGeminiModelName();

  try {
    analysis = await analyzeSubmissionContent(sourceContent, {
      sourceUrl: submission.source_url,
      submissionType: submission.submission_type,
      title: submission.title,
      model: modelName,
    });
  } catch (genError) {
    const errorMsg =
      genError instanceof Error ? genError.message : "Gemini analysis failed.";

    return NextResponse.json(
      {
        error: errorMsg,
        details: genError instanceof Error ? genError.stack : undefined,
      },
      { status: 502 }
    );
  }

  // Avoid duplicate claims when the same submission is analyzed again:
  // Remove existing claims for this submission first
  await supabase.from("claims").delete().eq("submission_id", submission.id);

  // Prepare claims records
  const claimsToInsert = analysis.claims.map((claim) => ({
    submission_id: submission.id,
    created_by: user.id,
    claim_text: claim.originalText,
    category: claim.category,
    verdict: "unverified" as const,
    confidence_score: null,
    normalized_text: claim.normalizedText,
    is_verifiable: claim.isVerifiable,
    claim_type: claim.claimType,
    entities: claim.entities,
    date: claim.date,
    location: claim.location,
    context: claim.context,
    search_queries: claim.searchQueries,
    metadata: {
      searchQueries: claim.searchQueries,
      entities: claim.entities,
      claimType: claim.claimType,
      isVerifiable: claim.isVerifiable,
      normalizedText: claim.normalizedText,
      extractedAt: new Date().toISOString(),
    },
  }));

  let savedClaimsCount = 0;

  if (claimsToInsert.length > 0) {
    // Attempt insert with extended Day 3 columns
    const { data: insertedClaims, error: claimsInsertError } = await supabase
      .from("claims")
      .insert(claimsToInsert)
      .select("id");

    if (claimsInsertError) {
      // Fallback: If DB schema does not have the new Day 3 columns yet,
      // insert using the standard legacy columns
      const fallbackClaims = claimsToInsert.map((c) => ({
        submission_id: c.submission_id,
        created_by: c.created_by,
        claim_text: c.claim_text,
        category: c.category,
        verdict: "unverified" as const,
        confidence_score: null,
      }));

      const { data: fbClaims } = await supabase
        .from("claims")
        .insert(fallbackClaims)
        .select("id");

      savedClaimsCount = fbClaims?.length ?? 0;
    } else {
      savedClaimsCount = insertedClaims?.length ?? 0;
    }
  }

  // Store analysis report in reports table
  let reportId: string | null = null;
  const { data: insertedReport } = await supabase
    .from("reports")
    .insert({
      submission_id: submission.id,
      author_id: user.id,
      summary: analysis.contentAnalysis.summary,
      methodology: `TruthLens AI Gemini Claim Extraction (${modelName})`,
      overall_verdict: "unverified",
      is_published: false,
    })
    .select("id")
    .maybeSingle();

  if (insertedReport?.id) {
    reportId = insertedReport.id;
  }

  // Update submission metadata with the full AI analysis and assessment summary
  const updatedMetadata = {
    ...(submission.metadata || {}),
    ai_analysis: analysis,
    ai_assessment: {
      verdict: "unverified" as const,
      confidence_score: null,
      summary: analysis.contentAnalysis.summary,
      assessed_at: new Date().toISOString(),
      model: modelName,
      claim_count: analysis.claims.length,
      is_election_related: analysis.contentAnalysis.isElectionRelated,
      analysis_status: analysis.overallAssessment.analysisStatus,
    },
  };

  const nextStatus =
    submission.status === "pending" || submission.status === "extracted"
      ? "in_review"
      : submission.status;

  await supabase
    .from("submissions")
    .update({
      metadata: updatedMetadata,
      status: nextStatus,
    })
    .eq("id", submission.id);

  // Record audit log
  await recordAuditLog({
    supabase,
    actorId: user.id,
    action: "submission.analyzed",
    entityType: "submission",
    entityId: submission.id,
    details: {
      claims_count: analysis.claims.length,
      verifiable_claims_count: analysis.claims.filter((c) => c.isVerifiable)
        .length,
      is_election_related: analysis.contentAnalysis.isElectionRelated,
      analysis_status: analysis.overallAssessment.analysisStatus,
      model: modelName,
      forced_reanalyze: forceReanalyze,
    },
    ipAddress,
  });

  return NextResponse.json<AnalyzeApiResponse>({
    success: true,
    submissionId: submission.id,
    analysis,
    savedClaimsCount,
    reportId,
    cached: false,
  });
}

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
      { error: "Query parameter 'submissionId' is required." },
      { status: 400 }
    );
  }

  const { data: submissionRow, error: fetchError } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError || !submissionRow) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  const submission = submissionRow as Submission;
  if (submission.user_id !== user.id && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to view this analysis." },
      { status: 403 }
    );
  }

  const { data: claims } = await supabase
    .from("claims")
    .select("*")
    .eq("submission_id", submission.id)
    .order("created_at", { ascending: true });

  const aiAnalysis = submission.metadata?.ai_analysis as
    | GeminiAnalysisResponse
    | undefined;

  return NextResponse.json({
    submission,
    analysis: aiAnalysis ?? null,
    claims: (claims ?? []) as Claim[],
  });
}
