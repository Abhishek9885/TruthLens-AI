import "server-only";
import {
  analyzeSubmissionContent,
  type AnalyzeContentOptions,
} from "./claim-extraction.service";
import type {
  ContentAnalysis,
  ExtractedEntity,
  GeminiAnalysisResponse,
} from "@/types/claim-analysis";

export interface ContentUnderstandingResult {
  contentAnalysis: ContentAnalysis;
  entities: ExtractedEntity[];
  overallAssessment: GeminiAnalysisResponse["overallAssessment"];
}

/**
 * Content Understanding Service
 *
 * Analyzes extracted text from News article URLs, manual text, or OCR images.
 * Determines election relevance, election type, topic, entities, and summary.
 */
export async function understandContent(
  text: string,
  options?: AnalyzeContentOptions
): Promise<ContentUnderstandingResult> {
  const fullAnalysis = await analyzeSubmissionContent(text, options);

  return {
    contentAnalysis: fullAnalysis.contentAnalysis,
    entities: fullAnalysis.entities,
    overallAssessment: fullAnalysis.overallAssessment,
  };
}

export { analyzeSubmissionContent };
