'use client';

import { replaySignals } from '@/lib/sentry/replay/signals';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Popup } from '@/types/interfaces';
import PopupBanner from '@/components/client/vote/dialogs/PopupBanner';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';

// 비정상 응답(4xx/5xx·배열이 아닌 JSON)은 오류로 처리해 렌더가 깨지지 않게 한다
const fetcher = async (url: string): Promise<Popup[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load popups: ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) { replaySignals.close(); return []; }
  if (data.some(item => typeof item !== 'object' || item === null || typeof item.id !== 'number')) replaySignals.close();
  if (data.length > 0) replaySignals.close();
  // 잘못된 원소(null·원시값·id 없음)는 버린다
  return data.filter(
    (item): item is Popup =>
      typeof item === 'object' && item !== null && typeof (item as Popup).id === 'number',
  );
};

interface PopupSlide {
  imageUrl: string;
  title: string;
  content: string;
  popupKey: number;
}

export default function PopupBannerLoader() {
  const { data: popups, error } = useSWR<Popup[]>('/api/popups', fetcher);
  const [slides, setSlides] = useState<PopupSlide[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide] = useState(0);

  useEffect(() => {
    if (!Array.isArray(popups) || error) return;
    if (popups.length === 0) { replaySignals.setReady('popup'); return; }

    const now = new Date();
    const filtered = popups.filter((popup) => {
      const hideUntil =
        typeof window !== 'undefined'
          ? localStorage.getItem(`hide_popup_${popup.id}`)
          : null;
      if (hideUntil && new Date(hideUntil) > now) return false;

      const platform = popup.platform || 'all';
      if (!(platform === 'all' || platform === 'web')) return false;

      return true;
    });

    if (filtered.length > 0) replaySignals.close();
    else replaySignals.setReady('popup');
    setSlides(
      filtered.map((popup) => ({
        imageUrl: getCdnImageUrl(getLocalizedString(popup.image)),
        title: getLocalizedString(popup.title),
        content: getLocalizedString(popup.content),
        popupKey: popup.id,
      })),
    );
  }, [popups, error]);

  useEffect(() => {
    if (slides.length > 0) setIsOpen(true);
  }, [slides]);

  if (error) console.error('Failed to load popups', error);

  const handleClose = () => setIsOpen(false);

  const handleCloseFor7Days = () => {
    const slide = slides[currentSlide];
    if (!slide) return;
    const hideUntil = new Date();
    hideUntil.setDate(hideUntil.getDate() + 7);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`hide_popup_${slide.popupKey}`, hideUntil.toISOString());
    }
    setIsOpen(false);
  };

  return (
    <PopupBanner
      isOpen={isOpen}
      onClose={handleClose}
      onCloseFor7Days={handleCloseFor7Days}
      slides={slides}
    />
  );
}
