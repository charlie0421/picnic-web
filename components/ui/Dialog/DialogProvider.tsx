'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  DialogContextType,
  DialogState,
  DialogProps,
  ActionDialogProps,
  ConfirmDialogProps,
  AlertDialogProps,
  LoginRequiredDialogProps,
} from './types';
import { Dialog } from './Dialog';
import { ActionDialog } from './ActionDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { AlertDialog } from './AlertDialog';
import { LoginRequiredDialog } from './LoginRequiredDialog';
import { useLanguageStore } from '@/stores/languageStore';

// 다이얼로그 컨텍스트 생성
const DialogContext = createContext<DialogContextType | null>(null);

// 고유 ID 생성 함수
let dialogIdCounter = 0;
const generateDialogId = () => `dialog-${++dialogIdCounter}`;

interface DialogProviderProps {
  children: ReactNode;
}

export function DialogProvider({ children }: DialogProviderProps) {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    type: 'dialog',
    props: {},
  });
  const { t } = useLanguageStore();

  const closeDialog = useCallback(() => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
    // 약간의 지연 후 상태 초기화 (애니메이션을 위해)
    setTimeout(() => {
      setDialogState({
        isOpen: false,
        type: 'dialog',
        props: {},
      });
    }, 200);
  }, []);

  const showDialog = useCallback(
    (props: DialogProps) => {
      setDialogState({
        isOpen: true,
        type: 'dialog',
        props: { ...props, isOpen: true, onClose: closeDialog },
      });
    },
    [closeDialog],
  );

  const showActionDialog = useCallback(
    (props: ActionDialogProps): Promise<boolean> => {
      return new Promise((resolve) => {
        const handleConfirm = async () => {
          try {
            if (props.onConfirm) {
              await props.onConfirm();
            }
            closeDialog();
            resolve(true);
          } catch (error) {
            console.error('Action dialog confirm failed:', error);
            resolve(false);
          }
        };

        const handleCancel = () => {
          if (props.onCancel) {
            props.onCancel();
          }
          closeDialog();
          resolve(false);
        };

        setDialogState({
          isOpen: true,
          type: 'action',
          props: {
            ...props,
            isOpen: true,
            onClose: closeDialog,
            onConfirm: handleConfirm,
            onCancel: handleCancel,
          },
          resolve,
        });
      });
    },
    [closeDialog],
  );

  const showConfirmDialog = useCallback(
    (props: ConfirmDialogProps): Promise<boolean> => {
      return new Promise((resolve) => {
        const handleConfirm = async () => {
          try {
            await props.onConfirm();
            closeDialog();
            resolve(true);
          } catch (error) {
            console.error('Confirm dialog failed:', error);
            resolve(false);
          }
        };

        const handleCancel = () => {
          if (props.onCancel) {
            props.onCancel();
          }
          closeDialog();
          resolve(false);
        };

        setDialogState({
          isOpen: true,
          type: 'confirm',
          props: {
            ...props,
            isOpen: true,
            onClose: closeDialog,
            onConfirm: handleConfirm,
            onCancel: handleCancel,
          },
          resolve,
        });
      });
    },
    [closeDialog],
  );

  const showAlertDialog = useCallback(
    (props: AlertDialogProps): Promise<void> => {
      return new Promise((resolve) => {
        const handleConfirm = () => {
          if (props.onConfirm) {
            props.onConfirm();
          }
          closeDialog();
          resolve();
        };

        setDialogState({
          isOpen: true,
          type: 'alert',
          props: {
            ...props,
            isOpen: true,
            onClose: closeDialog,
            onConfirm: handleConfirm,
          },
          resolve,
        });
      });
    },
    [closeDialog],
  );

  const showLoginRequired = useCallback(
    (
      props: Omit<LoginRequiredDialogProps, 'isOpen' | 'onClose'>,
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        const handleLogin = (redirectUrl?: string) => {
          if (props.onLogin) {
            props.onLogin(redirectUrl);
          }
          closeDialog();
          resolve(true);
        };

        const handleCancel = () => {
          if (props.onCancel) {
            props.onCancel();
          }
          closeDialog();
          resolve(false);
        };

        setDialogState({
          isOpen: true,
          type: 'loginRequired',
          props: {
            ...props,
            isOpen: true,
            onClose: closeDialog,
            onLogin: handleLogin,
            onCancel: handleCancel,
            // 다국어 기본값 설정
            title:
              props.title ||
              t('dialog.login_required.title') ||
              '로그인이 필요합니다',
            description:
              props.description ||
              t('dialog.login_required.description') ||
              '이 기능을 사용하려면 로그인이 필요합니다.',
          },
          resolve,
        });
      });
    },
    [closeDialog, t],
  );

  const contextValue: DialogContextType = {
    showDialog,
    showActionDialog,
    showConfirmDialog,
    showAlertDialog,
    showLoginRequired,
    closeDialog,
  };

  const renderDialog = () => {
    if (!dialogState.isOpen) return null;

    switch (dialogState.type) {
      case 'action':
        return <ActionDialog {...dialogState.props} />;
      case 'confirm':
        return <ConfirmDialog {...dialogState.props} />;
      case 'alert':
        return <AlertDialog {...dialogState.props} />;
      case 'loginRequired':
        return <LoginRequiredDialog {...dialogState.props} />;
      default:
        return <Dialog {...dialogState.props} />;
    }
  };

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {renderDialog()}
    </DialogContext.Provider>
  );
}

// 다이얼로그 컨텍스트 사용 훅
export function useDialog() {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }

  return context;
}

// 편의 훅들
export function useConfirm() {
  const { showConfirmDialog } = useDialog();
  return showConfirmDialog;
}

export function useAlert() {
  const { showAlertDialog } = useDialog();
  return showAlertDialog;
}

// 로그인 필요 다이얼로그 편의 훅
export function useLoginRequired() {
  const { showLoginRequired } = useDialog();
  return showLoginRequired;
}
