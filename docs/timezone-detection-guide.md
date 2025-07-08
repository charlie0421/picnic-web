# 시간대 변경 감지 가이드

## 개요

맥에서 시간대를 변경했을 때 웹 애플리케이션이 실시간으로 감지하고 시간 표시를 업데이트하는 기능입니다.

## 핵심 기능

### 1. 시간대 변경 감지 방법

- **브라우저 포커스 이벤트**: 다른 앱에서 브라우저로 돌아올 때 체크
- **가시성 변경 이벤트**: 탭이 비활성화되었다가 다시 활성화될 때 체크
- **주기적 체크**: 5분마다 자동으로 시간대 변경 체크
- **수동 체크**: 필요시 수동으로 시간대 체크 가능

### 2. 감지 정확도

- `Intl.DateTimeFormat().resolvedOptions().timeZone` 사용
- 시간대 오프셋 변화도 함께 감지
- 오류 처리 및 폴백 기능 포함

## 사용 방법

### 1. 기본 훅 사용

```tsx
import { useTimeZoneDetection } from '@/hooks/useTimeZoneDetection';

function MyComponent() {
  const { timeZone, changed, checkTimeZone } = useTimeZoneDetection();
  
  useEffect(() => {
    if (changed) {
      console.log('시간대 변경됨:', timeZone);
    }
  }, [changed, timeZone]);
  
  return (
    <div>
      <p>현재 시간대: {timeZone}</p>
      <button onClick={checkTimeZone}>수동 체크</button>
    </div>
  );
}
```

### 2. 간단한 훅 사용

```tsx
import { useTimeZone } from '@/hooks/useTimeZoneDetection';

function SimpleComponent() {
  const { timeZone, changed } = useTimeZone();
  
  return (
    <div className={changed ? 'text-blue-600' : 'text-gray-700'}>
      현재 시간대: {timeZone}
    </div>
  );
}
```

### 3. 시간 포맷팅과 함께 사용

```tsx
import { useTimeZoneDetection } from '@/hooks/useTimeZoneDetection';
import { formatDateWithTimeZone } from '@/utils/date';

function TimeDisplay() {
  const { timeZone } = useTimeZoneDetection();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div>
      {formatDateWithTimeZone(
        currentTime.toISOString(),
        'yyyy년 M월 d일 HH:mm:ss',
        'ko',
        timeZone
      )}
    </div>
  );
}
```

## 맥에서 테스트하는 방법

### 1. 시스템 환경설정에서 시간대 변경

1. 시스템 환경설정 → 날짜와 시간
2. 시간대 변경 (예: 서울 → 도쿄)
3. 브라우저로 돌아오기

### 2. 감지 트리거 방법

- **방법 1**: 다른 앱으로 갔다가 브라우저로 돌아오기
- **방법 2**: 브라우저 탭을 비활성화했다가 다시 활성화
- **방법 3**: 5분 기다리기 (자동 체크)
- **방법 4**: 수동 체크 버튼 클릭

### 3. 시각적 피드백

- 시간대 변경 시 텍스트 색상 변경
- 변경 알림 메시지 표시
- 콘솔에 로그 출력

## API 참조

### useTimeZoneDetection()

시간대 변경을 감지하는 메인 훅입니다.

```tsx
const {
  timeZone,    // 현재 시간대 (예: 'Asia/Seoul')
  offset,      // 시간대 오프셋 (분 단위)
  changed,     // 시간대 변경 여부 (boolean)
  checkTimeZone // 수동 체크 함수
} = useTimeZoneDetection();
```

### useTimeZone()

간단한 시간대 감지 훅입니다.

```tsx
const {
  timeZone,    // 현재 시간대
  changed      // 시간대 변경 여부
} = useTimeZone();
```

### getUserTimeZone()

현재 사용자의 시간대를 가져오는 유틸리티 함수입니다.

```tsx
import { getUserTimeZone } from '@/utils/date';

const currentTimeZone = getUserTimeZone();
```

### watchTimeZoneChange()

시간대 변경을 감지하는 리액티브 함수입니다.

```tsx
import { watchTimeZoneChange } from '@/utils/date';

const unwatch = watchTimeZoneChange((newTimeZone) => {
  console.log('시간대 변경:', newTimeZone);
});

// 정리
unwatch();
```

## 주의사항

1. **서버 사이드 렌더링**: 서버에서는 항상 'UTC'를 반환합니다
2. **브라우저 호환성**: 최신 브라우저에서만 지원됩니다
3. **성능**: 주기적 체크로 인한 성능 영향은 미미합니다
4. **메모리 누수**: 컴포넌트 언마운트 시 자동으로 정리됩니다

## 예제 컴포넌트

전체 기능을 보여주는 예제 컴포넌트는 `components/examples/TimeZoneAwareComponent.tsx`에서 확인할 수 있습니다.

## 트러블슈팅

### 시간대 변경이 감지되지 않는 경우

1. 브라우저 호환성 확인
2. 콘솔 에러 메시지 확인
3. 수동 체크 버튼으로 테스트
4. 다른 앱으로 갔다가 돌아오기

### 성능 문제

1. 주기적 체크 간격 조정 (현재 5분)
2. 불필요한 컴포넌트에서 훅 사용 제한
3. 메모화 적용 고려

## 추가 개선사항

- [ ] 시간대 변경 히스토리 저장
- [ ] 사용자 설정 시간대 우선순위
- [ ] 더 정확한 변경 감지 방법 연구
- [ ] 오프라인 상태 고려 