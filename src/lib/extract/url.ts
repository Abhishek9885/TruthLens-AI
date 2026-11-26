import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import {
  isBlockedHostnameOrIp,
  isBlockedIpAddress,
  validatePublicHttpUrl,
} from "@/lib/validation/url-safety";
import type { ExtractionStatus, SubmissionMetadata } from "@/types/database";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export interface UrlExtractionResult {
  sourceUrl: string;
  title: string | null;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  blockedByPolicy?: boolean;
  metadata: SubmissionMetadata;
}

const FETCH_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB cap
const MAX_EXTRACTED_CHARS = 30000;

export async function assertPublicHost(rawHostname: string): Promise<void> {
  const hostCheck = isBlockedHostnameOrIp(rawHostname);
  if (hostCheck.blocked) {
    throw new SsrfBlockedError(
      hostCheck.reason ?? "Target host is not permitted."
    );
  }

  const cleanHost = rawHostname.replace(/^\[|\]$/g, "");
  if (net.isIP(cleanHost)) {
    if (isBlockedIpAddress(cleanHost)) {
      throw new SsrfBlockedError(
        "Private, loopback, or reserved IP addresses are not permitted."
      );
    }
    return;
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(cleanHost, { all: true });
  } catch {
    throw new Error(`Could not resolve domain name "${cleanHost}".`);
  }

  if (!records.length) {
    throw new Error(`Could not resolve domain name "${cleanHost}".`);
  }

  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new SsrfBlockedError(
        "Target domain resolves to a restricted private or internal IP address."
      );
    }
  }
}

function cleanText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

async function fetchWithValidatedRedirects(
  initialUrl: URL,
  signal: AbortSignal,
  baseMetadata: SubmissionMetadata
): Promise<Response> {
  let currentUrl = initialUrl;
  const visited = new Set<string>([currentUrl.toString()]);
  const redirectChain: string[] = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = validatePublicHttpUrl(currentUrl.toString());
    if (!validated.ok) {
      throw new SsrfBlockedError(validated.error);
    }

    await assertPublicHost(validated.url.hostname);

    const response = await fetch(validated.url.toString(), {
      method: "GET",
      signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TruthLensBot/1.0; +https://truthlens.ai)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!isRedirectStatus(response.status)) {
      if (redirectChain.length > 0) {
        baseMetadata.redirected_to = validated.url.toString();
        baseMetadata.redirect_chain = redirectChain;
      }
      return response;
    }

    // Drain/cancel body before hopping
    await response.body?.cancel().catch(() => {});

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(
        `Website returned HTTP ${response.status} redirect without a destination.`
      );
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, validated.url);
    } catch {
      throw new SsrfBlockedError("Website returned a malformed redirect URL.");
    }

    const nextValidated = validatePublicHttpUrl(nextUrl.toString());
    if (!nextValidated.ok) {
      throw new SsrfBlockedError(
        `Redirect destination blocked: ${nextValidated.error}`
      );
    }

    const nextString = nextValidated.url.toString();
    if (visited.has(nextString)) {
      throw new Error("Circular redirect loop detected while fetching URL.");
    }

    if (hop === MAX_REDIRECTS) {
      throw new Error(
        `Exceeded maximum of ${MAX_REDIRECTS} HTTP redirects.`
      );
    }

    visited.add(nextString);
    redirectChain.push(nextString);
    currentUrl = nextValidated.url;
  }

  throw new Error("Redirect resolution exceeded limit.");
}

export async function extractArticleFromUrl(
  rawUrl: string
): Promise<UrlExtractionResult> {
  const initialCheck = validatePublicHttpUrl(rawUrl);
  if (!initialCheck.ok) {
    return {
      sourceUrl: rawUrl.trim(),
      title: null,
      extractedText: null,
      extractionStatus: "failed",
      extractionError: initialCheck.error,
      blockedByPolicy: true,
      metadata: {},
    };
  }

  const parsedUrl = initialCheck.url;
  const baseMetadata: SubmissionMetadata = {
    domain: parsedUrl.hostname,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchWithValidatedRedirects(
      parsedUrl,
      controller.signal,
      baseMetadata
    );

    baseMetadata.http_status = response.status;
    const contentType = response.headers.get("content-type") ?? "";
    baseMetadata.content_type = contentType;

    if (!response.ok) {
      return {
        sourceUrl: parsedUrl.toString(),
        title: null,
        extractedText: null,
        extractionStatus: "failed",
        extractionError: `Website blocked automated extraction or returned HTTP ${response.status} (${response.statusText || "Unavailable"}). The original URL can still be saved with analyst notes.`,
        metadata: baseMetadata,
      };
    }

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      return {
        sourceUrl: parsedUrl.toString(),
        title: null,
        extractedText: null,
        extractionStatus: "failed",
        extractionError: `Unsupported content type (${contentType || "unknown"}). Only HTML or plain-text articles can be parsed, though the original URL can still be saved.`,
        metadata: baseMetadata,
      };
    }

    // Stream-bounded read to prevent memory spikes
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        sourceUrl: parsedUrl.toString(),
        title: null,
        extractedText: null,
        extractionStatus: "failed",
        extractionError:
          "Website returned an empty response body. The original URL can still be saved.",
        metadata: baseMetadata,
      };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_HTML_BYTES) {
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
    }

    const html = Buffer.concat(chunks).toString("utf-8");

    if (contentType.includes("text/plain")) {
      const plainText = cleanText(html).slice(0, MAX_EXTRACTED_CHARS);
      return {
        sourceUrl: parsedUrl.toString(),
        title: parsedUrl.hostname,
        extractedText: plainText || null,
        extractionStatus: plainText ? "success" : "failed",
        extractionError: plainText
          ? null
          : "Page contained no readable text. Original URL is preserved.",
        metadata: {
          ...baseMetadata,
          word_count: plainText ? plainText.split(/\s+/).length : 0,
        },
      };
    }

    const $ = cheerio.load(html);

    const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
    const twitterTitle = $('meta[name="twitter:title"]').attr("content")?.trim();
    const docTitle = $("title").first().text().trim();
    const h1Title = $("h1").first().text().trim();

    const title = (ogTitle || twitterTitle || docTitle || h1Title || "").slice(
      0,
      240
    );

    const description =
      $('meta[property="og:description"]').attr("content")?.trim() ||
      $('meta[name="description"]').attr("content")?.trim() ||
      "";
    const siteName = $('meta[property="og:site_name"]').attr("content")?.trim();
    const author =
      $('meta[name="author"]').attr("content")?.trim() ||
      $('meta[property="article:author"]').attr("content")?.trim();
    const publishedAt =
      $('meta[property="article:published_time"]').attr("content")?.trim() ||
      $("time[datetime]").first().attr("datetime")?.trim();

    if (siteName) baseMetadata.site_name = siteName;
    if (author) baseMetadata.author = author;
    if (publishedAt) baseMetadata.published_at = publishedAt;
    if (description) baseMetadata.description = description;

    // Strip boilerplate & non-content tags
    $(
      "script, style, noscript, iframe, svg, nav, footer, header, aside, form, button, [role='navigation'], [aria-hidden='true']"
    ).remove();

    const container =
      $("article").length > 0
        ? $("article").first()
        : $("main").length > 0
        ? $("main").first()
        : $("[role='main']").length > 0
        ? $("[role='main']").first()
        : $("body");

    const blocks: string[] = [];
    container.find("h1, h2, h3, p, li, blockquote").each((_, el) => {
      const text = cleanText($(el).text());
      if (text.length >= 25) {
        blocks.push(text);
      }
    });

    const uniqueBlocks = blocks.filter(
      (item, index) => index === 0 || item !== blocks[index - 1]
    );

    let extractedText = uniqueBlocks.join("\n\n");
    if (!extractedText) {
      extractedText = cleanText(container.text());
    }
    if (!extractedText && description) {
      extractedText = description;
    }

    extractedText = extractedText.slice(0, MAX_EXTRACTED_CHARS);

    if (!title && !extractedText) {
      return {
        sourceUrl: parsedUrl.toString(),
        title: null,
        extractedText: null,
        extractionStatus: "failed",
        extractionError:
          "Website appears to require JavaScript rendering or blocks automated extraction. Original URL is preserved and can still be saved with analyst notes.",
        metadata: baseMetadata,
      };
    }

    const wordCount = extractedText ? extractedText.split(/\s+/).length : 0;
    baseMetadata.word_count = wordCount;

    const isPartial = wordCount < 25;

    return {
      sourceUrl: parsedUrl.toString(),
      title: title || parsedUrl.hostname,
      extractedText: extractedText || null,
      extractionStatus: isPartial ? "partial" : "success",
      extractionError: isPartial
        ? "Only limited text could be extracted (site may be paywalled, anti-bot gated, or JS-rendered). Original URL is preserved and can still be saved."
        : null,
      metadata: baseMetadata,
    };
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return {
        sourceUrl: parsedUrl.toString(),
        title: null,
        extractedText: null,
        extractionStatus: "failed",
        extractionError: err.message,
        blockedByPolicy: true,
        metadata: baseMetadata,
      };
    }

    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Timed out while fetching the website (10s limit). Original URL is preserved and can still be saved with analyst notes."
        : err instanceof Error && err.message
        ? `${err.message} Original URL is preserved and can still be saved with analyst notes.`
        : "Unable to reach or parse the target website. Original URL is preserved and can still be saved with analyst notes.";

    return {
      sourceUrl: parsedUrl.toString(),
      title: null,
      extractedText: null,
      extractionStatus: "failed",
      extractionError: message,
      metadata: baseMetadata,
    };
  } finally {
    clearTimeout(timer);
  }
}
