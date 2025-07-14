# Dialog System

Picnic Web의 팬시하고 재사용 가능한 다이얼로그 시스템입니다. Headless UI를 기반으로 구축되었으며, 완전한 접근성과 TypeScript 지원을 제공합니다.

## 특징

- 🎨 **팬시한 디자인**: 모던하고 아름다운 UI/UX
- 🔧 **완전한 커스터마이징**: 테마, 크기, 애니메이션 설정 가능
- ♿ **접근성**: ARIA 속성, 키보드 네비게이션, 스크린 리더 지원
- 📱 **반응형**: 모든 디바이스에서 완벽하게 작동
  - **모바일**: Bottom sheet 스타일, 전체 너비 버튼
  - **태블릿**: 적절한 크기 조정, 유연한 레이아웃
  - **데스크탑**: 전통적인 모달 스타일
- 🌙 **다크 모드**: 자동 다크 모드 지원
- 🎭 **다양한 타입**: info, warning, error, success, confirmation
- 🎬 **애니메이션**: 7가지 애니메이션 효과 (bottomSheet 포함)
- 🔌 **프로그래매틱 API**: Context를 통한 간편한 제어

## 반응형 디자인 상세

### 모바일 최적화 (< 768px)
- **Bottom Sheet**: `xl`과 `full` 크기에서 자동으로 bottom sheet 스타일 적용
- **버튼 레이아웃**: 세로 스택, 전체 너비
- **패딩**: 더 작은 패딩으로 화면 공간 효율적 사용
- **폰트 크기**: 터치 친화적인 크기 조정

### 태블릿 최적화 (768px - 1024px)
- **유연한 크기**: 화면 크기에 맞춘 적절한 다이얼로그 크기
- **하이브리드 레이아웃**: 모바일과 데스크탑의 중간 형태

### 데스크탑 최적화 (> 1024px)
- **전통적인 모달**: 중앙 정렬된 모달 스타일
- **가로 버튼 레이아웃**: 우측 정렬된 액션 버튼들
- **더 큰 패딩**: 넓은 화면에 맞춘 여백

## 설치 및 설정

### 1. DialogProvider 설정

앱의 최상위에 `DialogProvider`를 추가하세요:

```tsx
// app/layout.tsx 또는 _app.tsx
import { DialogProvider } from '@/components/ui/Dialog';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <DialogProvider>
          {children}
        </DialogProvider>
      </body>
    </html>
  );
}
```

## 사용법

### 1. 기본 다이얼로그 (선언적)

```tsx
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';

function MyComponent() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>다이얼로그 열기</button>
      
      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title="안녕하세요!"
        description="이것은 기본 다이얼로그입니다."
        type="info"
        size="md"
      >
        <p>여기에 커스텀 콘텐츠를 추가할 수 있습니다.</p>
      </Dialog>
    </>
  );
}
```

### 2. 액션 다이얼로그 (반응형 버튼)

```tsx
import { useDialog } from '@/components/ui/Dialog';

function MyComponent() {
  const { showActionDialog } = useDialog();

  const handleAction = async () => {
    const confirmed = await showActionDialog({
      title: '작업 확인',
      description: '이 작업을 수행하시겠습니까?',
      confirmText: '확인',
      cancelText: '취소',
      onConfirm: async () => {
        // 비동기 작업 수행
        await performAction();
      },
    });
    
    if (confirmed) {
      console.log('작업이 완료되었습니다.');
    }
  };

  return (
    <button onClick={handleAction}>
      액션 실행
    </button>
  );
}
```

### 3. 반응형 크기 설정

```tsx
// 모바일에서는 bottom sheet, 데스크탑에서는 일반 모달
<Dialog
  isOpen={open}
  onClose={() => setOpen(false)}
  size="xl" // 모바일에서 자동으로 bottom sheet 적용
  title="반응형 다이얼로그"
>
  <div className="space-y-4">
    <p>이 다이얼로그는 화면 크기에 따라 다르게 표시됩니다.</p>
    <ul className="list-disc pl-5 space-y-2">
      <li>모바일: Bottom sheet 스타일</li>
      <li>태블릿: 적절한 크기 조정</li>
      <li>데스크탑: 전통적인 모달</li>
    </ul>
  </div>
</Dialog>
```

### 4. 복합 다이얼로그 (서브 컴포넌트 사용)

```tsx
function ComplexDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog isOpen={open} onClose={() => setOpen(false)} size="lg">
      <Dialog.Header>
        <Dialog.Title>복잡한 다이얼로그</Dialog.Title>
        <Dialog.Description>
          이것은 더 복잡한 레이아웃을 가진 다이얼로그입니다.
        </Dialog.Description>
      </Dialog.Header>

      <Dialog.Content>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">이름</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">이메일</label>
            <input 
              type="email" 
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>
        </div>
      </Dialog.Content>

      <Dialog.Footer>
        <button 
          onClick={() => setOpen(false)}
          className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 order-2 sm:order-1"
        >
          취소
        </button>
        <button 
          onClick={() => setOpen(false)}
          className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 order-1 sm:order-2"
        >
          저장
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
```

## API 참조

### DialogType

```typescript
type DialogType = 'default' | 'info' | 'warning' | 'error' | 'success';
```

### DialogSize

```typescript
type DialogSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
```

**반응형 동작:**
- `xs`, `sm`, `md`, `lg`: 모든 화면에서 일반 모달
- `xl`, `full`: 모바일에서 bottom sheet, 데스크탑에서 일반 모달

### AnimationType

```typescript
type AnimationType = 'fade' | 'scale' | 'slide' | 'slideUp' | 'slideDown' | 'zoom' | 'bottomSheet';
```

**주의:** `bottomSheet`는 모바일에서 자동으로 적용되며, 직접 지정할 수도 있습니다.

### BaseDialogProps

```typescript
interface BaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  type?: DialogType;
  size?: DialogSize;
  className?: string;
  animation?: AnimationType;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}
```

## 반응형 커스터마이징

### 모바일 전용 스타일

```tsx
// mobileDialogConfig를 사용하여 모바일 동작 제어
import { mobileDialogConfig } from '@/components/ui/Dialog/theme';

// 특정 크기에서 bottom sheet 사용 여부 확인
const shouldUseBottomSheet = mobileDialogConfig.shouldUseBottomSheet('xl');
```

### 커스텀 반응형 클래스

```tsx
<Dialog
  isOpen={open}
  onClose={() => setOpen(false)}
  className="sm:max-w-lg md:max-w-xl lg:max-w-2xl"
  contentClassName="p-4 sm:p-6 md:p-8"
>
  <div className="text-sm sm:text-base md:text-lg">
    반응형 텍스트 크기
  </div>
</Dialog>
```

## 모범 사례

### 1. 반응형 버튼 레이아웃

```tsx
<Dialog.Footer className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
  <button className="w-full sm:w-auto order-2 sm:order-1">
    취소
  </button>
  <button className="w-full sm:w-auto order-1 sm:order-2">
    확인
  </button>
</Dialog.Footer>
```

### 2. 적절한 크기 선택

- **간단한 확인**: `xs`, `sm`
- **폼 입력**: `md`, `lg`
- **복잡한 콘텐츠**: `xl`, `full`

### 3. 모바일 친화적 텍스트

```tsx
<Dialog.Title className="text-base sm:text-lg md:text-xl">
  반응형 제목
</Dialog.Title>
<Dialog.Description className="text-sm sm:text-base">
  반응형 설명
</Dialog.Description>
```

### 4. 터치 친화적 버튼

```tsx
<button className="min-h-[44px] px-4 py-2.5 sm:py-2 text-sm font-medium">
  터치 친화적 버튼
</button>
```

## 접근성 고려사항

- **키보드 네비게이션**: Tab, Enter, Escape 키 지원
- **스크린 리더**: 적절한 ARIA 속성 자동 적용
- **포커스 관리**: 다이얼로그 열기/닫기 시 포커스 자동 관리
- **색상 대비**: WCAG 가이드라인 준수

## 문제 해결

### 일반적인 문제들

1. **모바일에서 bottom sheet가 적용되지 않음**
   - `size="xl"` 또는 `size="full"` 사용
   - 화면 너비가 768px 미만인지 확인

2. **버튼이 올바르게 정렬되지 않음**
   - `Dialog.Footer`에 반응형 클래스 적용
   - 버튼에 `order` 클래스 사용

3. **애니메이션이 부자연스러움**
   - 모바일에서는 `bottomSheet` 애니메이션이 자동 적용됨
   - 필요시 `animation` prop으로 직접 제어

## 업데이트 내역

### v2.0.0 (현재)
- ✅ 완전한 반응형 웹 UI 지원
- ✅ 모바일 bottom sheet 스타일
- ✅ 반응형 버튼 레이아웃
- ✅ 터치 친화적 인터페이스
- ✅ 개선된 애니메이션 시스템

### v1.0.0
- ✅ 기본 다이얼로그 시스템
- ✅ 다크 모드 지원
- ✅ 접근성 기능 