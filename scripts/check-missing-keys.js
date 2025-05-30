#!/usr/bin/env node

const { readFile } = require('fs/promises');
const { join } = require('path');
const { existsSync } = require('fs');

async function checkMissingKeys() {
  try {
    const reportPath = join(process.cwd(), 'scripts', 'translation-analysis-report.json');
    const templatePath = join(process.cwd(), 'scripts', 'missing-keys-template.json');

    if (!existsSync(reportPath)) {
      console.log('❌ 분석 리포트를 찾을 수 없습니다.');
      console.log('💡 먼저 번역 동기화를 실행하세요: npm run sync-translations');
      process.exit(1);
    }

    const reportContent = await readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    console.log('📊 번역 키 분석 요약');
    console.log('═'.repeat(50));
    console.log(`📝 코드에서 사용되는 키: ${report.summary.totalUsedKeys}개`);
    console.log(`📚 번역 파일의 키: ${report.summary.totalExistingKeys}개`);
    console.log(`☁️  Crowdin의 키: ${report.summary.totalCrowdinKeys}개`);
    console.log(`✅ 정상 연결된 키: ${report.summary.existingKeysInCodeCount}개`);
    console.log(`❌ 실제 누락된 키: ${report.summary.missingKeysCount}개`);
    console.log(`📋 새로 추가 필요한 키: ${report.summary.newKeysToAddCount}개`);
    console.log(`📥 Crowdin에만 있는 키: ${report.summary.keysInCrowdinNotLocalCount}개`);
    console.log(`🗑️  사용되지 않는 키: ${report.summary.unusedKeysCount}개`);
    console.log(`📅 분석 시간: ${new Date(report.generatedAt).toLocaleString('ko-KR')}`);

    // 상태별 상세 정보
    if (report.summary.existingKeysInCodeCount > 0) {
      console.log('\n✅ 정상 작동 상태');
      console.log('─'.repeat(30));
      console.log(`   ${report.summary.existingKeysInCodeCount}개의 번역 키가 올바르게 연결되어 있습니다.`);
    }

    if (report.summary.missingKeysCount > 0) {
      console.log('\n❌ 누락된 번역 키들');
      console.log('─'.repeat(30));
      
      report.details.missingKeys.forEach((key, index) => {
        if (index < 15) { // 처음 15개만 표시
          console.log(`   ${index + 1}. ${key}`);
        }
      });

      if (report.details.missingKeys.length > 15) {
        console.log(`   ... 그리고 ${report.details.missingKeys.length - 15}개 더`);
      }

      if (existsSync(templatePath)) {
        console.log('\n📋 번역 템플릿 파일:');
        console.log(`   ${templatePath}`);
        console.log('   이 파일에서 누락된 키들의 번역을 확인할 수 있습니다.');
      }
    }

    if (report.summary.keysInCrowdinNotLocalCount > 0) {
      console.log('\n📥 Crowdin에서 가져올 수 있는 키들');
      console.log('─'.repeat(40));
      console.log(`   ${report.summary.keysInCrowdinNotLocalCount}개의 키가 Crowdin에는 있지만 로컬에는 없습니다.`);
      console.log('   다음 동기화에서 자동으로 가져와집니다.');
    }

    // 다음 단계 안내
    if (report.summary.missingKeysCount > 0) {
      console.log('\n📌 다음 단계');
      console.log('─'.repeat(20));
      console.log('   1. scripts/missing-keys-template.json에서 번역 확인');
      console.log('   2. Crowdin에 누락된 키들 추가');
      console.log('   3. 번역 완료 후 npm run sync-translations 재실행');
      console.log('   4. npm run check-translations로 결과 확인');
    } else {
      console.log('\n🎉 모든 번역 키가 정상적으로 설정되어 있습니다!');
    }

    // 사용되지 않는 키가 많은 경우 경고
    if (report.summary.unusedKeysCount > 200) {
      console.log('\n🧹 정리 권장사항');
      console.log('─'.repeat(25));
      console.log(`   사용되지 않는 번역 키가 ${report.summary.unusedKeysCount}개 있습니다.`);
      console.log('   번역 파일이 너무 커지면 로딩 성능에 영향을 줄 수 있습니다.');
      console.log('   주기적으로 사용되지 않는 키들을 정리하는 것을 권장합니다.');
    }

    // 효율성 지표
    const efficiency = Math.round((report.summary.existingKeysInCodeCount / report.summary.totalUsedKeys) * 100);
    console.log('\n📈 번역 시스템 효율성');
    console.log('─'.repeat(30));
    console.log(`   연결률: ${efficiency}% (${report.summary.existingKeysInCodeCount}/${report.summary.totalUsedKeys})`);
    
    if (efficiency >= 90) {
      console.log('   🟢 매우 좋음 - 대부분의 키가 정상 작동합니다.');
    } else if (efficiency >= 70) {
      console.log('   🟡 보통 - 일부 키를 추가하면 더 좋아집니다.');
    } else {
      console.log('   🔴 개선 필요 - 많은 번역 키가 누락되어 있습니다.');
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

// CLI에서 직접 실행된 경우
if (require.main === module) {
  checkMissingKeys();
}

module.exports = { checkMissingKeys }; 