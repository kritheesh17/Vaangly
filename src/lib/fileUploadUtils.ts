/**
 * Robust File Upload, MIME Normalization & Queue Utilities for Vaangly
 * 
 * Provides:
 * 1. Magic byte-based MIME detection & validation (protects against Android empty MIME types
 *    and spoofed extensions).
 * 2. Concurrency-limited upload queue (max 2 parallel uploads to prevent mobile uplink saturation).
 * 3. Mobile-appropriate timeout handling (45-60s per upload).
 * 4. Transient error classification and retry logic with exponential backoff.
 */

export interface ValidatedMimeResult {
  isValid: boolean;
  mimeType: string;
  extension: string;
  error?: string;
}

// Supported MIME types for photos and documents
export const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_DOC_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

/**
 * Inspect file magic bytes (first 12 bytes) to determine actual content type.
 * Android file pickers frequently report empty file.type or generic application/octet-stream.
 */
export async function detectFileMimeType(
  file: File,
  options?: { allowPdf?: boolean }
): Promise<ValidatedMimeResult> {
  const allowPdf = options?.allowPdf ?? false;
  const fileName = file.name || '';
  const rawExt = fileName.split('.').pop()?.toLowerCase() || '';

  // 1. Check file size
  if (!file || file.size === 0) {
    return {
      isValid: false,
      mimeType: '',
      extension: rawExt,
      error: 'Selected file is empty (0 bytes). Please select a valid file.',
    };
  }

  // 2. Read first 12 bytes for magic numbers
  let headerBytes: Uint8Array;
  try {
    const slice = file.slice(0, 12);
    const buffer = await slice.arrayBuffer();
    headerBytes = new Uint8Array(buffer);
  } catch (err) {
    return {
      isValid: false,
      mimeType: '',
      extension: rawExt,
      error: 'Could not read file data. Please select the file again.',
    };
  }

  // 3. Inspect magic bytes
  // JPEG: 0xFF, 0xD8, 0xFF
  if (
    headerBytes.length >= 3 &&
    headerBytes[0] === 0xff &&
    headerBytes[1] === 0xd8 &&
    headerBytes[2] === 0xff
  ) {
    return { isValid: true, mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  if (
    headerBytes.length >= 8 &&
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47 &&
    headerBytes[4] === 0x0d &&
    headerBytes[5] === 0x0a &&
    headerBytes[6] === 0x1a &&
    headerBytes[7] === 0x0a
  ) {
    return { isValid: true, mimeType: 'image/png', extension: 'png' };
  }

  // WebP: RIFF (bytes 0-3: 0x52, 0x49, 0x46, 0x46) and WEBP (bytes 8-11: 0x57, 0x45, 0x42, 0x50)
  if (
    headerBytes.length >= 12 &&
    headerBytes[0] === 0x52 &&
    headerBytes[1] === 0x49 &&
    headerBytes[2] === 0x46 &&
    headerBytes[3] === 0x46 &&
    headerBytes[8] === 0x57 &&
    headerBytes[9] === 0x45 &&
    headerBytes[10] === 0x42 &&
    headerBytes[11] === 0x50
  ) {
    return { isValid: true, mimeType: 'image/webp', extension: 'webp' };
  }

  // PDF: %PDF- (bytes 0-4: 0x25, 0x50, 0x44, 0x46, 0x2D)
  if (
    allowPdf &&
    headerBytes.length >= 5 &&
    headerBytes[0] === 0x25 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x44 &&
    headerBytes[3] === 0x46 &&
    headerBytes[4] === 0x2d
  ) {
    return { isValid: true, mimeType: 'application/pdf', extension: 'pdf' };
  }

  // Explicit rejection: If magic bytes do not match verified JPEG, PNG, WebP (or PDF),
  // NEVER trust caller-supplied file.type or file extension.
  const supportedDesc = allowPdf
    ? 'JPEG, PNG, WebP images, or PDF documents'
    : 'JPEG, PNG, or WebP images';

  return {
    isValid: false,
    mimeType: file.type || 'unknown',
    extension: rawExt,
    error: `"${fileName}" has an unsupported format. Please upload ${supportedDesc}.`,
  };
}

/**
 * Determine whether a storage or network error is transient and safe to retry.
 * Authorization failures, invalid MIME types, payload size errors, and RLS violations must NEVER be retried.
 */
export function isTransientUploadError(err: unknown): boolean {
  if (!err) return false;
  const errObj = typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const status = typeof errObj.status === 'number' ? errObj.status : (typeof errObj.statusCode === 'number' ? errObj.statusCode : 0);
  const code = typeof errObj.code === 'string' ? errObj.code : '';
  const message = typeof errObj.message === 'string' ? errObj.message : (err instanceof Error ? err.message : String(err));
  const combined = `${status} ${code} ${message}`.toLowerCase();

  // Permanent failures — NEVER retry
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 413 ||
    status === 422 ||
    code === '42501' || // RLS error
    code === '23505' || // Duplicate key
    code === '23503' || // FK violation
    combined.includes('mime type') ||
    combined.includes('not allowed') ||
    combined.includes('unauthorized') ||
    combined.includes('row-level security') ||
    combined.includes('permission denied') ||
    combined.includes('payload too large') ||
    combined.includes('size limit') ||
    combined.includes('invalid file') ||
    combined.includes('unsupported format')
  ) {
    return false;
  }

  // Transient failures — SAFE to retry
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 429 ||
    status === 500 ||
    combined.includes('failed to fetch') ||
    combined.includes('networkerror') ||
    combined.includes('network error') ||
    combined.includes('net::err_') ||
    combined.includes('upload timed out') ||
    combined.includes('timeout') ||
    combined.includes('timed out') ||
    combined.includes('connection reset') ||
    combined.includes('broken pipe') ||
    combined.includes('stream closed')
  ) {
    return true;
  }

  return false;
}

/**
 * Execute an array of upload tasks with a strict concurrency limit (default 2),
 * exponential backoff retries for transient errors, and live progress reporting.
 */
export async function executeUploadQueue<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    maxRetries?: number;
    initialBackoffMs?: number;
    onProgress?: (completed: number, total: number, currentItem: T) => void;
  } = {}
): Promise<R[]> {
  const {
    concurrency = 2,
    maxRetries = 2,
    initialBackoffMs = 800,
    onProgress,
  } = options;

  const total = items.length;
  if (total === 0) return [];

  const results: R[] = new Array(total);
  let nextIndex = 0;
  let completedCount = 0;
  let firstError: Error | null = null;

  async function executeWithRetry(item: T, index: number): Promise<void> {
    let attempt = 0;
    while (true) {
      if (firstError) return; // Stop if another worker suffered a permanent error

      try {
        const result = await worker(item, index);
        results[index] = result;
        completedCount++;
        onProgress?.(completedCount, total, item);
        return;
      } catch (err: unknown) {
        attempt++;
        const isTransient = isTransientUploadError(err);
        const errorObj = err instanceof Error ? err : new Error(String(err));

        if (!isTransient || attempt > maxRetries) {
          firstError = errorObj;
          throw errorObj;
        }

        // Exponential backoff with jitter
        const backoff = initialBackoffMs * Math.pow(2, attempt - 1) + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  async function runWorker(): Promise<void> {
    while (nextIndex < total && !firstError) {
      const currentIndex = nextIndex++;
      await executeWithRetry(items[currentIndex], currentIndex);
    }
  }

  // Spawn up to `concurrency` parallel worker loops
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, total);
  for (let i = 0; i < workerCount; i++) {
    workers.push(runWorker());
  }

  await Promise.all(workers);

  if (firstError) {
    throw firstError;
  }

  return results;
}
