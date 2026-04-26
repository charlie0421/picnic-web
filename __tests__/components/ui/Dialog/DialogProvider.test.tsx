import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { DialogProvider, useDialog, useConfirm, useAlert, useLoginRequired, useWithdrawnUserDialog } from '@/components/ui/Dialog/DialogProvider';

// Mock dependencies
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => key,
    currentLanguage: 'ko',
    isHydrated: true,
  }),
}));

vi.mock('@/utils/auth-redirect', () => ({
  redirectToLogin: vi.fn(),
  saveRedirectUrl: vi.fn(),
}));

// Mock child dialog components to simplify testing the provider logic
vi.mock('@/components/ui/Dialog/Dialog', () => ({
  Dialog: ({ children, isOpen, title, description, ...rest }: any) =>
    isOpen ? (
      <div data-testid="dialog" data-title={title} data-description={description}>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/Dialog/ActionDialog', () => ({
  ActionDialog: ({ isOpen, onConfirm, onCancel, children, ...rest }: any) =>
    isOpen ? (
      <div data-testid="action-dialog">
        <button data-testid="action-confirm" onClick={onConfirm}>Confirm</button>
        {onCancel && <button data-testid="action-cancel" onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/Dialog/ConfirmDialog', () => ({
  ConfirmDialog: ({ isOpen, onConfirm, onCancel, ...rest }: any) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <button data-testid="confirm-confirm" onClick={onConfirm}>Confirm</button>
        {onCancel && <button data-testid="confirm-cancel" onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/Dialog/AlertDialog', () => ({
  AlertDialog: ({ isOpen, onConfirm, ...rest }: any) =>
    isOpen ? (
      <div data-testid="alert-dialog">
        <button data-testid="alert-confirm" onClick={onConfirm}>OK</button>
      </div>
    ) : null,
}));

vi.mock('@/components/ui/Dialog/LoginRequiredDialog', () => ({
  LoginRequiredDialog: ({ isOpen, onLogin, onCancel, ...rest }: any) =>
    isOpen !== false ? (
      <div data-testid="login-dialog">
        <button data-testid="login-login" onClick={() => onLogin?.()}>Login</button>
        {onCancel && <button data-testid="login-cancel" onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/Dialog/WithdrawnUserDialog', () => ({
  WithdrawnUserDialog: ({ isOpen, onClose, ...rest }: any) =>
    isOpen ? (
      <div data-testid="withdrawn-dialog">
        <button data-testid="withdrawn-close" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Helper to test hooks that require the provider
function TestConsumer() {
  const {
    showDialog,
    showActionDialog,
    showConfirmDialog,
    showAlertDialog,
    showLoginRequired,
    closeDialog,
  } = useDialog();

  return (
    <div>
      <button data-testid="open-dialog" onClick={() => showDialog({ title: 'Test' })}>
        Open Dialog
      </button>
      <button
        data-testid="open-action"
        onClick={async () => {
          const result = await showActionDialog({
            isOpen: true,
            onClose: () => {},
            title: 'Action',
            onConfirm: async () => {},
            onCancel: () => {},
          });
          // Store result for assertion
          document.getElementById('action-result')!.textContent = String(result);
        }}
      >
        Open Action
      </button>
      <button
        data-testid="open-confirm"
        onClick={async () => {
          const result = await showConfirmDialog({
            isOpen: true,
            onClose: () => {},
            title: 'Confirm',
            onConfirm: async () => {},
            onCancel: () => {},
          });
          document.getElementById('confirm-result')!.textContent = String(result);
        }}
      >
        Open Confirm
      </button>
      <button
        data-testid="open-alert"
        onClick={async () => {
          await showAlertDialog({
            isOpen: true,
            onClose: () => {},
            title: 'Alert',
            onConfirm: () => {},
          });
          document.getElementById('alert-result')!.textContent = 'resolved';
        }}
      >
        Open Alert
      </button>
      <button
        data-testid="open-login"
        onClick={async () => {
          const result = await showLoginRequired({ title: 'Login' });
          document.getElementById('login-result')!.textContent = String(result);
        }}
      >
        Open Login
      </button>
      <button data-testid="close-dialog" onClick={closeDialog}>
        Close
      </button>
      <span id="action-result" />
      <span id="confirm-result" />
      <span id="alert-result" />
      <span id="login-result" />
    </div>
  );
}

function WithdrawnTestConsumer() {
  const showWithdrawnUserDialog = useWithdrawnUserDialog();

  return (
    <button
      data-testid="open-withdrawn"
      onClick={async () => {
        await showWithdrawnUserDialog({ title: 'Withdrawn' });
        document.getElementById('withdrawn-result')!.textContent = 'resolved';
      }}
    >
      Open Withdrawn
      <span id="withdrawn-result" />
    </button>
  );
}

describe('DialogProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(
      <DialogProvider>
        <div data-testid="child">Hello</div>
      </DialogProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('showDialog opens a generic dialog', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-dialog'));
    });

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('closeDialog closes the dialog and resets state after timeout', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-dialog'));
    });

    expect(screen.getByTestId('dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('close-dialog'));
    });

    // After close, dialog should disappear
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

    // Wait for setTimeout(200) to reset state
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
  });

  it('showActionDialog shows action dialog and resolves true on confirm', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-action'));
    });

    expect(screen.getByTestId('action-dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('action-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('action-result')!.textContent).toBe('true');
  });

  it('showActionDialog resolves false on cancel', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-action'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('action-cancel'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('action-result')!.textContent).toBe('false');
  });

  it('showConfirmDialog resolves true on confirm', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-confirm'));
    });

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('confirm-result')!.textContent).toBe('true');
  });

  it('showConfirmDialog resolves false on cancel', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-confirm'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-cancel'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('confirm-result')!.textContent).toBe('false');
  });

  it('showAlertDialog resolves after confirm', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-alert'));
    });

    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('alert-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('alert-result')!.textContent).toBe('resolved');
  });

  it('showLoginRequired resolves true on login', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-login'));
    });

    expect(screen.getByTestId('login-dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-login'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('login-result')!.textContent).toBe('true');
  });

  it('showLoginRequired resolves false on cancel', async () => {
    render(
      <DialogProvider>
        <TestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-login'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-cancel'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('login-result')!.textContent).toBe('false');
  });

  it('showWithdrawnUserDialog resolves after close', async () => {
    render(
      <DialogProvider>
        <WithdrawnTestConsumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-withdrawn'));
    });

    expect(screen.getByTestId('withdrawn-dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('withdrawn-close'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('withdrawn-result')!.textContent).toBe('resolved');
  });
});

describe('useDialog outside provider', () => {
  it('throws error when used outside DialogProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BadConsumer() {
      useDialog();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useDialog must be used within a DialogProvider',
    );

    spy.mockRestore();
  });
});

describe('useWithdrawnUserDialog outside provider', () => {
  it('throws error when used outside DialogProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BadConsumer() {
      useWithdrawnUserDialog();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useWithdrawnUserDialog must be used within a DialogProvider',
    );

    spy.mockRestore();
  });
});

describe('convenience hooks', () => {
  it('useConfirm returns showConfirmDialog', () => {
    let hookResult: any;

    function Consumer() {
      hookResult = useConfirm();
      return null;
    }

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    expect(typeof hookResult).toBe('function');
  });

  it('useAlert returns showAlertDialog', () => {
    let hookResult: any;

    function Consumer() {
      hookResult = useAlert();
      return null;
    }

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    expect(typeof hookResult).toBe('function');
  });

  it('useLoginRequired returns showLoginRequired', () => {
    let hookResult: any;

    function Consumer() {
      hookResult = useLoginRequired();
      return null;
    }

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    expect(typeof hookResult).toBe('function');
  });
});

describe('DialogProvider showLoginRequired with custom title/description', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses provided title and description over translations', async () => {
    function Consumer() {
      const { showLoginRequired } = useDialog();
      return (
        <button
          data-testid="open"
          onClick={() => showLoginRequired({ title: 'Custom Title', description: 'Custom Desc' })}
        >
          Open
        </button>
      );
    }

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open'));
    });

    expect(screen.getByTestId('login-dialog')).toBeInTheDocument();
  });

  it('falls back to translation keys when title/description not provided', async () => {
    function Consumer() {
      const { showLoginRequired } = useDialog();
      return (
        <button data-testid="open" onClick={() => showLoginRequired({})}>
          Open
        </button>
      );
    }

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open'));
    });

    expect(screen.getByTestId('login-dialog')).toBeInTheDocument();
  });
});

describe('DialogProvider showActionDialog error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves false when onConfirm throws', async () => {
    function Consumer() {
      const { showActionDialog } = useDialog();
      return (
        <button
          data-testid="open"
          onClick={async () => {
            const result = await showActionDialog({
              isOpen: true,
              onClose: () => {},
              title: 'Fail',
              onConfirm: async () => {
                throw new Error('fail');
              },
            });
            document.getElementById('result')!.textContent = String(result);
          }}
        >
          Open
          <span id="result" />
        </button>
      );
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('action-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('result')!.textContent).toBe('false');
    spy.mockRestore();
  });
});

describe('DialogProvider showConfirmDialog error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves false when onConfirm throws', async () => {
    function Consumer() {
      const { showConfirmDialog } = useDialog();
      return (
        <button
          data-testid="open"
          onClick={async () => {
            const result = await showConfirmDialog({
              isOpen: true,
              onClose: () => {},
              title: 'Fail',
              onConfirm: async () => {
                throw new Error('fail');
              },
            });
            document.getElementById('result2')!.textContent = String(result);
          }}
        >
          Open
          <span id="result2" />
        </button>
      );
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('result2')!.textContent).toBe('false');
    spy.mockRestore();
  });
});

describe('DialogProvider showAlertDialog without onConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves even when onConfirm is undefined', async () => {
    function Consumer() {
      const { showAlertDialog } = useDialog();
      return (
        <button
          data-testid="open"
          onClick={async () => {
            await showAlertDialog({
              isOpen: true,
              onClose: () => {},
              title: 'Alert no confirm',
            });
            document.getElementById('result3')!.textContent = 'done';
          }}
        >
          Open
          <span id="result3" />
        </button>
      );
    }

    render(
      <DialogProvider>
        <Consumer />
      </DialogProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('open'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('alert-confirm'));
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(document.getElementById('result3')!.textContent).toBe('done');
  });
});
