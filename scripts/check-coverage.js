#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 커버리지 임계값 검증 스크립트
 * CI/CD 파이프라인에서 커버리지가 임계값을 충족하는지 확인합니다.
 */

const COVERAGE_THRESHOLD = {
  statements: 80,
  branches: 80,
  functions: 80,
  lines: 80
};

const COVERAGE_FILE = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

function checkCoverage() {
  console.log('🔍 커버리지 임계값 검증을 시작합니다...\n');

  // 커버리지 파일 존재 확인
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error('❌ 커버리지 파일을 찾을 수 없습니다:', COVERAGE_FILE);
    console.error('먼저 "npm run test:coverage"를 실행하세요.');
    process.exit(1);
  }

  // 커버리지 데이터 읽기
  let coverageData;
  try {
    const coverageContent = fs.readFileSync(COVERAGE_FILE, 'utf8');
    coverageData = JSON.parse(coverageContent);
  } catch (error) {
    console.error('❌ 커버리지 파일을 읽는 중 오류가 발생했습니다:', error.message);
    process.exit(1);
  }

  const { total } = coverageData;
  
  console.log('📊 현재 커버리지 현황:');
  console.log('┌─────────────┬──────────┬──────────┬────────┐');
  console.log('│ 항목        │ 현재     │ 임계값   │ 상태   │');
  console.log('├─────────────┼──────────┼──────────┼────────┤');
  
  const results = [];
  const metrics = ['statements', 'branches', 'functions', 'lines'];
  
  metrics.forEach(metric => {
    const current = total[metric].pct;
    const threshold = COVERAGE_THRESHOLD[metric];
    const passed = current >= threshold;
    const status = passed ? '✅ 통과' : '❌ 실패';
    
    console.log(`│ ${metric.padEnd(11)} │ ${String(current + '%').padEnd(8)} │ ${String(threshold + '%').padEnd(8)} │ ${status} │`);
    
    results.push({
      metric,
      current,
      threshold,
      passed
    });
  });
  
  console.log('└─────────────┴──────────┴──────────┴────────┘\n');

  // 실패한 항목 확인
  const failedMetrics = results.filter(result => !result.passed);
  
  if (failedMetrics.length > 0) {
    console.error('❌ 다음 커버리지 항목들이 임계값에 미달했습니다:');
    failedMetrics.forEach(({ metric, current, threshold }) => {
      console.error(`   • ${metric}: ${current}% (필요: ${threshold}%)`);
    });
    console.error('\n💡 추가 테스트를 작성하여 커버리지를 향상시켜 주세요.');
    process.exit(1);
  }

  console.log('🎉 모든 커버리지 임계값을 충족했습니다!');
  console.log('✅ 코드 품질 기준을 통과했습니다.\n');
  
  // 상세 정보 출력
  console.log('📈 상세 커버리지 정보:');
  console.log(`   • 총 라인 수: ${total.lines.total}`);
  console.log(`   • 커버된 라인 수: ${total.lines.covered}`);
  console.log(`   • 총 함수 수: ${total.functions.total}`);
  console.log(`   • 커버된 함수 수: ${total.functions.covered}`);
  console.log(`   • 총 브랜치 수: ${total.branches.total}`);
  console.log(`   • 커버된 브랜치 수: ${total.branches.covered}`);
  
  process.exit(0);
}

// 스크립트 실행
if (require.main === module) {
  checkCoverage();
}

module.exports = { checkCoverage, COVERAGE_THRESHOLD }; 