require('dotenv').config({ path: '.env.local' });

const { execSync } = require("child_process");
const pkg = require("../package.json");

let sha = process.env.VERCEL_GIT_COMMIT_SHA;
if (!sha) {
  try {
    sha = execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    console.warn("⚠️ Git SHA를 가져오지 못했습니다. 기본 SHA 사용");
    sha = "no-git";
  }
}

const date = new Date().toISOString().split("T")[0];
const release = `${pkg.name}@${pkg.version}-${date}-${sha}`;

console.log(`📦 Sentry Release: ${release}`);
console.log("SENTRY_AUTH_TOKEN:", process.env.SENTRY_AUTH_TOKEN);
console.log("SENTRY_ORG:", process.env.SENTRY_ORG);
console.log("SENTRY_PROJECT:", process.env.SENTRY_PROJECT);

// 조직과 프로젝트 환경변수 확인
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

if (!sentryOrg || !sentryProject) {
  console.error("🚨 SENTRY_ORG 또는 SENTRY_PROJECT 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

try {
  // 조직과 프로젝트를 명시적으로 지정
  execSync(`sentry-cli releases --org=${sentryOrg} --project=${sentryProject} new ${release}`, { stdio: "inherit" });
} catch (e) {
  console.error("🚨 sentry-cli releases new 실패:", e.message);
  process.exit(1); // 강제 종료
}

const repo = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
  ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
  : null;

try {
  if (repo && process.env.VERCEL_GIT_COMMIT_SHA) {
    execSync(`sentry-cli releases --org=${sentryOrg} --project=${sentryProject} set-commits ${release} --commit "${repo}@${sha}"`, { stdio: "inherit" });
  } else {
    execSync(`sentry-cli releases --org=${sentryOrg} --project=${sentryProject} set-commits ${release} --auto`, { stdio: "inherit" });
  }
} catch (e) {
  console.warn('⚠️ set-commits 실패: git 정보가 없을 수 있습니다. 무시하고 계속 진행합니다.');
}

try {
  execSync(
    `sentry-cli releases --org=${sentryOrg} --project=${sentryProject} files ${release} upload-sourcemaps .next --url-prefix '~/_next' --rewrite`,
    { stdio: "inherit" }
  );
} catch (e) {
  console.warn('⚠️ 소스맵 업로드 실패:', e.message);
}

try {
  execSync(`sentry-cli releases --org=${sentryOrg} --project=${sentryProject} finalize ${release}`, { stdio: "inherit" });
} catch (e) {
  console.warn('⚠️ 릴리즈 finalize 실패:', e.message);
}