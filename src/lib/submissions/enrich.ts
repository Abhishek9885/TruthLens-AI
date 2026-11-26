import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiAssessmentSummary,
  Claim,
  Review,
  Submission,
} from "@/types/database";

export const SIGNED_IMAGE_TTL_SECONDS = 900; // 15-minute short-lived signed URL

export function buildAiAssessmentSummary(
  submission: Submission,
  claims: Pick<Claim, "id" | "submission_id" | "verdict" | "confidence_score" | "created_at">[]
): AiAssessmentSummary {
  const metaAi = submission.metadata?.ai_assessment;

  // Prefer explicit DB claims/AI columns when present; never fabricate scores
  if (claims.length > 0) {
    const primary = claims[0];
    return {
      has_assessment: true,
      verdict: primary.verdict,
      confidence_score:
        typeof primary.confidence_score === "number"
          ? primary.confidence_score
          : null,
      claim_count: claims.length,
      summary: metaAi?.summary ?? null,
      assessed_at: metaAi?.assessed_at ?? primary.created_at,
    };
  }

  if (metaAi && metaAi.verdict) {
    return {
      has_assessment: true,
      verdict: metaAi.verdict,
      confidence_score:
        typeof metaAi.confidence_score === "number"
          ? metaAi.confidence_score
          : null,
      claim_count: 0,
      summary: metaAi.summary ?? null,
      assessed_at: metaAi.assessed_at ?? null,
    };
  }

  return {
    has_assessment: false,
    verdict: null,
    confidence_score: null,
    claim_count: 0,
    summary: null,
    assessed_at: null,
  };
}

export async function enrichSubmissions(
  supabase: SupabaseClient,
  submissions: Submission[]
): Promise<Submission[]> {
  if (submissions.length === 0) return [];

  const ids = submissions.map((s) => s.id);

  const [reviewsRes, claimsRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("*")
      .in("submission_id", ids)
      .order("updated_at", { ascending: false }),
    supabase
      .from("claims")
      .select("id, submission_id, verdict, confidence_score, created_at")
      .in("submission_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const latestReviewMap = new Map<string, Review>();
  for (const row of (reviewsRes.data ?? []) as Review[]) {
    if (!latestReviewMap.has(row.submission_id)) {
      latestReviewMap.set(row.submission_id, row);
    }
  }

  const claimsMap = new Map<
    string,
    Pick<Claim, "id" | "submission_id" | "verdict" | "confidence_score" | "created_at">[]
  >();
  for (const row of (claimsRes.data ?? []) as Pick<
    Claim,
    "id" | "submission_id" | "verdict" | "confidence_score" | "created_at"
  >[]) {
    const existing = claimsMap.get(row.submission_id) ?? [];
    existing.push(row);
    claimsMap.set(row.submission_id, existing);
  }

  return Promise.all(
    submissions.map(async (item) => {
      let imageSignedUrl: string | null = null;
      if (item.submission_type === "image" && item.image_path) {
        const { data: signed } = await supabase.storage
          .from("submission-images")
          .createSignedUrl(item.image_path, SIGNED_IMAGE_TTL_SECONDS);
        imageSignedUrl = signed?.signedUrl ?? null;
      }

      const itemClaims = claimsMap.get(item.id) ?? [];
      return {
        ...item,
        image_signed_url: imageSignedUrl,
        latest_review: latestReviewMap.get(item.id) ?? null,
        ai_assessment: buildAiAssessmentSummary(item, itemClaims),
      };
    })
  );
}
