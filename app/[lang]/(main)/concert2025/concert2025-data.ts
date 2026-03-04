// Pure data constants and helper functions for concert2025.
// No React dependency — safe to import from any module.

export type Artist = { id: number; name: string; slug: string }

export type PosterFile = { src: string; alt: string; slug: string; variant?: number }

export type VideoSource = { src: string; type: string }

export type VideoGroup = { key: string; sources: VideoSource[]; thumb?: string }

export const lineup: Artist[] = [
  { id: 1, name: 'T-ARA 柳和荣（류화영）', slug: 'ryuhwayoung' },
  { id: 2, name: 'ifeye(이프아이)', slug: 'ifeye' },
  { id: 3, name: 'Gavy NJ（가비앤제이）', slug: 'gavynj' },
  { id: 4, name: 'EastShine（이스트샤인）', slug: 'eastshine' },
  { id: 5, name: 'iii（아이아이아이）', slug: 'iii' },
  { id: 6, name: 'Young Posse（영파씨）', slug: 'youngposse' },
]

export const POSTERS_BY_SLUG: Record<string, PosterFile[]> = {
  'eastshine': [
    { src: '/concert2025/image/poster/eastshine-1.png', alt: 'eastshine-1', slug: 'eastshine', variant: 1 },
    { src: '/concert2025/image/poster/eastshine-2.png', alt: 'eastshine-2', slug: 'eastshine', variant: 2 },
  ],
  'ifeye': [
    { src: '/concert2025/image/poster/ifeye-1.png', alt: 'ifeye-1', slug: 'ifeye', variant: 1 },
    { src: '/concert2025/image/poster/ifeye-2.png', alt: 'ifeye-2', slug: 'ifeye', variant: 2 },
  ],
  'gavy-nj': [
    { src: '/concert2025/image/poster/gavy-nj.png', alt: 'gavy-nj', slug: 'gavy-nj', variant: 1 },
  ],
  'ryu-hwayoung': [
    { src: '/concert2025/image/poster/ryu-hwayoung.png', alt: 'ryu-hwayoung', slug: 'ryu-hwayoung', variant: 1 },
  ],
  'iii': [
    { src: '/concert2025/image/poster/iii.png', alt: 'iii', slug: 'iii', variant: 1 },
  ],
  'youngposse': [
    { src: '/concert2025/image/poster/youngposse.png', alt: 'youngposse', slug: 'youngposse', variant: 1 },
  ],
}

export const postersBySlugNormalized: Record<string, PosterFile[]> = Object.fromEntries(
  Object.entries(POSTERS_BY_SLUG).map(([k, v]) => [k.replace(/[^a-z0-9]/gi, '').toLowerCase(), v])
)

export const postersFlat: PosterFile[] = Object.values(POSTERS_BY_SLUG).flat()

export const firstPosterSrc: string | undefined = postersFlat.length > 0 ? postersFlat[0].src : undefined

export const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export const slugToArtistName: Record<string, string> = Object.fromEntries(
  lineup.map((a) => [normalizeKey(a.slug), a.name])
)

// slug 기반 대표 이미지 선택
export const pickImageBySlug = (slug: string): string | undefined => {
  const arr = POSTERS_BY_SLUG[slug]
  if (!arr || arr.length === 0) return undefined
  const v1 = arr.find(p => p.variant === 1)
  return v1 ? v1.src : arr[0].src
}

export const toKeyFromFilename = (name: string) => {
  const base = name.replace(/\.mp4$/i, '')
  const ascii = base.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ascii || base.toLowerCase()
}

// 비디오 키(파일 베이스명)로 포스터 찾기
export const getPosterForVideoKey = (key: string): string | undefined => {
  const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  const postersBySlug = POSTERS_BY_SLUG
  const list = postersBySlug[key] || postersBySlugNormalized[normKey]
  const pickPreferred = (arr: typeof list) => {
    if (!arr || arr.length === 0) return undefined
    const v1 = arr.find(p => p.variant === 1)
    if (v1) return v1.src
    const withVariant = arr.filter(p => typeof p.variant === 'number').sort((a,b) => (a.variant! - b.variant!))
    if (withVariant.length > 0) return withVariant[0].src
    return arr[0].src
  }
  const chosen = pickPreferred(list)
  if (chosen) return chosen
  // lineup 슬러그로도 매칭 시도
  const lineupMatch = lineup.find(a => a.slug.replace(/[^a-z0-9]/g, '') === normKey)
  if (lineupMatch) {
    const lNorm = lineupMatch.slug.replace(/[^a-z0-9]/g, '')
    const lList = postersBySlug[lineupMatch.slug] || postersBySlugNormalized[lNorm]
    return pickPreferred(lList)
  }
  return undefined
}
