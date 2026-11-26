import "server-only";
import { generateGeminiJson } from "@/lib/gemini";
import {
  evidenceClassificationSchema,
  type EvidenceClassificationResult,
  type NormalizedClaimReview,
} from "@/types/evidence";

export interface ClaimContextForClassification {
  claimText: string;
  normalizedText?: string | null;
  date?: string | null;
  location?: string | null;
  category?: string | null;
}

export interface FactCheckContextForClassification {
  factCheckClaimText: string;
  review: NormalizedClaimReview;
}

const CLASSIFICATION_SYSTEM_INSTRUCTION = `You are the TruthLens AI Evidence Classification Engine.
Your task is to classify how a retrieved fact-check article relates to a specific target claim under investigation.

CLASSIFICATION CATEGORIES:
1. "supporting": The fact-check confirms or substantiates the target claim as accurate or true.
2. "contradicting": The fact-check refutes, debunks, or contradicts the target claim (e.g., proves the asserted event, quote, or statistic is false or fabricated).
3. "contextual": The article discusses the broader topic, candidates, or related events, but does not directly verify or refute this specific factual assertion (e.g., provides background on election laws, historical precedents, or a different precinct).
4. "unclassified": The source has ambiguous relevance, discusses an unrelated subject, or relevance cannot be determined with confidence.

CRITICAL RULES:
- NEVER invent or hallucinate facts, sources, or URLs.
- Do NOT classify evidence solely on single keywords in the publisher's rating. You must compare the actual proposition asserted in the target claim against what the fact-checker evaluated.
  * Example: If the target claim asserts "County X had 50,000 fraudulent mail-in ballots", and the fact-checker investigated that claim and rated it "False", this fact-check CONTRADICTS the target claim.
  * Example: If the target claim asserts "The Secretary of State extended polling hours to 9 PM", and the fact-checker rated it "True", this fact-check SUPPORTS the target claim.
- Consider dates, names, and geographic locations to ensure both reference the same event.
- If the fact check discusses a different election cycle or different state, classify as "contextual" or "unclassified".

OUTPUT FORMAT:
Return strictly valid JSON:
{
  "evidenceType": "supporting" | "contradicting" | "contextual" | "unclassified",
  "relevanceScore": number between 0 and 100,
  "relevanceExplanation": "Concise 1-2 sentence objective explanation describing specifically how this fact-check relates to the target claim"
}`;

/**
 * Deterministic fallback classifier used if AI service is unavailable or rate limited.
 */
export function classifyEvidenceHeuristic(
  claim: ClaimContextForClassification,
  factCheck: FactCheckContextForClassification
): EvidenceClassificationResult {
  const targetText = (claim.normalizedText || claim.claimText || "").toLowerCase();
  const fcClaimText = (factCheck.factCheckClaimText || "").toLowerCase();
  const title = (factCheck.review.title || "").toLowerCase();
  const rating = (factCheck.review.textualRating || "").toLowerCase();

  // Basic token overlap
  const targetWords = targetText.split(/\W+/).filter((w) => w.length > 3);
  const fcWords = new Set((fcClaimText + " " + title).split(/\W+/).filter((w) => w.length > 3));

  let matchCount = 0;
  for (const w of targetWords) {
    if (fcWords.has(w)) matchCount++;
  }

  const overlapRatio = targetWords.length > 0 ? matchCount / targetWords.length : 0;

  // Rating polarity indicators
  const isRefutingRating =
    /\b(false|pants on fire|incorrect|fake|debunked|hoax|untrue|fabricated|disproven|scam)\b/i.test(rating);
  const isAffirmingRating =
    /\b(true|correct|accurate|verified|confirmed)\b/i.test(rating) &&
    !/\b(not true|partly|mostly false|half true)\b/i.test(rating);
  const isContextualRating =
    /\b(misleading|needs context|partly|half true|unproven|unsupported|mixture|exaggerates)\b/i.test(rating);

  if (overlapRatio < 0.25) {
    return {
      evidenceType: "contextual",
      relevanceScore: 40,
      relevanceExplanation: `Retrieved article from ${factCheck.review.publisher} mentions related keywords but does not directly evaluate this specific claim statement.`,
    };
  }

  if (isRefutingRating) {
    return {
      evidenceType: "contradicting",
      relevanceScore: Math.round(70 + overlapRatio * 25),
      relevanceExplanation: `Fact-check by ${factCheck.review.publisher} evaluated this assertion and designated it as "${factCheck.review.textualRating || "Refuted"}".`,
    };
  }

  if (isAffirmingRating) {
    return {
      evidenceType: "supporting",
      relevanceScore: Math.round(70 + overlapRatio * 25),
      relevanceExplanation: `Fact-check by ${factCheck.review.publisher} examined this statement and rated it as "${factCheck.review.textualRating || "Verified"}".`,
    };
  }

  if (isContextualRating) {
    return {
      evidenceType: "contextual",
      relevanceScore: 60,
      relevanceExplanation: `Article by ${factCheck.review.publisher} evaluated related claims with rating "${factCheck.review.textualRating || "Context Required"}".`,
    };
  }

  return {
    evidenceType: "unclassified",
    relevanceScore: 50,
    relevanceExplanation: `Fact-check article from ${factCheck.review.publisher} with rating "${factCheck.review.textualRating || "Unrated"}". Directional relevance requires further analysis.`,
  };
}

/**
 * Classifies a retrieved fact-check review against a target claim.
 * Uses Gemini AI with prompt guardrails when available, falling back safely to deterministic rules.
 */
export async function classifyEvidence(
  claim: ClaimContextForClassification,
  factCheck: FactCheckContextForClassification
): Promise<EvidenceClassificationResult> {
  // If Gemini API is not configured or in unit test environment, use heuristic
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey || apiKey.includes("your-gemini-api-key")) {
    return classifyEvidenceHeuristic(claim, factCheck);
  }

  try {
    const prompt = `Classify how the retrieved fact-check review relates to the target claim.

<target_claim>
Claim Text: ${claim.claimText}
${claim.normalizedText ? `Normalized Assertion: ${claim.normalizedText}` : ""}
${claim.category ? `Category: ${claim.category}` : ""}
${claim.date ? `Date: ${claim.date}` : ""}
${claim.location ? `Location: ${claim.location}` : ""}
</target_claim>

<retrieved_fact_check>
Publisher: ${factCheck.review.publisher} (${factCheck.review.publisherSite || "site not specified"})
Article Title: ${factCheck.review.title}
Original Publisher Rating: ${factCheck.review.textualRating || "No rating provided"}
Claim Evaluated by Fact-Checker: ${factCheck.factCheckClaimText}
Review Date: ${factCheck.review.reviewDate || "Date unspecified"}
Source URL: ${factCheck.review.url}
</retrieved_fact_check>

Return ONLY the JSON classification object.`;

    const rawJson = await generateGeminiJson({
      prompt,
      systemInstruction: CLASSIFICATION_SYSTEM_INSTRUCTION,
      temperature: 0.1,
      timeoutMs: 15000,
    });

    const parsed = evidenceClassificationSchema.safeParse(rawJson);
    if (parsed.success) {
      return parsed.data;
    }

    return classifyEvidenceHeuristic(claim, factCheck);
  } catch {
    // If Gemini fails (rate limits, timeouts), fall back to robust heuristic classifier
    return classifyEvidenceHeuristic(claim, factCheck);
  }
}
