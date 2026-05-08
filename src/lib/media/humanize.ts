export function humanizeFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^./]+$/, '')
  const lastPathSegment = withoutExt.split('/').pop() ?? withoutExt
  // Pick the last dot-separated chunk so naming-convention prefixes
  // ("8583.11604.cupertino.cupertino-hotel.amenity.breakfast-restaurant-bar")
  // collapse to the most specific descriptor.
  const lastDotSegment = lastPathSegment.split('.').pop() ?? lastPathSegment
  const spaced = lastDotSegment
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced) return filename
  return spaced
    .split(' ')
    .map((word) => {
      if (/^\d+$/.test(word)) return word
      if (word.length <= 3 && word === word.toUpperCase()) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}
