import { Metadata } from 'next'
import { getLanguageFromParams } from '@/utils/api/language'
import Image from 'next/image'
import Link from 'next/link'
import BookingButtons from '@/components/client/concert2025/BookingButtons'
import PosterGrid from '@/components/client/PosterGrid'
import VideoSection from '@/components/client/VideoSection'
import fs from 'fs'
import path from 'path'
import { getTranslations } from '@/lib/i18n/server'
import Concert2025Guide from './Concert2025Guide'
import {
  lineup,
  POSTERS_BY_SLUG,
  postersBySlugNormalized,
  postersFlat,
  firstPosterSrc,
  normalizeKey,
  slugToArtistName,
  toKeyFromFilename,
  getPosterForVideoKey,
  type VideoSource,
  type VideoGroup,
} from './concert2025-data'

export const dynamic = 'force-static'
export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = getLanguageFromParams(await params)
  const t = await getTranslations(lang)
  return {
    title: t('concert2025.meta.title'),
    description: t('concert2025.meta.description'),
  }
}

export default async function Concert2025Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const isCn = (lang || '').toLowerCase().startsWith('zh-cn')
  const t = await getTranslations(getLanguageFromParams(await params))

  const info = {
    dateTime: t('concert2025.info.dateTime'),
    entrance: t('concert2025.info.entrance'),
    venue: t('concert2025.info.venue'),
  }

  const venue = {
    name: '서울 블루스퀘어(Blue Square)',
    address: '서울특별시 용산구 한남동',
    coord: { lng: 127.003, lat: 37.5405 },
    amapKeyword: encodeURIComponent('Blue Square Seoul'),
  }

  // 지도 이미지는 항상 map.png를 사용 (SSG 캐시 이슈 방지)
  const mapImagePublicRelative = path.join('concert2025', 'image', 'map.png')
  const mapImageFsPath = path.join(process.cwd(), 'public', mapImagePublicRelative)
  const hasMapImage = true

  // 소개 영상: video 폴더의 mp4를 모두 노출 (한글/대소문자 파일명 포함)
  const publicVideoDir = path.join(process.cwd(), 'public', 'concert2025', 'video')
  const videoFiles = fs.existsSync(publicVideoDir)
    ? fs.readdirSync(publicVideoDir).filter((f) => f.toLowerCase().endsWith('.mp4'))
    : []
  const videoGroups: VideoGroup[] = videoFiles.map((file) => {
    const key = toKeyFromFilename(file)
    const thumb = `/concert2025/video/thumbs/${encodeURIComponent(file.replace(/\.mp4$/i, '.jpg'))}`
    return {
      key,
      sources: [{ src: `/concert2025/video/${encodeURIComponent(file)}?v=1`, type: 'video/mp4' }],
      thumb,
    }
  })

  return (
    <main className="relative container mx-auto px-4 py-12 md:py-16 break-words">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(60% 60% at 15% 20%, rgba(118, 97, 255, 0.35), rgba(118,97,255,0) 60%),\
             radial-gradient(60% 60% at 85% 25%, rgba(255, 123, 172, 0.30), rgba(255,123,172,0) 60%),\
             radial-gradient(60% 60% at 50% 85%, rgba(255, 216, 170, 0.25), rgba(255,216,170,0) 60%),\
             linear-gradient(180deg, #BEB7FF 0%, #E8A6CF 55%, #FFD4C7 100%)',
        }}
      />
      <div className="relative z-10">
      {/* Hero */}
      <section className="text-center space-y-2 md:space-y-3" lang="ko">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="relative mx-auto w-full aspect-[16/7]">
            <Image
              src="/concert2025/image/logo.png?v=1"
              alt={t('concert2025.hero.altLogo')}
              fill
              sizes="(max-width: 768px) 80vw, 720px"
              priority
              className="object-contain"
            />
          </div>
        </div>
              <h2
                className="text-xl md:text-2xl font-bold mb-0 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent"
                lang="en"
              >
                {t('concert2025.hero.tagline')}
              </h2>
      </section>

      {/* Notice (non-CN only) */}
      {!isCn && (
        <section className="mt-6" lang="ko">
          <div className="rounded-xl border border-primary/30 bg-white/90 backdrop-blur p-5 shadow-sm">
            <div className="text-sm md:text-base text-gray-800 text-center">
              <pre className="whitespace-pre-line break-normal hyphens-none leading-relaxed" style={{ overflowWrap: 'normal', wordBreak: 'keep-all' }}>{t('concert2025.notice.koText')}</pre>
            </div>
          </div>
        </section>
      )}

      {isCn && (
        <section className="mt-6" lang="zh">
          <div className="rounded-xl border border-primary/30 bg-white/90 backdrop-blur p-5 shadow-sm">
            <div className="text-sm md:text-base text-gray-800 text-center">
              <pre className="whitespace-pre-line break-normal hyphens-none leading-relaxed" style={{ overflowWrap: 'normal', wordBreak: 'keep-all' }}>{
`本链接为前来参加"Shining Seoul"演唱会的中国籍游客提供的特别专属链接。
通过本链接购票的观众可享受优惠票价。
在预订门票时，即视为已同意本页面所载的所有须知事项。
本页面内容可能会根据情况进行补充或更改，恕不另行通知。
因未仔细阅读入场及观演须知而造成的不便或损失，由观众本人承担。
为避免观演受阻或产生不利影响，请您在入场前务必再次确认相关须知。`}
              </pre>
            </div>
          </div>
        </section>
      )}

      {/* Info Bar (일정/장소) */}
      <section className="mt-6">
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur px-5 py-4 md:px-6 md:py-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center md:text-left">
            <div className="font-semibold text-gray-900">{info.dateTime}</div>
            <div className="text-sm text-gray-700">{info.entrance}</div>
            <div className="text-sm text-gray-700">{info.venue}</div>
          </div>
        </div>
      </section>

      {/* Posters section removed per request */}

      {/* Description removed per request */}

      {/* Intro Video moved below Korean guide per request */}

      {/* Ticket Guide moved below to above video section for zh */}

      {/* 한국어 안내사항 */}
      <Concert2025Guide t={t} mapImagePublicRelative={mapImagePublicRelative} />

      {/* Intro Video */}
      {/* Booking buttons (ko/en etc) or Ticket Guide (zh) positioned ABOVE the video */}
      <section className="mt-10" style={{ contentVisibility: 'auto' }}>
        {!isCn ? (
          <BookingButtons
            lang={lang}
            title={t('concert2025.bookingButtons.title')}
            firstFloorLabel={t('concert2025.bookingButtons.firstFloor')}
            secondFloorLabel={t('concert2025.bookingButtons.secondFloor')}
          />
        ) : (
          <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm" lang="zh">
            <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">购票须知</h2>
            <div className="mt-6">
              <p className="text-gray-700 leading-relaxed">以下账户信息用于本次演出的购票打款：</p>
              <dl className="mt-4 space-y-3 text-sm text-gray-800">
                <div className="grid grid-cols-3 gap-2">
                  <dt className="col-span-1 font-semibold">公司名称</dt>
                  <dd className="col-span-2 break-all">大连艾康星文化传媒有限公司</dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="col-span-1 font-semibold">账户号码</dt>
                  <dd className="col-span-2 break-all">285686624326</dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="col-span-1 font-semibold">开户行</dt>
                  <dd className="col-span-2 break-all">中国银行大连市分行营业部</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg border border-secondary/20 bg-secondary/5 p-3 text-xs text-gray-600">
                <p>• 打款完成后请保留凭证，联系微信客服提交订单信息以便对账。</p>
                <p className="mt-1">• 若有改期/退款政策，以主办方公告为准。</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mt-10" lang="ko" style={{ contentVisibility: 'auto' }}>
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">{t('concert2025.introVideo.title')}</h2>
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm">
          {videoGroups.length === 0 ? (
            <p className="text-sm text-gray-500">{t('concert2025.introVideo.comingSoon')}</p>
          ) : (
            <VideoSection
              groups={videoGroups.map((g) => ({
                key: g.key,
                sources: g.sources,
                poster: g.thumb || getPosterForVideoKey(g.key) || firstPosterSrc,
              }))}
            />
          )}
        </div>
      </section>

      {/* Contact / WeChat QR - CN only */}
            {isCn && (
              <section className="mt-10" lang="zh" style={{ contentVisibility: 'auto' }}>
                <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm grid place-items-center">
                  <div className="relative rounded-xl border bg-white p-3 shadow-sm">
                    <Image
                      src="/concert2025/image/wechat-qr.png?v=1"
                      alt=""
                      width={288}
                      height={288}
                      className="object-contain"
                    />
                  </div>
                </div>
              </section>
            )}

      {/* Location / Map (removed per request) */}

      {/* Posters - Flat Grid (no grouping) */}
      <section className="mt-10" lang="ko">
        <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">{t('concert2025.posters.title')}</h2>
        <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm">
          <PosterGrid
            posters={[...postersFlat]
              .sort((a, b) => {
                const as = (a.slug || '').localeCompare(b.slug || '')
                if (as !== 0) return as
                const av = typeof a.variant === 'number' ? a.variant! : Number.MAX_SAFE_INTEGER
                const bv = typeof b.variant === 'number' ? b.variant! : Number.MAX_SAFE_INTEGER
                return av - bv
              })
              .map((p) => ({
                src: p.src,
                alt: slugToArtistName[normalizeKey(p.slug || '')] || p.alt || p.slug || t('concert2025.posters.unknownArtist'),
                slug: p.slug,
                variant: p.variant,
              }))}
          />
        </div>
      </section>
      </div>
    </main>
  )
}
