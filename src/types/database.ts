export type UserRole = "user" | "admin";

export type SubmissionType = "url" | "text" | "image";

export type SubmissionStatus =
  | "pending"
  | "extracted"
  | "in_review"
  | "pending_review"
  | "under_review"
  | "approved"
  | "flagged"
  | "needs_evidence"
  | "rejected"
  | "completed"
  | "failed";

export type ExtractionStatus =
  | "not_applicable"
  | "success"
  | "partial"
  | "failed";

export type ClaimVerdict =
  | "unverified"
  | "verified_true"
  | "misleading"
  | "false"
  | "unverifiable";

export type EvidenceStance = "supporting" | "refuting" | "neutral";

export type ReviewDecision =
  | "approved"
  | "flagged"
  | "rejected"
  | "needs_evidence"
  | "needs_more_evidence";

export type HumanReviewStatus =
  | "pending_review"
  | "under_review"
  | "approved"
  | "flagged"
  | "needs_evidence"
  | "rejected";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionMetadata {
  domain?: string;
  site_name?: string;
  author?: string;
  published_at?: string;
  description?: string;
  http_status?: number;
  content_type?: string;
  ocr_confidence?: number | null;
  ocr_engine?: string;
  original_filename?: string;
  word_count?: number;
  char_count?: number;
  redirected_to?: string;
  redirect_chain?: string[];
  ai_assessment?: {
    verdict?: ClaimVerdict;
    confidence_score?: number | null;
    summary?: string | null;
    assessed_at?: string | null;
  } | null;
  [key: string]: unknown;
}

export interface AiAssessmentSummary {
  has_assessment: boolean;
  verdict: ClaimVerdict | null;
  confidence_score: number | null;
  claim_count: number;
  summary: string | null;
  assessed_at: string | null;
}

export interface Submission {
  id: string;
  user_id: string;
  submission_type: SubmissionType;
  status: SubmissionStatus;
  title: string | null;
  source_url: string | null;
  raw_text: string | null;
  extracted_text: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  image_path: string | null;
  image_mime_type: string | null;
  image_size_bytes: number | null;
  metadata: SubmissionMetadata;
  created_at: string;
  updated_at: string;
  image_signed_url?: string | null;
  latest_review?: Review | null;
  ai_assessment?: AiAssessmentSummary | null;
}

export interface Claim {
  id: string;
  submission_id: string;
  created_by: string;
  claim_text: string;
  category: string | null;
  verdict: ClaimVerdict;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
  normalized_text?: string | null;
  is_verifiable?: boolean;
  claim_type?: string;
  entities?: string[];
  date?: string | null;
  location?: string | null;
  context?: string | null;
  search_queries?: string[];
  metadata?: Record<string, unknown>;
  ai_verdict?: string | null;
  ai_confidence?: number | null;
  ai_explanation?: string | null;
  ai_reasoning?: string | null;
  ai_structured_result?: Record<string, unknown> | null;
  verified_at?: string | null;
  human_verdict?: string | null;
  human_explanation?: string | null;
  human_reviewer_id?: string | null;
  human_reviewed_at?: string | null;
}

export interface Evidence {
  id: string;
  claim_id: string;
  added_by: string;
  source_title: string;
  source_url: string | null;
  excerpt: string | null;
  stance: EvidenceStance;
  credibility_rating: number | null;
  created_at: string;
  source_name?: string | null;
  source_type?: string | null;
  evidence_type?: string | null;
  title?: string | null;
  summary?: string | null;
  original_rating?: string | null;
  published_at?: string | null;
  retrieved_at?: string | null;
  relevance_explanation?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Report {
  id: string;
  submission_id: string;
  author_id: string;
  summary: string;
  methodology: string | null;
  overall_verdict: ClaimVerdict;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  findings?: unknown[] | null;
  overall_stats?: Record<string, unknown> | null;
  limitations?: string[] | null;
  ai_model?: string | null;
  final_human_verdict?: string | null;
  human_review_status?: HumanReviewStatus | null;
  reviewer_notes?: string | null;
  reviewed_at?: string | null;
  reviewer_id?: string | null;
}

export interface Review {
  id: string;
  submission_id: string;
  reviewer_id: string;
  decision: ReviewDecision;
  notes: string | null;
  created_at: string;
  updated_at: string;
  report_id?: string | null;
  previous_verdict?: string | null;
  final_verdict?: string | null;
  evidence_inspected?: boolean;
  evidence_references?: Record<string, unknown>[] | null;
  unresolved_issues?: string | null;
  reviewer?: {
    id: string;
    email?: string;
    full_name?: string | null;
  };
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}
