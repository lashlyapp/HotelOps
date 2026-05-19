// Deterministic PRNG so that the "auto-detected" market intelligence is
// stable for a given (property, date) pair without persisting random
// state. Same seed in → same numbers out, across the cron and the
// on-demand refresh path.

function hashString(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0xffffffff
  }
}

export function pickN<T>(items: readonly T[], n: number, seed: string): T[] {
  if (items.length <= n) return [...items]
  const rng = seededRandom(seed)
  const pool = [...items]
  const out: T[] = []
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

export function pickOne<T>(items: readonly T[], seed: string): T {
  return items[Math.floor(seededRandom(seed)() * items.length)]
}
