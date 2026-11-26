"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Scale,
  Clock,
  RefreshCw,
  ArrowRight,
  Eye,
  HelpCircle,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AdminDashboardData, ReviewQueueItem } from "@/types/review";

export default function AdminDashboardPage() {
  const router = useRouter();

  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) {
          router.push("/login?redirect=/admin");
          return;
        }
        const meData = await meRes.json();
        if (!meData.profile || meData.profile.role !== "admin") {
          if (!ignore) {
            setError("Forbidden: Access restricted to authorized platform administrators.");
            setLoading(false);
          }
          return;
        }

        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set("search", searchQuery.trim());
        if (typeFilter !== "all") params.set("type", typeFilter);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (verdictFilter !== "all") params.set("verdict", verdictFilter);
        if (dateRange !== "all") params.set("dateRange", dateRange);

        const res = await fetch(`/api/admin/analytics?${params.toString()}`);
        const json = await res.json();
        if (!ignore) {
          if (!res.ok) {
            throw new Error(json.error || "Failed to load admin analytics.");
          }
          setData(json.data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "An unexpected error occurred.");
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
  }, [router, searchQuery, typeFilter, statusFilter, verdictFilter, dateRange, refreshIndex]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshIndex((prev) => prev + 1);
  };

  const getVerdictBadge = (verdict: string) => {
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
            <HelpCircle className="h-3 w-3 mr-1" />
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
            Approved
          </Badge>
        );
      case "flagged":
        return (
          <Badge className="bg-warning/15 text-warning border-warning/30 font-semibold text-[11px]">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Flagged
          </Badge>
        );
      case "needs_evidence":
        return (
          <Badge className="bg-blue-accent/15 text-blue-accent border-blue-accent/30 font-semibold text-[11px]">
            <Search className="h-3 w-3 mr-1" />
            Needs Evidence
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-danger/15 text-danger border-danger/30 font-semibold text-[11px]">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      case "under_review":
        return (
          <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-semibold text-[11px]">
            <Eye className="h-3 w-3 mr-1 animate-pulse" />
            Under Review
          </Badge>
        );
      case "pending_review":
      default:
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold text-[11px]">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 h-16 border-b border-border/50 bg-navy-950/80 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-accent" />
            <span className="font-bold tracking-tight text-base sm:text-lg">
              TruthLens<span className="text-blue-accent"> AI</span>
            </span>
          </Link>
          <Separator orientation="vertical" className="h-5 bg-border/50 hidden sm:block" />
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs font-mono">
              Admin Workspace
            </Badge>
            <span className="text-xs text-muted-foreground hidden md:inline">
              · Editorial &amp; Verification Governance
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={handleRefresh}
            className="gap-2 border-border/60 hover:border-blue-accent/60 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-accent" : ""}`} />
            <span className="hidden sm:inline">Refresh Analytics</span>
          </Button>

          <Link href="/dashboard">
            <Button size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-foreground">
              User Dashboard
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Permission Denied Banner */}
        {error && error.includes("Forbidden") && (
          <Card className="border-danger/40 bg-danger/10 p-8 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 text-danger mx-auto" />
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-danger">Access Restricted</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                This administrative console is reserved strictly for designated truth verification moderators and system administrators.
              </p>
            </div>
            <Link href="/dashboard">
              <Button size="sm" className="bg-navy-800 hover:bg-navy-700 text-foreground">
                Return to Personal Dashboard
              </Button>
            </Link>
          </Card>
        )}

        {/* Generic Error Notice */}
        {error && !error.includes("Forbidden") && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger flex items-start gap-3">
            <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Dashboard Notice</p>
              <p className="text-danger/90 text-xs">{error}</p>
            </div>
          </div>
        )}

        {/* Dashboard Loaded State */}
        {data && !error && (
          <>
            {/* Top Stat Overview Bar */}
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>Verification Oversight &amp; Analytics</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Real-time election intelligence, human review queues, and multi-source credibility tracking.
              </p>
            </div>

            {/* 1. Overview Statistics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className="rounded-lg border border-border/60 bg-navy-900/70 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-mono">
                  Submissions
                </span>
                <span className="text-2xl font-bold text-foreground">{data.stats.totalSubmissions}</span>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 block font-mono">
                  Pending AI
                </span>
                <span className="text-2xl font-bold text-amber-400">{data.stats.pendingSubmissions}</span>
              </div>

              <div className="rounded-lg border border-blue-accent/30 bg-blue-accent/5 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-blue-accent block font-mono">
                  Processing
                </span>
                <span className="text-2xl font-bold text-blue-accent">{data.stats.processingSubmissions}</span>
              </div>

              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-cyan-400 block font-mono">
                  Review Queue
                </span>
                <span className="text-2xl font-bold text-cyan-400">{data.stats.awaitingHumanReview}</span>
              </div>

              <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-success block font-mono">
                  Approved
                </span>
                <span className="text-2xl font-bold text-success">{data.stats.approvedReports}</span>
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-warning block font-mono">
                  Flagged
                </span>
                <span className="text-2xl font-bold text-warning">{data.stats.flaggedReports}</span>
              </div>

              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-danger block font-mono">
                  Rejected
                </span>
                <span className="text-2xl font-bold text-danger">{data.stats.rejectedReports}</span>
              </div>

              <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-purple-300 block font-mono">
                  Active Users
                </span>
                <span className="text-2xl font-bold text-purple-300">{data.stats.totalRegisteredUsers}</span>
              </div>
            </div>

            {/* 2. Verdict Distribution & Comparative Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* AI Preliminary Verdicts */}
              <Card className="bg-navy-900/70 border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-accent" />
                      <span>AI Preliminary Verdict Distribution</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Algorithmic
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Grounded syntheses generated by Gemini 2.5 Flash from evidence catalog.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-xs">
                    {/* Verified */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-success font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Verified True
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.aiVerdictDistribution.verified}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-success"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.aiVerdictDistribution.verified /
                                Math.max(1, data.stats.totalSubmissions)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* False */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-danger font-medium flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> False / Fabricated
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.aiVerdictDistribution.false}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-danger"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.aiVerdictDistribution.false /
                                Math.max(1, data.stats.totalSubmissions)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Misleading */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-warning font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Misleading / Out of Context
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.aiVerdictDistribution.misleading}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-warning"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.aiVerdictDistribution.misleading /
                                Math.max(1, data.stats.totalSubmissions)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Partially True */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-amber-400 font-medium flex items-center gap-1">
                          <Scale className="h-3 w-3" /> Partially True / Disputed
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.aiVerdictDistribution.partially_true}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-amber-500"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.aiVerdictDistribution.partially_true /
                                Math.max(1, data.stats.totalSubmissions)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Unverified */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-muted-foreground font-medium flex items-center gap-1">
                          <HelpCircle className="h-3 w-3" /> Unverified / Evidence Deficient
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.aiVerdictDistribution.unverified}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-muted-foreground"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.aiVerdictDistribution.unverified /
                                Math.max(1, data.stats.totalSubmissions)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Human-Certified Verdicts */}
              <Card className="bg-navy-900/70 border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span>Certified Human Verdicts</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400">
                      Editorial Review
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Final certified determinations approved by verified human moderators.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-xs">
                    {/* Verified */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-success font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Certified Verified
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.humanVerdictDistribution.verified}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-success"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.humanVerdictDistribution.verified /
                                Math.max(1, data.stats.approvedReports + data.stats.rejectedReports)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* False */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-danger font-medium flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Certified False
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.humanVerdictDistribution.false}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-danger"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.humanVerdictDistribution.false /
                                Math.max(1, data.stats.approvedReports + data.stats.rejectedReports)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Misleading */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-warning font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Certified Misleading
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.humanVerdictDistribution.misleading}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-warning"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.humanVerdictDistribution.misleading /
                                Math.max(1, data.stats.approvedReports + data.stats.rejectedReports)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Partially True */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-amber-400 font-medium flex items-center gap-1">
                          <Scale className="h-3 w-3" /> Certified Partially True
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.humanVerdictDistribution.partially_true}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-amber-500"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.humanVerdictDistribution.partially_true /
                                Math.max(1, data.stats.approvedReports + data.stats.rejectedReports)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Unverified */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span className="text-muted-foreground font-medium flex items-center gap-1">
                          <HelpCircle className="h-3 w-3" /> Concluded Unverified
                        </span>
                        <span className="font-mono text-foreground font-semibold">
                          {data.humanVerdictDistribution.unverified}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-navy-950 overflow-hidden border border-border/40">
                        <div
                          className="h-full bg-muted-foreground"
                          style={{
                            width: `${Math.min(
                              100,
                              (data.humanVerdictDistribution.unverified /
                                Math.max(1, data.stats.approvedReports + data.stats.rejectedReports)) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 3. Review Queue Section with Multi-Filter Search Bar */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <span>Editorial Review Queue</span>
                    <Badge className="bg-blue-accent/20 text-blue-accent border-blue-accent/30 text-xs">
                      {data.reviewQueue.length} In Queue
                    </Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Inspect evidence, evaluate AI reasoning models, adjudicate final verdicts, and record audit trails.
                  </p>
                </div>
              </div>

              {/* Filter Controls Card */}
              <Card className="bg-navy-900/60 border-border/60 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                  {/* Search Bar */}
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search title, URL, or claim text…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-navy-950 border-border/60 h-9 text-xs"
                    />
                  </div>

                  {/* Submission Type Filter */}
                  <div>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      aria-label="Filter by Submission Type"
                      className="w-full h-9 bg-navy-950 border border-border/60 rounded-md px-3 text-xs text-foreground focus:outline-none focus:border-blue-accent"
                    >
                      <option value="all">All Submission Types</option>
                      <option value="url">URL (News Articles)</option>
                      <option value="text">Text (Statements)</option>
                      <option value="image">Image (Screenshots/OCR)</option>
                    </select>
                  </div>

                  {/* Verdict Filter */}
                  <div>
                    <select
                      value={verdictFilter}
                      onChange={(e) => setVerdictFilter(e.target.value)}
                      aria-label="Filter by Verdict"
                      className="w-full h-9 bg-navy-950 border border-border/60 rounded-md px-3 text-xs text-foreground focus:outline-none focus:border-blue-accent"
                    >
                      <option value="all">All Verdicts</option>
                      <option value="verified">Verified</option>
                      <option value="false">False</option>
                      <option value="misleading">Misleading</option>
                      <option value="partially_true">Partially True</option>
                      <option value="unverified">Unverified</option>
                    </select>
                  </div>

                  {/* Review Status Filter */}
                  <div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      aria-label="Filter by Review Status"
                      className="w-full h-9 bg-navy-950 border border-border/60 rounded-md px-3 text-xs text-foreground focus:outline-none focus:border-blue-accent"
                    >
                      <option value="all">All Review Statuses</option>
                      <option value="in_review">Pending Review</option>
                      <option value="under_review">Under Review</option>
                      <option value="approved">Approved</option>
                      <option value="flagged">Flagged</option>
                      <option value="needs_evidence">Needs Evidence</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  {/* Date Range Filter */}
                  <div>
                    <select
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value)}
                      aria-label="Filter by Date Range"
                      className="w-full h-9 bg-navy-950 border border-border/60 rounded-md px-3 text-xs text-foreground focus:outline-none focus:border-blue-accent"
                    >
                      <option value="all">All Dates</option>
                      <option value="today">Today</option>
                      <option value="7days">Past 7 Days</option>
                      <option value="30days">Past 30 Days</option>
                    </select>
                  </div>
                </div>
              </Card>

              {/* Review Queue Items */}
              {data.reviewQueue.length === 0 ? (
                <Card className="bg-navy-900/40 border-border/40 p-12 text-center space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
                  <p className="text-sm font-semibold text-foreground">Review Queue Empty</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    No submissions currently match the specified search or filter criteria.
                  </p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {data.reviewQueue.map((item: ReviewQueueItem) => (
                    <Card
                      key={item.id}
                      className="bg-navy-900/70 border-border/60 hover:border-border/90 transition-all p-4 space-y-3"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* Left Info: Type, Title, Submitter */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] uppercase font-mono border-blue-accent/30 text-blue-glow">
                              {item.submissionType}
                            </Badge>
                            {getReviewStatusBadge(item.humanReviewStatus)}
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(item.submittedAt).toLocaleString()}
                            </span>
                          </div>

                          <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
                            {item.title}
                          </h3>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>Submitter: <strong className="text-foreground/80">{item.submitterEmail}</strong></span>
                            <span>•</span>
                            <span>Claims: <strong className="text-blue-accent">{item.claimsCount}</strong></span>
                            <span>•</span>
                            <span>Evidence Sources: <strong className="text-foreground/80">{item.evidenceCount}</strong></span>
                          </div>
                        </div>

                        {/* Right: AI Preliminary Verdict & Review Action Button */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/30">
                          <div className="text-left sm:text-right space-y-1">
                            <div className="flex items-center sm:justify-end gap-1.5">
                              <span className="text-[11px] text-muted-foreground">AI Verdict:</span>
                              {getVerdictBadge(item.aiVerdict)}
                            </div>
                            <div className="flex items-center sm:justify-end gap-1 text-[11px] text-muted-foreground">
                              <span>Confidence:</span>
                              <span className="font-mono text-foreground font-semibold">
                                {item.aiConfidence}%
                              </span>
                            </div>
                          </div>

                          <Link href={`/admin/review/${item.submissionId}`}>
                            <Button
                              size="sm"
                              className="gap-1.5 bg-blue-accent hover:bg-blue-accent/90 text-navy-950 font-semibold text-xs"
                            >
                              <span>Open Review</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Recent Platform Audit Activity */}
            <Card className="bg-navy-900/70 border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-accent" />
                  <span>Recent Editorial &amp; Administrative Activity</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Chronological event log tracking submissions, automated assessments, and moderator adjudications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentActivity.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-3 text-center">
                    No recent activity recorded.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.recentActivity.map((act) => (
                      <div
                        key={act.id}
                        className="p-3 rounded-lg bg-navy-950/60 border border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{act.title}</span>
                            {act.status && (
                              <Badge variant="outline" className="text-[10px] uppercase font-mono py-0">
                                {act.status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground text-[11px]">{act.description}</p>
                        </div>

                        <div className="flex items-center gap-3 text-muted-foreground text-[11px] shrink-0">
                          <span>By: <strong className="text-foreground/80">{act.actor}</strong></span>
                          <span>•</span>
                          <span>{new Date(act.timestamp).toLocaleTimeString()}</span>
                          {act.link && (
                            <Link href={act.link} className="text-blue-accent hover:underline flex items-center gap-0.5">
                              <span>Inspect</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
