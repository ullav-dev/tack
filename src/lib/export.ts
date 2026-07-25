/** Triggers a browser download of `content` as a file named `filename`.
 * Client-side only (uses `Blob`/`URL.createObjectURL`) -- both Markdown and
 * HTML export (Notes and Pages) go through this. */
export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Turns a title into a safe-ish filename stem -- lowercase, spaces to
 * hyphens, strips anything not alphanumeric/hyphen. Falls back to
 * `untitled` for an empty/all-punctuation title. */
export function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wraps a rendered HTML body fragment into a standalone document -- self-
 * contained (inline styles, no external stylesheet) so the downloaded file
 * looks reasonable opened directly in a browser with no other context. */
export function wrapHtmlDocument(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1.5rem; color: #1e293b; line-height: 1.6; }
  h1 { font-size: 1.5rem; }
  img { max-width: 100%; border-radius: 0.5rem; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0; }
  .meta { color: #94a3b8; font-size: 0.8rem; }
  blockquote { border-left: 3px solid #e2e8f0; margin: 0; padding-left: 1rem; color: #475569; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #e2e8f0; padding: 0.4rem 0.6rem; }
  code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 0.25rem; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}
