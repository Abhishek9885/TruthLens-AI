import "server-only";
import { createWorker, OEM } from "tesseract.js";
import type { ExtractionStatus } from "@/types/database";

export interface OcrExtractionResult {
  extractedText: string | null;
  confidence: number | null;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
}

const OCR_TIMEOUT_MS = 25000;

export async function extractTextFromImageBuffer(
  imageBuffer: Buffer
): Promise<OcrExtractionResult> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let capturedWorkerError: string | null = null;

  try {
    // Provide errorHandler so corrupt/unreadable images never throw uncaught
    // exceptions out of the worker MessagePort callback.
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      errorHandler: (err) => {
        capturedWorkerError =
          err instanceof Error ? err.message : String(err ?? "Worker error");
      },
    });

    const recognitionPromise = worker.recognize(imageBuffer);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("OCR processing timed out.")),
        OCR_TIMEOUT_MS
      )
    );

    const result = await Promise.race([recognitionPromise, timeoutPromise]);
    const text = result.data.text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const rawConf = result.data.confidence;
    const confidence =
      typeof rawConf === "number" && Number.isFinite(rawConf)
        ? Math.min(100, Math.max(0, Math.round(rawConf * 100) / 100))
        : null;

    if (!text) {
      return {
        extractedText: null,
        confidence,
        extractionStatus: "partial",
        extractionError:
          "No readable text was detected in this image. The original image can still be saved securely.",
      };
    }

    return {
      extractedText: text,
      confidence,
      extractionStatus: "success",
      extractionError: null,
    };
  } catch (err) {
    const rawReason =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : capturedWorkerError;

    const isUnreadable =
      typeof rawReason === "string" &&
      (rawReason.includes("attempting to read image") ||
        rawReason.includes("pix not read"));

    return {
      extractedText: null,
      confidence: null,
      extractionStatus: "failed",
      extractionError: isUnreadable
        ? "Image could not be decoded for OCR (it may be corrupted or use an unsupported sub-encoding). The original image can still be preserved."
        : rawReason ||
          "OCR extraction failed. The original image can still be saved.",
    };
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}
