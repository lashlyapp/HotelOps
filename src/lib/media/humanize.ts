export function humanizeFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^./]+$/, '')
  const lastPathSegment = withoutExt.split('/').pop() ?? withoutExt
  // Treat dots, dashes, and underscores all as word boundaries so structured
  // filenames ("8583.11604.cupertino.cupertino-hotel.amenity.breakfast-restaurant-bar")
  // turn into space-separated words. Leading numeric-only segments (likely
  // IDs / timestamps from automated feeds) are dropped because they don't
  // help a human identify the file. Adjacent duplicate words collapse so
  // "cupertino.cupertino-hotel" doesn't repeat.
  const tokens = lastPathSegment
    .split(/[._\-]+/)
    .map((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2').trim())
    .filter(Boolean)

  while (tokens.length > 1 && /^\d+$/.test(tokens[0])) tokens.shift()

  const deduped: string[] = []
  for (const token of tokens) {
    if (deduped[deduped.length - 1]?.toLowerCase() !== token.toLowerCase()) {
      deduped.push(token)
    }
  }

  if (deduped.length === 0) return filename
  return deduped
    .flatMap((token) => token.split(/\s+/))
    .map((word) => {
      if (/^\d+$/.test(word)) return word
      if (word.length <= 3 && word === word.toUpperCase()) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}
