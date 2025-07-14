// 컴포넌트 exports
export { Dialog } from "./Dialog";
export { ActionDialog } from "./ActionDialog";
export { ConfirmDialog } from "./ConfirmDialog";
export { AlertDialog } from "./AlertDialog";
export { LoginRequiredDialog } from "./LoginRequiredDialog";
export { QueryTimeDialog } from "./QueryTimeDialog";
export type { QueryTimeDialogProps } from "./QueryTimeDialog";
export {
    DialogProvider,
    useAlert,
    useConfirm,
    useDialog,
    useLoginRequired,
} from "./DialogProvider";
export { DialogIcon } from "./DialogIcon";

// 타입 exports
export type {
    ActionDialogProps,
    AlertDialogProps,
    AnimationType,
    BaseDialogProps,
    ButtonVariant,
    ConfirmDialogProps,
    DialogSize,
    DialogTheme,
    DialogType,
    LoginRequiredDialogProps,
    TimeBasedDisplay,
    TimeStatus,
} from "./types";

// 테마 exports
export {
    animationClasses,
    defaultDialogTheme,
    dialogColors,
    dialogIcons,
} from "./theme";
