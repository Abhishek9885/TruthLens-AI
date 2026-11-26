import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminDashboardData,
  AdminOverviewStats,
  RecentActivityItem,
  ReviewQueueItem,
  VerdictDistributionStats,
} from "@/types/review";
import type { Claim, Profile, Report, Review, Submission } from "@/types/database";
import type { VerificationVerdict } from "@/types/verification";

export interface AdminFilterOptions {
  search?: string;
  type?: "url" | "text" | "image" | "all";
  status?: string;
  verdict?: string;
  dateRange?: "today" | "7days" | "30days" | "all";
}

/**
 * Aggregates real platform statistics, verdict distributions, review queue,
 * and chronological activity stream for the TruthLens Admin Dashboard.
 */
export async function getAdminDashboardAnalytics(
  supabase: SupabaseClient,
  filters: AdminFilterOptions = {}
): Promise<AdminDashboardData> {
  // 1. Fetch total user count from profiles
  const { count: totalUsersCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  // 2. Fetch submissions
  let subQuery = supabase
    .from("submissions")
    .select("id, user_id, submission_type, status, title, source_url, created_at, updated_at, metadata")
    .order("created_at", { ascending: false });

  if (filters.type && filters.type !== "all") {
    subQuery = subQuery.eq("submission_type", filters.type);
  }
  if (filters.status && filters.status !== "all") {
    subQuery = subQuery.eq("status", filters.status);
  }
  if (filters.dateRange && filters.dateRange !== "all") {
    const now = new Date();
    const pastDate = new Date();
    if (filters.dateRange === "today") pastDate.setHours(0, 0, 0, 0);
    else if (filters.dateRange === "7days") pastDate.setDate(now.getDate() - 7);
    else if (filters.dateRange === "30days") pastDate.setDate(now.getDate() - 30);
    subQuery = subQuery.gte("created_at", pastDate.toISOString());
  }

  const { data: subRows, error: subErr } = await subQuery;
  if (subErr) {
    console.error("[AdminAnalytics] Failed to fetch submissions:", subErr.message);
  }
  const submissions = (subRows || []) as Submission[];

  // 3. Compute Overview Statistics
  const stats: AdminOverviewStats = {
    totalSubmissions: submissions.length,
    pendingSubmissions: submissions.filter((s) => s.status === "pending").length,
    processingSubmissions: submissions.filter((s) =>
      ["extracted", "in_review", "under_review"].includes(s.status)
    ).length,
    completedSubmissions: submissions.filter((s) => s.status === "completed").length,
    awaitingHumanReview: submissions.filter((s) =>
      ["in_review", "pending_review", "under_review", "needs_evidence"].includes(s.status)
    ).length,
    approvedReports: submissions.filter((s) => s.status === "approved").length,
    rejectedReports: submissions.filter((s) => s.status === "rejected").length,
    flaggedReports: submissions.filter((s) => s.status === "flagged").length,
    totalRegisteredUsers: totalUsersCount || 0,
  };

  // 4. Fetch Claims for Verdict Distributions & Counts
  const { data: claimsRows } = await supabase
    .from("claims")
    .select("id, submission_id, verdict, ai_verdict, human_verdict");
  const claims = (claimsRows || []) as Claim[];

  // 5. Fetch Reports
  const { data: reportsRows } = await supabase
    .from("reports")
    .select("id, submission_id, overall_verdict, final_human_verdict, human_review_status");
  const reports = (reportsRows || []) as Report[];

  // 6. Fetch Evidence count
  const { data: evidenceRows } = await supabase
    .from("evidence")
    .select("id, claim_id");
  const evidenceList = evidenceRows || [];

  // Group evidence by claim ID
  const claimEvidenceCount = new Map<string, number>();
  for (const ev of evidenceList) {
    claimEvidenceCount.set(ev.claim_id, (claimEvidenceCount.get(ev.claim_id) || 0) + 1);
  }

  // Group claims by submission ID
  const subClaimsMap = new Map<string, Claim[]>();
  for (const c of claims) {
    const list = subClaimsMap.get(c.submission_id) || [];
    list.push(c);
    subClaimsMap.set(c.submission_id, list);
  }

  // Group reports by submission ID
  const subReportsMap = new Map<string, Report>();
  for (const rep of reports) {
    subReportsMap.set(rep.submission_id, rep);
  }

  // 7. Compute Verdict Distributions
  const aiDistribution: VerdictDistributionStats = {
    verified: 0,
    false: 0,
    misleading: 0,
    partially_true: 0,
    unverified: 0,
  };

  for (const c of claims) {
    const rawVerdict = (c.ai_verdict || c.verdict || "unverified").toLowerCase();
    if (rawVerdict === "verified" || rawVerdict === "verified_true") {
      aiDistribution.verified++;
    } else if (rawVerdict === "false") {
      aiDistribution.false++;
    } else if (rawVerdict === "misleading") {
      aiDistribution.misleading++;
    } else if (rawVerdict === "partially_true") {
      aiDistribution.partially_true++;
    } else {
      aiDistribution.unverified++;
    }
  }

  const humanDistribution: VerdictDistributionStats = {
    verified: 0,
    false: 0,
    misleading: 0,
    partially_true: 0,
    unverified: 0,
  };

  for (const rep of reports) {
    if (rep.final_human_verdict) {
      const v = rep.final_human_verdict.toLowerCase();
      if (v === "verified" || v === "verified_true") humanDistribution.verified++;
      else if (v === "false") humanDistribution.false++;
      else if (v === "misleading") humanDistribution.misleading++;
      else if (v === "partially_true") humanDistribution.partially_true++;
      else humanDistribution.unverified++;
    }
  }

  // 8. Fetch Submitter Emails for Review Queue
  const userIds = Array.from(new Set(submissions.map((s) => s.user_id)));
  const userEmailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profRows } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);
    for (const p of (profRows || []) as Profile[]) {
      userEmailMap.set(p.id, p.full_name || p.email);
    }
  }

  // 9. Build Review Queue
  const reviewQueue: ReviewQueueItem[] = [];

  for (const sub of submissions) {
    const relatedClaims = subClaimsMap.get(sub.id) || [];
    const relatedReport = subReportsMap.get(sub.id);

    // Sum evidence across all claims of this submission
    let totalEvidence = 0;
    for (const c of relatedClaims) {
      totalEvidence += claimEvidenceCount.get(c.id) || 0;
    }

    // Determine representative AI verdict
    let repAiVerdict: VerificationVerdict = "unverified";
    const firstClaimAi = relatedClaims.find((c) => c.ai_verdict)?.ai_verdict;
    if (firstClaimAi) {
      repAiVerdict = firstClaimAi as VerificationVerdict;
    } else if (relatedReport?.overall_verdict === "verified_true") {
      repAiVerdict = "verified";
    } else if (relatedReport?.overall_verdict) {
      repAiVerdict = relatedReport.overall_verdict as VerificationVerdict;
    }

    const firstClaimConf =
      relatedClaims.find((c) => typeof c.ai_confidence === "number")?.ai_confidence ??
      (typeof relatedClaims[0]?.confidence_score === "number"
        ? Number(relatedClaims[0].confidence_score)
        : 70);

    // Determine human review status
    let reviewStatus: ReviewQueueItem["humanReviewStatus"] = "pending_review";
    if (["approved", "flagged", "needs_evidence", "rejected"].includes(sub.status)) {
      reviewStatus = sub.status as ReviewQueueItem["humanReviewStatus"];
    } else if (sub.status === "under_review") {
      reviewStatus = "under_review";
    } else if (sub.status === "in_review" || relatedReport) {
      reviewStatus = "pending_review";
    }

    const title = sub.title || sub.source_url || `Submission ${sub.id.slice(0, 8)}`;

    // Apply Search Filter if requested
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchesTitle = title.toLowerCase().includes(q);
      const matchesUrl = (sub.source_url || "").toLowerCase().includes(q);
      const matchesClaim = relatedClaims.some((c) => c.claim_text.toLowerCase().includes(q));
      if (!matchesTitle && !matchesUrl && !matchesClaim) {
        continue;
      }
    }

    // Apply Verdict Filter if requested
    if (filters.verdict && filters.verdict !== "all") {
      if (repAiVerdict !== filters.verdict && relatedReport?.final_human_verdict !== filters.verdict) {
        continue;
      }
    }

    reviewQueue.push({
      id: sub.id,
      submissionId: sub.id,
      title,
      submissionType: sub.submission_type,
      submittedAt: sub.created_at,
      submitterEmail: userEmailMap.get(sub.user_id) || "Anonymous Submitter",
      claimsCount: relatedClaims.length,
      aiVerdict: repAiVerdict,
      aiConfidence: firstClaimConf,
      evidenceCount: totalEvidence,
      humanReviewStatus: reviewStatus,
      finalHumanVerdict: relatedReport?.final_human_verdict || null,
      reviewerName: null,
    });
  }

  // 10. Fetch Recent Activity Stream (Recent Submissions, Reviews, Audit Logs)
  const recentActivity: RecentActivityItem[] = [];

  // Recent 5 Submissions
  for (const s of submissions.slice(0, 5)) {
    recentActivity.push({
      id: `sub-${s.id}`,
      type: "submission",
      title: "New Content Submitted",
      description: s.title || s.source_url || `Type: ${s.submission_type}`,
      actor: userEmailMap.get(s.user_id) || "User",
      timestamp: s.created_at,
      status: s.status,
      link: `/admin/review/${s.id}`,
    });
  }

  // Recent 5 Reviews
  const { data: recentRevRows } = await supabase
    .from("reviews")
    .select("id, submission_id, reviewer_id, decision, final_verdict, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  for (const rev of (recentRevRows || []) as Review[]) {
    recentActivity.push({
      id: `rev-${rev.id}`,
      type: "human_review",
      title: `Report ${rev.decision.toUpperCase()}`,
      description: rev.notes ? (rev.notes.length > 80 ? rev.notes.slice(0, 77) + "..." : rev.notes) : `Verdict: ${rev.final_verdict || "Unchanged"}`,
      actor: userEmailMap.get(rev.reviewer_id) || "Admin Reviewer",
      timestamp: rev.created_at,
      status: rev.decision,
      link: `/admin/review/${rev.submission_id}`,
    });
  }

  // Sort combined activity stream chronologically
  recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    stats,
    aiVerdictDistribution: aiDistribution,
    humanVerdictDistribution: humanDistribution,
    reviewQueue,
    recentActivity: recentActivity.slice(0, 10),
  };
}
