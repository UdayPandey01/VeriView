import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VeriView — Zero-Trust Visual Firewall for AI Agents',
  description: 'VeriView renders webpages and runs 6-axis DOM physics analysis to block invisible prompt injections before your AI agent acts on them.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
