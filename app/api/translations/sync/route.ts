import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import OtaClient from "@crowdin/ota-client";
import { type Language, SUPPORTED_LANGUAGES } from "@/config/settings";

// Crowdin 언어 코드 매핑
const crowdinLangMap: Record<Language, string> = {
    ko: "ko",
    en: "en",
    ja: "ja",
    zh: "zh-CN",
    id: "id",
};

export async function POST(request: NextRequest) {
    try {
        // 인증 확인 (예: API 키 또는 관리자 권한)
        const authHeader = request.headers.get("authorization");
        const expectedAuth = process.env.TRANSLATION_SYNC_API_KEY;

        if (!expectedAuth || authHeader !== `Bearer ${expectedAuth}`) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const distributionHash =
            process.env.NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH;

        if (!distributionHash) {
            return NextResponse.json({
                error: "Crowdin distribution hash not configured",
            }, { status: 500 });
        }

        const otaClient = new OtaClient(distributionHash);
        const results: Record<string, any> = {};

        // 각 언어별로 번역 동기화
        for (const lang of SUPPORTED_LANGUAGES) {
            try {
                const crowdinLang = crowdinLangMap[lang] || lang;
                otaClient.setCurrentLocale(crowdinLang);

                const crowdinData = await otaClient.getStringsByLocale(
                    crowdinLang,
                );

                if (crowdinData && Object.keys(crowdinData).length > 0) {
                    // Crowdin 데이터를 JSON 형태로 변환
                    const translations: Record<string, string> = {};
                    Object.values(crowdinData).forEach((item: any) => {
                        if (
                            item.identifier &&
                            (item.translation || item.source_string)
                        ) {
                            translations[item.identifier] = item.translation ||
                                item.source_string;
                        }
                    });

                    // public/locales 디렉토리 확인/생성
                    const localesDir = join(process.cwd(), "public", "locales");
                    try {
                        await mkdir(localesDir, { recursive: true });
                    } catch (err) {
                        // 디렉토리가 이미 존재하는 경우 무시
                    }

                    // JSON 파일로 저장
                    const filePath = join(localesDir, `${lang}.json`);
                    await writeFile(
                        filePath,
                        JSON.stringify(translations, null, 2),
                        "utf-8",
                    );

                    results[lang] = {
                        success: true,
                        keysCount: Object.keys(translations).length,
                        updatedAt: new Date().toISOString(),
                    };
                } else {
                    results[lang] = {
                        success: false,
                        error: "No translations found in Crowdin",
                    };
                }
            } catch (error) {
                results[lang] = {
                    success: false,
                    error: error instanceof Error
                        ? error.message
                        : "Unknown error",
                };
            }
        }

        return NextResponse.json({
            message: "Translation sync completed",
            results,
            syncedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Translation sync error:", error);
        return NextResponse.json({
            error: "Internal server error",
            details: error instanceof Error ? error.message : "Unknown error",
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: "Translation sync endpoint",
        method: "POST",
        description: "Syncs translations from Crowdin to local JSON files",
        requiresAuth: true,
    });
}
