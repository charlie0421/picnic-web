'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { chartHref } from '@/lib/charts/contract';
import { useTranslations } from '@/hooks/useTranslations';

const labels: Record<string, string> = { en: 'KPOP Dashboard', ko: 'KPOP 대시보드', ja: 'KPOP ダッシュボード', 'zh-cn': 'KPOP 数据看板', 'zh-tw': 'KPOP 數據看板', id: 'Dasbor KPOP', es: 'Panel KPOP', bn: 'KPOP ড্যাশবোর্ড', tl: 'KPOP Dashboard', th: 'แดชบอร์ด KPOP', vi: 'Bảng tin KPOP', my: 'KPOP ဒက်ရှ်ဘုတ်' };

export default function ChartMenuLink() {
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const { tDynamic } = useTranslations();
  const [hostname, setHostname] = useState<string>();
  useEffect(() => setHostname(window.location.hostname), []);
  return (
    <a href={chartHref(locale, hostname)} aria-current={pathname.endsWith('/charts') ? 'page' : undefined}
      className="inline-flex min-h-10 flex-shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-bold text-indigo-800 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 sm:gap-2 sm:px-3 sm:text-sm">
      <BarChart3 className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      <span className="max-w-[92px] sm:max-w-none">{tDynamic('nav_kpop_dashboard', labels[locale] || labels.en) || labels[locale] || labels.en}</span>
    </a>
  );
}
