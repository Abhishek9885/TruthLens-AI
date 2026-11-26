"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Scale,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  FileText,
  History,
  Info,
  Check,
  ImageIcon,
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
import type { ReviewWorkspaceData, ReviewActionDecision } from "@/types/review";
import type { VerificationVerdict } from "@/types/verification";

interface PageProps {
  params: Promise<{ id: string }>;
}

function ReviewWorkspaceContent({ params }: PageProps) {
  const { id } = use(params);

  const [workspace, setWorkspace] = useState<ReviewWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form State
  const [decision, setDecision] = useState<ReviewActionDecision>("approved");
  const [finalVerdict, setFinalVerdict] = useState<VerificationVerdict>("verified");
  const [notes, setNotes] = useState("");
  const [evidenceInspected, setEvidenceInspected] = useState(false);
  const [unresolvedIssues, setUnresolvedIssues] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`/api/reviews/${id}`);
        const json = await res.json();
        if (ignore) return;
        if (!res.ok) {
          throw new Error(json.error || "Failed to load review workspace.");
        }
        setWorkspace(json.data);

        // Pre-populate verdict from AI or existing human review
        const currentVerdict =
          json.data.report?.final_human_verdict ||
          json.data.aiAssessment?.verdict ||
          "unverified";
        setFinalVerdict(currentVerdict as VerificationVerdict);

        if (json.data.report?.reviewer_notes) {
          setNotes(json.data.report.reviewer_notes);
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
  }, [id, refreshTrigger]);

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validation 1: evidence inspection check for approval
    if (decision === "approved" && !evidenceInspected) {
      setError("Compliance Rule: You must inspect the retrieved evidence before approving a report.");
      return;
    }

    // Validation 2: verdict change explanation check
    const previousVerdict =
      workspace?.report?.final_human_verdict ||
      workspace?.aiAssessment?.verdict ||
      "unverified";

    if (finalVerdict !== previousVerdict && notes.trim().length < 10) {
      setError("Required: A detailed explanation (at least 10 characters) is required when changing the AI verdict.");
      return;
    }

    // Validation 3: rejection or flag reason
    if ((decision === "rejected" || decision === "flagged") && notes.trim().length < 5) {
      setError("Please provide a note or reason for flagging or rejecting this report.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        decision,
        finalVerdict,
        previousVerdict,
        notes: notes.trim(),
        evidenceInspected,
        unresolvedIssues: unresolvedIssues.trim() || undefined,
      };

      const res = await fetch(`/api/reviews/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to submit review decision.");
      }

      setSuccessMessage(`Editorial decision '${decision}' has been committed and recorded in the audit log.`);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const getVerdictBadge = (verdict: string) => {
    switch (verdict?.toLowerCase()) {
      case "verified":
      case "verified_true":
        return (
          <Badge className="bg-success/15 text-success border-success/30 font-semibold px-2 py-0.5 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Verified
          </Badge>
        );
      case "false":
        return (
          <Badge className="bg-danger/15 text-danger border-danger/30 font-semibold px-2 py-0.5 text-xs">
            <XCircle className="h-3.5 w-3.5 mr-1" />
            False
          </Badge>
        );
      case "misleading":
        return (
          <Badge className="bg-warning/15 text-warning border-warning/30 font-semibold px-2 py-0.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Misleading
          </Badge>
        );
      case "partially_true":
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold px-2 py-0.5 text-xs">
            <Scale className="h-3.5 w-3.5 mr-1" />
            Partially True
          </Badge>
        );
      case "unverified":
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border font-semibold px-2 py-0.5 text-xs">
            <Info className="h-3.5 w-3.5 mr-1" />
            Unverified
          </Badge>
        );
    }
  };

  const getDecisionBadge = (dec: string) => {
    switch (dec) {
      case "approved":
        return (
          <Badge className="bg-success/15 text-success border-success/30 font-semibold text-xs">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "flagged":
        return (
          <Badge className="bg-warning/15 text-warning border-warning/30 font-semibold text-xs">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Flagged
          </Badge>
        );
      case "needs_evidence":
        return (
          <Badge className="bg-blue-accent/15 text-blue-accent border-blue-accent/30 font-semibold text-xs">
            <Search className="h-3 w-3 mr-1" />
            Needs Evidence
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-danger/15 text-danger border-danger/30 font-semibold text-xs">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {dec}
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 text-foreground">
      {/* Top Header */}
      <header className="sticky top-0 z-30 h-16 border-b border-border/50 bg-navy-950/80 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground text-xs">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Queue</span>
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5 bg-border/50 hidden sm:block" />
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-accent" />
            <span className="font-bold tracking-tight text-sm sm:text-base">
              Human Review Workspace
            </span>
            <span className="text-xs text-muted-foreground hidden md:inline">
              · Submission ID: <code className="font-mono text-foreground/80">{id.slice(0, 8)}</code>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/analyze/${id}`} target="_blank">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs border-border/60">
              <span>View Analysis</span>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Loading Spinner */}
        {loading && !workspace && (
          <div className="py-24 text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-accent mx-auto" />
            <p className="text-sm text-muted-foreground">Loading review workspace and evidence catalog…</p>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger flex items-start gap-3">
            <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">Review Notice</p>
              <p className="text-danger/90">{error}</p>
            </div>
          </div>
        )}

        {/* Success Banner */}
        {successMessage && (
          <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-xs text-success flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Decision Committed</p>
              <p className="text-success/90">{successMessage}</p>
            </div>
          </div>
        )}

        {workspace && (
          <>
            {/* Section 1: Submission Metadata & Submitter Info */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-border/40">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase font-mono border-blue-accent/30 text-blue-glow">
                    {workspace.submission.submission_type}
                  </Badge>
                  {getDecisionBadge(workspace.submission.status)}
                  <span className="text-xs text-muted-foreground">
                    Submitted: {new Date(workspace.submission.created_at).toLocaleString()}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {workspace.submission.title || workspace.submission.source_url || "Untitled Content"}
                </h1>
                {workspace.submission.source_url && (
                  <a
                    href={workspace.submission.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-accent hover:underline break-all"
                  >
                    <span>{workspace.submission.source_url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
              </div>

              {/* Submitter Info Card */}
              {workspace.submission.user && (
                <div className="rounded-lg bg-navy-900/70 border border-border/50 p-3 text-xs space-y-1 shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-mono">
                    Submitter Identity
                  </span>
                  <div className="font-medium text-foreground">
                    {workspace.submission.user.full_name || workspace.submission.user.email}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Role: <code className="font-mono text-blue-accent">{workspace.submission.user.role}</code>
                  </div>
                </div>
              )}
            </div>

            {/* Extracted Content & OCR / Image Inspection Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Submitted Content Excerpt */}
              <Card className="bg-navy-900/70 border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-accent" />
                    <span>Submitted Content &amp; Extracted Text</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="p-3 rounded-lg bg-navy-950/70 border border-border/40 max-h-56 overflow-y-auto space-y-2">
                    <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {workspace.submission.extracted_text ||
                        workspace.submission.raw_text ||
                        "No direct text content available."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Image Inspection (if applicable) */}
              <Card className="bg-navy-900/70 border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-cyan-accent" />
                    <span>Visual Media &amp; OCR Inspection</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {workspace.submission.signedImageUrl ? (
                    <div className="space-y-2">
                      <div className="rounded-lg overflow-hidden border border-border/40 max-h-56 bg-black/30 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={workspace.submission.signedImageUrl}
                          alt="Submitted media"
                          className="max-h-56 w-auto object-contain"
                        />
                      </div>
                      <a
                        href={workspace.submission.signedImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-accent hover:underline text-[11px] inline-flex items-center gap-1"
                      >
                        <span>Open Full-Resolution Image</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground italic rounded-lg bg-navy-950/40 border border-border/30">
                      No image attachment uploaded with this submission.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Section 2: Immutable AI Assessment */}
            <Card className="bg-navy-900/70 border-border/60 space-y-0">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-accent" />
                    <CardTitle className="text-base font-semibold">
                      AI Preliminary Assessment (Immutable Record)
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono border-blue-accent/30 text-blue-accent">
                      Model: {workspace.aiAssessment?.modelUsed || "gemini-2.5-flash"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground text-[11px]">AI Verdict:</span>
                      {getVerdictBadge(workspace.aiAssessment?.verdict || "unverified")}
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground text-[11px]">Confidence:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {workspace.aiAssessment?.confidence}%
                      </span>
                    </div>
                  </div>
                </div>
                <CardDescription className="text-xs pt-1">
                  The original AI assessment is preserved immutably to maintain algorithmic transparency and forensic auditing.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4 space-y-4 text-xs">
                {/* AI Explanation */}
                <div className="p-3.5 rounded-lg bg-navy-950/70 border border-border/40 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block font-semibold">
                    Algorithmic Explanation
                  </span>
                  <p className="text-foreground/90 leading-relaxed">
                    {workspace.aiAssessment?.explanation}
                  </p>
                </div>

                {/* Evidence Catalog Inspectable List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono font-semibold">
                      Associated Retrieved Evidence Sources ({workspace.evidence.length})
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {workspace.claims.length} Extracted Claims
                    </span>
                  </div>

                  {workspace.evidence.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground italic rounded-lg bg-navy-950/40 border border-border/30">
                      No third-party fact-checks or primary evidence were catalogued for this submission.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                      {workspace.evidence.map((ev, ei) => (
                        <div
                          key={ev.id || ei}
                          className="p-3 rounded-lg border border-border/50 bg-navy-950/60 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground text-xs truncate">
                              {ev.source_name || ev.source_title}
                            </span>
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">
                              {ev.evidence_type || ev.stance}
                            </Badge>
                          </div>
                          {ev.original_rating && (
                            <p className="text-[11px] text-warning font-mono">
                              Original Publisher Rating: <strong>{ev.original_rating}</strong>
                            </p>
                          )}
                          <p className="text-muted-foreground text-[11px] line-clamp-2">
                            {ev.summary || ev.excerpt || ev.relevance_explanation}
                          </p>
                          {ev.source_url && (
                            <a
                              href={ev.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-accent hover:underline text-[11px] inline-flex items-center gap-1 break-all"
                            >
                              <span>View Reference Article</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Section 3: Reviewer Decision Console */}
            <Card className="bg-navy-900/80 border-blue-accent/40 shadow-lg">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-accent" />
                  <CardTitle className="text-base font-semibold">
                    Editorial Reviewer Adjudication Console
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Certify final verdict, record editorial justifications, and commit decision to the immutable audit log.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-4">
                <form onSubmit={handleSubmitDecision} className="space-y-5 text-xs">
                  {/* Step A: Review Action Selector */}
                  <div className="space-y-2">
                    <label className="font-semibold text-foreground uppercase tracking-wider text-[11px] block">
                      1. Select Review Action
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setDecision("approved")}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          decision === "approved"
                            ? "border-success bg-success/15 text-foreground ring-1 ring-success"
                            : "border-border/60 bg-navy-950/60 text-muted-foreground hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-success">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Approve</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Certify report &amp; verdict</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDecision("flagged")}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          decision === "flagged"
                            ? "border-warning bg-warning/15 text-foreground ring-1 ring-warning"
                            : "border-border/60 bg-navy-950/60 text-muted-foreground hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-warning">
                          <ShieldAlert className="h-4 w-4" />
                          <span>Flag</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Escalate for 2nd review</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDecision("needs_evidence")}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          decision === "needs_evidence"
                            ? "border-blue-accent bg-blue-accent/15 text-foreground ring-1 ring-blue-accent"
                            : "border-border/60 bg-navy-950/60 text-muted-foreground hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-blue-accent">
                          <Search className="h-4 w-4" />
                          <span>Needs Evidence</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Request more sources</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDecision("rejected")}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          decision === "rejected"
                            ? "border-danger bg-danger/15 text-foreground ring-1 ring-danger"
                            : "border-border/60 bg-navy-950/60 text-muted-foreground hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-danger">
                          <XCircle className="h-4 w-4" />
                          <span>Reject</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Mark invalid or debunked</p>
                      </button>
                    </div>
                  </div>

                  {/* Step B: Final Verdict Selection */}
                  <div className="space-y-2">
                    <label htmlFor="final-verdict-select" className="font-semibold text-foreground uppercase tracking-wider text-[11px] block">
                      2. Certified Human Verdict
                    </label>
                    <select
                      id="final-verdict-select"
                      value={finalVerdict}
                      onChange={(e) => setFinalVerdict(e.target.value as VerificationVerdict)}
                      className="w-full h-10 bg-navy-950 border border-border/60 rounded-md px-3 text-xs text-foreground focus:outline-none focus:border-blue-accent font-semibold"
                    >
                      <option value="verified">Verified (Sufficient evidence supports claim)</option>
                      <option value="false">False (Evidence directly contradicts claim)</option>
                      <option value="misleading">Misleading (Accurate facts framed deceptively)</option>
                      <option value="partially_true">Partially True (Mixed corroboration)</option>
                      <option value="unverified">Unverified (Insufficient documentary evidence)</option>
                    </select>

                    {workspace.aiAssessment?.verdict &&
                      finalVerdict !== workspace.aiAssessment.verdict && (
                        <div className="rounded-lg bg-warning/10 border border-warning/30 p-2.5 text-warning text-xs flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>
                            You are altering the preliminary AI verdict from{" "}
                            <strong>{workspace.aiAssessment.verdict}</strong> to{" "}
                            <strong>{finalVerdict}</strong>. A detailed reviewer explanation is mandatory below.
                          </span>
                        </div>
                      )}
                  </div>

                  {/* Step C: Reviewer Explanation & Notes */}
                  <div className="space-y-1.5">
                    <label htmlFor="reviewer-notes-textarea" className="font-semibold text-foreground uppercase tracking-wider text-[11px] block">
                      3. Reviewer Explanation &amp; Notes
                    </label>
                    <textarea
                      id="reviewer-notes-textarea"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Explain the rationale behind this decision, cite specific primary records, or detail why the AI preliminary verdict was accepted/modified…"
                      className="w-full bg-navy-950 border border-border/60 rounded-md p-3 text-xs text-foreground focus:outline-none focus:border-blue-accent"
                    />
                  </div>

                  {/* Optional Unresolved Issues */}
                  <div className="space-y-1.5">
                    <label htmlFor="unresolved-issues-input" className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] block">
                      Unresolved Issues / Pending Inquiries (Optional)
                    </label>
                    <input
                      id="unresolved-issues-input"
                      type="text"
                      value={unresolvedIssues}
                      onChange={(e) => setUnresolvedIssues(e.target.value)}
                      placeholder="E.g., Awaiting formal ballot audit certification from Secretary of State…"
                      className="w-full bg-navy-950 border border-border/60 rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-accent"
                    />
                  </div>

                  {/* Step D: Evidence Inspection Gate */}
                  <div className="rounded-lg bg-navy-950/80 border border-border/60 p-3 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={evidenceInspected}
                        onChange={(e) => setEvidenceInspected(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border/60 text-blue-accent focus:ring-blue-accent"
                      />
                      <span className="text-foreground/90 leading-tight">
                        <strong>Certification Gate:</strong> I confirm that I have inspected the retrieved third-party fact-check articles, primary source documents, and confidence metadata for this submission.
                      </span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      Action will be committed atomically to the audit log.
                    </span>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-6 text-xs"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Committing Decision…</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Commit Editorial Decision</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Section 4: Chronological Review History */}
            <Card className="bg-navy-900/70 border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-blue-accent" />
                  <span>Chronological Review History ({workspace.reviewHistory.length})</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Full historical record of all previous moderator decisions, previous verdicts, and reviewer explanations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.reviewHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    No human review decisions have been recorded for this submission yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {workspace.reviewHistory.map((rev, ri) => (
                      <div
                        key={rev.id || ri}
                        className="p-3.5 rounded-lg bg-navy-950/70 border border-border/40 space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {getDecisionBadge(rev.decision)}
                            <span className="font-semibold text-foreground">
                              {rev.reviewer?.full_name || rev.reviewer?.email || "Admin Moderator"}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3" />
                            {new Date(rev.created_at).toLocaleString()}
                          </span>
                        </div>

                        {rev.previous_verdict && rev.final_verdict && (
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>Verdict Transition:</span>
                            <span className="line-through">{rev.previous_verdict}</span>
                            <span>&rarr;</span>
                            <strong className="text-foreground">{rev.final_verdict}</strong>
                          </div>
                        )}

                        {rev.notes && (
                          <p className="text-foreground/90 text-xs italic bg-navy-900/60 p-2 rounded border border-border/30">
                            &ldquo;{rev.notes}&rdquo;
                          </p>
                        )}
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

export default function ReviewWorkspacePage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-navy-950 text-foreground flex items-center justify-center">
          <div className="py-24 text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-accent mx-auto" />
            <p className="text-sm text-muted-foreground">Loading review workspace…</p>
          </div>
        </div>
      }
    >
      <ReviewWorkspaceContent {...props} />
    </Suspense>
  );
}
