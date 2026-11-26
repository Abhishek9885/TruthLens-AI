import { z } from "zod";
import { validatePublicHttpUrl } from "./url-safety";

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_SIZE_LABEL = "5 MB";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MIN_TEXT_LENGTH = 20;
export const MAX_TEXT_LENGTH = 20000;
export const MAX_TITLE_LENGTH = 240;

export const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2048, "URL must be under 2,048 characters")
  .superRefine((val, ctx) => {
    const check = validatePublicHttpUrl(val);
    if (!check.ok) {
      ctx.addIssue({
        code: "custom",
        message: check.error,
      });
    }
  });

export const extractUrlRequestSchema = z.object({
  url: httpUrlSchema,
});

export const urlSubmissionSchema = z.object({
  submissionType: z.literal("url"),
  sourceUrl: httpUrlSchema,
  title: z
    .string()
    .trim()
    .max(MAX_TITLE_LENGTH, `Title must be under ${MAX_TITLE_LENGTH} characters`)
    .optional()
    .nullable(),
  extractedText: z
    .string()
    .trim()
    .max(50000, "Extracted text exceeds maximum length")
    .optional()
    .nullable(),
  extractionStatus: z
    .enum(["not_applicable", "success", "partial", "failed"])
    .default("success"),
  extractionError: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const textSubmissionSchema = z.object({
  submissionType: z.literal("text"),
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(MAX_TITLE_LENGTH, `Title must be under ${MAX_TITLE_LENGTH} characters`),
  rawText: z
    .string()
    .trim()
    .min(MIN_TEXT_LENGTH, `Claim text must be at least ${MIN_TEXT_LENGTH} characters`)
    .max(MAX_TEXT_LENGTH, `Claim text must not exceed ${MAX_TEXT_LENGTH.toLocaleString()} characters`),
  sourceUrl: z
    .union([httpUrlSchema, z.literal(""), z.null()])
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export const reviewSubmissionSchema = z.object({
  decision: z.enum(["approved", "flagged", "rejected", "needs_more_evidence"]),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["in_review", "completed", "failed"]).optional(),
});

export function resolveImageMimeType(file: File): AllowedImageMimeType | null {
  if (
    ALLOWED_IMAGE_MIME_TYPES.includes(file.type as AllowedImageMimeType)
  ) {
    return file.type as AllowedImageMimeType;
  }

  // Fallback for drag-and-drop on browsers that omit MIME on certain extensions;
  // server still strictly validates binary magic bytes.
  if (!file.type) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
  }

  return null;
}

export function validateClientImageFile(file: File): string | null {
  if (!resolveImageMimeType(file)) {
    return "Unsupported image format. Allowed formats: JPG, JPEG, PNG, WebP, GIF.";
  }

  if (file.size === 0) {
    return "Selected image file is empty.";
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the ${MAX_IMAGE_SIZE_LABEL} limit.`;
  }

  return null;
}

/**
 * Verifies actual file binary magic bytes against claimed MIME type
 * to prevent spoofed file uploads.
 */
export function verifyImageMagicBytes(
  bytes: Uint8Array,
  mimeType: string
): boolean {
  if (bytes.length < 12) return false;

  switch (mimeType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/gif":
      return (
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
      );
    case "image/webp":
      return (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    default:
      return false;
  }
}

export type ImageServerValidationResult =
  | {
      ok: true;
      mimeType: AllowedImageMimeType;
      arrayBuffer: ArrayBuffer;
      bytes: Uint8Array;
    }
  | {
      ok: false;
      error: string;
    };

export async function validateServerImageFile(
  file: unknown
): Promise<ImageServerValidationResult> {
  if (!(file instanceof File)) {
    return {
      ok: false,
      error: "An image file field named 'image' is required.",
    };
  }

  const mimeType = resolveImageMimeType(file);
  if (!mimeType) {
    return {
      ok: false,
      error:
        "Unsupported image format. Allowed formats: JPG, JPEG, PNG, WebP, GIF.",
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: "Uploaded image file is empty.",
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      ok: false,
      error: `File size exceeds the ${MAX_IMAGE_SIZE_LABEL} limit.`,
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!verifyImageMagicBytes(bytes, mimeType)) {
    return {
      ok: false,
      error:
        "File signature does not match its declared image type. Upload rejected.",
    };
  }

  return { ok: true, mimeType, arrayBuffer, bytes };
}

export function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
