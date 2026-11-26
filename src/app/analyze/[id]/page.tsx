"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Calendar,
  MapPin,
  Tag,
  Users,
  ExternalLink,
  RefreshCw,
  FileText,
  Shield,
  Copy,
  Check,
  Globe,
  Radio,
  BookOpen,
  Info,
  ChevronDown,
  ChevronUp,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { GeminiAnalysisResponse, ExtractedClaim } from "@/types/claim-analysis";
import type { Submission } from "@/types/database";
import type {
  RetrieveEvidenceApiResponse,
  EvidenceType,
} from "@/types/evidence";

interface PageProps {
  params: Promise<{ id: string }>;
}

function AnalyzeContent({ params }: PageProps) {
  const { id } = use(params);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [analysis, setAnalysis] = useState<GeminiAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Day 4: Evidence Discovery & Retrieval state
  const [evidenceData, setEvidenceData] = useState<RetrieveEvidenceApiResponse | null>(null);
  const [retrievingEvidence, setRetrievingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});

  const handleTriggerAnalysis = async () => {
    setAnalyzing(true);
    setError(null);

    try {
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: id, forceReanalyze: true }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || "Analysis failed.");
      }
      setAnalysis(analyzeData.analysis);

      // Refresh submission metadata
      const res = await fetch(`/api/analyze?submissionId=${id}`);
      const data = await res.json();
      if (res.ok && data.submission) {
        setSubmission(data.submission);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDiscoverEvidence = async (forceRefresh = false) => {
    setRetrievingEvidence(true);
    setEvidenceError(null);
    try {
      const res = await fetch("/api/evidence/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: id, forceRefresh }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to retrieve fact-check evidence.");
      }
      setEvidenceData(data);
    } catch (err) {
      setEvidenceError(
        err instanceof Error ? err.message : "Evidence retrieval failed."
      );
    } finally {
      setRetrievingEvidence(false);
    }
  };

  useEffect(() => {
    let ignore = false;

    async function fetchSubmissionData() {
      try {
        const res = await fetch(`/api/analyze?submissionId=${id}`);
        const data = await res.json();
        if (ignore) return;

        if (!res.ok) {
          throw new Error(data.error || "Failed to load submission data.");
        }

        setSubmission(data.submission);
        if (data.analysis) {
          setAnalysis(data.analysis);
        }

        // Fetch saved evidence if already retrieved
        try {
          const evRes = await fetch(`/api/evidence/retrieve?submissionId=${id}`);
          const evData = await evRes.json();
          if (!ignore && evRes.ok && evData.success) {
            setEvidenceData(evData);
          }
        } catch {
          // ignore background evidence fetch error
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "An unexpected error occurred."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchSubmissionData();

    return () => {
      ignore = true;
    };
  }, [id]);

  const copyQuery = (query: string) => {
    navigator.clipboard.writeText(query);
    setCopiedQuery(query);
    setTimeout(() => setCopiedQuery(null), 2000);
  };

  const getClaimTypeBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case "verifiable factual claim":
        return (
          <Badge className="bg-success/10 text-success border-success/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Factual Claim
          </Badge>
        );
      case "opinion":
        return (
          <Badge className="bg-blue-accent/10 text-blue-accent border-blue-accent/30">
            Opinion / Editorial
          </Badge>
        );
      case "prediction":
        return (
          <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30">
            Speculative Prediction
          </Badge>
        );
      case "satire":
        return (
          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">
            Satire / Parody
          </Badge>
        );
      case "unsupported allegation":
        return (
          <Badge className="bg-danger/10 text-danger border-danger/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Unsupported Allegation
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            {type}
          </Badge>
        );
    }
  };

  const getEvidenceTypeBadge = (type: EvidenceType | string) => {
    switch (type.toLowerCase()) {
      case "supporting":
        return (
          <Badge className="bg-success/15 text-success border-success/30 font-medium">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Supporting Evidence
          </Badge>
        );
      case "contradicting":
        return (
          <Badge className="bg-danger/15 text-danger border-danger/30 font-medium">
            <XCircle className="h-3 w-3 mr-1" />
            Contradicting Evidence
          </Badge>
        );
      case "contextual":
        return (
          <Badge className="bg-blue-accent/15 text-blue-accent border-blue-accent/30 font-medium">
            <Info className="h-3 w-3 mr-1" />
            Contextual Background
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            Unclassified
          </Badge>
        );
    }
  };

  const filteredClaims =
    analysis?.claims.filter((c: ExtractedClaim) =>
      categoryFilter === "all" ? true : c.category === categoryFilter
    ) ?? [];

  const uniqueCategories = Array.from(
    new Set(analysis?.claims.map((c) => c.category) ?? [])
  );

  return (
    <div className="min-h-screen bg-navy-950 text-foreground">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-16 border-b border-border/50 bg-navy-950/80 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/submit">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Submissions</span>
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5 bg-border/50 hidden sm:block" />
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-accent" />
            <span className="font-bold tracking-tight text-sm sm:text-base">
              TruthLens<span className="text-blue-accent"> AI</span>
            </span>
            <span className="text-xs text-muted-foreground hidden md:inline">
              · Claim Extraction Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={analyzing || loading}
            onClick={handleTriggerAnalysis}
            className="gap-2 border-blue-accent/30 hover:border-blue-accent/60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? "animate-spin text-blue-accent" : ""}`} />
            <span>{analyzing ? "Analyzing with Gemini…" : analysis ? "Re-Analyze Content" : "Analyze Claims"}</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Banner */}
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger flex items-start gap-3">
            <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Analysis Notice</p>
              <p className="text-danger/90">{error}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && !submission && (
          <div className="py-24 text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-accent mx-auto" />
            <p className="text-sm text-muted-foreground">Loading submission and extraction data…</p>
          </div>
        )}

        {submission && (
          <>
            {/* Header / Submission Info */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-border/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="uppercase text-[11px] border-blue-accent/30 text-blue-glow">
                    {submission.submission_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    ID: <code className="text-foreground/80">{submission.id}</code>
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {submission.title || submission.source_url || "Untitled Content"}
                </h1>
                {submission.source_url && (
                  <a
                    href={submission.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-accent hover:underline break-all"
                  >
                    <span>{submission.source_url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Analysis Status</p>
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {analysis ? analysis.overallAssessment.analysisStatus.replace(/_/g, " ") : submission.status}
                  </p>
                </div>
                <div className="h-9 w-9 rounded-lg bg-navy-800 border border-border/60 flex items-center justify-center text-blue-accent">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* If no analysis yet, prompt user to trigger it */}
            {!analysis && !analyzing && (
              <Card className="bg-navy-900/60 border-border/60 text-center py-12 px-4">
                <CardHeader className="space-y-2">
                  <div className="h-14 w-14 rounded-2xl bg-blue-accent/10 border border-blue-accent/30 text-blue-accent mx-auto flex items-center justify-center">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <CardTitle className="text-xl">Intelligent Claim Extraction Ready</CardTitle>
                  <CardDescription className="max-w-md mx-auto text-sm">
                    TruthLens AI uses Google Gemini to analyze the submitted text, determine election relevance, and extract individual verifiable claims.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <Button
                    size="lg"
                    onClick={handleTriggerAnalysis}
                    className="gap-2 px-6 bg-blue-accent hover:bg-blue-accent/90"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Run Gemini Claim Extraction</span>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Analysis in progress */}
            {analyzing && (
              <Card className="bg-navy-900/60 border-blue-accent/40 text-center py-16 px-4 space-y-4">
                <RefreshCw className="h-10 w-10 animate-spin text-blue-accent mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">Extracting Claims with Gemini…</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Understanding content context, separating factual statements from opinions, and generating evidence search queries.
                  </p>
                </div>
              </Card>
            )}

            {/* Analysis Results Display */}
            {analysis && (
              <div className="space-y-8">
                {/* 1. Content Overview & Metadata Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Summary & Scope */}
                  <Card className="lg:col-span-8 bg-navy-900/70 border-border/60">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-accent" />
                          Content Understanding & Scope
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {analysis.contentAnalysis.isElectionRelated ? (
                            <Badge className="bg-success/10 text-success border-success/30">
                              <Radio className="h-3 w-3 mr-1 animate-pulse" />
                              Election-Related
                            </Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground border-border">
                              Non-Election Content
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            Lang: {analysis.contentAnalysis.language.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 text-sm">
                      <div className="rounded-lg bg-navy-950/70 border border-border/40 p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                          Executive Summary
                        </p>
                        <p className="text-foreground/95 leading-relaxed">
                          {analysis.contentAnalysis.summary}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-navy-950/40 border border-border/30">
                          <span className="text-muted-foreground block mb-0.5">Primary Topic</span>
                          <span className="font-medium text-foreground">{analysis.contentAnalysis.mainTopic}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-navy-950/40 border border-border/30">
                          <span className="text-muted-foreground block mb-0.5">Election Type</span>
                          <span className="font-medium text-foreground">
                            {analysis.contentAnalysis.electionType || "Unspecified"}
                          </span>
                        </div>
                        <div className="p-3 rounded-lg bg-navy-950/40 border border-border/30">
                          <span className="text-muted-foreground block mb-0.5">Region / Jurisdiction</span>
                          <span className="font-medium text-foreground">
                            {analysis.contentAnalysis.region || "Unspecified"}
                          </span>
                        </div>
                      </div>

                      {analysis.contentAnalysis.importantDates.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                          <Calendar className="h-3.5 w-3.5 text-blue-accent shrink-0" />
                          <span>Important Dates:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {analysis.contentAnalysis.importantDates.map((d, i) => (
                              <Badge key={i} variant="secondary" className="text-[11px] font-mono">
                                {d}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Right Column: Named Entities */}
                  <Card className="lg:col-span-4 bg-navy-900/70 border-border/60">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-accent" />
                        Key Named Entities ({analysis.entities.length})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Recognized officials, organizations, locations & laws
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-72 overflow-y-auto text-xs pr-1">
                      {analysis.entities.length === 0 ? (
                        <p className="text-muted-foreground italic py-4 text-center">No specific named entities detected.</p>
                      ) : (
                        analysis.entities.map((ent, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-navy-950/60 border border-border/40 space-y-0.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">{ent.name}</span>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                                {ent.type}
                              </Badge>
                            </div>
                            {ent.context && (
                              <p className="text-muted-foreground text-[11px] line-clamp-2">
                                {ent.context}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* 2. Extracted Claims Section */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <span>Individual Extracted Claims</span>
                        <Badge className="bg-blue-accent/20 text-blue-accent border-blue-accent/30 text-xs">
                          {analysis.claims.length} Total
                        </Badge>
                        <Badge className="bg-success/15 text-success border-success/30 text-xs">
                          {analysis.claims.filter((c) => c.isVerifiable).length} Verifiable
                        </Badge>
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Factual claims are structured individually for evidence retrieval. Verification verdicts are determined in subsequent stages.
                      </p>
                    </div>

                    {/* Category Filter */}
                    {uniqueCategories.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Category:</span>
                        <select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="bg-navy-900 border border-border/60 rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-blue-accent"
                        >
                          <option value="all">All Categories ({analysis.claims.length})</option>
                          {uniqueCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {filteredClaims.length === 0 ? (
                    <Card className="bg-navy-900/40 border-border/40 p-8 text-center text-sm text-muted-foreground">
                      No claims found matching this category filter.
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {filteredClaims.map((claim, idx) => (
                        <Card
                          key={claim.id || idx}
                          className="bg-navy-900/70 border-border/60 hover:border-border transition-colors space-y-3"
                        >
                          <CardHeader className="pb-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                                <Badge variant="outline" className="text-xs gap-1 border-border">
                                  <Tag className="h-3 w-3 text-blue-accent" />
                                  <span>{claim.category}</span>
                                </Badge>
                                {getClaimTypeBadge(claim.claimType)}
                                {claim.isVerifiable ? (
                                  <Badge className="bg-success/10 text-success border-success/20 text-[11px]">
                                    Verifiable Target
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-[11px]">
                                    Non-Verifiable (Subjective)
                                  </Badge>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {claim.date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {claim.date}
                                  </span>
                                )}
                                {claim.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {claim.location}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="pt-2">
                              <h3 className="text-base font-semibold text-foreground leading-snug">
                                {claim.normalizedText}
                              </h3>
                            </div>
                          </CardHeader>

                          <CardContent className="space-y-3 text-xs">
                            {/* Original excerpt quote */}
                            <div className="p-3 rounded-lg bg-navy-950/70 border border-border/40 space-y-1">
                              <span className="text-[11px] uppercase tracking-wider text-muted-foreground block font-mono">
                                Source Excerpt
                              </span>
                              <p className="italic text-foreground/80 leading-relaxed">
                                &ldquo;{claim.originalText}&rdquo;
                              </p>
                              {claim.context && (
                                <p className="text-muted-foreground text-[11px] pt-1">
                                  <strong className="text-foreground/70">Context: </strong>
                                  {claim.context}
                                </p>
                              )}
                            </div>

                            {/* Entities & Search Queries */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
                              {/* Entities involved */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-muted-foreground">Entities:</span>
                                {claim.entities.length > 0 ? (
                                  claim.entities.map((e, ei) => (
                                    <Badge key={ei} variant="secondary" className="text-[11px]">
                                      {e}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-muted-foreground italic">None noted</span>
                                )}
                              </div>

                              {/* Evidence-First Disclaimer */}
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <HelpCircle className="h-3 w-3 text-blue-accent" />
                                Verification pending evidence retrieval
                              </span>
                            </div>

                            {/* Suggested Search Queries */}
                            {claim.searchQueries.length > 0 && (
                              <div className="pt-2 border-t border-border/30 space-y-1.5">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 font-mono">
                                  <Search className="h-3 w-3 text-blue-accent" />
                                  Suggested Evidence Search Queries
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {claim.searchQueries.map((query, qi) => (
                                    <button
                                      key={qi}
                                      type="button"
                                      onClick={() => copyQuery(query)}
                                      className="inline-flex items-center gap-1.5 rounded-md bg-navy-950/80 border border-border/60 hover:border-blue-accent/60 px-2.5 py-1 text-xs text-foreground/90 transition-colors group"
                                      title="Click to copy query"
                                    >
                                      <span className="font-mono text-[11px]">{query}</span>
                                      {copiedQuery === query ? (
                                        <Check className="h-3 w-3 text-success shrink-0" />
                                      ) : (
                                        <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Evidence Discovery & Fact Check Engine (Day 4) */}
                <div className="space-y-4 pt-4 border-t border-border/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-blue-accent" />
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                          Evidence Discovery Engine
                        </h2>
                        <Badge className="bg-blue-accent/15 text-blue-accent border-blue-accent/30 text-xs font-mono">
                          Google Fact Check Tools API
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cross-references individual claims against registered fact-checking organizations and official databases.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={retrievingEvidence}
                        onClick={() => handleDiscoverEvidence(Boolean(evidenceData))}
                        className="gap-2 bg-blue-accent hover:bg-blue-accent/90 text-navy-950 font-medium"
                      >
                        {retrievingEvidence ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Querying Fact-Checks…</span>
                          </>
                        ) : evidenceData && evidenceData.totalEvidenceRetrieved > 0 ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Refresh Evidence</span>
                          </>
                        ) : (
                          <>
                            <Search className="h-3.5 w-3.5" />
                            <span>Discover Fact-Check Evidence</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Evidence Error Banner */}
                  {evidenceError && (
                    <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger flex items-start gap-3">
                      <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold">Evidence Discovery Notice</p>
                        <p className="text-danger/90">{evidenceError}</p>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleDiscoverEvidence(true)}
                          className="mt-2 text-xs border-danger/40 hover:bg-danger/20"
                        >
                          Retry Fact-Check Query
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Retrieving Spinner State */}
                  {retrievingEvidence && (
                    <Card className="bg-navy-900/60 border-blue-accent/40 text-center py-12 px-4 space-y-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-blue-accent mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          Searching Google Fact Check Tools API…
                        </p>
                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                          Querying claims, matching verified claimant assertions, evaluating publisher ratings, and classifying directional relevance.
                        </p>
                      </div>
                    </Card>
                  )}

                  {/* Evidence Summary Stats Bar */}
                  {evidenceData && !retrievingEvidence && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-border/50 bg-navy-900/60 p-3 space-y-1">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground block font-mono">
                          Claims Evaluated
                        </span>
                        <span className="text-xl font-bold text-foreground">
                          {evidenceData.totalClaimsProcessed}
                        </span>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-navy-900/60 p-3 space-y-1">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground block font-mono">
                          Total Fact-Checks
                        </span>
                        <span className="text-xl font-bold text-blue-accent">
                          {evidenceData.totalEvidenceRetrieved}
                        </span>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-navy-900/60 p-3 space-y-1">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground block font-mono">
                          Contradicting / Refuting
                        </span>
                        <span className="text-xl font-bold text-danger">
                          {
                            evidenceData.claimsEvidence.flatMap((c) => c.evidenceItems).filter(
                              (e) => e.evidenceType === "contradicting"
                            ).length
                          }
                        </span>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-navy-900/60 p-3 space-y-1">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground block font-mono">
                          Supporting / Confirming
                        </span>
                        <span className="text-xl font-bold text-success">
                          {
                            evidenceData.claimsEvidence.flatMap((c) => c.evidenceItems).filter(
                              (e) => e.evidenceType === "supporting"
                            ).length
                          }
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Empty state: Not yet retrieved */}
                  {!evidenceData && !retrievingEvidence && (
                    <Card className="bg-navy-900/40 border-border/60 text-center py-10 px-4">
                      <CardHeader className="space-y-2">
                        <div className="h-12 w-12 rounded-xl bg-blue-accent/10 border border-blue-accent/30 text-blue-accent mx-auto flex items-center justify-center">
                          <BookOpen className="h-6 w-6" />
                        </div>
                        <CardTitle className="text-lg">Fact-Check Discovery Ready</CardTitle>
                        <CardDescription className="max-w-md mx-auto text-xs text-muted-foreground">
                          Click below to search the Google Fact Check Tools API for registered claim reviews from trusted global newsrooms and independent fact-checkers.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          size="sm"
                          onClick={() => handleDiscoverEvidence(false)}
                          className="gap-2 bg-blue-accent hover:bg-blue-accent/90 text-navy-950 font-medium"
                        >
                          <Search className="h-3.5 w-3.5" />
                          <span>Search Fact Check Registries</span>
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Claims & Retrieved Fact Check Evidence Cards */}
                  {evidenceData && !retrievingEvidence && (
                    <div className="space-y-4">
                      {evidenceData.claimsEvidence.map((summary, idx) => (
                        <Card
                          key={summary.claimId || idx}
                          className="bg-navy-900/70 border-border/60 overflow-hidden"
                        >
                          <CardHeader className="pb-3 border-b border-border/40">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-blue-accent font-semibold">
                                  Claim #{idx + 1}
                                </span>
                                {summary.category && (
                                  <Badge variant="outline" className="text-[11px] border-border/70">
                                    {summary.category}
                                  </Badge>
                                )}
                              </div>
                              <div>
                                {summary.evidenceItems.length > 0 ? (
                                  <Badge className="bg-blue-accent/15 text-blue-accent border-blue-accent/30 text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {summary.evidenceItems.length} Fact-Check{summary.evidenceItems.length > 1 ? "s" : ""} Found
                                  </Badge>
                                ) : (
                                  <Badge className="bg-muted text-muted-foreground border-border text-xs">
                                    No Fact-Checks Catalogued
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-sm font-medium text-foreground pt-1.5 leading-relaxed">
                              &ldquo;{summary.claimText}&rdquo;
                            </p>
                            {summary.normalizedText && summary.normalizedText !== summary.claimText && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground/80">Normalized Assertion:</span>{" "}
                                {summary.normalizedText}
                              </p>
                            )}
                          </CardHeader>

                          <CardContent className="pt-4 space-y-3">
                            {summary.evidenceItems.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-border/60 bg-navy-950/40 p-5 text-center space-y-2">
                                <HelpCircle className="h-5 w-5 text-muted-foreground mx-auto" />
                                <p className="text-xs font-medium text-foreground/90">
                                  No matching articles in Google Fact Check registry
                                </p>
                                <p className="text-[11px] text-muted-foreground max-w-lg mx-auto leading-relaxed">
                                  Registered fact-checking organizations have not published an article evaluating this specific claim.{" "}
                                  <strong className="text-foreground/80">Note:</strong> Absence of a fact check does not mean this claim is true or false. In Day 5, this claim will proceed to multi-source evidence synthesis.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {summary.evidenceItems.map((item, itemIdx) => {
                                  const itemKey = `${summary.claimId}-${itemIdx}`;
                                  const isExpanded = Boolean(expandedEvidence[itemKey]);

                                  return (
                                    <div
                                      key={item.id || itemIdx}
                                      className="rounded-lg border border-border/50 bg-navy-950/60 p-4 space-y-3 transition-colors hover:border-border/80"
                                    >
                                      {/* Top Row: Publisher, Classification Badge, Original Rating */}
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge className="bg-navy-800 text-foreground border-border text-xs font-semibold">
                                            {item.sourceName}
                                          </Badge>
                                          {getEvidenceTypeBadge(item.evidenceType)}
                                        </div>

                                        {item.originalRating && (
                                          <div className="flex items-center gap-1.5 text-xs">
                                            <span className="text-muted-foreground text-[11px]">Publisher&apos;s Rating:</span>
                                            <Badge
                                              variant="outline"
                                              className="border-warning/40 text-warning bg-warning/5 font-mono text-[11px] font-semibold"
                                            >
                                              {item.originalRating}
                                            </Badge>
                                          </div>
                                        )}
                                      </div>

                                      {/* Article Title & Source Link */}
                                      <div className="space-y-1">
                                        <a
                                          href={item.sourceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm font-semibold text-foreground hover:text-blue-accent transition-colors inline-flex items-center gap-1.5 group break-words"
                                        >
                                          <span>{item.title}</span>
                                          <ExternalLink className="h-3.5 w-3.5 text-blue-accent shrink-0 group-hover:translate-x-0.5 transition-transform" />
                                        </a>
                                        <p className="text-xs text-muted-foreground break-all">
                                          {item.sourceUrl}
                                        </p>
                                      </div>

                                      {/* Relevance Explanation */}
                                      <div className="rounded-md bg-navy-900/60 border border-border/30 p-2.5 text-xs text-foreground/90 space-y-1">
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block">
                                          Relevance Explanation & Context
                                        </span>
                                        <p className="leading-relaxed">{item.relevanceExplanation}</p>
                                      </div>

                                      {/* Footer: Date & Expand Details Toggle */}
                                      <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t border-border/30">
                                        <div className="flex items-center gap-3">
                                          {item.publishedAt && (
                                            <span className="flex items-center gap-1">
                                              <Calendar className="h-3 w-3 text-muted-foreground" />
                                              {new Date(item.publishedAt).toLocaleDateString()}
                                            </span>
                                          )}
                                          <span>Retrieved: {new Date(item.retrievedAt).toLocaleDateString()}</span>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedEvidence((prev) => ({
                                              ...prev,
                                              [itemKey]: !prev[itemKey],
                                            }))
                                          }
                                          className="inline-flex items-center gap-1 text-blue-accent hover:underline text-[11px]"
                                        >
                                          <span>{isExpanded ? "Hide Metadata" : "Inspect Metadata"}</span>
                                          {isExpanded ? (
                                            <ChevronUp className="h-3 w-3" />
                                          ) : (
                                            <ChevronDown className="h-3 w-3" />
                                          )}
                                        </button>
                                      </div>

                                      {/* Expandable Technical Metadata */}
                                      {isExpanded && (
                                        <div className="pt-2 text-[11px] font-mono text-muted-foreground bg-black/20 p-2.5 rounded border border-border/40 space-y-1">
                                          <p>
                                            <span className="text-foreground/80">Canonical URL:</span>{" "}
                                            {(item.metadata.normalizedUrl as string) || item.sourceUrl}
                                          </p>
                                          <p>
                                            <span className="text-foreground/80">Claim Evaluated by Fact-Checker:</span>{" "}
                                            {(item.metadata.factCheckClaimText as string) || "N/A"}
                                          </p>
                                          {typeof item.metadata.relevanceScore === "number" && (
                                            <p>
                                              <span className="text-foreground/80">Confidence Alignment Score:</span>{" "}
                                              {item.metadata.relevanceScore}/100
                                            </p>
                                          )}
                                          <p>
                                            <span className="text-foreground/80">Retrieval Provider:</span> Google Fact Check Tools API
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* 4-Tier Verdict Framework Callout */}
                  <div className="rounded-xl border border-blue-accent/20 bg-blue-accent/5 p-4 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <Scale className="h-4 w-4 text-blue-accent" />
                      <span>TruthLens AI 4-Tier Verification Framework</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-muted-foreground pt-1">
                      <div className="rounded bg-navy-950/60 p-2.5 border border-border/40">
                        <p className="font-semibold text-foreground/90">1. Publisher&apos;s Original Rating</p>
                        <p className="text-[11px] mt-0.5">Assigned by the external reporting organization (e.g. PolitiFact, FactCheck.org). Preserved without modification.</p>
                      </div>
                      <div className="rounded bg-navy-950/60 p-2.5 border border-border/40">
                        <p className="font-semibold text-foreground/90">2. Evidence Classification</p>
                        <p className="text-[11px] mt-0.5">Determines whether the third-party source supports, contradicts, or provides contextual background for this specific claim.</p>
                      </div>
                      <div className="rounded bg-navy-950/60 p-2.5 border border-border/40">
                        <p className="font-semibold text-foreground/90">3. AI Verification Synthesis (Day 5)</p>
                        <p className="text-[11px] mt-0.5">Future multi-evidence synthesis model that aggregates all evidence to compute probability and explanations.</p>
                      </div>
                      <div className="rounded bg-navy-950/60 p-2.5 border border-border/40">
                        <p className="font-semibold text-foreground/90">4. Human Editorial Verdict</p>
                        <p className="text-[11px] mt-0.5">Independent judgment rendered by platform moderators and administrators in the Admin Review workspace.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Overall Engine Assessment Card */}
                <Card className="bg-navy-900/60 border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Globe className="h-4 w-4 text-cyan-accent" />
                      Extraction Engine Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p className="text-foreground/90 leading-relaxed">
                      {analysis.overallAssessment.explanation}
                    </p>
                    <div className="rounded-lg bg-navy-950/50 border border-border/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                      <Shield className="h-4 w-4 text-blue-accent shrink-0 mt-0.5" />
                      <span>
                        <strong>Evidence-First Philosophy:</strong> TruthLens AI does not declare claims true or false during extraction. In Day 4, these individual claims and queries will be cross-referenced against official fact-check registries and documentary evidence.
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function AnalyzePage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-navy-950 text-foreground flex items-center justify-center">
          <div className="py-24 text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-accent mx-auto" />
            <p className="text-sm text-muted-foreground">
              Loading claim extraction engine…
            </p>
          </div>
        </div>
      }
    >
      <AnalyzeContent {...props} />
    </Suspense>
  );
}
