const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 빌드 버전을 생성합니다.
 * 형태: YYYYMMDD.HHMM.BBB (예: 20250129.1430.001)
 * - YYYYMMDD: 날짜
 * - HHMM: 시간 (24시간 형식)
 * - BBB: 빌드 번호 (같은 날짜에 여러 빌드 시 증가)
 */
function generateBuildVersion() {
  // 한국 시간 기준으로 날짜와 시간 생성
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC + 9시간
  
  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, '0');
  const day = String(kst.getDate()).padStart(2, '0');
  const hours = String(kst.getHours()).padStart(2, '0');
  const minutes = String(kst.getMinutes()).padStart(2, '0');
  
  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hours}${minutes}`;
  
  // 빌드 번호 관리 파일 경로
  const buildInfoPath = path.join(__dirname, '..', '.next', 'build-info.json');
  const buildInfoDir = path.dirname(buildInfoPath);
  
  // .next 디렉토리가 없으면 생성
  if (!fs.existsSync(buildInfoDir)) {
    fs.mkdirSync(buildInfoDir, { recursive: true });
  }
  
  let buildInfo = { lastDate: '', buildNumber: 0 };
  
  // 기존 빌드 정보 읽기
  if (fs.existsSync(buildInfoPath)) {
    try {
      buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
    } catch (e) {
      console.warn('⚠️ 빌드 정보 파일을 읽는데 실패했습니다. 초기화합니다.');
    }
  }
  
  // 같은 날짜면 빌드 번호 증가, 다른 날짜면 초기화
  if (buildInfo.lastDate === dateStr) {
    buildInfo.buildNumber += 1;
  } else {
    buildInfo.lastDate = dateStr;
    buildInfo.buildNumber = 1;
  }
  
  const buildNumberStr = String(buildInfo.buildNumber).padStart(3, '0');
  const version = `${dateStr}.${timeStr}.${buildNumberStr}`;
  
  // 빌드 정보 저장
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
  
  // 환경변수로 설정 (Vercel과 Next.js에서 사용)
  process.env.BUILD_VERSION = version;
  process.env.SENTRY_RELEASE = `picnic-web@${version}`;
  process.env.NEXT_PUBLIC_SENTRY_RELEASE = `picnic-web@${version}`;
  
  console.log(`🏗️ 빌드 버전 생성: ${version}`);
  console.log(`📦 Sentry 릴리스: picnic-web@${version}`);
  
  return version;
}

// 직접 실행시 버전 생성 및 출력
if (require.main === module) {
  const version = generateBuildVersion();
  
  // package.json의 버전도 업데이트 (선택적)
  const packagePath = path.join(__dirname, '..', 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    pkg.buildVersion = version;
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
    console.log(`📦 package.json buildVersion 업데이트: ${version}`);
  } catch (e) {
    console.warn('⚠️ package.json 업데이트 실패:', e.message);
  }
}

module.exports = { generateBuildVersion }; 