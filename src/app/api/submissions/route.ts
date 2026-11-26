import { NextResponse } from "next/server";
import { getAuthContext, isAdminRole } from "@/lib/auth";
import { getClientIp, recordAuditLog } from "@/lib/audit";
import {
  SsrfBlockedError,
  assertPublicHost,
  extractArticleFromUrl,
} from "@/lib/extract/url";
import { extractTextFromImageBuffer } from "@/lib/extract/ocr";
import {
  SIGNED_IMAGE_TTL_SECONDS,
  buildAiAssessmentSummary,
  enrichSubmissions,
} from "@/lib/submissions/enrich";
import {
  MAX_TITLE_LENGTH,
  getExtensionFromMime,
  textSubmissionSchema,
  urlSubmissionSchema,
  validateServerImageFile,
} from "@/lib/validation/submission";
import type { Submission } from "@/types/database";

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { supabase, user, profile } = auth;
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const typeFilter = searchParams.get("type");

  if (scope === "all" && !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Administrator privileges required to view all submissions." },
      { status: 403 }
    );
  }

  let query = supabase
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (scope !== "all" || !isAdminRole(profile.role)) {
    query = query.eq("user_id", user.id);
  }

  if (
    typeFilter === "url" ||
    typeFilter === "text" ||
    typeFilter === "image"
  ) {
    query = query.eq("submission_type", typeFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to load submissions.", details: error.message },
      { status: 500 }
    );
  }

  const submissions = (data ?? []) as Submission[];
  const enriched = await enrichSubmissions(supabase, submissions);

  return NextResponse.json({
    submissions: enriched,
    role: profile.role,
  });
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { supabase, user } = auth;
  const ipAddress = getClientIp(request);
  const contentType = request.headers.get("content-type") ?? "";

  // Branch 1: Multipart image upload
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart/form-data payload." },
        { status: 400 }
      );
    }

    const fileField = formData.get("image");
    const validation = await validateServerImageFile(fileField);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const file = fileField as File;
    const { mimeType, arrayBuffer } = validation;

    const titleRaw = formData.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim().length > 0
        ? titleRaw.trim().slice(0, MAX_TITLE_LENGTH)
        : file.name.slice(0, MAX_TITLE_LENGTH);

    const notesRaw = formData.get("notes");
    const rawText =
      typeof notesRaw === "string" && notesRaw.trim().length > 0
        ? notesRaw.trim().slice(0, 5000)
        : null;

    // Reuse previewed OCR result when present, otherwise run OCR server-side
    const providedOcr = formData.get("extractedText");
    const providedStatus = formData.get("extractionStatus");
    const providedError = formData.get("extractionError");
    const providedConfidence = formData.get("ocrConfidence");

    let extractedText: string | null = null;
    let extractionStatus: "success" | "partial" | "failed" | "not_applicable" =
      "not_applicable";
    let extractionError: string | null = null;
    let ocrConfidence: number | null = null;

    if (
      providedStatus === "success" ||
      providedStatus === "partial" ||
      providedStatus === "failed"
    ) {
      extractedText =
        typeof providedOcr === "string" && providedOcr.trim().length > 0
          ? providedOcr.trim().slice(0, 50000)
          : null;
      extractionStatus = providedStatus;
      extractionError =
        typeof providedError === "string" && providedError.trim().length > 0
          ? providedError.trim().slice(0, 1000)
          : null;
      const parsedConf = Number(providedConfidence);
      ocrConfidence =
        Number.isFinite(parsedConf) && parsedConf >= 0 && parsedConf <= 100
          ? Math.round(parsedConf * 100) / 100
          : null;
    } else {
      const ocr = await extractTextFromImageBuffer(Buffer.from(arrayBuffer));
      extractedText = ocr.extractedText;
      extractionStatus = ocr.extractionStatus;
      extractionError = ocr.extractionError;
      ocrConfidence = ocr.confidence;
    }

    const ext = getExtensionFromMime(mimeType);
    const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("submission-images")
      .upload(storagePath, arrayBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          error: "Failed to securely store image in Supabase Storage.",
          details: uploadError.message,
        },
        { status: 500 }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("submissions")
      .insert({
        user_id: user.id,
        submission_type: "image",
        status: extractedText ? "extracted" : "pending",
        title,
        raw_text: rawText,
        extracted_text: extractedText,
        extraction_status: extractionStatus,
        extraction_error: extractionError,
        image_path: storagePath,
        image_mime_type: mimeType,
        image_size_bytes: file.size,
        metadata: {
          original_filename: file.name,
          ocr_confidence: ocrConfidence,
          ocr_engine: "tesseract.js",
        },
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      await supabase.storage.from("submission-images").remove([storagePath]);
      return NextResponse.json(
        {
          error: "Failed to save image submission.",
          details: insertError?.message,
        },
        { status: 500 }
      );
    }

    await recordAuditLog({
      supabase,
      actorId: user.id,
      action: "submission.created",
      entityType: "submission",
      entityId: inserted.id,
      details: {
        submission_type: "image",
        extraction_status: extractionStatus,
        image_size_bytes: file.size,
        image_mime_type: mimeType,
        ocr_confidence: ocrConfidence,
      },
      ipAddress,
    });

    const { data: signed } = await supabase.storage
      .from("submission-images")
      .createSignedUrl(storagePath, SIGNED_IMAGE_TTL_SECONDS);

    const baseSubmission = inserted as Submission;
    return NextResponse.json(
      {
        submission: {
          ...baseSubmission,
          image_signed_url: signed?.signedUrl ?? null,
          latest_review: null,
          ai_assessment: buildAiAssessmentSummary(baseSubmission, []),
        },
      },
      { status: 201 }
    );
  }

  // Branch 2: JSON payload (URL or manual text submission)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const submissionType =
    typeof body === "object" && body !== null && "submissionType" in body
      ? (body as { submissionType?: unknown }).submissionType
      : null;

  if (submissionType === "url") {
    const parsed = urlSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid URL submission.",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const parsedUrlObj = new URL(input.sourceUrl);

    // Server-side DNS SSRF verification even when caller skips /extract-url
    try {
      await assertPublicHost(parsedUrlObj.hostname);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      // Public domain DNS resolution failures remain saveable if user chooses to preserve URL
    }

    let title = input.title ?? null;
    let extractedText = input.extractedText ?? null;
    let extractionStatus = input.extractionStatus;
    let extractionError = input.extractionError ?? null;
    let metadata = input.metadata ?? {};

    // Sanitize caller-supplied metadata redirect target if present
    if (typeof metadata.redirected_to === "string") {
      try {
        const redirectHost = new URL(metadata.redirected_to).hostname;
        await assertPublicHost(redirectHost);
      } catch (err) {
        if (err instanceof SsrfBlockedError) {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
      }
    }

    // If caller didn't pre-extract via /extract-url, extract server-side now
    if (!title && !extractedText && !extractionError) {
      const extracted = await extractArticleFromUrl(input.sourceUrl);
      if (extracted.blockedByPolicy) {
        return NextResponse.json(
          { error: extracted.extractionError ?? "Blocked URL target." },
          { status: 400 }
        );
      }
      title = extracted.title;
      extractedText = extracted.extractedText;
      extractionStatus = extracted.extractionStatus;
      extractionError = extracted.extractionError;
      metadata = extracted.metadata;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("submissions")
      .insert({
        user_id: user.id,
        submission_type: "url",
        status:
          extractionStatus === "success" || extractionStatus === "partial"
            ? "extracted"
            : "pending",
        title: title || input.sourceUrl,
        source_url: input.sourceUrl,
        raw_text: input.notes ?? null,
        extracted_text: extractedText,
        extraction_status: extractionStatus,
        extraction_error: extractionError,
        metadata,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        {
          error: "Failed to save URL submission.",
          details: insertError?.message,
        },
        { status: 500 }
      );
    }

    await recordAuditLog({
      supabase,
      actorId: user.id,
      action: "submission.created",
      entityType: "submission",
      entityId: inserted.id,
      details: {
        submission_type: "url",
        source_url: input.sourceUrl,
        extraction_status: extractionStatus,
      },
      ipAddress,
    });

    const baseSubmission = inserted as Submission;
    return NextResponse.json(
      {
        submission: {
          ...baseSubmission,
          latest_review: null,
          ai_assessment: buildAiAssessmentSummary(baseSubmission, []),
        },
      },
      { status: 201 }
    );
  }

  if (submissionType === "text") {
    const parsed = textSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid text submission.",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const wordCount = input.rawText.trim().split(/\s+/).length;
    const charCount = input.rawText.trim().length;

    const { data: inserted, error: insertError } = await supabase
      .from("submissions")
      .insert({
        user_id: user.id,
        submission_type: "text",
        status: "pending",
        title: input.title,
        source_url: input.sourceUrl ?? null,
        raw_text: input.rawText,
        extracted_text: input.rawText,
        extraction_status: "not_applicable",
        metadata: {
          word_count: wordCount,
          char_count: charCount,
        },
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        {
          error: "Failed to save text submission.",
          details: insertError?.message,
        },
        { status: 500 }
      );
    }

    await recordAuditLog({
      supabase,
      actorId: user.id,
      action: "submission.created",
      entityType: "submission",
      entityId: inserted.id,
      details: {
        submission_type: "text",
        word_count: wordCount,
        char_count: charCount,
      },
      ipAddress,
    });

    const baseSubmission = inserted as Submission;
    return NextResponse.json(
      {
        submission: {
          ...baseSubmission,
          latest_review: null,
          ai_assessment: buildAiAssessmentSummary(baseSubmission, []),
        },
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      error:
        "Unsupported submissionType. Expected 'url', 'text', or multipart 'image'.",
    },
    { status: 400 }
  );
}
