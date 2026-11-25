import { Suspense } from 'react';
import { getTranslations } from '@/lib/i18n/server';
import type { Language } from '@/config/settings';
import { chartCopyKeys, type ChartCopy } from '@/lib/charts/copy';
import { fandomCopyKeys, type FandomCopy } from '@/lib/charts/fandom-copy';
import FandomExplorer from '@/components/charts/FandomExplorer';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ lang: string }> };
export async function generateMetadata({ params }: Props) {
    const { lang } = await params;
    const t = await getTranslations(lang as Language);
    return {
        title: t('kpop_fandom.explore'),
        alternates: { canonical: `https://chart.picnic.fan/${lang}/charts/artists` },
    };
}
export default async function ArtistReportsPage({ params }: Props) {
    const { lang } = await params;
    const t = await getTranslations(lang as Language);
    const copy = Object.fromEntries(
        fandomCopyKeys.map((key) => [key, t(`kpop_fandom.${key}`)]),
    ) as FandomCopy;
    const chart = Object.fromEntries(
        chartCopyKeys.map((key) => [key, t(`kpop_dashboard.${key}`)]),
    ) as ChartCopy;
    return (
        <Suspense fallback={<p>{chart.loading}</p>}>
            <FandomExplorer
                locale={lang}
                copy={copy}
                chart={chart}
                preview={process.env.KPOP_CHART_PREVIEW_DATA === 'synthetic'}
            />
        </Suspense>
    );
}
