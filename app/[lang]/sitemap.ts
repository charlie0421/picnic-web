import {MetadataRoute} from "next";
import {createClient} from "@/utils/supabase-server-client";
import {SITE_URL, STATIC_PAGES} from "./constants/static-pages";
import { SUPPORTED_LANGUAGES, Language } from '@/config/settings';
import fs from "fs";
import path from "path";
import { getVotes } from '@/lib/data-fetching/vote-service';
import { getRewards } from '@/utils/api/queries';

interface Vote {
    id: number;
    title: any;
    created_at: string;
    updated_at: string;
    status?: string; // 투표 상태 (활성/예정/종료)
}

// 파일 시스템에서 app 디렉토리의 페이지를 자동으로 탐지하는 함수
function detectAppPages(): string[] {
    const appDir = path.join(process.cwd(), "app");
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
            } else if (
                entry.isFile() &&
                (entry.name === "page.tsx" || entry.name === "page.jsx")
            ) {
                // page.tsx 또는 page.jsx 파일이 있으면 해당 경로는 페이지
                if (basePath && !detectedPaths.includes(basePath)) {
                    detectedPaths.push(basePath);
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

// 페이지 우선순위 결정 함수
function getPagePriority(path: string): number {
    if (path === '/' || path === '') {
        return 1.0; // 홈페이지는 최고 우선순위
    }
    
    if (path === '/vote' || path === '/media' || path === '/rewards') {
        return 0.9; // 주요 섹션 페이지들
    }
    
    if (path.startsWith('/vote/') || path.startsWith('/rewards/')) {
        return 0.8; // 동적 컨텐츠 페이지들
    }
    
    if (path.startsWith('/mypage') || path.startsWith('/notice')) {
        return 0.6; // 사용자 관련 페이지들
    }
    
    if (path === '/login' || path === '/faq') {
        return 0.5; // 정보성 페이지들
    }
    
    return 0.7; // 기타 페이지들
}

// 페이지 변경 빈도 결정 함수
function getChangeFrequency(path: string): 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' {
    if (path === '/' || path === '') {
        return 'daily'; // 홈페이지는 자주 변경
    }
    
    if (path === '/vote' || path.startsWith('/vote/')) {
        return 'daily'; // 투표 관련 페이지는 자주 업데이트
    }
    
    if (path === '/media') {
        return 'daily'; // 미디어 페이지도 자주 업데이트
    }
    
    if (path === '/rewards' || path.startsWith('/rewards/')) {
        return 'weekly'; // 리워드 페이지는 주간 업데이트
    }
    
    if (path.startsWith('/notice/')) {
        return 'monthly'; // 공지사항은 월간 업데이트
    }
    
    if (path === '/faq' || path === '/login') {
        return 'yearly'; // 정적 페이지는 거의 변경되지 않음
    }
    
    return 'weekly'; // 기본값
}

/**
 * 사이트맵 생성 함수
 * 
 * Next.js의 메타데이터 API를 활용하여 동적으로 사이트맵을 생성합니다.
 * 정적 페이지와 동적 컨텐츠(투표, 리워드 등)를 모두 포함합니다.
 * 
 * @return {Promise<MetadataRoute.Sitemap>} 사이트맵 객체 배열
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const currentDate = new Date();

    // 1. 정적 페이지 사이트맵 항목 생성 (모든 지원 언어 포함)
    const staticPagesMaps = SUPPORTED_LANGUAGES.flatMap((lang: Language) => 
        STATIC_PAGES.map(page => {
            const path = page === '/' ? '' : page;
            const url = lang === 'ko' 
                ? `${SITE_URL}${path}` 
                : `${SITE_URL}/${lang}${path}`;
            
            return {
                url,
                lastModified: currentDate,
                changeFrequency: getChangeFrequency(page),
                priority: getPagePriority(page),
            };
        })
    );

    // 2. 투표 페이지 사이트맵 항목 생성
    let votesMaps: MetadataRoute.Sitemap = [];
    try {
        const votes = await getVotes('all');
        
        votesMaps = SUPPORTED_LANGUAGES.flatMap((lang: Language) => 
            votes.map(vote => {
                const url = lang === 'ko' 
                    ? `${SITE_URL}/vote/${vote.id}` 
                    : `${SITE_URL}/${lang}/vote/${vote.id}`;
                
                return {
                    url,
                    lastModified: new Date(vote.updated_at || vote.created_at),
                    changeFrequency: getChangeFrequency('/vote/'),
                    priority: getPagePriority('/vote/'),
                };
            })
        );
    } catch (error) {
        console.error('사이트맵 생성 중 투표 데이터 가져오기 실패:', error);
    }

    // 3. 리워드 페이지 사이트맵 항목 생성
    let rewardsMaps: MetadataRoute.Sitemap = [];
    try {
        const rewards = await getRewards();
        
        rewardsMaps = SUPPORTED_LANGUAGES.flatMap((lang: Language) => 
            rewards.map(reward => {
                const url = lang === 'ko' 
                    ? `${SITE_URL}/rewards/${reward.id}` 
                    : `${SITE_URL}/${lang}/rewards/${reward.id}`;
                
                return {
                    url,
                    lastModified: new Date(reward.updated_at || reward.created_at),
                    changeFrequency: getChangeFrequency('/rewards/'),
                    priority: getPagePriority('/rewards/'),
                };
            })
        );
    } catch (error) {
        console.error('사이트맵 생성 중 리워드 데이터 가져오기 실패:', error);
    }

    // 4. 언어 변형이 있는 기본 도메인 추가 (SEO 최적화)
    const rootSitemapEntry: MetadataRoute.Sitemap = [
        {
            url: SITE_URL,
            lastModified: currentDate,
            changeFrequency: 'daily',
            priority: 1.0,
        }
    ];

    // 5. 사이트맵 병합 및 반환 (우선순위 순으로 정렬)
    const allEntries = [
        ...rootSitemapEntry,
        ...staticPagesMaps,
        ...votesMaps,
        ...rewardsMaps,
    ];

    // 우선순위와 URL 기준으로 정렬
    return allEntries.sort((a, b) => {
        // 우선순위 높은 순으로 정렬
        if (b.priority !== a.priority) {
            return (b.priority || 0) - (a.priority || 0);
        }
        // 우선순위가 같으면 URL 알파벳 순으로 정렬
        return a.url.localeCompare(b.url);
    });
}
