export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function escapeHtmlForAttribute(text: string): string {
  return escapeHtml(text);
}

export function sanitizeHtmlContent(content: string): string {
  return escapeHtml(content);
}
