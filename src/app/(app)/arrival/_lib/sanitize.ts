/**
 * Tiny markdown subset for the welcome body. We render server-side to
 * plain JSX (no dangerouslySetInnerHTML), so this returns a structured
 * tree the renderer walks. Supports paragraphs, **bold**, *italic*,
 * - bulleted lists, and [link text](https://url) with auto-noopener.
 *
 * Anything outside this subset is treated as plain text. This is on
 * purpose — operators paste arbitrary content and the public page is
 * cached at the CDN edge, so a sloppy HTML escape would be the wrong
 * place to find out about an XSS vector.
 */

export type Node =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Node[] }
  | { kind: 'italic'; children: Node[] }
  | { kind: 'link'; href: string; children: Node[] }

export type Block =
  | { kind: 'paragraph'; children: Node[] }
  | { kind: 'list'; items: Node[][] }

export function parseMarkdown(input: string): Block[] {
  const blocks: Block[] = []
  const lines = input.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i += 1
      continue
    }
    if (line.startsWith('- ')) {
      const items: Node[][] = []
      while (i < lines.length && lines[i]!.startsWith('- ')) {
        items.push(parseInline(lines[i]!.slice(2)))
        i += 1
      }
      blocks.push({ kind: 'list', items })
      continue
    }
    // Paragraph runs until the next blank line.
    const buf: string[] = [line]
    i += 1
    while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.startsWith('- ')) {
      buf.push(lines[i]!)
      i += 1
    }
    blocks.push({
      kind: 'paragraph',
      children: parseInline(buf.join(' ')),
    })
  }
  return blocks
}

// Inline parser — greedy left-to-right scan. The order matters: links
// first (so [foo](https://bar) doesn't accidentally consume **'s inside
// the label), then bold (** before *), then italic.
function parseInline(input: string): Node[] {
  const nodes: Node[] = []
  let rest = input
  while (rest.length > 0) {
    const linkMatch = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/)
    if (linkMatch) {
      nodes.push({
        kind: 'link',
        href: linkMatch[2]!,
        children: parseInline(linkMatch[1]!),
      })
      rest = rest.slice(linkMatch[0].length)
      continue
    }
    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      nodes.push({
        kind: 'bold',
        children: parseInline(boldMatch[1]!),
      })
      rest = rest.slice(boldMatch[0].length)
      continue
    }
    const italicMatch = rest.match(/^\*([^*]+)\*/)
    if (italicMatch) {
      nodes.push({
        kind: 'italic',
        children: parseInline(italicMatch[1]!),
      })
      rest = rest.slice(italicMatch[0].length)
      continue
    }
    // Plain text up to the next inline marker (or end-of-string).
    const nextMarker = rest.search(/(\[|\*\*|\*)/)
    if (nextMarker === -1) {
      nodes.push({ kind: 'text', text: rest })
      break
    }
    if (nextMarker > 0) {
      nodes.push({ kind: 'text', text: rest.slice(0, nextMarker) })
      rest = rest.slice(nextMarker)
    } else {
      // We saw a marker but it didn't match (mismatched **, etc.) — eat
      // one character and continue so we make progress and don't loop.
      nodes.push({ kind: 'text', text: rest[0]! })
      rest = rest.slice(1)
    }
  }
  return nodes
}

export function safeHref(href: string): string | null {
  // Only https URLs allowed on the public page. Operators get a warning
  // upstream; this is the belt-and-suspenders that the renderer enforces.
  if (!/^https:\/\//i.test(href)) return null
  return href
}
