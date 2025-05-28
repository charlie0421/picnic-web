import { ReactNode } from "react";

// 다이얼로그 타입
export type DialogType = "default" | "success" | "warning" | "error" | "info";

// 다이얼로그 크기
export type DialogSize = "xs" | "sm" | "md" | "lg" | "xl";

// 애니메이션 타입
export type AnimationType =
    | "scale"
    | "slide"
    | "fade"
    | "slideUp"
    | "slideDown"
    | "zoom";

// 버튼 변형
export type ButtonVariant =
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "error";

// 다이얼로그 테마 타입
export interface DialogTheme {
    backdrop: string;
    container: string;
    panel: {
        base: string;
        size: Record<string, string>;
        type: Record<string, string>;
    };
    header: string;
    title: string;
    description: string;
    content: string;
    footer: string;
    closeButton: string;
    actions: {
        container: string;
        button: {
            base: string;
            variant: Record<string, string>;
        };
    };
}

// 기본 다이얼로그 Props
export interface BaseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children?: ReactNode;
    size?: DialogSize;
    type?: DialogType;
    animation?: AnimationType;
    className?: string;
    overlayClassName?: string;
    contentClassName?: string;
    showCloseButton?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    preventBodyScroll?: boolean;
    autoFocus?: boolean;
    restoreFocus?: boolean;
    trapFocus?: boolean;
    role?: string;
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
}

// Dialog 컴포넌트 Props
export interface DialogProps extends BaseDialogProps {
    [key: string]: any; // 추가 HTML 속성들을 위한 인덱스 시그니처
}

// ActionDialog Props
export interface ActionDialogProps extends BaseDialogProps {
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: ButtonVariant;
    cancelVariant?: ButtonVariant;
    isLoading?: boolean;
    disabled?: boolean;
}

// ConfirmDialog Props
export interface ConfirmDialogProps extends BaseDialogProps {
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: ButtonVariant;
    cancelVariant?: ButtonVariant;
    isLoading?: boolean;
    disabled?: boolean;
}

// AlertDialog Props
export interface AlertDialogProps extends BaseDialogProps {
    onConfirm?: () => void;
    confirmText?: string;
    confirmVariant?: ButtonVariant;
}

// LoginRequiredDialog Props
export interface LoginRequiredDialogProps
    extends Omit<BaseDialogProps, "isOpen"> {
    isOpen?: boolean; // 선택적 속성으로 변경
    redirectUrl?: string;
    onLogin?: (redirectUrl?: string) => void;
    onCancel?: () => void;
    loginText?: string;
    cancelText?: string;
}

// DialogProvider Context 타입
export interface DialogContextType {
    showDialog: (props: DialogProps) => void;
    showActionDialog: (props: ActionDialogProps) => Promise<boolean>;
    showConfirmDialog: (props: ConfirmDialogProps) => Promise<boolean>;
    showAlertDialog: (props: AlertDialogProps) => Promise<void>;
    showLoginRequired: (
        props: Omit<LoginRequiredDialogProps, "isOpen" | "onClose">,
    ) => Promise<boolean>;
    closeDialog: () => void;
}

// 다이얼로그 상태
export interface DialogState {
    isOpen: boolean;
    type: "dialog" | "action" | "confirm" | "alert" | "loginRequired";
    props: any;
    resolve?: (value: any) => void;
}
