import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'MediShield PreCheck · Privacy-first Insurance Triage',
  description:
    'Run a medical insurance eligibility pre-check directly in your browser with fully homomorphic encryption. No health data ever leaves your control.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Script
          src="https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.umd.cjs"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  )
}
