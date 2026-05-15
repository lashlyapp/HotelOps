import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMarkdown, safeHref } from './sanitize'

describe('parseMarkdown', () => {
  it('splits text into paragraphs', () => {
    const blocks = parseMarkdown('Hello\n\nWorld')
    assert.equal(blocks.length, 2)
    assert.equal(blocks[0]!.kind, 'paragraph')
    assert.equal(blocks[1]!.kind, 'paragraph')
  })

  it('parses bold and italic inline marks', () => {
    const [block] = parseMarkdown('Hi **friend** and *welcome*')
    assert.equal(block!.kind, 'paragraph')
    if (block!.kind !== 'paragraph') return
    const kinds = block.children.map((c) => c.kind)
    assert.deepEqual(kinds, ['text', 'bold', 'text', 'italic'])
  })

  it('parses bulleted lists with - prefix', () => {
    const blocks = parseMarkdown('- breakfast\n- lunch\n- dinner')
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0]!.kind, 'list')
    if (blocks[0]!.kind !== 'list') return
    assert.equal(blocks[0]!.items.length, 3)
  })

  it('parses links with markdown syntax', () => {
    const [block] = parseMarkdown('See [the menu](https://example.com)')
    assert.equal(block!.kind, 'paragraph')
    if (block!.kind !== 'paragraph') return
    const link = block.children.find((c) => c.kind === 'link')
    assert.ok(link)
    if (link?.kind !== 'link') return
    assert.equal(link.href, 'https://example.com')
  })

  it('treats unmatched markers as plain text', () => {
    const [block] = parseMarkdown('a*b')
    assert.equal(block!.kind, 'paragraph')
    if (block!.kind !== 'paragraph') return
    // Should not blow up or hang; produces 3 text nodes.
    const text = block.children.map((c) => (c.kind === 'text' ? c.text : '')).join('')
    assert.equal(text, 'a*b')
  })
})

describe('safeHref', () => {
  it('accepts https links', () => {
    assert.equal(safeHref('https://example.com'), 'https://example.com')
  })

  it('rejects javascript and data URLs', () => {
    assert.equal(safeHref('javascript:alert(1)'), null)
    assert.equal(safeHref('data:text/html,<script>'), null)
  })

  it('rejects http links (https only for public arrival page)', () => {
    assert.equal(safeHref('http://example.com'), null)
  })
})
