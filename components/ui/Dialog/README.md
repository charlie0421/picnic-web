# Dialog System

Picnic Web의 팬시하고 재사용 가능한 다이얼로그 시스템입니다. Headless UI를 기반으로 구축되었으며, 완전한 접근성과 TypeScript 지원을 제공합니다.

## 특징

- 🎨 **팬시한 디자인**: 모던하고 아름다운 UI/UX
- 🔧 **완전한 커스터마이징**: 테마, 크기, 애니메이션 설정 가능
- ♿ **접근성**: ARIA 속성, 키보드 네비게이션, 스크린 리더 지원
- 📱 **반응형**: 모든 디바이스에서 완벽하게 작동
- 🌙 **다크 모드**: 자동 다크 모드 지원
- 🎭 **다양한 타입**: info, warning, error, success, confirmation
- 🎬 **애니메이션**: 6가지 애니메이션 효과
- 🔌 **프로그래매틱 API**: Context를 통한 간편한 제어

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
        open={open}
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

### 2. 액션 다이얼로그

```tsx
import { ActionDialog } from '@/components/ui/Dialog';

function ActionDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <ActionDialog
      open={open}
      onClose={() => setOpen(false)}
      title="작업 확인"
      description="이 작업을 수행하시겠습니까?"
      type="warning"
      primaryAction={{
        label: '확인',
        variant: 'primary',
        onClick: async () => {
          // 비동기 작업 수행
          await performAction();
        }
      }}
      secondaryAction={{
        label: '취소',
        variant: 'secondary',
        onClick: () => console.log('취소됨')
      }}
    />
  );
}
```

### 3. 확인 다이얼로그

```tsx
import { ConfirmDialog } from '@/components/ui/Dialog';

function ConfirmDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <ConfirmDialog
      open={open}
      onClose={() => setOpen(false)}
      title="삭제 확인"
      description="정말로 이 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
      type="error"
      destructive={true}
      confirmText="삭제"
      cancelText="취소"
      onConfirm={async () => {
        await deleteItem();
      }}
      onCancel={() => {
        console.log('삭제 취소됨');
      }}
    />
  );
}
```

### 4. 알림 다이얼로그

```tsx
import { AlertDialog } from '@/components/ui/Dialog';

function AlertDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog
      open={open}
      onClose={() => setOpen(false)}
      title="성공!"
      description="작업이 성공적으로 완료되었습니다."
      type="success"
      okText="확인"
      onOk={() => {
        console.log('확인됨');
      }}
    />
  );
}
```

## 프로그래매틱 API

Context를 사용하여 프로그래매틱하게 다이얼로그를 제어할 수 있습니다:

### 1. useDialog 훅

```tsx
import { useDialog } from '@/components/ui/Dialog';

function MyComponent() {
  const { showDialog, showConfirm, showAlert } = useDialog();

  const handleShowDialog = async () => {
    const result = await showDialog({
      title: '사용자 입력',
      description: '계속하시겠습니까?',
      type: 'info',
      primaryAction: {
        label: '계속',
        onClick: () => console.log('계속 클릭됨')
      },
      secondaryAction: {
        label: '취소',
        onClick: () => console.log('취소 클릭됨')
      }
    });
    
    console.log('다이얼로그 결과:', result);
  };

  const handleConfirm = async () => {
    const confirmed = await showConfirm({
      title: '확인 필요',
      description: '이 작업을 수행하시겠습니까?',
      type: 'warning',
      onConfirm: () => console.log('확인됨'),
      onCancel: () => console.log('취소됨')
    });
    
    if (confirmed) {
      console.log('사용자가 확인했습니다');
    }
  };

  const handleAlert = async () => {
    await showAlert({
      title: '알림',
      description: '작업이 완료되었습니다.',
      type: 'success'
    });
    
    console.log('알림이 닫혔습니다');
  };

  return (
    <div>
      <button onClick={handleShowDialog}>다이얼로그 표시</button>
      <button onClick={handleConfirm}>확인 다이얼로그</button>
      <button onClick={handleAlert}>알림 표시</button>
    </div>
  );
}
```

### 2. 편의 훅들

```tsx
import { useConfirm, useAlert } from '@/components/ui/Dialog';

function QuickExample() {
  const confirm = useConfirm();
  const alert = useAlert();

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: '삭제 확인',
      description: '정말로 삭제하시겠습니까?',
      type: 'error',
      destructive: true,
      onConfirm: () => deleteItem()
    });

    if (confirmed) {
      await alert({
        title: '완료',
        description: '삭제가 완료되었습니다.',
        type: 'success'
      });
    }
  };

  return <button onClick={handleDelete}>삭제</button>;
}
```

## 컴파운드 컴포넌트

더 복잡한 레이아웃을 위해 컴파운드 컴포넌트를 사용할 수 있습니다:

```tsx
import { Dialog } from '@/components/ui/Dialog';

function ComplexDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} size="lg">
      <Dialog.Header>
        <Dialog.Title>복잡한 다이얼로그</Dialog.Title>
        <Dialog.Description>
          이것은 더 복잡한 레이아웃을 가진 다이얼로그입니다.
        </Dialog.Description>
      </Dialog.Header>

      <Dialog.Content>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">이름</label>
            <input type="text" className="mt-1 block w-full rounded-md border-gray-300" />
          </div>
          <div>
            <label className="block text-sm font-medium">이메일</label>
            <input type="email" className="mt-1 block w-full rounded-md border-gray-300" />
          </div>
        </div>
      </Dialog.Content>

      <Dialog.Footer>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            취소
          </button>
          <button 
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </Dialog.Footer>
    </Dialog>
  );
}
```

## API 참조

### DialogType

```typescript
type DialogType = 'info' | 'warning' | 'error' | 'success' | 'confirmation';
```

### DialogSize

```typescript
type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
```

### AnimationType

```typescript
type AnimationType = 'fade' | 'scale' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right';
```

### BaseDialogProps

```typescript
interface BaseDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  type?: DialogType;
  size?: DialogSize;
  className?: string;
  animation?: AnimationType;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}
```

### DialogAction

```typescript
interface DialogAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  autoClose?: boolean;
}
```

## 커스터마이징

### 테마 커스터마이징

기본 테마를 확장하거나 완전히 새로운 테마를 만들 수 있습니다:

```tsx
import { defaultDialogTheme } from '@/components/ui/Dialog';

const customTheme = {
  ...defaultDialogTheme,
  panel: {
    ...defaultDialogTheme.panel,
    base: 'custom-panel-classes'
  }
};

<Dialog theme={customTheme} {...props} />
```

### CSS 변수 사용

CSS 변수를 사용하여 색상을 커스터마이징할 수 있습니다:

```css
:root {
  --dialog-primary: #3b82f6;
  --dialog-danger: #ef4444;
  --dialog-success: #10b981;
  --dialog-warning: #f59e0b;
}
```

## 모범 사례

1. **적절한 타입 선택**: 상황에 맞는 다이얼로그 타입을 선택하세요
2. **명확한 제목과 설명**: 사용자가 이해하기 쉬운 텍스트를 사용하세요
3. **적절한 크기**: 콘텐츠에 맞는 크기를 선택하세요
4. **접근성 고려**: ARIA 속성을 적절히 사용하세요
5. **비동기 작업**: 로딩 상태를 적절히 처리하세요

## 예제 모음

더 많은 예제는 `components/ui/Dialog/examples/` 폴더를 참조하세요.

## 문제 해결

### 일반적인 문제들

1. **다이얼로그가 표시되지 않음**: DialogProvider가 올바르게 설정되었는지 확인하세요
2. **스타일이 적용되지 않음**: Tailwind CSS가 올바르게 설정되었는지 확인하세요
3. **애니메이션이 작동하지 않음**: Headless UI Transition이 올바르게 import되었는지 확인하세요

### 디버깅

개발 모드에서는 콘솔에 디버그 정보가 출력됩니다:

```tsx
<Dialog debug={true} {...props} />
```

## 기여하기

이 다이얼로그 시스템에 기여하고 싶으시다면:

1. 새로운 기능이나 버그 수정을 위한 이슈를 생성하세요
2. 테스트를 포함한 PR을 제출하세요
3. 문서를 업데이트하세요

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 