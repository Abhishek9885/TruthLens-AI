import { NextResponse } from "next/server";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { enrichSubmissions } from "@/lib/submissions/enrich";
import type { Submission } from "@/types/database";

/**
 * GET /api/admin/submissions
 * Search, filter, and paginate submissions across the entire system.
 * Restricted strictly to administrators.
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { supabase, profile } = auth;
  if (!isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privileges required." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  let query = supabase
    .from("submissions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (type && type !== "all") {
    query = query.eq("submission_type", type);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,source_url.ilike.%${search}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch admin submissions.", details: error.message },
      { status: 500 }
    );
  }

  const submissions = (data || []) as Submission[];
  const enriched = await enrichSubmissions(supabase, submissions);

  return NextResponse.json({
    success: true,
    total: count || 0,
    submissions: enriched,
  });
}
