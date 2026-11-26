import { z } from "zod";
import { VERIFICATION_VERDICTS, type VerificationVerdict } from "@/types/verification";
import type { Claim, Evidence, Profile, Report, Review, Submission } from "@/types/database";

// ============================================================================
// Review Decisions & Status Constants
// ============================================================================

export const REVIEW_DECISIONS = [
  "approved",
  "flagged",
  "rejected",
  "needs_evidence",
] as const;
export type ReviewActionDecision = (typeof REVIEW_DECISIONS)[number];

export const DECISION_LABELS: Record<ReviewActionDecision, string> = {
  approved: "Approve Report",
  flagged: "Flag for Escalation",
  rejected: "Reject Report",
  needs_evidence: "Request Additional Evidence",
};

// ============================================================================
// Review Decision Request Schema (Validation for API)
// ============================================================================

export const claimOverrideSchema = z.object({
  claimId: z.string().uuid("Claim ID must be a valid UUID."),
  humanVerdict: z.enum(VERIFICATION_VERDICTS),
  humanExplanation: z.string().optional(),
});

export const submitReviewDecisionSchema = z
  .object({
    decision: z.enum(REVIEW_DECISIONS),
    finalVerdict: z.enum(VERIFICATION_VERDICTS),
    previousVerdict: z.string().optional(),
    notes: z.string().optional().default(""),
    evidenceInspected: z.boolean({
      message: "Confirmation of evidence inspection is required.",
    }),
    evidenceReferences: z
      .array(
        z.object({
          sourceUrl: z.string().url("Must be a valid URL."),
          sourceName: z.string().optional(),
          title: z.string().optional(),
          stance: z.string().optional(),
        })
      )
      .optional()
      .default([]),
    unresolvedIssues: z.string().optional(),
    claimOverrides: z.array(claimOverrideSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    // Rule 1: Approval requires evidence inspection
    if (data.decision === "approved" && !data.evidenceInspected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceInspected"],
        message:
          "Reviewers cannot approve a report without certifying that they have inspected the associated evidence.",
      });
    }

    // Rule 2: If verdict changed, explanation is mandatory
    if (
      data.previousVerdict &&
      data.finalVerdict !== data.previousVerdict &&
      (!data.notes || data.notes.trim().length < 10)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message:
          "A detailed explanation (at least 10 characters) is required when changing the AI-generated preliminary verdict.",
      });
    }

    // Rule 3: Rejection or Flagging should have a note
    if (
      (data.decision === "rejected" || data.decision === "flagged") &&
      (!data.notes || data.notes.trim().length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: "Please provide a brief reason or note for this decision.",
      });
    }
  });

export type SubmitReviewDecisionInput = z.infer<typeof submitReviewDecisionSchema>;

// ============================================================================
// Enriched Review Workspace Data Types
// ============================================================================

export interface ReviewWorkspaceData {
  submission: Submission & {
    user?: Pick<Profile, "id" | "email" | "full_name" | "role">;
    signedImageUrl?: string | null;
  };
  claims: Claim[];
  evidence: Evidence[];
  report: Report | null;
  reviewHistory: (Review & {
    reviewer?: Pick<Profile, "id" | "email" | "full_name">;
  })[];
  aiAssessment: {
    verdict: string;
    confidence: number;
    explanation: string;
    modelUsed: string;
    assessedAt: string | null;
    limitations: string[];
    missingInformation: string[];
  } | null;
}

// ============================================================================
// Admin Dashboard Analytics & Queue Types
// ============================================================================

export interface AdminOverviewStats {
  totalSubmissions: number;
  pendingSubmissions: number;
  processingSubmissions: number;
  completedSubmissions: number;
  awaitingHumanReview: number;
  approvedReports: number;
  rejectedReports: number;
  flaggedReports: number;
  totalRegisteredUsers: number;
}

export interface VerdictDistributionStats {
  verified: number;
  false: number;
  misleading: number;
  partially_true: number;
  unverified: number;
}

export interface RecentActivityItem {
  id: string;
  type: "submission" | "ai_assessment" | "human_review" | "admin_action";
  title: string;
  description: string;
  actor: string;
  actorEmail?: string;
  status?: string;
  timestamp: string;
  link?: string;
}

export interface ReviewQueueItem {
  id: string;
  submissionId: string;
  title: string;
  submissionType: "url" | "text" | "image";
  submittedAt: string;
  submitterEmail?: string;
  claimsCount: number;
  aiVerdict: VerificationVerdict | "unverified";
  aiConfidence: number;
  evidenceCount: number;
  humanReviewStatus: "pending_review" | "under_review" | "approved" | "flagged" | "needs_evidence" | "rejected";
  finalHumanVerdict?: string | null;
  reviewerName?: string | null;
  assignedReviewerId?: string | null;
}

export interface AdminDashboardData {
  stats: AdminOverviewStats;
  aiVerdictDistribution: VerdictDistributionStats;
  humanVerdictDistribution: VerdictDistributionStats;
  reviewQueue: ReviewQueueItem[];
  recentActivity: RecentActivityItem[];
}
