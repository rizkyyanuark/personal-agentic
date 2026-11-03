export type SearchMode = "messages" | "documents" | "images";

export function normalizeSearchQuery(query: string): string {
  const whitespace = /[\p{White_Space}\uFEFF]/u;
  let start = 0;
  let end = query.length;
  while (start < end && whitespace.test(query[start])) start += 1;
  while (end > start && whitespace.test(query[end - 1])) end -= 1;
  return query.slice(start, end);
}

export function searchEmptyMessage(mode: SearchMode, indexedArtifactCount?: number): string {
  if (mode !== "messages" && indexedArtifactCount === 0) {
    return `No searchable indexed ${mode} yet. Add files to Knowledge and make them searchable separately.`;
  }
  return `No ${mode} found in this group.`;
}
