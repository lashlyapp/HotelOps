import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HotelOps Signage',
  description: 'Hotel digital signage player.',
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
