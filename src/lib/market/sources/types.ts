// Shared types for every data-source adapter. See
// docs/revenue-intelligence.md § "Layer-by-layer detail" for the
// pipeline contract.

export type ObservationTargetKind =
  | 'event'
  | 'venue'
  | 'holiday'
  | 'weather'
  | 'review'
  | 'rate'
  | 'pageview'
  | 'fx'
  | 'disruption'

// What an adapter produces. `payload` is the cleansed/normalized
// representation that downstream normalizers read; `payload_raw`
// preserves the original API response for audit.
export type Observation = {
  observed_at: string // ISO timestamp (UTC)
  target_kind: ObservationTargetKind
  target_key?: string | null
  geo_key?: string | null
  property_id?: string | null
  org_id?: string | null
  payload: Record<string, unknown>
  payload_raw?: Record<string, unknown> | null
}

// Standard adapter return shape.
export type AdapterResult = {
  observations: Observation[]
  api_calls: number
  errors: AdapterError[]
}

export type AdapterError = {
  message: string
  context?: Record<string, unknown>
}

// Context passed to every adapter run. Adapters can use this to
// short-circuit (e.g. weather adapter wants per-property geos).
export type AdapterContext = {
  // List of properties to fetch for. Adapters that are per-property
  // (weather, reviews, comp rates) iterate this; global adapters
  // (holidays, FX) ignore it.
  properties: Array<{
    id: string
    org_id: string
    city: string | null
    state: string | null
    country: string
    latitude?: number | null
    longitude?: number | null
  }>
}

export type Adapter = {
  source: string
  // Pure function — fetches from the external API, returns
  // cleansed observations. Does NOT touch the database. The runner
  // handles all DB writes.
  run(ctx: AdapterContext): Promise<AdapterResult>
}
