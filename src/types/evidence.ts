import { z } from "zod";

// ============================================================================
// Enums & Literals
// ============================================================================

export const SOURCE_TYPES = [
  "fact_check",
  "election_commission",
  "government",
  "news",
  "legal_record",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EVIDENCE_TYPES = [
  "supporting",
  "contradicting",
  "contextual",
  "unclassified",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

// ============================================================================
// Raw Google Fact Check API Types
// ============================================================================

export interface RawGooglePublisher {
  name?: string | null;
  site?: string | null;
}

export interface RawGoogleClaimReview {
  publisher?: RawGooglePublisher | null;
  url?: string | null;
  title?: string | null;
  reviewDate?: string | null;
  textualRating?: string | null;
  languageCode?: string | null;
}

export interface RawGoogleClaim {
  text?: string | null;
  claimant?: string | null;
  claimDate?: string | null;
  claimReview?: RawGoogleClaimReview[] | null;
}

export interface RawGoogleFactCheckResponse {
  claims?: RawGoogleClaim[] | null;
  nextPageToken?: string | null;
}

// ============================================================================
// Normalized Fact Check Types & Schemas
// ============================================================================

export const normalizedClaimReviewSchema = z.object({
  publisher: z.string().min(1),
  publisherSite: z.string().nullable().optional(),
  title: z.string().min(1),
  url: z.string().url(),
  reviewDate: z.string().nullable().optional(),
  textualRating: z.string().nullable().optional(),
  languageCode: z.string().nullable().optional(),
});
export type NormalizedClaimReview = z.infer<typeof normalizedClaimReviewSchema>;

export const normalizedFactCheckResultSchema = z.object({
  claimText: z.string().min(1),
  claimant: z.string().nullable().optional(),
  claimDate: z.string().nullable().optional(),
  claimReview: z.array(normalizedClaimReviewSchema).default([]),
});
export type NormalizedFactCheckResult = z.infer<typeof normalizedFactCheckResultSchema>;

// ============================================================================
// Evidence Classification Schemas
// ============================================================================

export const evidenceClassificationSchema = z.object({
  evidenceType: z.enum(EVIDENCE_TYPES),
  relevanceScore: z.number().min(0).max(100).optional().default(50),
  relevanceExplanation: z.string().min(1),
});
export type EvidenceClassificationResult = z.infer<typeof evidenceClassificationSchema>;

// ============================================================================
// Unified Retrieved Evidence Item
// ============================================================================

export interface RetrievedEvidenceItem {
  id?: string;
  claimId: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: SourceType;
  evidenceType: EvidenceType;
  title: string;
  summary: string;
  originalRating: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  relevanceExplanation: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// API Request & Response Schemas
// ============================================================================

export const retrieveEvidenceRequestSchema = z.object({
  submissionId: z.string().uuid("A valid submission UUID is required."),
  claimIds: z.array(z.string().uuid()).optional(),
  forceRefresh: z.boolean().optional().default(false),
  maxClaimsToProcess: z.number().int().min(1).max(20).optional().default(10),
});
export type RetrieveEvidenceRequest = z.infer<typeof retrieveEvidenceRequestSchema>;

export interface ClaimEvidenceSummary {
  claimId: string;
  claimText: string;
  normalizedText?: string | null;
  category: string | null;
  factChecksCount: number;
  evidenceItems: RetrievedEvidenceItem[];
  status: "evidence_found" | "no_fact_checks_found" | "search_error";
  error?: string | null;
}

export interface RetrieveEvidenceApiResponse {
  success: boolean;
  submissionId: string;
  totalClaimsProcessed: number;
  totalEvidenceRetrieved: number;
  claimsEvidence: ClaimEvidenceSummary[];
  cached?: boolean;
  message?: string;
}
