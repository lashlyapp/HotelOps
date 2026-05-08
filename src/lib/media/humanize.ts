export function humanizeFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^./]+$/, '')
  const lastSegment = withoutExt.split('/').pop() ?? withoutExt
  const spaced = lastSegment
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
