'use client';

import React, { Fragment, useEffect, useRef, useCallback } from 'react';
import { Dialog as HeadlessDialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';
import { DialogProps } from './types';
import { getDialogTheme } from './theme';
import { cn } from '@/lib/utils';

// 서브 컴포넌트들 먼저 정의
const DialogHeader = React.memo<React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }) => (
    <div className={cn('mb-4', className)} {...props}>
      {children}
    </div>
  ),
);
DialogHeader.displayName = 'Dialog.Header';

const DialogTitle = React.memo<React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }) => (
    <HeadlessDialog.Title
      as='h3'
      className={cn('text-lg font-semibold leading-6 text-gray-900', className)}
      {...props}
    >
      {children}
    </HeadlessDialog.Title>
  ),
);
DialogTitle.displayName = 'Dialog.Title';

const DialogDescription = React.memo<
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }) => (
  <HeadlessDialog.Description
    className={cn('mt-2 text-sm text-gray-600', className)}
    {...props}
  >
    {children}
  </HeadlessDialog.Description>
));
DialogDescription.displayName = 'Dialog.Description';

const DialogContent = React.memo<React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }) => (
    <div className={cn('mt-4', className)} {...props}>
      {children}
    </div>
  ),
);
DialogContent.displayName = 'Dialog.Content';

const DialogFooter = React.memo<React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }) => (
    <div
      className={cn('mt-6 flex justify-end space-x-3', className)}
      {...props}
    >
      {children}
    </div>
  ),
);
DialogFooter.displayName = 'Dialog.Footer';

// Dialog 컴포넌트 타입 정의
interface DialogComponent
  extends React.MemoExoticComponent<React.FC<DialogProps>> {
  Header: typeof DialogHeader;
  Title: typeof DialogTitle;
  Description: typeof DialogDescription;
  Content: typeof DialogContent;
  Footer: typeof DialogFooter;
}

const DialogBase = React.memo<DialogProps>(
  ({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = 'md',
    type = 'default',
    animation = 'scale',
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    className,
    overlayClassName,
    contentClassName,
    preventBodyScroll = true,
    autoFocus = true,
    restoreFocus = true,
    trapFocus = true,
    role = 'dialog',
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    ...props
  }) => {
    const theme = getDialogTheme(size, type, animation);
    const initialFocusRef = useRef<HTMLButtonElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // 포커스 관리
    useEffect(() => {
      if (isOpen && restoreFocus) {
        previousActiveElement.current = document.activeElement as HTMLElement;
      }

      return () => {
        if (!isOpen && restoreFocus && previousActiveElement.current) {
          // 다이얼로그가 닫힐 때 이전 포커스 복원
          setTimeout(() => {
            previousActiveElement.current?.focus();
          }, 0);
        }
      };
    }, [isOpen, restoreFocus]);

    // 바디 스크롤 방지
    useEffect(() => {
      if (!preventBodyScroll) return;

      if (isOpen) {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = 'hidden';

        return () => {
          document.body.style.overflow = originalStyle;
        };
      }
    }, [isOpen, preventBodyScroll]);

    // ESC 키 처리 최적화
    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (event.key === 'Escape' && closeOnEscape && isOpen) {
          event.preventDefault();
          onClose();
        }
      },
      [closeOnEscape, isOpen, onClose],
    );

    useEffect(() => {
      if (isOpen) {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
      }
    }, [isOpen, handleKeyDown]);

    // 오버레이 클릭 처리 최적화
    const handleOverlayClick = useCallback(
      (event: React.MouseEvent) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
          onClose();
        }
      },
      [closeOnOverlayClick, onClose],
    );

    // 닫기 버튼 클릭 처리
    const handleCloseClick = useCallback(() => {
      onClose();
    }, [onClose]);

    // 다이얼로그가 열리지 않았으면 렌더링하지 않음
    if (!isOpen) {
      return null;
    }

    return (
      <Transition appear show={isOpen} as={Fragment}>
        <HeadlessDialog
          as='div'
          className='relative z-50'
          onClose={onClose}
          initialFocus={autoFocus ? initialFocusRef : undefined}
          {...props}
        >
          {/* 오버레이 */}
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in duration-200'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div
              className={cn(theme.overlay, overlayClassName)}
              onClick={handleOverlayClick}
              aria-hidden='true'
            />
          </Transition.Child>

          {/* 다이얼로그 컨테이너 */}
          <div className='fixed inset-0 overflow-y-auto'>
            <div className='flex min-h-full items-center justify-center p-4 text-center'>
              <Transition.Child
                as={Fragment}
                enter={theme.animation.enter}
                enterFrom={theme.animation.enterFrom}
                enterTo={theme.animation.enterTo}
                leave={theme.animation.leave}
                leaveFrom={theme.animation.leaveFrom}
                leaveTo={theme.animation.leaveTo}
              >
                <HeadlessDialog.Panel
                  className={cn(theme.content, contentClassName, className)}
                  role={role}
                  aria-labelledby={
                    ariaLabelledBy || (title ? 'dialog-title' : undefined)
                  }
                  aria-describedby={
                    ariaDescribedBy ||
                    (description ? 'dialog-description' : undefined)
                  }
                  aria-modal='true'
                >
                  {/* 헤더 */}
                  {(title || showCloseButton) && (
                    <DialogHeader className='flex items-center justify-between'>
                      {title && (
                        <DialogTitle id='dialog-title'>{title}</DialogTitle>
                      )}
                      {showCloseButton && (
                        <button
                          ref={initialFocusRef}
                          type='button'
                          className={theme.closeButton}
                          onClick={handleCloseClick}
                          aria-label='다이얼로그 닫기'
                        >
                          <X className='h-4 w-4' aria-hidden='true' />
                        </button>
                      )}
                    </DialogHeader>
                  )}

                  {/* 설명 */}
                  {description && (
                    <DialogDescription id='dialog-description'>
                      {description}
                    </DialogDescription>
                  )}

                  {/* 콘텐츠 */}
                  <DialogContent>{children}</DialogContent>
                </HeadlessDialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </HeadlessDialog>
      </Transition>
    );
  },
);

DialogBase.displayName = 'Dialog';

// 서브 컴포넌트들을 Dialog에 첨부
const Dialog = DialogBase as DialogComponent;
Dialog.Header = DialogHeader;
Dialog.Title = DialogTitle;
Dialog.Description = DialogDescription;
Dialog.Content = DialogContent;
Dialog.Footer = DialogFooter;

export { Dialog };
