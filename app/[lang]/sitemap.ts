import {MetadataRoute} from "next";
import {createClient} from "@/utils/supabase-server-client";
import {SITE_URL, STATIC_PAGES} from "./constants/static-pages";
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

/**
 * 사이트맵 생성 함수
 * 
 * Next.js의 메타데이터 API를 활용하여 동적으로 사이트맵을 생성합니다.
 * 정적 페이지와 동적 컨텐츠(투표, 리워드 등)를 모두 포함합니다.
 * 
 * @return {Promise<MetadataRoute.Sitemap>} 사이트맵 객체 배열
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // 다국어 지원을 위한 언어 목록
    const languages = ['ko', 'en'];

    // 1. 정적 페이지 사이트맵 항목 생성
    const staticPagesMaps = languages.flatMap(lang => 
        STATIC_PAGES.map(page => ({
            url: `${SITE_URL}/${lang}${page === '/' ? '' : page}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: page === '/' ? 1.0 : 0.8,
        }))
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

    // 4. 사이트맵 병합 및 반환
    return [
        ...staticPagesMaps,
        ...votesMaps,
        ...rewardsMaps,
    ];
}
