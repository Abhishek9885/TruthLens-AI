"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Link2,
  FileText,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ExternalLink,
  Eye,
  Trash2,
  ShieldCheck,
  ScanText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MAX_IMAGE_SIZE_LABEL,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
  httpUrlSchema,
  validateClientImageFile,
} from "@/lib/validation/submission";
import type {
  ExtractionStatus,
  Submission,
  SubmissionMetadata,
  SubmissionType,
} from "@/types/database";

interface SubmissionWorkspaceProps {
  onSubmitted: (submission: Submission) => void;
}

interface UrlPreviewState {
  sourceUrl: string;
  title: string | null;
  extractedText: string | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  metadata: SubmissionMetadata;
}

interface ImagePreviewState {
  file: File;
  objectUrl: string;
  extractedText: string | null;
  confidence: number | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
}

export function SubmissionWorkspace({ onSubmitted }: SubmissionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<SubmissionType>("url");

  // URL mode state
  const [urlInput, setUrlInput] = useState("");
  const [urlNotes, setUrlNotes] = useState("");
  const [extractingUrl, setExtractingUrl] = useState(false);
  const [urlPreview, setUrlPreview] = useState<UrlPreviewState | null>(null);

  // Manual text mode state
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [textRefUrl, setTextRefUrl] = useState("");

  // Image + OCR mode state
  const [imageTitle, setImageTitle] = useState("");
  const [imageNotes, setImageNotes] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(
    null
  );
  const [runningOcr, setRunningOcr] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Shared submission state
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savedSubmissionId, setSavedSubmissionId] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    objectUrlRef.current = imagePreview?.objectUrl ?? null;
  }, [imagePreview]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const resetMessages = () => {
    setFormError(null);
    setSuccessMessage(null);
    setSavedSubmissionId(null);
  };

  // --- Inline Validation Helpers ---
  const urlValidation = urlInput.trim()
    ? httpUrlSchema.safeParse(urlInput)
    : null;
  const textTitleTrimmed = textTitle.trim();
  const textBodyTrimmed = textBody.trim();
  const textRefValidation = textRefUrl.trim()
    ? httpUrlSchema.safeParse(textRefUrl)
    : null;

  // --- URL Extraction ---
  const handleExtractUrl = async () => {
    resetMessages();
    const validated = httpUrlSchema.safeParse(urlInput);
    if (!validated.success) {
      setFormError(validated.error.issues[0]?.message ?? "Invalid URL.");
      return;
    }

    setExtractingUrl(true);
    try {
      const response = await fetch("/api/submissions/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: validated.data }),
      });

      const data = await response.json();
      if (!response.ok) {
        setUrlPreview(null);
        setFormError(data.error ?? "Failed to inspect URL.");
        return;
      }

      setUrlPreview(data as UrlPreviewState);
    } catch {
      setFormError("Network error while fetching article URL.");
    } finally {
      setExtractingUrl(false);
    }
  };

  // --- Image Selection & OCR ---
  const processSelectedImage = useCallback(
    async (file: File) => {
      resetMessages();
      const validationError = validateClientImageFile(file);
      if (validationError) {
        setFormError(validationError);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setImagePreview((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return {
          file,
          objectUrl,
          extractedText: null,
          confidence: null,
          extractionStatus: "not_applicable",
          extractionError: null,
        };
      });

      if (!imageTitle.trim()) {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        setImageTitle(baseName.slice(0, 120));
      }

      setRunningOcr(true);
      try {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/api/submissions/ocr", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (!response.ok) {
          // Server rejected file (e.g., spoofed magic bytes or invalid size) — discard preview
          URL.revokeObjectURL(objectUrl);
          setImagePreview(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          setFormError(data.error ?? "Image validation or OCR failed.");
          return;
        }

        setImagePreview((prev) =>
          prev
            ? {
                ...prev,
                extractedText: data.extractedText ?? null,
                confidence: data.confidence ?? null,
                extractionStatus: data.extractionStatus ?? "partial",
                extractionError: data.extractionError ?? null,
              }
            : null
        );
      } catch {
        setImagePreview((prev) =>
          prev
            ? {
                ...prev,
                extractionStatus: "failed",
                extractionError:
                  "Network error during OCR preview. You can still upload the original image.",
              }
            : null
        );
      } finally {
        setRunningOcr(false);
      }
    },
    [imageTitle]
  );

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      void processSelectedImage(droppedFile);
    }
  };

  const handleClearImage = () => {
    if (imagePreview?.objectUrl) {
      URL.revokeObjectURL(imagePreview.objectUrl);
    }
    setImagePreview(null);
    setImageTitle("");
    setImageNotes("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // --- Save Submission to Supabase ---
  const handleSaveSubmission = async () => {
    resetMessages();

    if (activeTab === "url") {
      const validated = httpUrlSchema.safeParse(urlInput);
      if (!validated.success) {
        setFormError(validated.error.issues[0]?.message ?? "Invalid URL.");
        return;
      }

      setSubmitting(true);
      try {
        const payload = {
          submissionType: "url" as const,
          sourceUrl: urlPreview?.sourceUrl ?? validated.data,
          title: urlPreview?.title ?? null,
          extractedText: urlPreview?.extractedText ?? null,
          extractionStatus: urlPreview?.extractionStatus ?? "not_applicable",
          extractionError: urlPreview?.extractionError ?? null,
          notes: urlNotes.trim() || null,
          metadata: urlPreview?.metadata ?? {},
        };

        const response = await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          setFormError(data.error ?? "Failed to save URL submission.");
          return;
        }

        onSubmitted(data.submission as Submission);
        setSavedSubmissionId(data.submission?.id ?? null);
        setSuccessMessage(
          data.submission?.extraction_status === "failed"
            ? "Blocked/unparsed URL saved with its original source URL and your notes."
            : "URL submission saved to Supabase."
        );
        setUrlInput("");
        setUrlNotes("");
        setUrlPreview(null);
      } catch {
        setFormError("Unexpected network error while saving URL submission.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (activeTab === "text") {
      if (textTitleTrimmed.length < 3) {
        setFormError("Submission title must be at least 3 characters.");
        return;
      }
      if (textBodyTrimmed.length < MIN_TEXT_LENGTH) {
        const remaining = MIN_TEXT_LENGTH - textBodyTrimmed.length;
        setFormError(
          `Claim text must be at least ${MIN_TEXT_LENGTH} characters (${remaining} more needed).`
        );
        return;
      }
      if (textRefUrl.trim() && textRefValidation && !textRefValidation.success) {
        setFormError(
          textRefValidation.error.issues[0]?.message ?? "Invalid reference URL."
        );
        return;
      }

      setSubmitting(true);
      try {
        const response = await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionType: "text",
            title: textTitleTrimmed,
            rawText: textBodyTrimmed,
            sourceUrl: textRefUrl.trim() || null,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setFormError(data.error ?? "Failed to save text submission.");
          return;
        }

        onSubmitted(data.submission as Submission);
        setSavedSubmissionId(data.submission?.id ?? null);
        setSuccessMessage("Manual text submission saved to Supabase.");
        setTextTitle("");
        setTextBody("");
        setTextRefUrl("");
      } catch {
        setFormError("Unexpected network error while saving text submission.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (activeTab === "image") {
      if (!imagePreview) {
        setFormError("Please upload or drag-and-drop an image first.");
        return;
      }

      setSubmitting(true);
      try {
        const formData = new FormData();
        formData.append("image", imagePreview.file);
        if (imageTitle.trim()) {
          formData.append("title", imageTitle.trim());
        }
        if (imageNotes.trim()) {
          formData.append("notes", imageNotes.trim());
        }
        if (imagePreview.extractedText) {
          formData.append("extractedText", imagePreview.extractedText);
        }
        if (imagePreview.extractionStatus !== "not_applicable") {
          formData.append("extractionStatus", imagePreview.extractionStatus);
        }
        if (imagePreview.extractionError) {
          formData.append("extractionError", imagePreview.extractionError);
        }
        if (imagePreview.confidence !== null) {
          formData.append("ocrConfidence", String(imagePreview.confidence));
        }

        const response = await fetch("/api/submissions", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
          setFormError(data.error ?? "Failed to save image submission.");
          return;
        }

        onSubmitted(data.submission as Submission);
        setSavedSubmissionId(data.submission?.id ?? null);
        setSuccessMessage(
          "Original image saved to private storage and OCR text recorded."
        );
        handleClearImage();
      } catch {
        setFormError("Unexpected network error while saving image submission.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  // --- Preview Helpers ---
  const wordCount = (text: string | null | undefined) => {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  };

  const renderExtractionBadge = (status: ExtractionStatus) => {
    switch (status) {
      case "success":
        return (
          <Badge className="bg-success/10 text-success border-success/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Extracted
          </Badge>
        );
      case "partial":
        return (
          <Badge className="bg-warning/10 text-warning border-warning/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Partial Extraction
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-danger/10 text-danger border-danger/30">
            <XCircle className="h-3 w-3 mr-1" />
            Extraction Blocked / Unavailable
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-accent/10 text-blue-accent border-blue-accent/30">
            Ready
          </Badge>
        );
    }
  };

  const isBusy = submitting || extractingUrl || runningOcr;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Left: Input Form */}
      <Card className="xl:col-span-7 bg-navy-800/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">
            Submit Election Content for Verification
          </CardTitle>
          <CardDescription>
            Submit a news article URL, manually entered claim text, or
            screenshot image. All original URLs and assets are preserved.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as SubmissionType);
              resetMessages();
            }}
          >
            <TabsList className="grid w-full grid-cols-3 bg-navy-900 border border-border/50 h-10">
              <TabsTrigger value="url" className="gap-1.5">
                <Link2 className="h-4 w-4" />
                <span>Article URL</span>
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-1.5">
                <FileText className="h-4 w-4" />
                <span>Manual Text</span>
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-1.5">
                <ImageIcon className="h-4 w-4" />
                <span>Image Upload</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: URL SUBMISSION */}
            <TabsContent value="url" className="space-y-4 mt-5">
              <div className="space-y-2">
                <Label htmlFor="article-url">News Article or Source URL</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    id="article-url"
                    type="url"
                    placeholder="https://example.com/election-news-article"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      if (urlPreview && e.target.value !== urlPreview.sourceUrl) {
                        setUrlPreview(null);
                      }
                    }}
                    className="bg-navy-900 border-border flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleExtractUrl}
                    disabled={extractingUrl || !urlInput.trim()}
                    className="gap-2 shrink-0"
                  >
                    {extractingUrl ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4" />
                        Extract & Preview
                      </>
                    )}
                  </Button>
                </div>
                {urlValidation && !urlValidation.success ? (
                  <p className="text-xs text-danger">
                    {urlValidation.error.issues[0]?.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only public `http://` and `https://` URLs are allowed
                    (localhost and private/internal IPs are blocked). If a
                    website blocks extraction, you can still save the original
                    URL with optional analyst notes.
                  </p>
                )}
              </div>

              {urlPreview &&
                (urlPreview.extractionStatus === "failed" ||
                  urlPreview.extractionStatus === "partial") && (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium">
                        {urlPreview.extractionStatus === "failed"
                          ? "Website blocked automated extraction or returned unusable content"
                          : "Only partial article content could be extracted"}
                      </p>
                      <p className="text-warning/90">
                        {urlPreview.extractionError} You can add context in
                        Analyst Notes below and still save this submission.
                      </p>
                    </div>
                  </div>
                )}

              <div className="space-y-2">
                <Label htmlFor="url-notes">
                  Analyst Context / Notes (Optional)
                </Label>
                <Textarea
                  id="url-notes"
                  placeholder="Add context about where this link was shared, what claim needs verification, or summary if the site blocked extraction…"
                  value={urlNotes}
                  onChange={(e) => setUrlNotes(e.target.value)}
                  className="bg-navy-900 border-border min-h-24"
                  maxLength={5000}
                />
              </div>
            </TabsContent>

            {/* TAB 2: MANUAL TEXT SUBMISSION */}
            <TabsContent value="text" className="space-y-4 mt-5">
              <div className="space-y-2">
                <Label htmlFor="text-title">Submission Title</Label>
                <Input
                  id="text-title"
                  type="text"
                  placeholder="e.g., Viral post claiming polling hours changed in County B"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  className="bg-navy-900 border-border"
                  maxLength={240}
                />
                {textTitle.length > 0 && textTitleTrimmed.length < 3 && (
                  <p className="text-xs text-danger">
                    Title must be at least 3 non-whitespace characters.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="text-body">Claim Text</Label>
                  <span className="text-xs text-muted-foreground">
                    {textBodyTrimmed.length.toLocaleString()} /{" "}
                    {MAX_TEXT_LENGTH.toLocaleString()} chars (min{" "}
                    {MIN_TEXT_LENGTH})
                  </span>
                </div>
                <Textarea
                  id="text-body"
                  placeholder="Paste the exact election-related claim, transcript, or social media statement here…"
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  className="bg-navy-900 border-border min-h-40"
                  maxLength={MAX_TEXT_LENGTH}
                />
                {textBody.length > 0 &&
                  textBodyTrimmed.length < MIN_TEXT_LENGTH && (
                    <p className="text-xs text-danger">
                      Claim text requires at least {MIN_TEXT_LENGTH} characters
                      ({MIN_TEXT_LENGTH - textBodyTrimmed.length} more needed).
                    </p>
                  )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="text-ref-url">
                  Optional Source Reference URL
                </Label>
                <Input
                  id="text-ref-url"
                  type="url"
                  placeholder="https://..."
                  value={textRefUrl}
                  onChange={(e) => setTextRefUrl(e.target.value)}
                  className="bg-navy-900 border-border"
                />
                {textRefValidation && !textRefValidation.success && (
                  <p className="text-xs text-danger">
                    {textRefValidation.error.issues[0]?.message}
                  </p>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: IMAGE UPLOAD + OCR */}
            <TabsContent value="image" className="space-y-4 mt-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-blue-accent bg-blue-accent/10"
                    : "border-border/70 bg-navy-900/60 hover:border-blue-accent/50 hover:bg-navy-900"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) void processSelectedImage(selected);
                  }}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-blue-accent/10 text-blue-accent flex items-center justify-center">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Drag and drop an image here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports JPG, JPEG, PNG, WebP, GIF up to{" "}
                      {MAX_IMAGE_SIZE_LABEL}. Server validates file magic bytes
                      and runs OCR automatically.
                    </p>
                  </div>
                </div>
              </div>

              {imagePreview && (
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-navy-900 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <ImageIcon className="h-4 w-4 text-blue-accent shrink-0" />
                    <span className="truncate font-medium text-foreground">
                      {imagePreview.file.name}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      ({(imagePreview.file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleClearImage}
                    className="text-danger hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="image-title">Image Title / Label</Label>
                <Input
                  id="image-title"
                  type="text"
                  placeholder="e.g., Screenshot of flyer distributed on Telegram"
                  value={imageTitle}
                  onChange={(e) => setImageTitle(e.target.value)}
                  className="bg-navy-900 border-border"
                  maxLength={240}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="image-notes">Analyst Notes (Optional)</Label>
                <Textarea
                  id="image-notes"
                  placeholder="Where was this image captured? Any context for reviewers…"
                  value={imageNotes}
                  onChange={(e) => setImageNotes(e.target.value)}
                  className="bg-navy-900 border-border min-h-20"
                  maxLength={5000}
                />
              </div>
            </TabsContent>
          </Tabs>

          {formError && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
              {savedSubmissionId && (
                <Link href={`/analyze/${savedSubmissionId}`}>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 gap-1.5 bg-blue-accent hover:bg-blue-accent/90 text-navy-950 font-medium"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Analyze Claims with AI</span>
                  </Button>
                </Link>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-blue-accent" />
              <span>Validated & stored under Row Level Security</span>
            </div>
            <Button
              type="button"
              onClick={handleSaveSubmission}
              disabled={isBusy}
              className="gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Submission"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Right: Live Submission Preview */}
      <Card className="xl:col-span-5 bg-navy-800/50 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-accent" />
              Submission Preview
            </CardTitle>
            <Badge variant="outline" className="uppercase text-[11px]">
              {activeTab}
            </Badge>
          </div>
          <CardDescription>
            Inspect extracted content and preserved source metadata before
            saving.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* URL PREVIEW */}
          {activeTab === "url" && (
            <>
              {extractingUrl ? (
                <div className="rounded-lg border border-border/50 bg-navy-900/60 p-8 text-center space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-accent mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Fetching article title and text…
                  </p>
                </div>
              ) : urlPreview ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    {renderExtractionBadge(urlPreview.extractionStatus)}
                    {urlPreview.metadata?.domain && (
                      <span className="text-xs text-muted-foreground">
                        {urlPreview.metadata.domain}
                      </span>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/50 bg-navy-900/70 p-3 space-y-1.5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Title
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {urlPreview.title ?? "No title extracted"}
                    </p>
                    <a
                      href={urlPreview.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-accent hover:underline break-all"
                    >
                      {urlPreview.sourceUrl}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    {urlPreview.metadata?.redirected_to && (
                      <p className="text-[11px] text-muted-foreground break-all">
                        Final URL after verified redirects:{" "}
                        {urlPreview.metadata.redirected_to}
                      </p>
                    )}
                  </div>

                  {urlPreview.extractionError && (
                    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                      {urlPreview.extractionError}
                    </div>
                  )}

                  <div className="rounded-lg border border-border/50 bg-navy-900/70 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Extracted Article Text
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {wordCount(urlPreview.extractedText)} words
                      </span>
                    </div>
                    <div className="max-h-60 overflow-y-auto text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {urlPreview.extractedText ??
                        "No article body could be extracted automatically. The original URL will still be saved."}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 bg-navy-900/40 p-8 text-center text-sm text-muted-foreground">
                  Enter a public URL and click <strong>Extract & Preview</strong>{" "}
                  to inspect the extracted title and article text, or click{" "}
                  <strong>Save Submission</strong> directly.
                </div>
              )}
            </>
          )}

          {/* TEXT PREVIEW */}
          {activeTab === "text" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                {textTitleTrimmed.length >= 3 &&
                textBodyTrimmed.length >= MIN_TEXT_LENGTH ? (
                  <Badge className="bg-success/10 text-success border-success/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Valid & Ready to Save
                  </Badge>
                ) : (
                  <Badge className="bg-warning/10 text-warning border-warning/30">
                    Min {MIN_TEXT_LENGTH} chars required
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {textBodyTrimmed.length} chars · {wordCount(textBody)} words
                </span>
              </div>

              <div className="rounded-lg border border-border/50 bg-navy-900/70 p-3 space-y-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Title
                </p>
                <p className="text-sm font-medium text-foreground">
                  {textTitleTrimmed || "Untitled text submission"}
                </p>
                {textRefUrl.trim() && (
                  <p className="text-xs text-blue-accent break-all">
                    Ref: {textRefUrl.trim()}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border/50 bg-navy-900/70 p-3 space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Claim Text Preview
                </p>
                <div className="max-h-64 overflow-y-auto text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {textBodyTrimmed || "Enter claim text on the left to preview…"}
                </div>
              </div>
            </div>
          )}

          {/* IMAGE + OCR PREVIEW */}
          {activeTab === "image" && (
            <>
              {imagePreview ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/50 bg-navy-900/70 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview.objectUrl}
                      alt="Uploaded submission preview"
                      className="max-h-56 w-full object-contain bg-black/30"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {runningOcr ? (
                      <Badge className="bg-blue-accent/10 text-blue-accent border-blue-accent/30">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Running OCR…
                      </Badge>
                    ) : (
                      renderExtractionBadge(imagePreview.extractionStatus)
                    )}
                    {imagePreview.confidence !== null && (
                      <div className="text-right">
                        <span className="text-xs font-medium text-foreground block">
                          OCR Text Recognition: {imagePreview.confidence}%
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          Character legibility only — not claim verification
                        </span>
                      </div>
                    )}
                  </div>

                  {imagePreview.extractionError && (
                    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                      {imagePreview.extractionError}
                    </div>
                  )}

                  <div className="rounded-lg border border-border/50 bg-navy-900/70 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <ScanText className="h-3.5 w-3.5 text-blue-accent" />
                        OCR Extracted Visible Text
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {wordCount(imagePreview.extractedText)} words
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {runningOcr
                        ? "Scanning image for visible text…"
                        : imagePreview.extractedText ??
                          "No text detected yet."}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 bg-navy-900/40 p-8 text-center text-sm text-muted-foreground">
                  Upload or drag-and-drop an image to preview the preserved
                  image and its OCR-extracted text.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
