# Common Components

서버와 클라이언트 양쪽에서 사용 가능한 공통 컴포넌트들입니다. Atomic Design 패턴을 따라 구성되어 있습니다.

## 폴더 구조

```
common/
├── atoms/       # 가장 작은 단위의 컴포넌트
├── molecules/   # atoms를 조합한 중간 단위 컴포넌트
└── organisms/   # 복잡한 UI 블록
```

## 설계 원칙

### 1. 순수 함수형 컴포넌트
- React hooks 사용 금지
- props만으로 렌더링
- 사이드 이펙트 없음

### 2. 유연한 스타일링
```tsx
// ✅ Good: className prop으로 스타일 확장 가능
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;  // 추가 스타일링을 위한 className
}
```

### 3. 도메인 독립성
- 특정 도메인에 종속되지 않음
- 재사용 가능한 일반적인 컴포넌트
- 도메인 타입 import 금지

## Atoms

가장 작은 단위의 UI 요소들:

```typescript
// atoms/Button.tsx
export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Button({ 
  children, 
  variant = 'primary',
  size = 'md',
  ...props 
}: ButtonProps) {
  // 구현
}
```

### 주요 Atoms
- Button
- Input
- Label
- Icon
- Badge
- Spinner
- Avatar
- Divider

## Molecules

Atoms를 조합한 중간 단위:

```typescript
// molecules/SearchBar.tsx
import { Input, Button, Icon } from '../atoms';

export interface SearchBarProps {
  placeholder?: string;
  onSearch?: (value: string) => void;
  className?: string;
}

export function SearchBar({ onSearch, ...props }: SearchBarProps) {
  // Input + Button + Icon 조합
}
```

### 주요 Molecules
- SearchBar
- Card
- Modal
- Dropdown
- Tabs
- Pagination
- FormField (Label + Input + Error)
- UserInfo (Avatar + Name + Badge)

## Organisms

여러 molecules와 atoms로 구성된 복잡한 UI:

```typescript
// organisms/Header.tsx
import { SearchBar, UserInfo } from '../molecules';
import { Logo, Button } from '../atoms';

export interface HeaderProps {
  user?: User;
  onSearch?: (value: string) => void;
}

export function Header({ user, onSearch }: HeaderProps) {
  // 복잡한 헤더 레이아웃
}
```

### 주요 Organisms
- Header
- Footer
- Sidebar
- DataTable
- Form
- Gallery
- CommentSection

## 사용 예시

### 도메인에서 사용
```typescript
// features/vote/client/VoteCard.tsx
import { Card, Button, Badge } from '@/components/common';

export function VoteCard({ vote }) {
  return (
    <Card>
      <Card.Header>
        <h3>{vote.title}</h3>
        <Badge variant={vote.status}>{vote.status}</Badge>
      </Card.Header>
      <Card.Body>
        {/* vote specific content */}
      </Card.Body>
      <Card.Footer>
        <Button onClick={handleVote}>투표하기</Button>
      </Card.Footer>
    </Card>
  );
}
```

### 스타일 확장
```typescript
// 도메인별 스타일 적용
<Button 
  className="vote-button" 
  variant="primary"
>
  투표하기
</Button>

// CSS
.vote-button {
  background: linear-gradient(45deg, #ff6b6b, #ee5a6f);
}
```

## 테스트 가이드

### 1. 단위 테스트
```typescript
// atoms/Button.test.tsx
describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-danger');
  });
});
```

### 2. 스토리북
```typescript
// atoms/Button.stories.tsx
export default {
  title: 'Common/Atoms/Button',
  component: Button,
};

export const Primary = {
  args: {
    children: 'Primary Button',
    variant: 'primary',
  },
};
```

## 마이그레이션 체크리스트

기존 컴포넌트를 common으로 이동할 때:

- [ ] React hooks 제거 가능한가?
- [ ] 도메인 종속성이 없는가?
- [ ] props 인터페이스가 명확한가?
- [ ] 적절한 카테고리 선택 (atom/molecule/organism)
- [ ] 테스트 작성
- [ ] 스토리북 스토리 작성
- [ ] index.ts 업데이트 