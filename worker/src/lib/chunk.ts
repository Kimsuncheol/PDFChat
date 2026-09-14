/** Simple character-based chunker with overlap. Good enough for prose PDFs. */
export function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = end - overlap;
  }
  return chunks;
}
