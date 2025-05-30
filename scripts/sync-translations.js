#!/usr/bin/env node

// .env.local 파일 로드
require('dotenv').config({ path: '.env.local' });

const { writeFile, mkdir, readFile, readdir } = require('fs/promises');
const { join } = require('path');
const { existsSync } = require('fs');
const glob = require('glob');

// ES modules을 동적으로 import하기 위한 함수
async function importOtaClient() {
  try {
    const module = await import('@crowdin/ota-client');
    // 중첩된 default 구조를 처리
    const OtaClient = module.default.default || module.default.OtaClient || module.default;
    return OtaClient;
  } catch (error) {
    console.error('OTA Client import 실패:', error);
    throw error;
  }
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

// 코드에서 사용되는 번역 키를 추출하는 함수
async function extractUsedTranslationKeys() {
  const usedKeys = new Set();
  const dynamicPatterns = new Set(); // 동적 패턴 저장
  
  // 모든 TypeScript, TSX, JavaScript, JSX 파일 검색
  const filePatterns = [
    'app/**/*.{ts,tsx,js,jsx}',
    'components/**/*.{ts,tsx,js,jsx}',
    'pages/**/*.{ts,tsx,js,jsx}',
    'src/**/*.{ts,tsx,js,jsx}',
    'lib/**/*.{ts,tsx,js,jsx}',
    'utils/**/*.{ts,tsx,js,jsx}',
  ];

  console.log('🔍 번역 키 추출 중...');

  for (const pattern of filePatterns) {
    const files = glob.sync(pattern, { cwd: process.cwd() });
    
    for (const file of files) {
      try {
        const content = await readFile(join(process.cwd(), file), 'utf-8');
        
        // 1. 기본 정적 번역 키 패턴
        const staticPatterns = [
          /\bt\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_\.]*?)['\"`]\s*\)/g, // t('static_key')
          /\bt\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_\.]*?)['\"`]\s*,/g, // t('key', params)
          /getText\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_\.]*?)['\"`]\s*\)/g, // getText('key')
          /\$t\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_\.]*?)['\"`]\s*\)/g, // $t('key')
        ];

        for (const regex of staticPatterns) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            const key = match[1];
            if (key && /^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(key)) {
              usedKeys.add(key);
            }
          }
        }

        // 2. 동적 키 패턴 감지 (템플릿 리터럴)
        const dynamicPatterns = [
          /\bt\(\s*`([^`]*\$\{[^}]+\}[^`]*)`\s*\)/g, // t(`prefix_${variable}`)
          /\bt\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_]*?)_\$\{[^}]+\}['\"`]\s*\)/g, // t('prefix_${var}')
        ];

        for (const regex of dynamicPatterns) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            const template = match[1];
            // 동적 패턴을 기록하되, 가능한 키들을 추론
            if (template.includes('label_vote_')) {
              // vote 카테고리 관련 키들 추가
              ['label_vote_kpop', 'label_vote_musical', 'label_vote_general'].forEach(key => usedKeys.add(key));
            }
            if (template.includes('compatibility_gender_')) {
              // 성별 호환성 키들 추가
              ['compatibility_gender_male', 'compatibility_gender_female', 'compatibility_gender_all'].forEach(key => usedKeys.add(key));
            }
          }
        }

        // 3. 중첩된 점 표기법 키 (dialog.login_required.title)
        const nestedPatterns = [
          /\bt\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_\.]*?)['\"`]\s*\)/g,
        ];

        for (const regex of nestedPatterns) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            const key = match[1];
            if (key && /^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(key)) {
              usedKeys.add(key);
            }
          }
        }

        // 4. 특정 파일에서 자주 사용되는 패턴들 감지
        if (content.includes('useLanguageStore')) {
          // aria-label에서 사용되는 키들
          const ariaLabelPattern = /aria-label=\{t\(['\"`]([^'"`]+)['\"`]\)/g;
          let match;
          while ((match = ariaLabelPattern.exec(content)) !== null) {
            const key = match[1];
            if (key && /^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(key)) {
              usedKeys.add(key);
            }
          }

          // 상태 텍스트 함수에서 사용되는 키들
          if (content.includes('getStatusText')) {
            ['status_upcoming', 'status_ongoing', 'status_completed', 'status_scheduled', 'status_ended'].forEach(key => usedKeys.add(key));
          }
        }

      } catch (error) {
        console.warn(`⚠️  파일 읽기 실패: ${file}`, error.message);
      }
    }
  }

  console.log(`📝 추출된 번역 키: ${usedKeys.size}개`);
  return Array.from(usedKeys).sort();
}

// 현재 번역 파일에서 키를 추출하는 함수
async function extractExistingKeys() {
  const existingKeys = {};
  
  for (const lang of SUPPORTED_LANGUAGES) {
    const filePath = join(process.cwd(), 'public', 'locales', `${lang}.json`);
    
    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const translations = JSON.parse(content);
        existingKeys[lang] = Object.keys(translations).sort();
      } catch (error) {
        console.warn(`⚠️  번역 파일 읽기 실패: ${lang}.json`, error.message);
        existingKeys[lang] = [];
      }
    } else {
      existingKeys[lang] = [];
    }
  }

  return existingKeys;
}

// 키 분석 리포트를 생성하는 함수
async function generateKeyAnalysisReport(usedKeys, existingKeys, crowdinKeys) {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {},
    details: {
      missingKeys: [],
      unusedKeys: {},
      newKeysToAdd: [],
      keysInCrowdinNotLocal: [],
      existingKeysInCode: []
    }
  };

  // 모든 언어의 기존 키 통합 (중복 제거)
  const allExistingKeys = new Set();
  Object.values(existingKeys).forEach(keys => {
    keys.forEach(key => allExistingKeys.add(key));
  });

  // 모든 언어의 Crowdin 키 통합 (중복 제거)
  const allCrowdinKeys = new Set();
  Object.values(crowdinKeys).forEach(keys => {
    keys.forEach(key => allCrowdinKeys.add(key));
  });

  console.log(`📚 기존 번역 파일 키: ${allExistingKeys.size}개`);
  console.log(`☁️  Crowdin 키: ${allCrowdinKeys.size}개`);

  // 코드에서 사용되면서 기존 파일에도 있는 키들
  const existingKeysInCode = usedKeys.filter(key => allExistingKeys.has(key));
  report.details.existingKeysInCode = existingKeysInCode;

  // 코드에서 사용되지만 기존 파일에 없는 키들 (실제 누락)
  const trulyMissingKeys = usedKeys.filter(key => !allExistingKeys.has(key));
  report.details.missingKeys = trulyMissingKeys;

  // 새로 추가해야 할 키들 (Crowdin에도 없는 키들)
  const newKeysToAdd = trulyMissingKeys.filter(key => !allCrowdinKeys.has(key));
  report.details.newKeysToAdd = newKeysToAdd;

  // Crowdin에는 있지만 로컬에는 없는 키들
  const keysInCrowdinNotLocal = Array.from(allCrowdinKeys).filter(key => !allExistingKeys.has(key));
  report.details.keysInCrowdinNotLocal = keysInCrowdinNotLocal;

  // 각 언어별로 사용되지 않는 키 계산
  for (const lang of SUPPORTED_LANGUAGES) {
    const existing = existingKeys[lang] || [];
    const unusedInCode = existing.filter(key => !usedKeys.includes(key));
    report.details.unusedKeys[lang] = unusedInCode;
  }

  // 요약 정보
  report.summary = {
    totalUsedKeys: usedKeys.length,
    totalExistingKeys: Math.round(Object.values(existingKeys).reduce((sum, keys) => sum + keys.length, 0) / SUPPORTED_LANGUAGES.length),
    totalCrowdinKeys: allCrowdinKeys.size,
    existingKeysInCodeCount: existingKeysInCode.length,
    missingKeysCount: trulyMissingKeys.length,
    newKeysToAddCount: newKeysToAdd.length,
    keysInCrowdinNotLocalCount: keysInCrowdinNotLocal.length,
    unusedKeysCount: Object.values(report.details.unusedKeys).reduce((sum, keys) => sum + keys.length, 0)
  };

  console.log(`✅ 코드에서 사용되고 번역 파일에도 있는 키: ${existingKeysInCode.length}개`);
  console.log(`❌ 코드에서 사용되지만 번역 파일에 없는 키: ${trulyMissingKeys.length}개`);
  console.log(`📋 Crowdin에는 있지만 로컬에 없는 키: ${keysInCrowdinNotLocal.length}개`);

  return report;
}

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
    console.log('🔍 코드에서 사용되는 번역 키를 분석 중...');

    // 코드에서 사용되는 번역 키 추출
    const usedKeys = await extractUsedTranslationKeys();
    console.log(`📝 코드에서 발견된 번역 키: ${usedKeys.length}개`);

    // 현재 번역 파일의 키 추출
    const existingKeys = await extractExistingKeys();

    const OtaClient = await importOtaClient();
    const otaClient = new OtaClient(distributionHash);

    const results = {};
    const crowdinKeys = {};
    let totalUpdated = 0;

    // public/locales 디렉토리 확인/생성
    const publicLocalesDir = join(process.cwd(), 'public', 'locales');
    try {
      await mkdir(publicLocalesDir, { recursive: true });
      console.log('📁 public/locales 디렉토리 생성/확인됨');
    } catch (err) {
      // 디렉토리가 이미 존재하는 경우 무시
    }

    // 각 언어별로 번역 동기화
    for (const lang of SUPPORTED_LANGUAGES) {
      console.log(`📥 ${lang} 언어 번역을 가져오는 중...`);

      try {
        const crowdinLang = crowdinLangMap[lang] || lang;
        otaClient.setCurrentLocale(crowdinLang);

        const crowdinData = await otaClient.getStringsByLocale(crowdinLang);
        const filePath = join(publicLocalesDir, `${lang}.json`);

        if (crowdinData && Object.keys(crowdinData).length > 0) {
          // Crowdin 데이터를 JSON 형태로 변환
          const translations = {};
          Object.values(crowdinData).forEach((item) => {
            if (item.identifier && (item.translation || item.source_string)) {
              translations[item.identifier] =
                item.translation || item.source_string;
            }
          });

          // Crowdin 키 저장 (분석용)
          crowdinKeys[lang] = Object.keys(translations).sort();

          // JSON 파일을 public/locales에 저장
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
          console.log(`✅ ${lang}: ${keysCount}개 키 업데이트됨 (public/locales/${lang}.json)`);
        } else {
          results[lang] = {
            success: false,
            error: 'Crowdin에서 번역을 찾을 수 없습니다',
          };
          crowdinKeys[lang] = [];
          console.log(`⚠️  ${lang}: 번역을 찾을 수 없음`);
        }
      } catch (error) {
        results[lang] = {
          success: false,
          error: error.message,
        };
        crowdinKeys[lang] = [];
        console.log(`❌ ${lang}: ${error.message}`);
      }
    }

    // 키 분석 리포트 생성
    console.log('\n🔬 번역 키 분석 중...');
    const analysisReport = await generateKeyAnalysisReport(usedKeys, existingKeys, crowdinKeys);

    // 결과 요약 출력
    console.log('\n📊 동기화 결과:');
    console.log(`- 총 업데이트된 키: ${totalUpdated}개`);
    console.log(`- 코드에서 사용되는 키: ${analysisReport.summary.totalUsedKeys}개`);
    console.log(`- 기존 번역 파일 키: ${analysisReport.summary.totalExistingKeys}개`);
    console.log(`- Crowdin 키: ${analysisReport.summary.totalCrowdinKeys}개`);
    console.log(`- ✅ 정상 연결된 키: ${analysisReport.summary.existingKeysInCodeCount}개`);
    console.log(`- ❌ 실제 누락된 키: ${analysisReport.summary.missingKeysCount}개`);
    console.log(`- 📋 새로 추가 필요한 키: ${analysisReport.summary.newKeysToAddCount}개`);
    console.log(`- 📥 Crowdin에만 있는 키: ${analysisReport.summary.keysInCrowdinNotLocalCount}개`);
    console.log(`- 🗑️  사용되지 않는 키: ${analysisReport.summary.unusedKeysCount}개`);
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
    console.log(`- 저장 위치: public/locales/`);
    console.log(`- 완료 시간: ${new Date().toLocaleString('ko-KR')}`);

    // 분석 리포트 저장
    const scriptsDir = join(process.cwd(), 'scripts');
    try {
      await mkdir(scriptsDir, { recursive: true });
    } catch (err) {
      // 디렉토리가 이미 존재하는 경우 무시
    }

    const reportPath = join(scriptsDir, 'translation-analysis-report.json');
    await writeFile(
      reportPath,
      JSON.stringify(analysisReport, null, 2),
      'utf-8',
    );
    console.log(`📄 번역 키 분석 리포트가 ${reportPath}에 저장되었습니다`);

    // 누락된 키들을 위한 템플릿 파일 생성
    if (analysisReport.details.newKeysToAdd.length > 0) {
      const missingKeysTemplate = {
        note: "이 키들을 Crowdin에 추가해야 합니다",
        generatedAt: new Date().toISOString(),
        missingKeys: {}
      };

      // 키 이름을 분석하여 적절한 기본 번역 생성
      const generateTranslations = (key) => {
        // 기본 번역 매핑
        const keyTranslations = {
          // 버튼 관련
          'button_go_to_home': {
            ko: '홈으로 가기',
            en: 'Go to Home',
            ja: 'ホームに戻る',
            zh: '回到首页',
            id: 'Kembali ke Beranda'
          },
          'label_login': {
            ko: '로그인',
            en: 'Login',
            ja: 'ログイン',
            zh: '登录',
            id: 'Masuk'
          },
          'label_already_logged_in': {
            ko: '이미 로그인됨',
            en: 'Already logged in',
            ja: '既にログイン済み',
            zh: '已登录',
            id: 'Sudah masuk'
          },
          'message_already_logged_in': {
            ko: '이미 로그인되어 있습니다',
            en: 'You are already logged in',
            ja: '既にログインしています',
            zh: '您已经登录',
            id: 'Anda sudah masuk'
          },
          
          // 소셜 로그인
          'label_login_with_apple': {
            ko: 'Apple로 로그인',
            en: 'Login with Apple',
            ja: 'Appleでログイン',
            zh: '使用Apple登录',
            id: 'Masuk dengan Apple'
          },
          'label_login_with_google': {
            ko: 'Google로 로그인',
            en: 'Login with Google',
            ja: 'Googleでログイン',
            zh: '使用Google登录',
            id: 'Masuk dengan Google'
          },
          'label_login_with_kakao': {
            ko: 'Kakao로 로그인',
            en: 'Login with Kakao',
            ja: 'Kakaoでログイン',
            zh: '使用Kakao登录',
            id: 'Masuk dengan Kakao'
          },
          'label_login_with_wechat': {
            ko: 'WeChat으로 로그인',
            en: 'Login with WeChat',
            ja: 'WeChatでログイン',
            zh: '使用微信登录',
            id: 'Masuk dengan WeChat'
          },
          
          // 투표 관련
          'text_vote_no_items': {
            ko: '투표 항목이 없습니다',
            en: 'No vote items',
            ja: '投票項目がありません',
            zh: '没有投票项目',
            id: 'Tidak ada item voting'
          },
          'text_vote_processing': {
            ko: '투표 집계 중입니다',
            en: 'Vote processing',
            ja: '投票集計中です',
            zh: '投票处理中',
            id: 'Pemrosesan voting'
          },
          'label_area_filter_all': {
            ko: '전체',
            en: 'ALL',
            ja: '全体',
            zh: '全部',
            id: 'SEMUA'
          },
          'label_area_filter_kpop': {
            ko: 'K-POP',
            en: 'K-POP',
            ja: 'K-POP',
            zh: 'K-POP',
            id: 'K-POP'
          },
          'label_area_filter_musical': {
            ko: '뮤지컬',
            en: 'K-MUSICAL',
            ja: 'ミュージカル',
            zh: '音乐剧',
            id: 'MUSIKAL'
          },
          
          // 다이얼로그 - 로그인 필요
          'dialog.login_required.title': {
            ko: '로그인이 필요합니다',
            en: 'Login Required',
            ja: 'ログインが必要です',
            zh: '需要登录',
            id: 'Perlu Masuk'
          },
          'dialog.login_required.description': {
            ko: '이 기능을 사용하려면 로그인이 필요합니다. 로그인하시겠습니까?',
            en: 'You need to login to use this feature. Would you like to login?',
            ja: 'この機能を使用するにはログインが必要です。ログインしますか？',
            zh: '使用此功能需要登录。您要登录吗？',
            id: 'Anda perlu masuk untuk menggunakan fitur ini. Apakah Anda ingin masuk?'
          },
          'dialog.login_required.login_button': {
            ko: '로그인',
            en: 'Login',
            ja: 'ログイン',
            zh: '登录',
            id: 'Masuk'
          },
          'dialog.login_required.cancel_button': {
            ko: '취소',
            en: 'Cancel',
            ja: 'キャンセル',
            zh: '取消',
            id: 'Batal'
          },
          
          // 다이얼로그 - 확인
          'dialog.confirm.confirm_button': {
            ko: '확인',
            en: 'Confirm',
            ja: '確認',
            zh: '确认',
            id: 'Konfirmasi'
          },
          'dialog.confirm.cancel_button': {
            ko: '취소',
            en: 'Cancel',
            ja: 'キャンセル',
            zh: '취소',
            id: 'Batal'
          },
          'dialog.confirm.loading': {
            ko: '처리 중...',
            en: 'Loading...',
            ja: '処理中...',
            zh: '处理中...',
            id: 'Memproses...'
          },
          
          // 다이얼로그 - 액션
          'dialog.action.confirm_button': {
            ko: '확인',
            en: 'Confirm',
            ja: '確認',
            zh: '확인',
            id: 'Konfirmasi'
          },
          'dialog.action.cancel_button': {
            ko: '취소',
            en: 'Cancel',
            ja: 'キャンセル',
            zh: '취소',
            id: 'Batal'
          },
          'dialog.action.loading': {
            ko: '처리 중...',
            en: 'Loading...',
            ja: '処理中...',
            zh: '处理中...',
            id: 'Memproses...'
          },
          
          // 다이얼로그 - 알림
          'dialog.alert.confirm_button': {
            ko: '확인',
            en: 'OK',
            ja: 'OK',
            zh: '确认',
            id: 'OK'
          },
          
          // 투표 버튼
          'vote.button.vote': {
            ko: '투표하기',
            en: 'Vote',
            ja: '投票する',
            zh: '투표',
            id: 'Vote'
          },
          'vote.button.voting': {
            ko: '투표 중...',
            en: 'Voting...',
            ja: '투票中...',
            zh: '投票中...',
            id: 'Voting...'
          },
          'vote.button.completed': {
            ko: '투표 완료',
            en: 'Vote Completed',
            ja: '投票完了',
            zh: '投票完成',
            id: 'Vote Selesai'
          },
          'vote.button.login_to_vote': {
            ko: '로그인 후 투표하기',
            en: 'Login to Vote',
            ja: 'ログインして投票',
            zh: '登录后投票',
            id: 'Masuk untuk Vote'
          },
          
          // 투표 로그인 필요
          'vote.login_required.title': {
            ko: '투표하려면 로그인이 필요합니다',
            en: 'Login required to vote',
            ja: '投票にはログインが必要です',
            zh: '投票需要登录',
            id: 'Perlu masuk untuk vote'
          },
          'vote.login_required.description': {
            ko: '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
            en: 'You need to login to participate in this vote. Would you like to login?',
            ja: 'この投票に参加するにはログインが필要です。ログインしますか？',
            zh: '参与此投票需要登录。您要登录吗？',
            id: 'Anda perlu masuk untuk berpartisipasi dalam voting ini. Apakah Anda ingin masuk?'
          },
          'vote.login_required.description_with_artist': {
            ko: '{artistName}에게 투표하려면 로그인이 필요합니다. 로그인하시겠습니까?',
            en: 'You need to login to vote for {artistName}. Would you like to login?',
            ja: '{artistName}に投票するにはログインが必要です。ログインしますか？',
            zh: '为{artistName}投票需要登录。您要登录吗？',
            id: 'Anda perlu masuk untuk vote {artistName}. Apakah Anda ingin masuk?'
          },
          
          // 투표 에러
          'vote.error.general': {
            ko: '투표 중 오류가 발생했습니다.',
            en: 'An error occurred while voting.',
            ja: '投票中にエラーが発生しました。',
            zh: '投票时发生错误。',
            id: 'Terjadi error saat voting.'
          }
        };
        
        // 특정 키에 대한 번역이 있으면 사용, 없으면 기본 템플릿 사용
        if (keyTranslations[key]) {
          return keyTranslations[key];
        }
        
        // 기본 템플릿
        return {
          ko: `[번역 필요] ${key}`,
          en: `[Translation needed] ${key}`,
          ja: `[翻訳が必要] ${key}`,
          zh: `[需要翻译] ${key}`,
          id: `[Perlu diterjemahkan] ${key}`
        };
      };

      analysisReport.details.newKeysToAdd.forEach(key => {
        missingKeysTemplate.missingKeys[key] = generateTranslations(key);
      });

      const missingKeysPath = join(scriptsDir, 'missing-keys-template.json');
      await writeFile(
        missingKeysPath,
        JSON.stringify(missingKeysTemplate, null, 2),
        'utf-8',
      );
      console.log(`📋 누락된 키 템플릿이 ${missingKeysPath}에 저장되었습니다`);
    }

    // 결과를 JSON 파일로 저장 (선택사항)
    if (process.env.SAVE_SYNC_RESULTS === 'true') {
      const resultPath = join(scriptsDir, 'last-sync-result.json');
      await writeFile(
        resultPath,
        JSON.stringify(
          {
            syncedAt: new Date().toISOString(),
            results,
            totalUpdated,
            saveLocation: 'public/locales/',
            analysis: analysisReport.summary
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`📄 동기화 결과가 ${resultPath}에 저장되었습니다`);
    }

    // 간단한 요약 출력
    if (analysisReport.details.missingKeys.length > 0) {
      console.log('\n⚠️  실제 누락된 키들 (코드에서 사용되지만 번역 파일에 없음):');
      analysisReport.details.missingKeys.slice(0, 10).forEach(key => {
        console.log(`   - ${key}`);
      });
      if (analysisReport.details.missingKeys.length > 10) {
        console.log(`   ... 그리고 ${analysisReport.details.missingKeys.length - 10}개 더`);
      }
    }

    if (analysisReport.summary.existingKeysInCodeCount > 0) {
      console.log(`\n✅ 정상 작동 중인 번역 키: ${analysisReport.summary.existingKeysInCodeCount}개`);
    }

    if (analysisReport.details.keysInCrowdinNotLocal.length > 0) {
      console.log('\n📥 Crowdin에서 가져올 수 있는 키들:');
      analysisReport.details.keysInCrowdinNotLocal.slice(0, 5).forEach(key => {
        console.log(`   - ${key}`);
      });
      if (analysisReport.details.keysInCrowdinNotLocal.length > 5) {
        console.log(`   ... 그리고 ${analysisReport.details.keysInCrowdinNotLocal.length - 5}개 더`);
      }
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
