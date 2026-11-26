"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Link2,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Bot,
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
import type {
  ReviewDecision,
  Submission,
  UserRole,
} from "@/types/database";

interface SubmissionsListProps {
  submissions: Submission[];
  userRole: UserRole;
  scope: "mine" | "all";
  onScopeChange: (scope: "mine" | "all") => void;
  onDelete: (id: string) => Promise<void>;
  onAdminReview: (
    id: string,
    decision: ReviewDecision,
    notes?: string
  ) => Promise<string | null>;
  loading: boolean;
}

const DECISION_LABELS: Record<ReviewDecision, string> = {
  approved: "Approved",
  flagged: "Flagged",
  needs_evidence: "Needs Evidence",
  needs_more_evidence: "Needs Evidence",
  rejected: "Rejected",
};

export function SubmissionsList({
  submissions,
  userRole,
  scope,
  onScopeChange,
  onDelete,
  onAdminReview,
  loading,
}: SubmissionsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewError, setReviewError] = useState<Record<string, string>>({});

  const getTypeIcon = (type: Submission["submission_type"]) => {
    switch (type) {
      case "url":
        return <Link2 className="h-4 w-4 text-blue-accent" />;
      case "text":
        return <FileText className="h-4 w-4 text-cyan-accent" />;
      case "image":
        return <ImageIcon className="h-4 w-4 text-blue-glow" />;
    }
  };

  const getStatusBadge = (status: Submission["status"]) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-success/10 text-success border-success/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "extracted":
        return (
          <Badge className="bg-blue-accent/10 text-blue-accent border-blue-accent/30">
            Extracted
          </Badge>
        );
      case "in_review":
        return (
          <Badge className="bg-warning/10 text-warning border-warning/30">
            <Eye className="h-3 w-3 mr-1" />
            In Review
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-danger/10 text-danger border-danger/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getDecisionBadge = (decision: ReviewDecision) => {
    switch (decision) {
      case "approved":
        return (
          <Badge className="bg-success/10 text-success border-success/30">
            Human: Approved
          </Badge>
        );
      case "flagged":
        return (
          <Badge className="bg-warning/10 text-warning border-warning/30">
            Human: Flagged
          </Badge>
        );
      case "needs_more_evidence":
        return (
          <Badge className="bg-blue-accent/10 text-blue-accent border-blue-accent/30">
            Human: Needs Evidence
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-danger/10 text-danger border-danger/30">
            Human: Rejected
          </Badge>
        );
    }
  };

  return (
    <Card className="bg-navy-800/50 border-border/50">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold text-foreground">
            Saved Submissions
          </CardTitle>
          <CardDescription>
            {scope === "all"
              ? "Administrator view across all users (protected by RLS)"
              : "Your submitted URLs, text claims, and OCR images"}
          </CardDescription>
        </div>

        {userRole === "admin" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={scope === "mine" ? "default" : "outline"}
              onClick={() => onScopeChange("mine")}
            >
              My Submissions
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === "all" ? "default" : "outline"}
              onClick={() => onScopeChange("all")}
              className="gap-1.5"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              All Users (Admin)
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Loading submissions…
          </p>
        ) : submissions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 bg-navy-900/40 p-8 text-center text-sm text-muted-foreground">
            No submissions found yet. Submit a URL, text, or image above to get
            started.
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-border/50 bg-navy-900/70 p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-navy-800 border border-border/50">
                        {getTypeIcon(item.submission_type)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.title || item.source_url || "Untitled submission"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span className="uppercase">
                            {item.submission_type}
                          </span>
                          <span>·</span>
                          <span>
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                          {item.extraction_status !== "not_applicable" && (
                            <>
                              <span>·</span>
                              <span>
                                Extraction: {item.extraction_status}
                              </span>
                            </>
                          )}
                          {item.submission_type === "image" &&
                            typeof item.metadata?.ocr_confidence ===
                              "number" && (
                              <>
                                <span>·</span>
                                <span title="OCR character legibility score (not claim verification)">
                                  OCR Text Recognition:{" "}
                                  {item.metadata.ocr_confidence}%
                                </span>
                              </>
                            )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.latest_review &&
                        getDecisionBadge(item.latest_review.decision)}
                      {getStatusBadge(item.status)}
                      <Link href={`/analyze/${item.id}`}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-blue-accent/30 text-blue-accent hover:bg-blue-accent/10 h-8 px-2.5 text-xs"
                          title="Extract and inspect election claims with Gemini AI"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-blue-glow" />
                          <span>Analyze Claims</span>
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : item.id)
                        }
                        aria-label={isExpanded ? "Collapse details" : "Expand details"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={busyId === item.id}
                        onClick={async () => {
                          setBusyId(item.id);
                          try {
                            await onDelete(item.id);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="text-muted-foreground hover:text-danger"
                        title="Delete submission"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-3 border-t border-border/40 space-y-3 text-xs">
                      {item.source_url && (
                        <div>
                          <span className="text-muted-foreground">
                            Preserved Source URL:{" "}
                          </span>
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-accent hover:underline break-all"
                          >
                            {item.source_url}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                      )}

                      {item.extraction_error && (
                        <div className="rounded border border-warning/30 bg-warning/10 p-2.5 text-warning">
                          {item.extraction_error}
                        </div>
                      )}

                      {item.image_signed_url && (
                        <div className="rounded-lg border border-border/50 bg-black/30 p-2 space-y-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image_signed_url}
                            alt={item.title ?? "Preserved submission image"}
                            className="max-h-56 mx-auto object-contain rounded"
                          />
                          <p className="text-[11px] text-center text-muted-foreground">
                            Served via authenticated short-lived signed URL from
                            private bucket
                            {typeof item.metadata?.ocr_confidence === "number"
                              ? ` · OCR Text-Recognition Score: ${item.metadata.ocr_confidence}% (legibility only, not claim verification)`
                              : ""}
                          </p>
                        </div>
                      )}

                      {(item.extracted_text || item.raw_text) && (
                        <div className="rounded-md bg-navy-950/70 border border-border/40 p-3 space-y-2">
                          {item.extracted_text && (
                            <div>
                              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                                {item.submission_type === "image"
                                  ? "OCR Extracted Visible Text"
                                  : item.submission_type === "url"
                                  ? "Extracted Article Text"
                                  : "Submitted Claim Text"}
                              </p>
                              <p className="whitespace-pre-wrap text-foreground/90 max-h-48 overflow-y-auto leading-relaxed">
                                {item.extracted_text}
                              </p>
                            </div>
                          )}
                          {item.raw_text &&
                            item.raw_text !== item.extracted_text && (
                              <div>
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                                  Analyst Notes
                                </p>
                                <p className="whitespace-pre-wrap text-foreground/80">
                                  {item.raw_text}
                                </p>
                              </div>
                            )}
                        </div>
                      )}

                      {/* Separated AI Assessment vs Human Review Panel */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-md border border-border/40 bg-navy-950/50 p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                            <Bot className="h-3.5 w-3.5 text-cyan-accent" />
                            <span>Original AI Assessment (Preserved)</span>
                          </div>
                          {item.ai_assessment?.has_assessment ? (
                            <div className="space-y-1 pt-1">
                              <p className="text-foreground font-medium">
                                AI Verdict:{" "}
                                <span className="uppercase">
                                  {item.ai_assessment.verdict ?? "unverified"}
                                </span>
                                {item.ai_assessment.confidence_score !== null &&
                                  ` (${item.ai_assessment.confidence_score}% claim confidence)`}
                              </p>
                              {item.ai_assessment.summary && (
                                <p className="text-muted-foreground">
                                  {item.ai_assessment.summary}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-muted-foreground pt-1">
                              Not yet analyzed by AI pipeline. Human review
                              actions keep AI fields separate and untouched.
                            </p>
                          )}
                        </div>

                        <div className="rounded-md border border-border/40 bg-navy-950/50 p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                            <UserCheck className="h-3.5 w-3.5 text-blue-accent" />
                            <span>Final Human Review Verdict</span>
                          </div>
                          {item.latest_review ? (
                            <div className="space-y-1 pt-1">
                              <p className="text-foreground font-medium">
                                Decision:{" "}
                                {DECISION_LABELS[item.latest_review.decision]}
                              </p>
                              <p className="text-muted-foreground break-all">
                                Reviewer ID: {item.latest_review.reviewer_id}
                              </p>
                              <p className="text-muted-foreground">
                                Reviewed:{" "}
                                {new Date(
                                  item.latest_review.updated_at ||
                                    item.latest_review.created_at
                                ).toLocaleString()}
                              </p>
                              {item.latest_review.notes && (
                                <p className="text-foreground/90 pt-0.5">
                                  Notes: {item.latest_review.notes}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-muted-foreground pt-1">
                              Awaiting administrator moderation review.
                            </p>
                          )}
                        </div>
                      </div>

                      {userRole === "admin" && (
                        <div className="rounded-md border border-blue-accent/20 bg-blue-accent/5 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                              Admin Review Interface
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Updates `reviews` table & records audit log
                            </span>
                          </div>

                          <Input
                            type="text"
                            placeholder="Optional review notes (saved with verdict)…"
                            value={
                              reviewNotes[item.id] ??
                              item.latest_review?.notes ??
                              ""
                            }
                            onChange={(e) =>
                              setReviewNotes((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="bg-navy-900 border-border h-8 text-xs"
                            maxLength={2000}
                          />

                          {reviewError[item.id] && (
                            <p className="text-xs text-danger">
                              {reviewError[item.id]}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {(
                              [
                                { decision: "approved", label: "Approve" },
                                { decision: "flagged", label: "Flag" },
                                {
                                  decision: "needs_more_evidence",
                                  label: "Needs Evidence",
                                },
                                { decision: "rejected", label: "Reject" },
                              ] as const
                            ).map((action) => {
                              const isCurrent =
                                item.latest_review?.decision ===
                                action.decision;
                              return (
                                <Button
                                  key={action.decision}
                                  type="button"
                                  size="xs"
                                  variant={isCurrent ? "default" : "outline"}
                                  disabled={busyId === item.id}
                                  onClick={async () => {
                                    setBusyId(item.id);
                                    setReviewError((prev) => {
                                      const next = { ...prev };
                                      delete next[item.id];
                                      return next;
                                    });
                                    try {
                                      const noteToSave =
                                        reviewNotes[item.id] ??
                                        item.latest_review?.notes ??
                                        "";
                                      const err = await onAdminReview(
                                        item.id,
                                        action.decision,
                                        noteToSave
                                      );
                                      if (err) {
                                        setReviewError((prev) => ({
                                          ...prev,
                                          [item.id]: err,
                                        }));
                                      }
                                    } finally {
                                      setBusyId(null);
                                    }
                                  }}
                                >
                                  {action.label}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
