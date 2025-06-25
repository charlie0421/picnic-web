# Payment Modal Design Mockup

## 📋 개요
투표 시스템에 통합되는 결제 모달 컴포넌트로, 지역별 결제 수단을 제공하고 사용자가 별사탕, 보너스 등의 디지털 상품을 구매할 수 있게 합니다.

## 🎨 UI/UX 디자인

### 모달 레이아웃 구조

```
┌─────────────────────────────────────────────────────────┐
│                    💳 상품 결제                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🌍 지역 선택                                             │
│  [ 🇰🇷 Korea ] [ 🌏 Global ]                             │
│                                                         │
│  📦 상품 선택                                             │
│  ┌─────────────┬─────────────┬─────────────┐           │
│  │  ⭐ 별사탕   │  🎁 보너스   │  💎 프리미엄  │           │
│  │   100개     │    50개     │    20개     │           │
│  │  ₩5,000     │  ₩3,000     │  ₩10,000    │           │
│  └─────────────┴─────────────┴─────────────┘           │
│                                                         │
│  💰 결제 수단 (Korea 선택 시)                             │
│  [ 💳 카드결제 ] [ 🏦 계좌이체 ] [ 📱 간편결제 ]            │
│                                                         │
│  💰 결제 수단 (Global 선택 시)                            │
│  [ 💳 PayPal ] [ 💰 Credit Card ]                        │
│                                                         │
│  📊 요금표                                               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 상품        수량    가격      결제수수료    총 금액    │ │
│  │ 별사탕      100개   ₩5,000    ₩150      ₩5,150    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│              [ 취소 ]    [ 결제하기 ]                     │
└─────────────────────────────────────────────────────────┘
```

### 상호작용 플로우

1. **모달 열기**: 투표 페이지에서 "충전" 또는 "결제" 버튼 클릭
2. **지역 자동 감지**: IP 기반으로 Korea/Global 자동 선택
3. **지역 수동 변경**: 사용자가 토글로 지역 변경 가능
4. **상품 선택**: 별사탕, 보너스, 프리미엄 패키지 중 선택
5. **결제 수단 선택**: 지역에 따라 Port One(Korea) 또는 PayPal(Global)
6. **요금 확인**: 선택한 상품과 수수료를 포함한 총 금액 표시
7. **결제 진행**: 결제 진행 상태 표시

## 🏗️ 컴포넌트 구조

### 1. PaymentModal (메인 컴포넌트)
```tsx
interface PaymentModalProps extends BaseDialogProps {
  // IP 기반 자동 지역 감지
  detectedRegion?: 'korea' | 'global';
  
  // 초기 선택된 상품 (옵션)
  initialProduct?: ProductType;
  
  // 결제 완료 콜백
  onPaymentSuccess?: (receipt: PaymentReceipt) => void;
  onPaymentError?: (error: PaymentError) => void;
}
```

### 2. RegionSelector (지역 선택)
```tsx
interface RegionSelectorProps {
  selectedRegion: 'korea' | 'global';
  detectedRegion?: 'korea' | 'global';
  onRegionChange: (region: 'korea' | 'global') => void;
  disabled?: boolean;
}
```

### 3. ProductSelector (상품 선택)
```tsx
interface ProductSelectorProps {
  selectedProduct?: ProductType;
  onProductSelect: (product: ProductType) => void;
  region: 'korea' | 'global';
}

interface ProductType {
  id: string;
  name: string;
  description: string;
  quantity: number;
  price: number;
  currency: 'KRW' | 'USD';
  icon: string;
  category: 'stars' | 'bonus' | 'premium';
}
```

### 4. PaymentMethodSelector (결제 수단)
```tsx
interface PaymentMethodSelectorProps {
  region: 'korea' | 'global';
  selectedMethod?: PaymentMethod;
  onMethodSelect: (method: PaymentMethod) => void;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  provider: 'portone' | 'paypal';
  fees: number; // 수수료 (%)
}
```

### 5. PriceTable (요금표)
```tsx
interface PriceTableProps {
  product?: ProductType;
  paymentMethod?: PaymentMethod;
  region: 'korea' | 'global';
}

interface PriceBreakdown {
  subtotal: number;
  fees: number;
  total: number;
  currency: 'KRW' | 'USD';
}
```

### 6. PaymentActions (결제 버튼)
```tsx
interface PaymentActionsProps {
  canProceed: boolean;
  isLoading: boolean;
  onCancel: () => void;
  onProceed: () => Promise<void>;
}
```

## 🎯 상태 관리

### PaymentModal 상태
```tsx
interface PaymentModalState {
  // UI 상태
  currentStep: 'region' | 'product' | 'payment' | 'processing' | 'success' | 'error';
  isLoading: boolean;
  error?: PaymentError;
  
  // 결제 정보
  selectedRegion: 'korea' | 'global';
  detectedRegion?: 'korea' | 'global';
  selectedProduct?: ProductType;
  selectedPaymentMethod?: PaymentMethod;
  priceBreakdown?: PriceBreakdown;
  
  // 결제 진행
  paymentSession?: PaymentSession;
  receipt?: PaymentReceipt;
}
```

## 🔧 기술 스택 및 구현 방향

### 사용할 기술
- **기존 Dialog 시스템**: `components/ui/Dialog` 확장
- **Tailwind CSS**: 기존 디자인 시스템 활용
- **Zustand**: 결제 상태 관리 (기존 store 패턴 따름)
- **React Hook Form**: 폼 validation
- **TypeScript**: 완전한 타입 안전성

### 파일 구조
```
components/client/vote/dialogs/payment/
├── PaymentModal.tsx              # 메인 모달 컴포넌트
├── RegionSelector.tsx            # 지역 선택
├── ProductSelector.tsx           # 상품 선택
├── PaymentMethodSelector.tsx     # 결제 수단 선택
├── PriceTable.tsx               # 요금표
├── PaymentActions.tsx           # 결제 버튼들
├── hooks/
│   ├── usePaymentModal.ts       # 결제 모달 로직
│   ├── useRegionDetection.ts    # IP 기반 지역 감지
│   └── usePaymentFlow.ts        # 결제 플로우 관리
├── types.ts                     # 결제 관련 타입 정의
└── index.ts                     # Export 정리
```

## 🌟 접근성 고려사항

- **키보드 네비게이션**: Tab, Enter, Escape 키 지원
- **스크린 리더**: ARIA 라벨 및 설명
- **포커스 관리**: 모달 열림/닫힘 시 포커스 이동
- **다국어 지원**: 한국어/영어 지원

## 📱 반응형 디자인

- **모바일**: 풀스크린 모달
- **태블릿**: 중간 크기 모달
- **데스크톱**: 고정 크기 모달

## 🎨 디자인 시스템 연동

- **색상**: 기존 Picnic 브랜드 컬러 활용
- **아이콘**: 기존 아이콘 시스템 활용
- **애니메이션**: 기존 Dialog 애니메이션 활용
- **그림자/테두리**: 기존 스타일 가이드 준수

## 🔒 보안 고려사항

- **민감 정보 암호화**: 결제 정보는 클라이언트에서 보관하지 않음
- **CSRF 보호**: 결제 요청 시 토큰 검증
- **입력 검증**: 모든 사용자 입력 검증
- **HTTPS 강제**: 결제 관련 모든 통신 암호화

## 📋 다음 단계

1. ✅ **디자인 목업 완료** (현재 단계)
2. 🔄 **컴포넌트 API 및 Props 정의**
3. 🔄 **기본 컴포넌트 구조 구현**
4. 🔄 **상태 관리 설정**
5. 🔄 **인터랙티브 기능 추가**
6. 🔄 **접근성 기능 구현**
7. 🔄 **단위 테스트 작성**
8. 🔄 **통합 테스트 수행**