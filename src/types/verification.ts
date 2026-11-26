import { z } from "zod";

// ============================================================================
// Verdict Enums & Types
// ============================================================================

export const VERIFICATION_VERDICTS = [
  "verified",
  "false",
  "misleading",
  "partially_true",
  "unverified",
] as const;
export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number];

export const VERDICT_LABELS: Record<VerificationVerdict, string> = {
  verified: "Verified",
  false: "False",
  misleading: "Misleading",
  partially_true: "Partially True",
  unverified: "Unverified",
};

export const VERDICT_DESCRIPTIONS: Record<VerificationVerdict, string> = {
  verified:
    "Reliable, relevant evidence sufficiently supports the material elements of the claim.",
  false:
    "Reliable, relevant evidence directly contradicts the material elements of the claim.",
  misleading:
    "The claim contains technically accurate information but omits critical context or presents facts in a materially deceptive manner.",
  partially_true:
    "Some material elements are supported, while other material elements are contradicted or inaccurate.",
  unverified:
    "Available evidence is insufficient, unreliable, outdated, or inconclusive. Absence of evidence does not indicate falsehood.",
};

// ============================================================================
// Evidence Citation Schema
// ============================================================================

export const evidenceCitationSchema = z.object({
  evidenceId: z.string().min(1, "Evidence ID is required."),
  sourceUrl: z.string().url("A valid source URL is required."),
  sourceName: z.string().optional().default("Independent Fact-Checker"),
  relevanceExplanation: z.string().min(1, "Relevance explanation is required."),
});
export type EvidenceCitation = z.infer<typeof evidenceCitationSchema>;

// ============================================================================
// Single Claim Verification Schema (Model Output & Database Persistence)
// ============================================================================

export const claimVerificationResultSchema = z.object({
  claimId: z.string().min(1, "Claim ID is required."),
  verdict: z.enum(VERIFICATION_VERDICTS),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Model confidence in its assessment based strictly on available evidence. NOT the probability of truth."
    ),
  explanation: z.string().min(10, "Detailed explanation is required."),
  supportingEvidence: z.array(evidenceCitationSchema).default([]),
  contradictingEvidence: z.array(evidenceCitationSchema).default([]),
  contextualEvidence: z.array(evidenceCitationSchema).default([]),
  limitations: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  reasoningSummary: z
    .string()
    .min(5, "Transparent reasoning summary is required."),
  requiresHumanReview: z.literal(true).default(true),
});
export type ClaimVerificationResult = z.infer<
  typeof claimVerificationResultSchema
>;

// ============================================================================
// Overall Submission Verification Report Schema
// ============================================================================

export const verdictCountsSchema = z.object({
  verified: z.number().int().min(0).default(0),
  false: z.number().int().min(0).default(0),
  misleading: z.number().int().min(0).default(0),
  partially_true: z.number().int().min(0).default(0),
  unverified: z.number().int().min(0).default(0),
});
export type VerdictCounts = z.infer<typeof verdictCountsSchema>;

export const submissionVerificationReportSchema = z.object({
  submissionId: z.string().uuid(),
  reportId: z.string().uuid().nullable().optional(),
  totalClaims: z.number().int().min(0),
  counts: verdictCountsSchema,
  claimVerifications: z.array(claimVerificationResultSchema),
  overallSynthesis: z.string().min(1),
  methodology: z.string().min(1),
  modelUsed: z.string().min(1),
  verifiedAt: z.string(),
  requiresHumanReview: z.boolean().default(true),
});
export type SubmissionVerificationReport = z.infer<
  typeof submissionVerificationReportSchema
>;

// ============================================================================
// API Request & Response Schemas
// ============================================================================

export const verifySubmissionRequestSchema = z.object({
  submissionId: z.string().uuid("A valid submission UUID is required."),
  claimIds: z.array(z.string().uuid()).optional(),
  forceReverify: z.boolean().optional().default(false),
});
export type VerifySubmissionRequest = z.infer<
  typeof verifySubmissionRequestSchema
>;

export interface VerifyApiResponse {
  success: boolean;
  submissionId: string;
  report: SubmissionVerificationReport;
  cached?: boolean;
  message?: string;
}
