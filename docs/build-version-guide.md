# `npm build` 버전 정보 표시 기능 적용 가이드

이 문서는 `npm build` 시점의 버전 정보(Git 커밋 해시, 빌드 시간)를 애플리케이션에 표시하는 방법을 안내합니다.

## 1. `package.json` 스크립트 수정

`package.json` 파일의 `scripts` 섹션에서 `build` 명령을 수정하여, 빌드 시점에 Git 정보를 환경 변수로 주입합니다.

```json
// package.json

"scripts": {
  "build": "NEXT_PUBLIC_GIT_HASH=$(git rev-parse --short HEAD) NEXT_PUBLIC_BUILD_TIME=$(date -u +'%Y-%m-%dT%H:%M:%SZ') next build",
  // ... 다른 스크립트
}
```

- `NEXT_PUBLIC_GIT_HASH`: 현재 Git 브랜치의 마지막 커밋 해시(축약형)를 가져옵니다.
- `NEXT_PUBLIC_BUILD_TIME`: UTC 기준으로 현재 빌드 시간을 가져옵니다.
- `NEXT_PUBLIC_` 접두사: Next.js에서 클라이언트 사이드 코드에서도 이 환경 변수에 접근할 수 있도록 해줍니다.

## 2. `next.config.js` 설정 (선택 사항)

일반적으로 `NEXT_PUBLIC_` 접두사를 사용하면 `next.config.js`에 별도 설정 없이 환경 변수가 자동으로 주입됩니다. 하지만 명시적으로 관리하고 싶거나 다른 종류의 환경 변수를 사용해야 할 경우, 아래와 같이 설정할 수 있습니다.

```javascript
// next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_GIT_HASH: process.env.NEXT_PUBLIC_GIT_HASH,
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
  },
  // ... 다른 설정
};

module.exports = nextConfig;
```

## 3. UI에 버전 정보 표시

이제 애플리케이션의 어느 컴포넌트에서든 `process.env`를 통해 빌드 정보를 읽어와 화면에 표시할 수 있습니다. 주로 푸터(Footer) 컴포넌트에 많이 사용합니다.

```tsx
// components/layouts/Footer.tsx 예시

import React from 'react';

const Footer = () => {
  const gitHash = process.env.NEXT_PUBLIC_GIT_HASH;
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;

  return (
    <footer className="text-center text-xs text-gray-500 py-4">
      <div>
        <p>&copy; {new Date().getFullYear()} Your Company. All Rights Reserved.</p>
        {gitHash && buildTime && (
          <p>
            Build Version: {gitHash} ({buildTime})
          </p>
        )}
      </div>
    </footer>
  );
};

export default Footer;
```

이 컴포넌트를 레이아웃에 포함하면 모든 페이지 하단에 빌드 버전 정보가 표시됩니다.

## 4. 타입스크립트 환경 설정 (선택 사항)

타입스크립트를 사용하는 경우, `process.env`의 타입 정의를 추가하여 자동 완성과 타입 체크의 이점을 누릴 수 있습니다.

프로젝트 루트에 `env.d.ts`와 같은 타입 선언 파일을 만들고 다음 내용을 추가하세요.

```typescript
// env.d.ts

namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_GIT_HASH: string;
    readonly NEXT_PUBLIC_BUILD_TIME: string;
  }
}
```

이제 이 가이드를 따라 다른 프로젝트에도 손쉽게 빌드 버전 정보를 표시하는 기능을 추가할 수 있습니다. 추가적으로 궁금한 점이 있으시면 언제든지 질문해주세요. 