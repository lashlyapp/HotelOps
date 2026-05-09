import type {
  ItCredentialCategory,
  ItDocumentCategory,
  ItEquipmentCategory,
  ItEquipmentStatus,
  ItNetworkType,
  ItVendorType,
} from '@/lib/supabase/types'

export const NETWORK_TYPE_LABELS: Record<ItNetworkType, string> = {
  guest: 'Guest Wi-Fi',
  staff: 'Staff Wi-Fi',
  boh: 'Back-of-house',
  event: 'Event / banquet',
  iot: 'Smart devices',
  other: 'Other',
}

export const CREDENTIAL_CATEGORY_LABELS: Record<ItCredentialCategory, string> = {
  pms: 'Property management (PMS)',
  booking: 'Booking engine',
  channel: 'Channel manager / OTA',
  social: 'Social media',
  accounting: 'Accounting',
  utility: 'Utility / billing',
  email: 'Email',
  marketing: 'Marketing',
  security: 'Security / cameras',
  other: 'Other',
}

export const EQUIPMENT_CATEGORY_LABELS: Record<ItEquipmentCategory, string> = {
  router: 'Router',
  switch: 'Network switch',
  access_point: 'Wi-Fi access point',
  tv: 'TV',
  printer: 'Printer',
  phone: 'Phone',
  pos: 'Point of sale',
  camera: 'Camera',
  smart_lock: 'Smart lock',
  computer: 'Computer',
  tablet: 'Tablet',
  speaker: 'Speaker / audio',
  other: 'Other',
}

export const EQUIPMENT_STATUS_LABELS: Record<ItEquipmentStatus, string> = {
  active: 'In use',
  spare: 'Spare',
  retired: 'Retired',
  broken: 'Broken',
}

export const DOCUMENT_CATEGORY_LABELS: Record<ItDocumentCategory, string> = {
  contract: 'Contract',
  runbook: 'Runbook / SOP',
  presentation: 'Presentation',
  manual: 'Manual',
  network_diagram: 'Network diagram',
  license: 'License',
  warranty: 'Warranty',
  invoice: 'Invoice',
  policy: 'Policy',
  other: 'Other',
}

export const VENDOR_TYPE_LABELS: Record<ItVendorType, string> = {
  isp: 'Internet provider',
  it_support: 'IT support',
  software: 'Software vendor',
  phone: 'Phone system',
  tv_cable: 'TV / cable',
  security: 'Security / alarm',
  other: 'Other',
}

export function asOptions<T extends string>(
  labels: Record<T, string>,
): { value: T; label: string }[] {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({
    value,
    label,
  }))
}
