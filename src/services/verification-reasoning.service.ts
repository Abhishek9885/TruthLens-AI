import "server-only";
import { generateGeminiJson } from "@/lib/gemini";
import {
  claimVerificationResultSchema,
  type ClaimVerificationResult,
  type EvidenceCitation,
  type VerificationVerdict,
} from "@/types/verification";
import type { EvaluatedEvidenceItem, EvidenceQualityAudit } from "./evidence-quality.service";
import type { Claim } from "@/types/database";

const VERIFICATION_REASONING_SYSTEM_INSTRUCTION = `You are the TruthLens AI Evidence-Based Verification and Reasoning Engine.
Your task is to impartially evaluate whether an election-related claim is supported, refuted, misleading, partially true, or unverified, based SOLELY on the supplied catalog of retrieved evidence.

VERDICT DEFINITIONS:
1. "verified": Reliable, relevant evidence directly and sufficiently supports the material elements of the claim.
2. "false": Reliable, relevant evidence directly and unambiguously contradicts/refutes the material elements of the claim.
3. "misleading": The claim contains elements of truth but omits critical context, exaggerates, or presents facts in a materially deceptive manner.
4. "partially_true": Some material elements are supported, while other material elements are contradicted or inaccurate.
5. "unverified": Available evidence is insufficient, absent, unreliable, outdated, or inconclusive. 

CRITICAL EVIDENCE RULES:
- CITATION STRICTNESS: You may ONLY cite evidence items that appear in the provided <retrieved_evidence_catalog>.
  * Every citation MUST include the exact "evidenceId" and "sourceUrl" from the catalog.
  * NEVER invent an evidenceId, a URL, a quotation, a fact-checker name, or a statistic.
  * If an evidenceId was not provided in the catalog, DO NOT reference it.
- ZERO EVIDENCE RULE: If the evidence catalog is empty or has zero relevant items, your verdict MUST BE "unverified".
  * Do NOT assume a claim is true or false because no fact-check exists.
  * Set confidence between 0 and 15.
- CONTRADICTORY EVIDENCE: If sources disagree or present conflicting findings, explicitly acknowledge the contradiction in "reasoningSummary", explain the discrepancies, and do not arbitrarily pick one unless source primary directness or dates clearly resolve it. Assign "partially_true" or "unverified".
- TIMELINE & GEOGRAPHY: Ensure the evidence speaks to the exact election cycle, date, and jurisdiction in the claim. If the evidence evaluates a different year or state, classify it as contextual background, NOT definitive proof.
- MODEL CONFIDENCE: The "confidence" score (0 to 100) reflects your confidence in the sufficiency and quality of the evidence, NOT the probability that the claim is true.
- "requiresHumanReview" must always be true.

OUTPUT FORMAT:
Return strictly valid JSON conforming to this schema:
{
  "claimId": "...",
  "verdict": "verified" | "false" | "misleading" | "partially_true" | "unverified",
  "confidence": number between 0 and 100,
  "explanation": "Clear, objective, evidence-grounded explanation of the assessment",
  "supportingEvidence": [
    { "evidenceId": "...", "sourceUrl": "...", "sourceName": "...", "relevanceExplanation": "..." }
  ],
  "contradictingEvidence": [
    { "evidenceId": "...", "sourceUrl": "...", "sourceName": "...", "relevanceExplanation": "..." }
  ],
  "contextualEvidence": [
    { "evidenceId": "...", "sourceUrl": "...", "sourceName": "...", "relevanceExplanation": "..." }
  ],
  "limitations": ["String describing quality or scope limitation 1", "..."],
  "missingInformation": ["String describing essential information that remains missing 1", "..."],
  "reasoningSummary": "1-2 paragraph transparent synthesis of the evidence and why this verdict is justified",
  "requiresHumanReview": true
}`;

/**
 * Deterministic rule-based fallback verification generator.
 * Used if Gemini API is unavailable or rate limited, ensuring the system never crashes.
 */
export function generateHeuristicVerification(
  claim: Claim,
  audit: EvidenceQualityAudit
): ClaimVerificationResult {
  const evidenceList = audit.evaluatedEvidence;
  const supporting: EvidenceCitation[] = [];
  const contradicting: EvidenceCitation[] = [];
  const contextual: EvidenceCitation[] = [];

  for (const item of evidenceList) {
    const citation: EvidenceCitation = {
      evidenceId: item.id || item.sourceUrl,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      relevanceExplanation: item.relevanceExplanation || item.summary || "Catalogued evidence source.",
    };

    if (item.evidenceType === "supporting") {
      supporting.push(citation);
    } else if (item.evidenceType === "contradicting") {
      contradicting.push(citation);
    } else {
      contextual.push(citation);
    }
  }

  // Case A: Zero evidence
  if (evidenceList.length === 0) {
    return {
      claimId: claim.id,
      verdict: "unverified",
      confidence: 10,
      explanation:
        "No matching fact-checks or primary evidence sources were catalogued for this assertion. TruthLens AI cannot verify or refute this claim without documentary evidence.",
      supportingEvidence: [],
      contradictingEvidence: [],
      contextualEvidence: [],
      limitations: [
        "No matching entries in public fact-check registries.",
        "Local or emerging election occurrences may lack Schema.org fact-check documentation.",
      ],
      missingInformation: [
        "Official election commission statements or certified precinct results.",
        "Primary source documents verifying the alleged occurrence.",
      ],
      reasoningSummary:
        "Without relevant evidence, this claim remains strictly unverified. In accordance with platform governance, absence of fact-checks is never treated as proof of truth or falsehood.",
      requiresHumanReview: true,
    };
  }

  // Case B: Contradictory evidence (both supporting and contradicting sources present)
  if (supporting.length > 0 && contradicting.length > 0) {
    return {
      claimId: claim.id,
      verdict: "partially_true",
      confidence: 55,
      explanation:
        "Retrieved evidence presents conflicting findings across multiple independent reporting outlets. Material elements are subject to active factual dispute.",
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      contextualEvidence: contextual,
      limitations: [
        ...audit.qualityLimitations,
        "Conflicting source reports preclude an unambiguous true or false determination.",
      ],
      missingInformation: [
        "Official reconciliation from certified election administrators.",
      ],
      reasoningSummary: `Analysis identified ${supporting.length} supporting sources and ${contradicting.length} contradicting sources. Because independent sources directly conflict, this claim is designated as partially true pending further investigative review.`,
      requiresHumanReview: true,
    };
  }

  // Case C: Predominantly contradicting
  if (contradicting.length > 0 && supporting.length === 0) {
    const hasOutdated = audit.hasTemporalMismatch;
    const verdict: VerificationVerdict = hasOutdated ? "unverified" : "false";
    const confidence = hasOutdated ? 45 : Math.min(85, 60 + contradicting.length * 10);

    return {
      claimId: claim.id,
      verdict,
      confidence,
      explanation: hasOutdated
        ? "Available refuting sources evaluate prior election cycles and do not conclusively resolve the current assertion."
        : `Independent fact-checkers investigated this specific assertion and refuted it as inaccurate.`,
      supportingEvidence: [],
      contradictingEvidence: contradicting,
      contextualEvidence: contextual,
      limitations: audit.qualityLimitations,
      missingInformation: hasOutdated
        ? ["Contemporary documentation addressing the designated election cycle."]
        : [],
      reasoningSummary: `Examined ${contradicting.length} contradicting source(s) from established fact-check organizations (e.g. ${contradicting.map((c) => c.sourceName).join(", ")}). The evidence directly challenges the material proposition.`,
      requiresHumanReview: true,
    };
  }

  // Case D: Predominantly supporting
  if (supporting.length > 0 && contradicting.length === 0) {
    const hasOutdated = audit.hasTemporalMismatch;
    const verdict: VerificationVerdict = hasOutdated ? "unverified" : "verified";
    const confidence = hasOutdated ? 45 : Math.min(85, 60 + supporting.length * 10);

    return {
      claimId: claim.id,
      verdict,
      confidence,
      explanation: hasOutdated
        ? "Supporting sources reference past events and may not apply to the current election timeline."
        : `Available evidence from ${supporting.length} source(s) corroborates the factual elements of this claim.`,
      supportingEvidence: supporting,
      contradictingEvidence: [],
      contextualEvidence: contextual,
      limitations: audit.qualityLimitations,
      missingInformation: hasOutdated
        ? ["Contemporary verification confirming the rule or outcome remains active."]
        : [],
      reasoningSummary: `Corroborated across ${supporting.length} source(s). Material elements align with documented public records and verified reporting.`,
      requiresHumanReview: true,
    };
  }

  // Case E: Contextual only
  return {
    claimId: claim.id,
    verdict: "unverified",
    confidence: 30,
    explanation:
      "Available sources discuss related topics, candidates, or regional policies, but do not provide direct proof or refutation of this specific assertion.",
    supportingEvidence: [],
    contradictingEvidence: [],
    contextualEvidence: contextual,
    limitations: [
      ...audit.qualityLimitations,
      "Retrieved sources provide general context but lack direct factual verification.",
    ],
    missingInformation: [
      "Direct evidentiary investigation addressing the specific numerical or procedural claim.",
    ],
    reasoningSummary:
      "Catalogued sources serve as contextual background only. Because direct evidence is lacking, the claim is classified as unverified.",
    requiresHumanReview: true,
  };
}

/**
 * Conducts verification reasoning for a single claim using Gemini AI.
 * Strictly verifies citations against supplied evidence IDs, dropping any hallucinated citations.
 */
export async function reasonClaimVerification(
  claim: Claim,
  audit: EvidenceQualityAudit
): Promise<ClaimVerificationResult> {
  // If no evidence exists, skip LLM to prevent hallucination and return pure unverified
  if (audit.evaluatedEvidence.length === 0) {
    return generateHeuristicVerification(claim, audit);
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey || apiKey.includes("your-gemini-api-key")) {
    return generateHeuristicVerification(claim, audit);
  }

  // Prepare safe evidence catalog
  const catalogForPrompt = audit.evaluatedEvidence.map((item) => ({
    evidenceId: item.id || item.sourceUrl,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    title: item.title,
    originalRating: item.originalRating || "No rating provided",
    publishedAt: item.publishedAt || "Date unspecified",
    evidenceType: item.evidenceType,
    summary: item.summary,
    relevanceExplanation: item.relevanceExplanation,
    isSyndicated: item.quality.isSyndicated,
    temporalRelevance: item.quality.temporalRelevance,
  }));

  const validEvidenceIdMap = new Map<string, EvaluatedEvidenceItem>();
  for (const item of audit.evaluatedEvidence) {
    validEvidenceIdMap.set(item.id || item.sourceUrl, item);
    validEvidenceIdMap.set(item.sourceUrl, item);
  }

  const prompt = `Synthesize available evidence and generate an evidence-backed preliminary verification assessment.

<target_claim>
Claim ID: ${claim.id}
Claim Text: "${claim.claim_text}"
${claim.normalized_text ? `Normalized Assertion: "${claim.normalized_text}"` : ""}
Category: ${claim.category || "General election statement"}
Date / Time Period: ${claim.date || "Unspecified"}
Geographic Location: ${claim.location || "Unspecified"}
Context: ${claim.context || "None provided"}
</target_claim>

<evidence_quality_audit>
Total Sources: ${audit.totalSources}
Independent Source Count: ${audit.independentSourceCount}
Has Primary Sources: ${audit.hasPrimarySources}
Syndication / Echo Detected: ${audit.hasSyndicatedDuplicates}
Temporal Mismatch Flag: ${audit.hasTemporalMismatch}
Geographic Mismatch Flag: ${audit.hasGeographicMismatch}
Quality Limitations: ${JSON.stringify(audit.qualityLimitations)}
</evidence_quality_audit>

<retrieved_evidence_catalog>
${JSON.stringify(catalogForPrompt, null, 2)}
</retrieved_evidence_catalog>

REMEMBER:
- You may ONLY cite evidenceIds present in <retrieved_evidence_catalog>.
- Do not guess or invent verdicts. If evidence is ambiguous, output "unverified" or "partially_true".
- Return ONLY the JSON object conforming strictly to the requested schema.`;

  try {
    const rawJson = await generateGeminiJson({
      prompt,
      systemInstruction: VERIFICATION_REASONING_SYSTEM_INSTRUCTION,
      temperature: 0.1,
      timeoutMs: 25000,
    });

    const parsed = claimVerificationResultSchema.safeParse(rawJson);
    if (!parsed.success) {
      return generateHeuristicVerification(claim, audit);
    }

    const result = parsed.data;

    // Anti-Hallucination Citation Scrubbing:
    // Programmatically ensure every cited evidenceId exists in our catalog
    const filterValidCitations = (citations: EvidenceCitation[]) =>
      citations.filter((c) => {
        const found = validEvidenceIdMap.get(c.evidenceId) || validEvidenceIdMap.get(c.sourceUrl);
        if (found) {
          // Normalize sourceUrl and sourceName to match real catalog
          c.sourceUrl = found.sourceUrl;
          c.sourceName = found.sourceName;
          return true;
        }
        return false;
      });

    result.supportingEvidence = filterValidCitations(result.supportingEvidence);
    result.contradictingEvidence = filterValidCitations(result.contradictingEvidence);
    result.contextualEvidence = filterValidCitations(result.contextualEvidence);

    // Merge system-detected quality limitations
    const combinedLimitations = Array.from(
      new Set([...audit.qualityLimitations, ...result.limitations])
    );
    result.limitations = combinedLimitations;
    result.claimId = claim.id;
    result.requiresHumanReview = true;

    return result;
  } catch {
    // If Gemini fails (rate limit, timeout), return deterministic heuristic synthesis
    return generateHeuristicVerification(claim, audit);
  }
}
