'use client';

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
  return Array.isArray(data) ? (data as Popup[]) : [];
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
    if (!Array.isArray(popups) || popups.length === 0) return;

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

    setSlides(
      filtered.map((popup) => ({
        imageUrl: getCdnImageUrl(getLocalizedString(popup.image)),
        title: getLocalizedString(popup.title),
        content: getLocalizedString(popup.content),
        popupKey: popup.id,
      })),
    );
  }, [popups]);

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
