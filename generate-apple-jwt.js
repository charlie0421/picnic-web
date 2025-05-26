const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 명령줄 인자 파싱
const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : null;
};

// .p8 파일 자동 찾기
function findP8Files() {
  const currentDir = process.cwd();
  const files = fs.readdirSync(currentDir);
  return files.filter(file => file.startsWith('AuthKey_') && file.endsWith('.p8'));
}

// 대화형 입력
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('🍎 Apple JWT Client Secret 생성기');
  console.log('='.repeat(50));
  
  try {
    // Team ID 입력
    let teamId = getArg('--team-id');
    if (!teamId) {
      console.log('\n📋 Apple Developer Console → Membership에서 Team ID를 확인하세요');
      teamId = await askQuestion('🔑 Team ID (10자리): ');
    }
    
    if (!teamId || teamId.length !== 10) {
      throw new Error('Team ID는 10자리여야 합니다');
    }
    
    // Key ID 입력
    let keyId = getArg('--key-id');
    if (!keyId) {
      console.log('\n📋 Apple Developer Console → Keys에서 생성한 키의 ID를 확인하세요');
      keyId = await askQuestion('🔑 Key ID (10자리): ');
    }
    
    if (!keyId || keyId.length !== 10) {
      throw new Error('Key ID는 10자리여야 합니다');
    }
    
    // .p8 파일 찾기 및 선택
    let privateKeyPath = getArg('--key-file');
    
    if (!privateKeyPath) {
      const p8Files = findP8Files();
      
      if (p8Files.length === 0) {
        console.log('\n❌ AuthKey_*.p8 파일을 찾을 수 없습니다.');
        console.log('💡 Apple Developer Console에서 다운로드한 .p8 파일을 이 폴더에 넣어주세요.');
        privateKeyPath = await askQuestion('📁 .p8 파일 경로를 직접 입력하세요: ');
      } else if (p8Files.length === 1) {
        privateKeyPath = p8Files[0];
        console.log(`\n✅ .p8 파일 자동 감지: ${privateKeyPath}`);
      } else {
        console.log('\n📁 여러 .p8 파일이 발견되었습니다:');
        p8Files.forEach((file, index) => {
          console.log(`  ${index + 1}. ${file}`);
        });
        const choice = await askQuestion('사용할 파일 번호를 선택하세요: ');
        const choiceIndex = parseInt(choice) - 1;
        if (choiceIndex >= 0 && choiceIndex < p8Files.length) {
          privateKeyPath = p8Files[choiceIndex];
        } else {
          throw new Error('잘못된 선택입니다');
        }
      }
    }
    
    // Client ID (기본값 설정)
    const clientId = getArg('--client-id') || 'fan.picnic.web';
    
    console.log('\n📋 설정 정보:');
    console.log(`   Team ID: ${teamId}`);
    console.log(`   Key ID: ${keyId}`);
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Private Key: ${privateKeyPath}`);
    
    // .p8 파일 읽기
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`파일을 찾을 수 없습니다: ${privateKeyPath}`);
    }
    
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    
    // JWT 생성
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (60 * 60 * 24 * 180); // 6개월
    
    const payload = {
      iss: teamId,
      aud: 'https://appleid.apple.com',
      sub: clientId,
      iat: now,
      exp: exp
    };
    
    const header = {
      alg: 'ES256',
      kid: keyId,
      typ: 'JWT'
    };
    
    const token = jwt.sign(payload, privateKey, { 
      header: header,
      algorithm: 'ES256'
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Apple Client Secret JWT 생성 완료!');
    console.log('='.repeat(50));
    console.log('\n📋 생성된 JWT (Supabase Secret Key에 입력하세요):');
    console.log('\n' + token);
    console.log('\n📅 만료일:', new Date(exp * 1000).toLocaleDateString('ko-KR'));
    console.log('⏰ 갱신 필요일:', new Date((exp - 7 * 24 * 60 * 60) * 1000).toLocaleDateString('ko-KR'), '(1주일 전)');
    
    console.log('\n🎯 다음 단계:');
    console.log('1. 위 JWT를 복사');
    console.log('2. Supabase Dashboard → Authentication → Providers → Apple');
    console.log('3. Secret Key 필드에 붙여넣기');
    console.log('4. Save 클릭');
    
    // JWT를 파일로도 저장
    const outputFile = 'apple-client-secret.txt';
    fs.writeFileSync(outputFile, token);
    console.log(`\n💾 JWT가 ${outputFile} 파일에도 저장되었습니다.`);
    
  } catch (error) {
    console.error('\n❌ 오류:', error.message);
    console.log('\n💡 도움말:');
    console.log('사용법: node generate-apple-jwt.js [옵션]');
    console.log('옵션:');
    console.log('  --team-id <ID>     Apple Developer Team ID (10자리)');
    console.log('  --key-id <ID>      Apple Sign In Key ID (10자리)');
    console.log('  --key-file <path>  .p8 파일 경로');
    console.log('  --client-id <ID>   Client ID (기본값: fan.picnic.web)');
    console.log('\n예시: node generate-apple-jwt.js --team-id=1234567890 --key-id=ABCDEF1234');
  }
}

// 스크립트 실행
main(); 