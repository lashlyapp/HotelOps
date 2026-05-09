import type {
  EventLineSection,
  EventPaymentMethod,
  EventStatus,
  EventType,
} from '@/lib/supabase/types'

export const STATUS_LABELS: Record<EventStatus, string> = {
  inquiry: 'Inquiry',
  tentative: 'Tentative',
  proposal_sent: 'Proposal sent',
  definite: 'Definite',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  lost: 'Lost',
}

export const STATUS_TONE: Record<
  EventStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  inquiry: 'neutral',
  tentative: 'warning',
  proposal_sent: 'info',
  definite: 'success',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  lost: 'danger',
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: 'Wedding',
  corporate: 'Corporate',
  social: 'Social / party',
  catering: 'Catering only',
  meeting: 'Meeting',
  other: 'Other',
}

export const LINE_SECTION_LABELS: Record<EventLineSection, string> = {
  venue: 'Venue',
  food: 'Food',
  beverage: 'Beverage',
  av: 'AV',
  staffing: 'Staffing',
  rentals: 'Rentals',
  other: 'Other',
}

export const LINE_SECTION_ORDER: EventLineSection[] = [
  'venue',
  'food',
  'beverage',
  'av',
  'staffing',
  'rentals',
  'other',
]

export const PAYMENT_METHOD_LABELS: Record<EventPaymentMethod, string> = {
  check: 'Check',
  cash: 'Cash',
  ach: 'ACH',
  wire: 'Wire',
  card: 'Card',
  other: 'Other',
}

export function asOptions<T extends string>(
  labels: Record<T, string>,
): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }))
}
