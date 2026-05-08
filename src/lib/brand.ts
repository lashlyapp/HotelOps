/**
 * Single source of truth for brand strings. Anything customer-facing about
 * MyHotelOps the company (legal name, address, support email) lives here.
 */
export const BRAND = {
  name: 'MyHotelOps',
  productTagline: 'Operations platform for hotel property owners',
  legalName: 'MyHotelOps',
  address: {
    line1: '2108 N St #15449',
    line2: null as string | null,
    city: 'Sacramento',
    state: 'CA',
    postalCode: '95816',
    country: 'United States',
  },
  supportEmail: 'support@myhotelops.com',
  domain: 'myhotelops.com',
} as const

export const BRAND_ADDRESS_LINES = [
  BRAND.address.line1,
  BRAND.address.line2,
  `${BRAND.address.city}, ${BRAND.address.state} ${BRAND.address.postalCode}`,
  BRAND.address.country,
].filter((line): line is string => Boolean(line))
