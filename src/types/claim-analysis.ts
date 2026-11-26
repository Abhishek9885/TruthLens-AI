import { z } from "zod";

// ============================================================================
// Claim Categories & Types
// ============================================================================

export const CLAIM_CATEGORIES = [
  "Election results",
  "Candidate statements",
  "Voting procedures",
  "Electoral fraud",
  "Political announcements",
  "Government policies",
  "Campaign promises",
  "Election statistics",
  "Other",
] as const;

export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CLAIM_TYPES = [
  "Verifiable factual claim",
  "Opinion",
  "Prediction",
  "Satire",
  "Question",
  "Unsupported allegation",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export const ANALYSIS_STATUSES = [
  "completed",
  "unrelated_content",
  "insufficient_content",
  "opinion_only",
  "no_verifiable_claims",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

// ============================================================================
// Zod Schemas for Structured Gemini Output Validation
// ============================================================================

export const contentAnalysisSchema = z.object({
  summary: z.string().trim().min(1, "Summary is required"),
  language: z.string().trim().default("en"),
  isElectionRelated: z.boolean(),
  electionType: z.string().trim().nullable().default(null),
  region: z.string().trim().nullable().default(null),
  mainTopic: z.string().trim().default("General"),
  importantDates: z.array(z.string().trim()).default([]),
});

export const entitySchema = z.object({
  name: z.string().trim().min(1, "Entity name is required"),
  type: z.string().trim().default("Other"),
  context: z.string().trim().default(""),
});

export const extractedClaimSchema = z.object({
  id: z.string().trim().default(() => `claim-${Math.random().toString(36).slice(2, 9)}`),
  originalText: z.string().trim().min(1, "Original claim text is required"),
  normalizedText: z.string().trim().min(1, "Normalized claim text is required"),
  category: z
    .string()
    .trim()
    .transform((val) => {
      const match = CLAIM_CATEGORIES.find(
        (c) => c.toLowerCase() === val.toLowerCase()
      );
      return match || "Other";
    }),
  isVerifiable: z.boolean().default(true),
  claimType: z
    .string()
    .trim()
    .transform((val) => {
      const match = CLAIM_TYPES.find(
        (t) => t.toLowerCase() === val.toLowerCase()
      );
      return match || "Verifiable factual claim";
    }),
  entities: z.array(z.string().trim()).default([]),
  date: z.string().trim().nullable().default(null),
  location: z.string().trim().nullable().default(null),
  context: z.string().trim().default(""),
  searchQueries: z.array(z.string().trim()).default([]),
});

export const overallAssessmentSchema = z.object({
  analysisStatus: z
    .string()
    .trim()
    .transform((val) => {
      const match = ANALYSIS_STATUSES.find(
        (s) => s.toLowerCase() === val.toLowerCase()
      );
      return match || "completed";
    }),
  explanation: z.string().trim().min(1, "Explanation is required"),
});

export const geminiAnalysisResponseSchema = z.object({
  contentAnalysis: contentAnalysisSchema,
  entities: z.array(entitySchema).default([]),
  claims: z.array(extractedClaimSchema).default([]),
  overallAssessment: overallAssessmentSchema,
});

// ============================================================================
// Inferred TypeScript Interfaces
// ============================================================================

export type ContentAnalysis = z.infer<typeof contentAnalysisSchema>;
export type ExtractedEntity = z.infer<typeof entitySchema>;
export type ExtractedClaim = z.infer<typeof extractedClaimSchema>;
export type OverallAssessment = z.infer<typeof overallAssessmentSchema>;
export type GeminiAnalysisResponse = z.infer<typeof geminiAnalysisResponseSchema>;

// API Request/Response
export const analyzeRequestSchema = z.object({
  submissionId: z.string().uuid("Invalid submission ID format"),
  forceReanalyze: z.boolean().optional().default(false),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export interface AnalyzeApiResponse {
  success: boolean;
  submissionId: string;
  analysis: GeminiAnalysisResponse;
  savedClaimsCount: number;
  reportId?: string | null;
  cached?: boolean;
}
