import { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import { SITE_URL, STATIC_PAGES } from "./constants/static-pages";
import { SUPPORTED_LANGUAGES } from '@/config/settings';
import { getVotes } from '@/lib/data-fetching/server/vote-service';
import { getRewards } from '@/utils/api/queries';
import { getCommunityFeed } from '@/lib/data-fetching/server/community-service';
import { getNotices } from '@/lib/data-fetching/server/notice-service';

interface Vote {
    id: number;
    title: any;
    created_at: string;
    updated_at: string;
    status?: string; // 투표 상태 (활성/예정/종료)
}

const ADMIN_ONLY_SEGMENTS = new Set(['goong-hap']);
const SYSTEM_ONLY_SEGMENTS = new Set(['debug-env', 'test-redirect', 'open-in-browser']);
const PRIVATE_ONLY_SEGMENTS = new Set(['login', 'mypage']);
const HIDDEN_EXACT_PATHS = new Set(['/login', '/mypage', '/streaming-example']);

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

const ROUTE_PRIORITY: Record<string, number> = {
    '/': 1,
    '/vote': 0.9,
    '/rewards': 0.85,
    '/media': 0.8,
    '/community': 0.85,
    '/concert2025': 0.8,
    '/star-candy': 0.75,
    '/faq': 0.7,
    '/notice': 0.7,
    '/download': 0.75,
    '/terms': 0.6,
    '/privacy': 0.6,
};

const ROUTE_FREQUENCY: Record<string, ChangeFreq> = {
    '/': 'weekly',
    '/vote': 'daily',
    '/rewards': 'weekly',
    '/media': 'weekly',
    '/community': 'daily',
    '/concert2025': 'weekly',
    '/star-candy': 'weekly',
    '/faq': 'monthly',
    '/notice': 'weekly',
    '/download': 'monthly',
    '/terms': 'yearly',
    '/privacy': 'yearly',
};

function shouldSkipRoute(route: string): boolean {
    if (!route) return true;
    if (HIDDEN_EXACT_PATHS.has(route)) {
        return true;
    }
    const [first] = route.split('/').filter(Boolean);
    if (!first) return false;
    return (
        ADMIN_ONLY_SEGMENTS.has(first) ||
        SYSTEM_ONLY_SEGMENTS.has(first) ||
        PRIVATE_ONLY_SEGMENTS.has(first)
    );
}

function normalizeDetectedPath(raw: string): string | null {
    if (!raw.startsWith('[lang]')) {
        return null;
    }
    const segments = raw.split('/').slice(1);
    const filtered = segments.filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
    if (filtered.length === 0) {
        return '/';
    }
    const hasDynamicSegment = filtered.some((segment) => segment.includes('['));
    if (hasDynamicSegment) {
        return null;
    }
    const route = `/${filtered[0]}`;
    const normalizedRoute = route === '//' ? '/' : route;
    return shouldSkipRoute(normalizedRoute) ? null : normalizedRoute;
}

// 파일 시스템에서 app/[lang] 디렉토리의 페이지를 자동으로 탐지하는 함수
function detectAppPages(): string[] {
    const appDir = path.join(process.cwd(), "app", "[lang]");
    const detectedPaths: string[] = [];

    // 재귀적으로 디렉토리 탐색
    function scanDir(dir: string, basePath: string = "") {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            // 특수 디렉토리 스킵
            if (
                entry.name.startsWith("_") || entry.name.startsWith(".") ||
                entry.name === "api" || entry.name === "components" ||
                entry.name === "hooks" || entry.name === "utils" ||
                entry.name === "constants" || entry.name === "types" ||
                entry.name === "styles"
            ) {
                continue;
            }

            const entryPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // 라우트 그룹 처리 ((main), (auth) 등)
                if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
                    scanDir(entryPath, basePath);
                } else {
                    const newBasePath = basePath
                        ? `${basePath}/${entry.name}`
                        : entry.name;
                    scanDir(entryPath, newBasePath);
                }
            } else if (entry.isFile() &&
                (entry.name === "page.tsx" || entry.name === "page.jsx")) {
                // page.tsx 또는 page.jsx 파일이 있으면 해당 경로는 페이지
                const routeKey = basePath || '/';
                if (!detectedPaths.includes(routeKey)) {
                    detectedPaths.push(routeKey);
                }
            }
        }
    }

    try {
        scanDir(appDir);
        return detectedPaths;
    } catch (error) {
        console.error("페이지 탐지 중 오류:", error);
        return [];
    }
}

export async function buildSitemapEntries(
    languages: readonly string[] = SUPPORTED_LANGUAGES,
): Promise<MetadataRoute.Sitemap> {

    const detectedRoutes = detectAppPages()
        .map(normalizeDetectedPath)
        .filter((value): value is string => Boolean(value))
        .filter((route) => !shouldSkipRoute(route));

    const combinedRoutes = Array.from(
        new Set([...STATIC_PAGES, ...detectedRoutes].filter(Boolean)),
    );

    // 1. 정적 페이지 사이트맵 항목 생성
    const staticPagesMaps = languages.flatMap(lang =>
        combinedRoutes.map((page) => {
            const normalizedPath = page === '/' ? '' : page;
            const url = `${SITE_URL}/${lang}${normalizedPath}`;
            return {
                url,
                lastModified: new Date(),
                changeFrequency: ROUTE_FREQUENCY[page] ?? 'weekly',
                priority: ROUTE_PRIORITY[page] ?? 0.75,
            };
        }),
    );

    // 2. 투표 페이지 사이트맵 항목 생성
    let votesMaps: MetadataRoute.Sitemap = [];
    try {
        const votes = await getVotes('all');
        
        votesMaps = languages.flatMap(lang => 
            votes.map(vote => ({
                url: `${SITE_URL}/${lang}/vote/${vote.id}`,
                lastModified: new Date(vote.updated_at || vote.created_at),
                changeFrequency: 'daily' as const,
                priority: 0.9,
            }))
        );
    } catch (error) {
        console.error('사이트맵 생성 중 투표 데이터 가져오기 실패:', error);
    }

    // 3. 리워드 페이지 사이트맵 항목 생성
    let rewardsMaps: MetadataRoute.Sitemap = [];
    try {
        const rewards = await getRewards();
        
        rewardsMaps = languages.flatMap(lang => 
            rewards.map(reward => ({
                url: `${SITE_URL}/${lang}/rewards/${reward.id}`,
                lastModified: new Date(reward.updated_at || reward.created_at),
                changeFrequency: 'weekly' as const,
                priority: 0.8,
            }))
        );
    } catch (error) {
        console.error('사이트맵 생성 중 리워드 데이터 가져오기 실패:', error);
    }

    // 4. 커뮤니티 게시글 페이지 사이트맵 항목 생성
    let communityMaps: MetadataRoute.Sitemap = [];
    try {
        const communityFeed = await getCommunityFeed({ page: 1, limit: 30 });
        const posts = communityFeed?.posts ?? [];

        communityMaps = languages.flatMap(lang =>
            posts.map(post => ({
                url: `${SITE_URL}/${lang}/community/${post.id}`,
                lastModified: new Date((post as any).updatedAt ?? post.createdAt ?? Date.now()),
                changeFrequency: 'weekly' as const,
                priority: 0.7,
            })),
        );
    } catch (error) {
        console.error('사이트맵 생성 중 커뮤니티 데이터 가져오기 실패:', error);
    }

    // 5. 공지 상세 페이지 사이트맵 항목 생성
    let noticeMaps: MetadataRoute.Sitemap = [];
    try {
        const notices = await getNotices();
        const publishedNotices = (notices ?? []).filter(
            (notice) => typeof notice.id === 'number' && notice.id > 0,
        );

        noticeMaps = languages.flatMap(lang =>
            publishedNotices.map(notice => ({
                url: `${SITE_URL}/${lang}/notice/${notice.id}`,
                lastModified: new Date(notice.created_at ?? Date.now()),
                changeFrequency: 'weekly' as const,
                priority: 0.65,
            })),
        );
    } catch (error) {
        console.error('사이트맵 생성 중 공지 데이터 가져오기 실패:', error);
    }

    // 사이트맵 병합 및 반환
    return [
        ...staticPagesMaps,
        ...votesMaps,
        ...rewardsMaps,
        ...communityMaps,
        ...noticeMaps,
    ];
}

/**
 * 사이트맵 생성 함수
 * 기본적으로 모든 언어 데이터를 반환하며, 루트 sitemap과 공유됩니다.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    return buildSitemapEntries();
}
