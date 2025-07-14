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
- ⏰ **시간 기반 노출**: 쿼리 파라미터를 통한 시간 제한 기능

## 컴포넌트

### 기본 다이얼로그

#### `Dialog`
기본 다이얼로그 컴포넌트입니다.

```tsx
import { Dialog } from '@/components/ui/Dialog';

<Dialog isOpen={isOpen} onClose={onClose} title="제목">
  <Dialog.Content>
    내용
  </Dialog.Content>
</Dialog>
```

#### `ActionDialog`
확인/취소 액션이 있는 다이얼로그입니다.

```tsx
import { ActionDialog } from '@/components/ui/Dialog';

<ActionDialog
  isOpen={isOpen}
  onClose={onClose}
  title="확인"
  onConfirm={handleConfirm}
  onCancel={handleCancel}
>
  정말 삭제하시겠습니까?
</ActionDialog>
```

#### `ConfirmDialog`
확인을 요구하는 다이얼로그입니다.

```tsx
import { ConfirmDialog } from '@/components/ui/Dialog';

<ConfirmDialog
  isOpen={isOpen}
  onClose={onClose}
  title="삭제 확인"
  onConfirm={handleDelete}
>
  이 작업은 되돌릴 수 없습니다.
</ConfirmDialog>
```

#### `AlertDialog`
알림용 다이얼로그입니다.

```tsx
import { AlertDialog } from '@/components/ui/Dialog';

<AlertDialog
  isOpen={isOpen}
  onClose={onClose}
  title="알림"
  onConfirm={handleOk}
>
  작업이 완료되었습니다.
</AlertDialog>
```

### 시간 기반 다이얼로그

#### `QueryTimeDialog`
URL 쿼리 파라미터를 통해 시간 기반 노출을 제어하는 다이얼로그입니다.

```tsx
import { QueryTimeDialog } from '@/components/ui/Dialog';

<QueryTimeDialog
  defaultOpen={true}
  onClose={handleClose}
  title="이벤트 알림"
  showTimeInfo={true}
>
  <div>
    <h3>특별 이벤트 진행 중!</h3>
    <p>지금 참여하세요!</p>
  </div>
</QueryTimeDialog>
```

**URL 쿼리 파라미터:**
- `start_at`: 노출 시작 시간 (ISO 8601 형식)
- `stop_at`: 노출 종료 시간 (ISO 8601 형식)  
- `debug`: 디버그 모드 (true/1로 설정 시 항상 표시)

**사용 예시:**
```
/page?start_at=2024-01-01T00:00:00Z&stop_at=2024-12-31T23:59:59Z
/page?stop_at=2024-12-31T23:59:59Z
/page?debug=true
```

## 반응형 디자인 상세

### 모바일 최적화 (< 768px)
- **Bottom Sheet**: `xl`과 `full` 크기에서 자동으로 bottom sheet 스타일 적용
- **버튼 레이아웃**: 세로 스택, 전체 너비
- **패딩**: 더 작은 패딩으로 화면 공간 효율적 사용
- **폰트 크기**: 터치 친화적인 크기 조정

### 태블릿 최적화 (768px - 1024px)
- **유연한 크기**: 화면 크기에 맞춘 적절한 다이얼로그 크기
- **하이브리드 레이아웃**: 모바일과 데스크탑의 중간 형태

### 데스크탑 최적화 (≥ 1024px)
- **전통적인 모달**: 중앙 정렬, 적절한 크기
- **마우스 최적화**: 호버 효과, 정확한 클릭 영역

## 프로그래매틱 사용법

### Context API 사용

```tsx
import { useDialog, useConfirm, useAlert } from '@/components/ui/Dialog';

function MyComponent() {
  const { showDialog } = useDialog();
  const confirm = useConfirm();
  const alert = useAlert();

  const handleAction = async () => {
    const confirmed = await confirm({
      title: '확인',
      children: '정말 진행하시겠습니까?'
    });
    
    if (confirmed) {
      // 작업 수행
      await alert({
        title: '완료',
        children: '작업이 완료되었습니다.'
      });
    }
  };

  return (
    <button onClick={handleAction}>
      액션 실행
    </button>
  );
}
```

## 시간 기반 기능

### 서버 시간 API
```typescript
// /api/server-time
{
  "success": true,
  "serverTime": {
    "iso": "2024-01-15T12:00:00.000Z",
    "timestamp": 1705320000000,
    "utc": "Mon, 15 Jan 2024 12:00:00 GMT",
    "timezone": "Asia/Seoul",
    "offset": -540
  }
}
```

### 유틸리티 함수
```typescript
import { 
  checkTimeBasedDisplayWithServerTime,
  parseTimeBasedQuery,
  formatTimeRemaining 
} from '@/utils/time-based-display';

// URL 쿼리 파싱
const query = parseTimeBasedQuery(searchParams);

// 서버 시간 기준 체크
const result = await checkTimeBasedDisplayWithServerTime(query);
console.log(result.shouldDisplay); // true/false
console.log(result.status); // 'before' | 'active' | 'after'
```

## 커스터마이징

### 테마 커스터마이징

```tsx
import { defaultDialogTheme } from '@/components/ui/Dialog';

const customTheme = {
  ...defaultDialogTheme,
  panel: {
    ...defaultDialogTheme.panel,
    base: "custom-panel-styles"
  }
};
```

### 크기 설정

```tsx
<Dialog size="xs" /> // 280px (모바일) / 384px (데스크탑)
<Dialog size="sm" /> // 320px (모바일) / 448px (데스크탑)
<Dialog size="md" /> // 360px (모바일) / 512px (데스크탑)
<Dialog size="lg" /> // 400px (모바일) / 576px (데스크탑)
<Dialog size="xl" /> // 480px (모바일) / 672px (데스크탑)
<Dialog size="full" /> // 90vw (모바일) / 1152px (데스크탑)
```

### 애니메이션 설정

```tsx
<Dialog animation="scale" />     // 확대/축소
<Dialog animation="slide" />     // 슬라이드
<Dialog animation="fade" />      // 페이드
<Dialog animation="slideUp" />   // 아래에서 위로
<Dialog animation="slideDown" /> // 위에서 아래로
<Dialog animation="zoom" />      // 줌
<Dialog animation="bottomSheet" /> // 모바일 Bottom Sheet
```

## 접근성

- **ARIA 속성**: 적절한 role, aria-labelledby, aria-describedby 설정
- **키보드 네비게이션**: ESC로 닫기, Tab으로 포커스 이동
- **포커스 관리**: 다이얼로그 열림/닫힘 시 포커스 자동 관리
- **스크린 리더**: 적절한 텍스트 읽기 지원

## 데모

시간 기반 다이얼로그 데모를 확인하려면:
```
/demo-time-dialog
```

다양한 쿼리 파라미터를 테스트해보세요! 