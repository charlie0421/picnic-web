import { DialogTheme } from "./types";
import { AnimationType, DialogSize, DialogType } from "./types";

export const defaultDialogTheme: DialogTheme = {
    // 백드롭 스타일
    backdrop: "fixed inset-0 bg-black/50 backdrop-blur-sm z-50",

    // 컨테이너 스타일
    container: "fixed inset-0 z-50 flex items-center justify-center p-4",

    // 패널 스타일
    panel: {
        base:
            "relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-hidden",

        // 크기별 스타일
        size: {
            sm: "w-full max-w-sm",
            md: "w-full max-w-md",
            lg: "w-full max-w-lg",
            xl: "w-full max-w-2xl",
            full: "w-full max-w-6xl h-full max-h-[90vh]",
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

    // 헤더 스타일
    header: "flex items-start justify-between p-6 pb-4",

    // 제목 스타일
    title: "text-lg font-semibold text-gray-900 dark:text-white pr-8",

    // 설명 스타일
    description: "mt-2 text-sm text-gray-600 dark:text-gray-300",

    // 콘텐츠 스타일
    content: "px-6 py-2 overflow-y-auto",

    // 푸터 스타일
    footer:
        "flex items-center justify-end gap-3 p-6 pt-4 bg-gray-50 dark:bg-gray-800/50",

    // 닫기 버튼 스타일
    closeButton:
        "absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",

    // 액션 버튼 스타일
    actions: {
        container: "flex items-center justify-end gap-3",
        button: {
            base:
                "inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
            variant: {
                primary:
                    "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 shadow-sm",
                secondary:
                    "bg-gray-200 hover:bg-gray-300 text-gray-900 focus:ring-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white",
                danger:
                    "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-sm",
                ghost:
                    "text-gray-700 hover:bg-gray-100 focus:ring-gray-500 dark:text-gray-300 dark:hover:bg-gray-800",
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

// 애니메이션 클래스 정의
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
        enterFrom: "opacity-0 translate-y-full",
        enterTo: "opacity-100 translate-y-0",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 translate-y-0",
        leaveTo: "opacity-0 translate-y-full",
    },
    slideDown: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 -translate-y-full",
        enterTo: "opacity-100 translate-y-0",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 translate-y-0",
        leaveTo: "opacity-0 -translate-y-full",
    },
    zoom: {
        enter: "ease-out duration-300",
        enterFrom: "opacity-0 scale-50",
        enterTo: "opacity-100 scale-100",
        leave: "ease-in duration-200",
        leaveFrom: "opacity-100 scale-100",
        leaveTo: "opacity-0 scale-50",
    },
};

// 크기별 클래스
export const sizeClasses: Record<DialogSize, string> = {
    xs: "max-w-xs",
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
};

// 타입별 클래스
export const typeClasses: Record<DialogType, string> = {
    default: "border-gray-200",
    success: "border-green-200",
    warning: "border-yellow-200",
    error: "border-red-200",
    info: "border-blue-200",
};

// 기본 다이얼로그 테마
export const dialogTheme = {
    overlay: "fixed inset-0 bg-black/50 backdrop-blur-sm",
    content:
        "w-full transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all",
    closeButton:
        "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
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

// 버튼 테마
export const buttonTheme = {
    base:
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
            "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        success: "bg-green-600 text-white hover:bg-green-700",
        warning: "bg-yellow-600 text-white hover:bg-yellow-700",
        error: "bg-red-600 text-white hover:bg-red-700",
    },
    sizes: {
        sm: "h-9 px-3",
        md: "h-10 px-4 py-2",
        lg: "h-11 px-8",
    },
};
