/**
 * escape-html.ts — escape untrusted text before interpolating it into HTML
 * (email bodies, logged email HTML). Escapes & < > " ' so the value is safe in
 * element content and in quoted attribute values.
 */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Escape, then turn line breaks into <br>. The newline itself is replaced (not
 * kept) so containers styled `white-space:pre-wrap` don't render double breaks.
 */
export function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}
