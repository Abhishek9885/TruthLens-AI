"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Scale,
  Clock,
  FilePlus2,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Info,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Submission } from "@/types/database";
import type { Profile } from "@/types/database";

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        // 1. Fetch current profile
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          if (!ignore && meData?.profile) {
            setProfile(meData.profile);
          }
        }

        // 2. Fetch user's own submissions (scoped strictly to auth.uid() by server)
        const res = await fetch("/api/submissions");
        const json = await res.json();
        if (!ignore) {
          if (!res.ok) {
            throw new Error(json.error || "Failed to load submissions.");
          }
          setSubmissions(json.submissions || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [refreshIndex]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshIndex((prev) => prev + 1);
  };

  // Compute User Statistics from actual submissions
  const totalSubmissions = submissions.length;
  const verifiedCount = submissions.filter((s) => {
    const meta = s.metadata as Record<string, unknown> | undefined;
    const aiVerdict = (meta?.ai_assessment as { verdict?: string } | undefined)?.verdict;
    return s.status === "approved" || aiVerdict === "verified_true" || aiVerdict === "verified";
  }).length;

  const falseCount = submissions.filter((s) => {
    const meta = s.metadata as Record<string, unknown> | undefined;
    const aiVerdict = (meta?.ai_assessment as { verdict?: string } | undefined)?.verdict;
    return s.status === "rejected" || aiVerdict === "false";
  }).length;

  const pendingReviewCount = submissions.filter((s) =>
    ["pending", "extracted", "in_review", "under_review", "pending_review", "needs_evidence"].includes(s.status)
  ).length;

  const getVerdictBadge = (verdict?: string | null) => {
    switch (verdict?.toLowerCase()) {
      case "verified":
      case "verified_true":
        return (
          <Badge className="bg-success/15 text-success border-success/30 font-medium text-[11px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        );
      case "false":
        return (
          <Badge className="bg-danger/15 text-danger border-danger/30 font-medium text-[11px]">
            <XCircle className="h-3 w-3 mr-1" />
            False
          </Badge>
        );
      case "misleading":
        return (
          <Badge className="bg-warning/15 text-warning border-warning/30 font-medium text-[11px]">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Misleading
          </Badge>
        );
      case "partially_true":
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 font-medium text-[11px]">
            <Scale className="h-3 w-3 mr-1" />
            Partially True
          </Badge>
        );
      case "unverified":
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border font-medium text-[11px]">
            <Info className="h-3 w-3 mr-1" />
            Unverified
          </Badge>
        );
    }
  };

  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-success/15 text-success border-success/30 font-semibold text-[11px]">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Certified Approved
          </Badge>
        );
      case "flagged":
        return (
          <Badge className="bg-warning/15 text-warning border-warning/30 font-semibold text-[11px]">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Flagged for Escalation
          </Badge>
        );
      case "needs_evidence":
        return (
          <Badge className="bg-blue-accent/15 text-blue-accent border-blue-accent/30 font-semibold text-[11px]">
            <Search className="h-3 w-3 mr-1" />
            Needs Additional Evidence
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-danger/15 text-danger border-danger/30 font-semibold text-[11px]">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected by Reviewer
          </Badge>
        );
      case "under_review":
        return (
          <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-semibold text-[11px]">
            <Clock className="h-3 w-3 mr-1 animate-pulse" />
            Under Editorial Review
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-success/15 text-success border-success/30 font-semibold text-[11px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Analysis Completed
          </Badge>
        );
      case "in_review":
      case "pending_review":
      default:
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold text-[11px]">
            <Clock className="h-3 w-3 mr-1" />
            Pending Human Review
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Personal Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your election content submissions, preliminary AI syntheses, and certified review outcomes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={handleRefresh}
            className="gap-1.5 text-xs border-border/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-accent" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Link href="/dashboard/submit">
            <Button size="sm" className="gap-2 bg-blue-accent hover:bg-blue-accent/90 text-navy-950 font-semibold">
              <FilePlus2 className="h-4 w-4" />
              <span>Submit Content</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Admin Notice Callout (if logged in as admin) */}
      {profile?.role === "admin" && (
        <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-purple-400 shrink-0" />
            <div>
              <p className="font-semibold text-purple-200 text-sm">Administrator Privileges Active</p>
              <p className="text-xs text-purple-300/80">
                You have access to the system-wide Review Queue, Editorial Adjudication Console, and Platform Analytics.
              </p>
            </div>
          </div>
          <Link href="/admin">
            <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shrink-0">
              <span>Open Admin Console</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="My Submissions"
          value={String(totalSubmissions)}
          change="Real-time"
          trend="up"
          icon={Search}
        />
        <StatsCard
          title="Verified Claims"
          value={String(verifiedCount)}
          change="Corroborated"
          trend="up"
          icon={CheckCircle2}
        />
        <StatsCard
          title="Flagged / False"
          value={String(falseCount)}
          change="Refuted"
          trend="down"
          icon={AlertTriangle}
        />
        <StatsCard
          title="Awaiting Review"
          value={String(pendingReviewCount)}
          change="In Queue"
          trend="up"
          icon={Clock}
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger flex items-start gap-3">
          <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Dashboard Error</p>
            <p className="text-danger/90">{error}</p>
          </div>
        </div>
      )}

      {/* Submissions & Verification Lifecycle List */}
      <DashboardCard
        title="My Verification Reports"
        description="Chronological record of submitted election content, algorithmic assessments, and certified human decisions"
        icon={ShieldCheck}
      >
        {loading && submissions.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-accent mx-auto" />
            <p className="text-xs text-muted-foreground">Loading your verification records…</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Info className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-semibold text-foreground">No Submissions Yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Submit news article URLs, political speeches, or social media screenshots to extract claims and verify election facts.
            </p>
            <Link href="/dashboard/submit" className="inline-block pt-2">
              <Button size="sm" className="gap-2 bg-blue-accent text-navy-950 font-semibold text-xs">
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>Submit Your First Claim</span>
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const meta = sub.metadata as Record<string, unknown> | undefined;
              const aiAssessment = meta?.ai_assessment as
                | { verdict?: string; confidence_score?: number; summary?: string }
                | undefined;

              return (
                <div
                  key={sub.id}
                  className="rounded-lg border border-border/50 bg-navy-900/60 hover:border-border/80 p-4 transition-colors space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono border-blue-accent/30 text-blue-glow">
                          {sub.submission_type}
                        </Badge>
                        {getReviewStatusBadge(sub.status)}
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(sub.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
                        {sub.title || sub.source_url || "Untitled Content"}
                      </h3>

                      {sub.source_url && (
                        <p className="text-xs text-muted-foreground truncate">
                          Source: {sub.source_url}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/30">
                      <div className="text-left sm:text-right space-y-1 text-xs">
                        <div className="flex items-center sm:justify-end gap-1.5">
                          <span className="text-muted-foreground text-[11px]">AI Verdict:</span>
                          {getVerdictBadge(aiAssessment?.verdict)}
                        </div>
                        {typeof aiAssessment?.confidence_score === "number" && (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Confidence: <strong className="text-foreground">{aiAssessment.confidence_score}%</strong>
                          </p>
                        )}
                      </div>

                      <Link href={`/analyze/${sub.id}`}>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-border/60 hover:border-blue-accent/60">
                          <span>View Report</span>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Clarification banner distinguishing AI vs Human certification */}
                  <div className="pt-2 border-t border-border/30 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Info className="h-3 w-3 text-blue-accent shrink-0" />
                      <span>
                        {sub.status === "approved"
                          ? "Certified by human editorial reviewer."
                          : "AI-generated preliminary assessment. Human review in progress."}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ID: {sub.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
