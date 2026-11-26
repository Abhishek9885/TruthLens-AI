import { NextResponse } from "next/server";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { getClientIp } from "@/lib/audit";
import {
  getReviewWorkspaceData,
  submitHumanReviewDecision,
} from "@/services/review.service";
import { submitReviewDecisionSchema } from "@/types/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/reviews/[id]
 * Retrieves complete review workspace data for submission [id].
 * Accessible by admins and the submission owner.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Submission ID is required." },
      { status: 400 }
    );
  }

  const { supabase, user, profile } = auth;
  const isAdmin = isAdminRole(profile.role);

  try {
    const data = await getReviewWorkspaceData({
      supabase,
      submissionId: id,
      reviewerId: user.id,
      isAdmin,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load review data.";
    const status = message.includes("Forbidden") ? 403 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/reviews/[id]
 * Submits an editorial decision on submission [id].
 * Strictly restricted to administrators.
 */
export async function POST(request: Request, { params }: RouteParams) {
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
      { error: "Forbidden: Administrator privileges required to submit reviews." },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Submission ID is required." },
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

  const parseResult = submitReviewDecisionSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parseResult.error.issues,
      },
      { status: 400 }
    );
  }

  const ipAddress = getClientIp(request);

  try {
    const result = await submitHumanReviewDecision({
      supabase,
      submissionId: id,
      reviewerId: user.id,
      input: parseResult.data,
      ipAddress,
    });

    return NextResponse.json({
      message: `Report successfully ${parseResult.data.decision}.`,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review submission failed.";
    const status = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
