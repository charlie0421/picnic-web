import Image from 'next/image'

interface Concert2025GuideProps {
  t: (key: string) => string
  mapImagePublicRelative: string
}

export default function Concert2025Guide({ t, mapImagePublicRelative }: Concert2025GuideProps) {
  return (
    <section className="mt-10" lang="ko" style={{ contentVisibility: 'auto' }}>
      <h2 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-primary-700 to-point-600 bg-clip-text text-transparent">{t('concert2025.guide.title')}</h2>
      <div className="rounded-xl border border-primary/20 bg-white/80 backdrop-blur p-5 shadow-sm">
        <div className="text-sm md:text-base text-gray-800 space-y-6">
          <p>{t('concert2025.guide.intro')}</p>

          <div>
            <h3 className="font-semibold text-gray-900">{t('concert2025.seating.title')}</h3>
            {/* 좌석 안내 이미지 */}
            <div className="mt-3 space-y-4">
              <figure className="relative rounded-lg overflow-hidden border bg-white">
                <div className="relative w-full aspect-[16/9] md:aspect-[21/9] bg-white">
                  <Image
                    src="/concert2025/image/seating-guide.png?v=1"
                    alt={t('concert2025.seating.alt')}
                    fill
                    sizes="100vw"
                    className="object-contain"
                  />
                </div>
                <figcaption className="px-2 py-1 text-center text-xs text-gray-600">{t('concert2025.seating.caption')}</figcaption>
              </figure>
            </div>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{t('concert2025.seating.b1')}</li>
              <li>{t('concert2025.seating.b2')}</li>
              <li>{t('concert2025.seating.b3')}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900">{t('concert2025.booking.title')}</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{t('concert2025.booking.b1')}</li>
              <li>{t('concert2025.booking.b2')}</li>
              <li>{t('concert2025.booking.b3')}</li>
              <li>{t('concert2025.booking.b4')}</li>
              <li>{t('concert2025.booking.b5')}</li>
              <li>{t('concert2025.booking.b6')}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900">{t('concert2025.pickup.title')}</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{t('concert2025.pickup.b1')}</li>
              <li>{t('concert2025.pickup.b2')}</li>
              <li>{t('concert2025.pickup.b3')}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900">{t('concert2025.entry.title')}</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{t('concert2025.entry.b1')}</li>
              <li>{t('concert2025.entry.b2')}</li>
              <li>{t('concert2025.entry.b3')}</li>
              <li>{t('concert2025.entry.b4')}</li>
              <li>{t('concert2025.entry.b5')}</li>
              <li>{t('concert2025.entry.b6')}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900">{t('concert2025.policy.title')}</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{t('concert2025.policy.b1')}</li>
              <li>{t('concert2025.policy.b2')}</li>
              <li>{t('concert2025.policy.b3')}</li>
              <li>{t('concert2025.policy.b4')}</li>
              <li>{t('concert2025.policy.b5')}</li>
              <li>{t('concert2025.policy.b6')}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900">{t('concert2025.storage.title')}</h3>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{t('concert2025.storage.b1')}</li>
              <li>{t('concert2025.storage.b2')}</li>
              <li>{t('concert2025.storage.b3')}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900">{t('concert2025.transit.title')}</h3>
            <div className="mt-3 relative w-full overflow-hidden rounded-lg border">
              <div className="relative w-full aspect-video bg-white">
                <Image
                  src={`/${mapImagePublicRelative}?v=1`}
                  alt={t('concert2025.transit.mapAlt')}
                  fill
                  sizes="100vw"
                  className="object-contain"
                />
              </div>
            </div>
            <p className="mt-2">{t('concert2025.transit.address')}</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>{t('concert2025.transit.traffic1')}</li>
              <li>{t('concert2025.transit.traffic2')}</li>
            </ul>
            <div className="mt-3 space-y-1">
              <p className="font-medium">{t('concert2025.transit.publicTransitTitle')}</p>
              <p className="text-gray-700">{t('concert2025.transit.subway')}</p>
              <p className="text-gray-700">{t('concert2025.transit.bus')}</p>
            </div>
            <div className="mt-3">
              <p className="font-medium">{t('concert2025.transit.parkingTitle')}</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>{t('concert2025.transit.parking1')}</li>
                <li>{t('concert2025.transit.parking2')}</li>
                <li>{t('concert2025.transit.parking3')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
