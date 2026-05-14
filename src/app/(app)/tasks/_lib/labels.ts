import type {
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from '@/lib/supabase/types'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
}

export const STATUS_ORDER: TaskStatus[] = [
  'open',
  'in_progress',
  'waiting',
  'done',
]

export const STATUS_TONE: Record<
  TaskStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  open: 'neutral',
  in_progress: 'info',
  waiting: 'warning',
  done: 'success',
}

export const STATUS_COLUMN_DESCRIPTION: Record<TaskStatus, string> = {
  open: 'Newly reported, not yet picked up',
  in_progress: 'Someone is actively working on it',
  waiting: 'Blocked on parts, a vendor, or a guest',
  done: 'Resolved with proof attached',
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

export const PRIORITY_TONE: Record<
  TaskPriority,
  'neutral' | 'info' | 'warning' | 'danger'
> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
}

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  appliance: 'Appliance',
  furniture: 'Furniture',
  fixtures: 'Fixtures',
  flooring: 'Flooring',
  paint_wall: 'Paint / wall',
  door_lock: 'Door / lock',
  window: 'Window',
  lighting: 'Lighting',
  tv_av: 'TV / AV',
  pool_spa: 'Pool / spa',
  landscaping: 'Landscaping',
  pest: 'Pest control',
  housekeeping: 'Housekeeping',
  lost_found: 'Lost & found',
  amenities: 'Amenities',
  cleanliness: 'Cleanliness',
  guest_request: 'Guest request',
  safety: 'Safety',
  it: 'IT',
  other: 'Other',
}

// Ordered for the picker so the most common categories sit at the top.
export const CATEGORY_ORDER: TaskCategory[] = [
  'guest_request',
  'plumbing',
  'electrical',
  'hvac',
  'appliance',
  'tv_av',
  'lighting',
  'door_lock',
  'window',
  'furniture',
  'fixtures',
  'flooring',
  'paint_wall',
  'cleanliness',
  'housekeeping',
  'amenities',
  'lost_found',
  'pool_spa',
  'landscaping',
  'pest',
  'safety',
  'it',
  'other',
]

export const STATUSES: TaskStatus[] = ['open', 'in_progress', 'waiting', 'done']
export const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent']
export const CATEGORIES: TaskCategory[] = CATEGORY_ORDER
