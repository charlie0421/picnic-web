import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock @headlessui/react with minimal implementations
vi.mock('@headlessui/react', () => {
  const Fragment = ({ children }: { children: React.ReactNode }) => <>{children}</>
  return {
    Dialog: Object.assign(
      ({ children, onClose, className }: { children: React.ReactNode; onClose: () => void; className?: string }) => (
        <div role="dialog" className={className} data-testid="headless-dialog">
          {children}
        </div>
      ),
      {
        Title: ({ children, className, ...props }: { children: React.ReactNode; className?: string; as?: string; [key: string]: unknown }) => (
          <h3 className={className} {...props}>{children}</h3>
        ),
        Description: ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: unknown }) => (
          <p className={className} {...props}>{children}</p>
        ),
        Panel: ({ children, className, ...props }: { children: React.ReactNode; className?: string; role?: string; [key: string]: unknown }) => (
          <div className={className} {...props}>{children}</div>
        ),
      },
    ),
    Transition: Object.assign(
      ({ children, show }: { children: React.ReactNode; show?: boolean; appear?: boolean; as?: unknown }) => (
        show !== false ? <>{children}</> : null
      ),
      {
        Child: ({ children }: { children: React.ReactNode; as?: unknown; enter?: string; enterFrom?: string; enterTo?: string; leave?: string; leaveFrom?: string; leaveTo?: string }) => <>{children}</>,
      },
    ),
  }
})

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <span data-testid="close-icon" {...props} />,
}))

// Mock Dialog theme
vi.mock('@/components/ui/Dialog/theme', () => ({
  getDialogTheme: () => ({
    backdrop: 'backdrop-class',
    container: 'container-class',
    content: 'content-class',
    closeButton: 'close-button-class',
    animation: {
      enter: '',
      enterFrom: '',
      enterTo: '',
      leave: '',
      leaveFrom: '',
      leaveTo: '',
    },
  }),
  mobileDialogConfig: {
    shouldUseBottomSheet: () => false,
    mobileClasses: {
      container: '',
      panel: '',
      header: '',
      content: '',
    },
  },
  buttonTheme: {
    base: 'btn-base',
    sizes: { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' },
    variants: {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      success: 'btn-success',
      warning: 'btn-warning',
      error: 'btn-error',
    },
  },
}))

// Mock languageStore
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'dialog.alert.confirm_button': '확인',
        'dialog.confirm.confirm_button': '확인',
        'dialog.confirm.cancel_button': '취소',
        'dialog.confirm.loading': '처리 중...',
      }
      return translations[key] || key
    },
  }),
}))

import { Dialog } from '@/components/ui/Dialog/Dialog'
import { AlertDialog } from '@/components/ui/Dialog/AlertDialog'
import { ConfirmDialog } from '@/components/ui/Dialog/ConfirmDialog'

describe('Dialog', () => {
  it('renders when isOpen is true', () => {
    render(
      <Dialog isOpen={true} onClose={vi.fn()} title="Test Dialog">
        <p>Dialog content</p>
      </Dialog>
    )
    expect(screen.getByText('Test Dialog')).toBeInTheDocument()
    expect(screen.getByText('Dialog content')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(
      <Dialog isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>Hidden content</p>
      </Dialog>
    )
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('shows close button by default', () => {
    render(
      <Dialog isOpen={true} onClose={vi.fn()} title="With Close">
        Content
      </Dialog>
    )
    expect(screen.getByLabelText('다이얼로그 닫기')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <Dialog isOpen={true} onClose={onClose} title="Close Test">
        Content
      </Dialog>
    )
    fireEvent.click(screen.getByLabelText('다이얼로그 닫기'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders description when provided', () => {
    render(
      <Dialog isOpen={true} onClose={vi.fn()} description="A description">
        Content
      </Dialog>
    )
    expect(screen.getByText('A description')).toBeInTheDocument()
  })

  it('hides close button when showCloseButton is false', () => {
    render(
      <Dialog isOpen={true} onClose={vi.fn()} showCloseButton={false}>
        Content
      </Dialog>
    )
    expect(screen.queryByLabelText('다이얼로그 닫기')).not.toBeInTheDocument()
  })
})

describe('AlertDialog', () => {
  it('renders with confirm button', () => {
    render(
      <AlertDialog isOpen={true} onClose={vi.fn()} title="Alert" description="Alert message" />
    )
    expect(screen.getByText('Alert')).toBeInTheDocument()
    expect(screen.getByText('Alert message')).toBeInTheDocument()
    expect(screen.getByText('확인')).toBeInTheDocument()
  })

  it('calls onConfirm and onClose when confirm is clicked', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <AlertDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Alert"
      />
    )
    fireEvent.click(screen.getByText('확인'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders custom confirm text', () => {
    render(
      <AlertDialog isOpen={true} onClose={vi.fn()} confirmText="OK" />
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('renders confirm and cancel buttons', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Confirm Action"
      />
    )
    expect(screen.getByText('Confirm Action')).toBeInTheDocument()
    expect(screen.getByText('확인')).toBeInTheDocument()
    expect(screen.getByText('취소')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('확인'))
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
  })

  it('calls onCancel and onClose when cancel button is clicked', () => {
    const onCancel = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('취소'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders custom button text', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        confirmText="Yes"
        cancelText="No"
      />
    )
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('disables buttons when disabled is true', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        disabled={true}
      />
    )
    const buttons = screen.getAllByRole('button')
    // The confirm button should be disabled
    const confirmBtn = screen.getByText('확인')
    expect(confirmBtn).toBeDisabled()
  })
})
