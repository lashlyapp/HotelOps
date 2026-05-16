/**
 * Helper for the drip-publish cadence. Scans every blog post file
 * under src/content/blog/posts/, extracts the publishedAt date from
 * each, and prints the date 14 days after the latest one — published
 * or scheduled.
 *
 * Usage:
 *
 *   npx tsx scripts/schedule-next-post.ts
 *
 * Output is a single ISO YYYY-MM-DD line on stdout. Suitable for
 * scripting:
 *
 *   NEXT_DATE=$(npx tsx scripts/schedule-next-post.ts)
 *   echo "Stamp the next draft with publishedAt: $NEXT_DATE"
 *
 * Why not import src/content/blog directly: the registry pulls in
 * the form component used by the modernize post, which imports a
 * `server-only` server action. That import chain throws when run
 * from a plain `tsx` CLI context. A regex over the post files
 * stays in pure-Node space and is plenty robust for our schema.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const CADENCE_DAYS = 14
const POSTS_DIR = path.resolve(process.cwd(), 'src/content/blog/posts')

function main(): void {
  const dates = readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => extractPublishedAt(path.join(POSTS_DIR, f)))
    .filter((d): d is string => d !== null)
    .sort()

  if (dates.length === 0) {
    console.log(new Date().toISOString().slice(0, 10))
    return
  }

  const latest = dates[dates.length - 1]
  const next = new Date(`${latest}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + CADENCE_DAYS)
  console.log(next.toISOString().slice(0, 10))
}

function extractPublishedAt(filePath: string): string | null {
  const src = readFileSync(filePath, 'utf8')
  const match = src.match(/publishedAt:\s*'(\d{4}-\d{2}-\d{2})'/)
  return match ? match[1] : null
}

main()
