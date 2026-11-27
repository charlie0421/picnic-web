'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { chartHref } from '@/lib/charts/contract';
import { useTranslations } from '@/hooks/useTranslations';

const labels: Record<string, string> = { en: 'KPOP Dashboard', ko: 'KPOP 대시보드', ja: 'KPOP ダッシュボード', 'zh-cn': 'KPOP 数据看板', 'zh-tw': 'KPOP 數據看板', id: 'Dasbor KPOP', es: 'Panel KPOP', bn: 'KPOP ড্যাশবোর্ড', tl: 'KPOP Dashboard', th: 'แดชบอร์ด KPOP', vi: 'Bảng tin KPOP', my: 'KPOP ဒက်ရှ်ဘုတ်' };

// The shared header shows this link on every page, and the vote list is one of them.
// The Replay checks for the vote list accept only what they already know:
// - Tailwind writes a utility into the global CSS file only when a source file uses it, and
//   the build check pins that file. Use utilities that other files already use. Tailwind
//   reads comments too: one word here that is a utility name changes that file.
// - The vote-list contract (scripts/replay-p0/contracts/vote-list.ts) accepts few inline
//   style properties, and lengths only in px. An inline max-width closes the replay.
// The header may give this link less width than its label needs. Then a long label wraps.
// __tests__/components/charts/ChartMenuLink.test.tsx checks both rules.
const linkStyle = { minHeight: 40 };

export default function ChartMenuLink() {
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const { tDynamic } = useTranslations();
  const [hostname, setHostname] = useState<string>();
  useEffect(() => setHostname(window.location.hostname), []);
  return (
    <a href={chartHref(locale, hostname)} aria-current={pathname.endsWith('/charts') ? 'page' : undefined} style={linkStyle}
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-bold text-indigo-800 hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 sm:gap-2 sm:px-3 sm:text-sm">
      <BarChart3 className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      <span>{tDynamic('nav_kpop_dashboard', labels[locale] || labels.en) || labels[locale] || labels.en}</span>
    </a>
  );
}
