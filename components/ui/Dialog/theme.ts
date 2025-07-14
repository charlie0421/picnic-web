import { DialogTheme } from "./types";
import { AnimationType, DialogSize, DialogType } from "./types";

export const defaultDialogTheme: DialogTheme = {
    // 백드롭 스타일
    backdrop: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50",

    // 컨테이너 스타일 - 모바일에서 더 많은 여백 확보
    container: "fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-6 md:p-8",

    // 패널 스타일
    panel: {
        base:
            "relative bg-white dark:bg-gray-900 rounded-lg sm:rounded-xl md:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[85vh] sm:max-h-[90vh] md:max-h-[85vh] overflow-hidden w-full",

        // 크기별 스타일 - 모바일에서 더 작은 크기로 조정
        size: {
            xs: "max-w-[280px] sm:max-w-sm",
            sm: "max-w-[320px] sm:max-w-md",
            md: "max-w-[360px] sm:max-w-lg md:max-w-xl",
            lg: "max-w-[400px] sm:max-w-xl md:max-w-2xl",
            xl: "max-w-[480px] sm:max-w-2xl md:max-w-4xl",
            full: "max-w-[90vw] sm:max-w-6xl h-auto max-h-[85vh] sm:max-h-[90vh]",
        },

        // 타입별 스타일 (테두리 색상)
        type: {
            info: "border-l-4 border-l-blue-500",
            warning: "border-l-4 border-l-amber-500",
            error: "border-l-4 border-l-red-500",
            success: "border-l-4 border-l-green-500",
            confirmation: "border-l-4 border-l-purple-500",
        },
    },

    // 헤더 스타일 - 모바일에서 더 작은 패딩
    header: "flex items-start justify-between p-3 sm:p-6 pb-2 sm:pb-4",

    // 제목 스타일 - 모바일에서 더 작은 폰트
    title: "text-sm sm:text-lg md:text-xl font-semibold text-gray-900 dark:text-white pr-4 sm:pr-8",

    // 설명 스타일 - 모바일에서 더 작은 폰트
    description: "mt-1 sm:mt-2 text-xs sm:text-base text-gray-600 dark:text-gray-300",

    // 콘텐츠 스타일 - 모바일에서 더 작은 패딩
    content: "px-3 sm:px-6 py-1 sm:py-2 overflow-y-auto",

    // 푸터 스타일 - 모바일에서 더 작은 패딩
    footer:
        "flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 p-3 sm:p-6 pt-2 sm:pt-4 bg-gray-50 dark:bg-gray-800/50",

    // 닫기 버튼 스타일 - 모바일에서 더 작은 크기
    closeButton:
        "absolute top-2 right-2 sm:top-4 sm:right-4 inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors",

    // 액션 버튼 스타일 추가
    actions: {
        container: "flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto",
        button: {
            base: "w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
            variant: {
                primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
                secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500",
                danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
                success: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
                warning: "bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500",
            },
        },
    },
};

// 다이얼로그 타입별 아이콘 매핑
export const dialogIcons = {
    info: "info",
    warning: "alert-triangle",
    error: "alert-circle",
    success: "check-circle",
    confirmation: "help-circle",
} as const;

// 다이얼로그 타입별 색상 매핑
export const dialogColors = {
    info: {
        icon: "text-blue-500",
        background: "bg-blue-50 dark:bg-blue-900/20",
    },
    warning: {
        icon: "text-amber-500",
        background: "bg-amber-50 dark:bg-amber-900/20",
    },
    error: {
        icon: "text-red-500",
        background: "bg-red-50 dark:bg-red-900/20",
    },
    success: {
        icon: "text-green-500",
        background: "bg-green-50 dark:bg-green-900/20",
    },
    confirmation: {
        icon: "text-purple-500",
        background: "bg-purple-50 dark:bg-purple-900/20",
    },
} as const;

// 애니메이션 클래스 정의 - 모바일 최적화
export const animationClasses = {
    scale: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 scale-95",
        enterTo: "opacity-100 scale-100",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 scale-100",
        leaveTo: "opacity-0 scale-95",
    },
    slide: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95",
        enterTo: "opacity-100 translate-y-0 sm:scale-100",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 translate-y-0 sm:scale-100",
        leaveTo: "opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95",
    },
    fade: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0",
        enterTo: "opacity-100",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100",
        leaveTo: "opacity-0",
    },
    slideUp: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 translate-y-full sm:translate-y-8",
        enterTo: "opacity-100 translate-y-0",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 translate-y-0",
        leaveTo: "opacity-0 translate-y-full sm:translate-y-8",
    },
    slideDown: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 -translate-y-full sm:-translate-y-8",
        enterTo: "opacity-100 translate-y-0",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 translate-y-0",
        leaveTo: "opacity-0 -translate-y-full sm:-translate-y-8",
    },
    zoom: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 scale-50",
        enterTo: "opacity-100 scale-100",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 scale-100",
        leaveTo: "opacity-0 scale-50",
    },
    // 모바일 전용 bottom sheet 애니메이션 추가
    bottomSheet: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 translate-y-full",
        enterTo: "opacity-100 translate-y-0",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 translate-y-0",
        leaveTo: "opacity-0 translate-y-full",
    },
};

// 크기별 클래스 - 반응형 최적화
export const sizeClasses: Record<DialogSize, string> = {
    xs: "max-w-[280px] sm:max-w-sm",
    sm: "max-w-[320px] sm:max-w-md",
    md: "max-w-[360px] sm:max-w-lg md:max-w-xl",
    lg: "max-w-[400px] sm:max-w-xl md:max-w-2xl",
    xl: "max-w-[480px] sm:max-w-2xl md:max-w-4xl",
    full: "max-w-[90vw] sm:max-w-6xl h-auto max-h-[85vh] sm:max-h-[90vh]",
};

// 타입별 클래스
export const typeClasses: Record<DialogType, string> = {
    default: "border-gray-200",
    success: "border-green-200",
    warning: "border-yellow-200",
    error: "border-red-200",
    info: "border-blue-200",
};

// 기본 다이얼로그 테마 - 반응형 최적화
export const dialogTheme = {
    overlay: "fixed inset-0 bg-black/50 backdrop-blur-sm",
    content:
        "w-full transform overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl bg-white p-4 sm:p-6 text-left align-middle shadow-xl transition-all",
    closeButton:
        "absolute right-3 sm:right-4 top-3 sm:top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
};

// 다이얼로그 테마 생성 함수
export function getDialogTheme(
    size: DialogSize = "md",
    type: DialogType = "default",
    animation: AnimationType = "scale",
) {
    return {
        overlay: dialogTheme.overlay,
        content: `${dialogTheme.content} ${sizeClasses[size]} ${
            typeClasses[type]
        }`,
        closeButton: dialogTheme.closeButton,
        animation: animationClasses[animation],
    };
}

// 버튼 테마 - 반응형 최적화
export const buttonTheme = {
    base:
        "inline-flex items-center justify-center rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants: {
        primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
        secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500",
        success: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
        warning: "bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500",
        error: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
        ghost: "bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500",
    },
    sizes: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 py-2.5 sm:py-2",
        lg: "h-12 px-6 py-3",
    },
};

// 모바일 최적화된 다이얼로그 설정
export const mobileDialogConfig = {
    // 모바일에서 bottom sheet 스타일 적용 조건 강화
    shouldUseBottomSheet: (size: DialogSize) => {
        return size === 'full'; // xl 제거하여 더 보수적으로 적용
    },
    
    // 모바일 전용 클래스 - 더 작은 크기로 조정
    mobileClasses: {
        container: "fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4",
        panel: "w-full rounded-t-2xl sm:rounded-2xl max-h-[80vh] sm:max-h-[85vh]",
        content: "px-3 py-4 sm:px-6 sm:py-4",
        header: "px-3 py-3 sm:px-6 sm:py-6 border-b border-gray-200 sm:border-b-0",
        footer: "px-3 py-3 sm:px-6 sm:py-6 border-t border-gray-200 sm:border-t-0 bg-gray-50 sm:bg-transparent",
    },
    
    // 모바일에서 최대 크기 제한
    maxMobileSize: {
        width: '90vw',
        height: '85vh',
    },
};
