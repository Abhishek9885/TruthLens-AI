import "server-only";
import type { RawGoogleFactCheckResponse } from "@/types/evidence";

// ============================================================================
// Custom Error Classes for Error Handling & Diagnostics
// ============================================================================

export class FactCheckConfigurationError extends Error {
  constructor(
    message = "GOOGLE_FACTCHECK_API_KEY is not configured on the server. Please set it in .env.local."
  ) {
    super(message);
    this.name = "FactCheckConfigurationError";
  }
}

export class FactCheckRateLimitError extends Error {
  constructor(
    message = "Google Fact Check Tools API rate limit or quota exceeded. Please try again shortly."
  ) {
    super(message);
    this.name = "FactCheckRateLimitError";
  }
}

export class FactCheckTimeoutError extends Error {
  constructor(message = "Google Fact Check Tools API request timed out.") {
    super(message);
    this.name = "FactCheckTimeoutError";
  }
}

export class FactCheckApiError extends Error {
  public statusCode?: number;
  public details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = "FactCheckApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============================================================================
// Configuration & Helpers
// ============================================================================

const GOOGLE_FACTCHECK_SEARCH_URL =
  "https://factchecktools.googleapis.com/v1alpha1/claims:search";
export const DEFAULT_FACTCHECK_TIMEOUT_MS = 20000;
export const DEFAULT_PAGE_SIZE = 10;

/**
 * Returns the Google Fact Check API key from server environment variables.
 * Falls back to GEMINI_API_KEY if configured as a unified Google Cloud API key.
 */
export function getFactCheckApiKey(): string {
  const directKey = (process.env.GOOGLE_FACTCHECK_API_KEY || "").trim();
  if (directKey) {
    return directKey;
  }

  // Fallback to GEMINI_API_KEY if it's set and not a placeholder
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (geminiKey && !geminiKey.includes("your-gemini-api-key")) {
    return geminiKey;
  }

  throw new FactCheckConfigurationError(
    "Missing GOOGLE_FACTCHECK_API_KEY environment variable. Add your key from Google Cloud Console to .env.local."
  );
}

export interface FactCheckSearchParams {
  query: string;
  languageCode?: string | null;
  pageSize?: number;
  pageToken?: string | null;
  timeoutMs?: number;
}

/**
 * Performs a search against Google Fact Check Tools API claims:search endpoint.
 *
 * GET https://factchecktools.googleapis.com/v1alpha1/claims:search?query=...&key=...
 */
export async function searchFactCheckClaims(
  params: FactCheckSearchParams
): Promise<RawGoogleFactCheckResponse> {
  const apiKey = getFactCheckApiKey();
  const trimmedQuery = (params.query || "").trim();

  if (!trimmedQuery) {
    return { claims: [] };
  }

  const searchUrl = new URL(GOOGLE_FACTCHECK_SEARCH_URL);
  searchUrl.searchParams.set("query", trimmedQuery);
  searchUrl.searchParams.set(
    "pageSize",
    String(Math.min(params.pageSize || DEFAULT_PAGE_SIZE, 20))
  );

  if (params.languageCode && params.languageCode.trim().length > 0) {
    searchUrl.searchParams.set("languageCode", params.languageCode.trim());
  }

  if (params.pageToken && params.pageToken.trim().length > 0) {
    searchUrl.searchParams.set("pageToken", params.pageToken.trim());
  }

  searchUrl.searchParams.set("key", apiKey);

  const timeoutMs = params.timeoutMs || DEFAULT_FACTCHECK_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    // If transient 503 (temporary Google backend warm-up), retry once after a short backoff
    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      response = await fetch(searchUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    }

    clearTimeout(timeoutId);

    if (response.status === 429) {
      throw new FactCheckRateLimitError();
    }

    if (response.status === 400 || response.status === 403) {
      let errBody: { error?: { message?: string } } | null = null;
      try {
        errBody = await response.json();
      } catch {
        // ignore json parse error
      }
      const errMsg =
        errBody?.error?.message ||
        `Fact Check API request rejected with HTTP ${response.status}. Verify your API key has "Fact Check Tools API" enabled.`;
      throw new FactCheckApiError(errMsg, response.status, errBody);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new FactCheckApiError(
        `Fact Check API error HTTP ${response.status}: ${errText.slice(0, 300)}`,
        response.status
      );
    }

    const data: unknown = await response.json();

    // Handle empty body or empty object `{}`
    if (!data || typeof data !== "object") {
      return { claims: [] };
    }

    const typedData = data as RawGoogleFactCheckResponse;
    return {
      claims: Array.isArray(typedData.claims) ? typedData.claims : [],
      nextPageToken: typedData.nextPageToken || null,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (
      err instanceof FactCheckRateLimitError ||
      err instanceof FactCheckConfigurationError ||
      err instanceof FactCheckApiError
    ) {
      throw err;
    }

    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.message.toLowerCase().includes("abort"))
    ) {
      throw new FactCheckTimeoutError(
        `Google Fact Check Tools API request timed out after ${timeoutMs}ms.`
      );
    }

    throw new FactCheckApiError(
      err instanceof Error
        ? err.message
        : "Failed to communicate with Google Fact Check Tools API."
    );
  }
}
