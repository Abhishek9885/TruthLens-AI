import "server-only";
import { GoogleGenAI } from "@google/genai";

// ============================================================================
// Custom Error Classes for Error Handling & Diagnostics
// ============================================================================

export class GeminiConfigurationError extends Error {
  constructor(message = "GEMINI_API_KEY is not configured on the server.") {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

export class GeminiRateLimitError extends Error {
  constructor(
    message = "Gemini API rate limit or quota exceeded. Please try again shortly."
  ) {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiTimeoutError extends Error {
  constructor(message = "Gemini API request timed out.") {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

export class GeminiApiError extends Error {
  public statusCode?: number;
  public details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = "GeminiApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============================================================================
// Configuration
// ============================================================================

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_REQUEST_TIMEOUT_MS = 35000;

export function getGeminiModelName(): string {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
}

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new GeminiConfigurationError(
      "Missing GEMINI_API_KEY environment variable. Add your key from Google AI Studio to .env.local."
    );
  }

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
  }

  return cachedClient;
}

// ============================================================================
// JSON Sanitization & Parsing Helper
// ============================================================================

/**
 * Strips markdown code blocks (```json ... ```) or prefix text that LLMs
 * occasionally return, extracting the raw JSON string safely.
 */
export function sanitizeJsonString(raw: string): string {
  let cleaned = raw.trim();

  // Remove markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "");
    cleaned = cleaned.replace(/\n?```\s*$/, "");
  }

  // Find the first '{' or '[' and last '}' or ']'
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const start =
    firstBrace !== -1 && firstBracket !== -1
      ? Math.min(firstBrace, firstBracket)
      : firstBrace !== -1
      ? firstBrace
      : firstBracket;

  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  return cleaned.trim();
}

// ============================================================================
// Core Execution Wrapper with Timeout, Rate-Limit Detection & JSON Parsing
// ============================================================================

export interface GenerateStructuredOptions {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
}

export async function generateGeminiJson<T>(
  options: GenerateStructuredOptions
): Promise<{ data: T; rawText: string; modelUsed: string }> {
  const client = getGeminiClient();
  const model = options.model || getGeminiModelName();
  const timeoutMs = options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiCallPromise = client.models.generateContent({
      model,
      contents: options.prompt,
      config: {
        systemInstruction: options.systemInstruction,
        responseMimeType: "application/json",
        temperature: options.temperature ?? 0.1,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(new GeminiTimeoutError(`Gemini request timed out after ${timeoutMs}ms.`));
      });
    });

    const response = await Promise.race([apiCallPromise, timeoutPromise]);
    clearTimeout(timeoutId);

    const rawText = response.text || "";
    if (!rawText.trim()) {
      throw new GeminiApiError("Gemini returned an empty response.");
    }

    const sanitized = sanitizeJsonString(rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(sanitized);
    } catch (parseErr) {
      throw new GeminiApiError(
        `Failed to parse Gemini output as JSON: ${
          parseErr instanceof Error ? parseErr.message : "Invalid JSON syntax"
        }`,
        422,
        { rawSnippet: rawText.slice(0, 500) }
      );
    }

    return {
      data: parsed as T,
      rawText,
      modelUsed: model,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof GeminiTimeoutError || error instanceof GeminiConfigurationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    // Check for rate limit / quota exhaustion
    if (
      lower.includes("429") ||
      lower.includes("resource_exhausted") ||
      lower.includes("quota") ||
      lower.includes("rate limit")
    ) {
      throw new GeminiRateLimitError(
        "Gemini API rate limit or quota exceeded. Please verify your Google AI Studio quota or try again in a few moments."
      );
    }

    if (error instanceof GeminiApiError) {
      throw error;
    }

    throw new GeminiApiError(
      `Gemini generation failed: ${message}`,
      500,
      error
    );
  }
}
