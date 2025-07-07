import type { Metadata } from 'next'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: 'Picnic',
  description: 'Picnic - Your favorite voting platform',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 현재 경로에서 언어 감지
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || headersList.get('x-url') || ''
  
  // 경로에서 언어 추출 (예: /ko, /en, /ja 등)
  const languageMatch = pathname.match(/^\/([a-z]{2})(?:\/|$)/)
  const currentLang = languageMatch ? languageMatch[1] : 'ko'

  return (
    <html lang={currentLang}>
      <body>
        {children}
      </body>
    </html>
  )
} 