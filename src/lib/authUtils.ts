/**
 * Authentication and Redirection Security Utilities
 *
 * Implements strict URL sanitization for internal application routes to
 * protect against Open Redirect vulnerabilities, protocol-relative attacks,
 * backslash evasion techniques (CVE-2025-68470), dangerous URI schemes,
 * and double-encoded bypass attempts.
 */

/**
 * Sanitizes and validates internal application redirect targets.
 * Strictly guarantees that any returned redirect URL is a safe, internal relative path.
 *
 * @param rawUrl The unvalidated destination path from query params, state, or storage.
 * @param fallback Safe default route to return when the input is invalid or malicious (defaults to '/').
 * @returns A safe, internal relative route.
 */
export function sanitizeRedirectUrl(rawUrl: string | null | undefined, fallback = '/'): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallback;
  }

  let decoded = rawUrl.trim();
  if (!decoded) {
    return fallback;
  }

  // 1. Attempt iterative URL decoding to catch double-encoded bypasses (%2f%2fevil.com, %5c)
  for (let i = 0; i < 2; i++) {
    if (decoded.includes('%')) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next.trim();
      } catch {
        // If malformed URI sequence, immediately reject
        return fallback;
      }
    }
  }

  // 2. Reject unprintable control characters, newlines, and tabs
  if (/[\x00-\x1F\x7F]/.test(decoded)) {
    return fallback;
  }

  // 3. Strictly forbid backslashes anywhere in the path (CVE-2025-68470 bypasses)
  if (decoded.includes('\\')) {
    return fallback;
  }

  // 4. Strictly forbid double slashes anywhere in the target (protocol-relative URLs or encoded separators)
  if (decoded.includes('//')) {
    return fallback;
  }

  // 5. Strictly forbid any URI scheme (e.g., http:, https:, javascript:, data:, vbscript:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) {
    return fallback;
  }

  // 6. Target must start with a single forward slash
  if (!decoded.startsWith('/')) {
    return fallback;
  }

  // If raw input started with /, preserve original encoding in query strings
  // Otherwise return decoded safe internal path
  if (rawUrl.trim().startsWith('/')) {
    return rawUrl.trim();
  }
  return decoded;
}

