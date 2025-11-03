import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Picnic',
  description: 'Picnic - Your favorite voting platform',
  // AdSense 계정 메타 태그 (권장)
  other: {
    'google-adsense-account': 'ca-pub-1539304887624918',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 현재 경로에서 언어 감지
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || headersList.get('x-url') || ''
  
  // 경로에서 언어 추출 (예: /ko, /en, /ja, /zh-tw 등)
  const languageMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/)
  const currentLang = languageMatch ? languageMatch[1] : 'ko'

  return (
    <html lang={currentLang}>
      <body>
        {/* Google AdSense (Auto ads) */}
        <Script
          id="adsense"
          strategy="afterInteractive"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1539304887624918"
          crossOrigin="anonymous"
        />
        <div className='bg-white'>
          {children}
        </div>
      </body>
    </html>
  )
} 