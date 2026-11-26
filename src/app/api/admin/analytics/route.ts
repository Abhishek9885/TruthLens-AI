import { NextResponse } from "next/server";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { getAdminDashboardAnalytics } from "@/services/admin-analytics.service";

/**
 * GET /api/admin/analytics
 * Returns aggregated platform metrics, verdict distributions, review queue,
 * and recent audit activity. Restricted strictly to administrators.
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
      { error: "Forbidden: Administrator privileges required to access analytics." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const type = (searchParams.get("type") as "url" | "text" | "image" | "all") || undefined;
  const status = searchParams.get("status") || undefined;
  const verdict = searchParams.get("verdict") || undefined;
  const dateRange = (searchParams.get("dateRange") as "today" | "7days" | "30days" | "all") || undefined;

  try {
    const data = await getAdminDashboardAnalytics(supabase, {
      search,
      type,
      status,
      verdict,
      dateRange,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load admin analytics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
