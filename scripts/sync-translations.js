#!/usr/bin/env node

const { writeFile, mkdir } = require('fs/promises');
const { join } = require('path');

// ES modules을 동적으로 import하기 위한 함수
async function importOtaClient() {
  const { default: OtaClient } = await import('@crowdin/ota-client');
  return OtaClient;
}

// 지원하는 언어들
const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh', 'id'];

// Crowdin 언어 코드 매핑
const crowdinLangMap = {
  ko: 'ko',
  en: 'en',
  ja: 'ja',
  zh: 'zh-CN',
  id: 'id',
};

async function syncTranslations() {
  try {
    const distributionHash = process.env.NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH;

    if (!distributionHash) {
      console.error(
        '❌ NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH 환경변수가 설정되지 않았습니다.',
      );
      process.exit(1);
    }

    console.log('🚀 번역 동기화를 시작합니다...');

    const OtaClient = await importOtaClient();
    const otaClient = new OtaClient(distributionHash);

    const results = {};
    let totalUpdated = 0;

    // 각 언어별로 번역 동기화
    for (const lang of SUPPORTED_LANGUAGES) {
      console.log(`📥 ${lang} 언어 번역을 가져오는 중...`);

      try {
        const crowdinLang = crowdinLangMap[lang] || lang;
        otaClient.setCurrentLocale(crowdinLang);

        const crowdinData = await otaClient.getStringsByLocale(crowdinLang);

        if (crowdinData && Object.keys(crowdinData).length > 0) {
          // Crowdin 데이터를 JSON 형태로 변환
          const translations = {};
          Object.values(crowdinData).forEach((item) => {
            if (item.identifier && (item.translation || item.source_string)) {
              translations[item.identifier] =
                item.translation || item.source_string;
            }
          });

          // locales 디렉토리 확인/생성
          const localesDir = join(process.cwd(), 'locales');
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
            'utf-8',
          );

          const keysCount = Object.keys(translations).length;
          results[lang] = {
            success: true,
            keysCount,
            updatedAt: new Date().toISOString(),
          };

          totalUpdated += keysCount;
          console.log(`✅ ${lang}: ${keysCount}개 키 업데이트됨`);
        } else {
          results[lang] = {
            success: false,
            error: 'Crowdin에서 번역을 찾을 수 없습니다',
          };
          console.log(`⚠️  ${lang}: 번역을 찾을 수 없음`);
        }
      } catch (error) {
        results[lang] = {
          success: false,
          error: error.message,
        };
        console.log(`❌ ${lang}: ${error.message}`);
      }
    }

    // 결과 요약 출력
    console.log('\n📊 동기화 결과:');
    console.log(`- 총 업데이트된 키: ${totalUpdated}개`);
    console.log(
      `- 성공한 언어: ${
        Object.values(results).filter((r) => r.success).length
      }개`,
    );
    console.log(
      `- 실패한 언어: ${
        Object.values(results).filter((r) => !r.success).length
      }개`,
    );
    console.log(`- 완료 시간: ${new Date().toLocaleString('ko-KR')}`);

    // 결과를 JSON 파일로 저장 (선택사항)
    if (process.env.SAVE_SYNC_RESULTS === 'true') {
      const resultPath = join(
        process.cwd(),
        'scripts',
        'last-sync-result.json',
      );
      await writeFile(
        resultPath,
        JSON.stringify(
          {
            syncedAt: new Date().toISOString(),
            results,
            totalUpdated,
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`📄 결과가 ${resultPath}에 저장되었습니다`);
    }

    console.log('\n🎉 번역 동기화가 완료되었습니다!');
  } catch (error) {
    console.error('❌ 번역 동기화 중 오류 발생:', error);
    process.exit(1);
  }
}

// CLI에서 직접 실행된 경우
if (require.main === module) {
  syncTranslations();
}

module.exports = { syncTranslations };
