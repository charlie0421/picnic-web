import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** DES-003: 투표 다이얼로그는 대화상자로 알려지고, 포커스를 가두고, Esc 로 닫혀야 한다. */
vi.mock('@/components/client/vote/dialogs/useVoteDialog', () => ({
  useVoteDialog: () => ({
    voteAmount: 3, setVoteAmount: vi.fn(), useAllVotes: false, isVoting: false, voteError: null,
    showSuccess: false, userBalance: { total: 10 }, maxAmount: 10, isBalanceAboveMaxVoteAmount: false,
    lastUsage: null, isLoadingBalance: false, balanceError: null, imminentBonus: null, currentLanguage: 'ko',
    handleUseAllChange: vi.fn(), handleAmountChange: vi.fn(), handleInputChange: vi.fn(),
    handleVoteSubmit: vi.fn(), getLocale: () => 'ko-KR', mutateProfile: vi.fn(),
    t: (key: string) => key,
  }),
}));
vi.mock('@/components/client/vote/dialogs/VoteDialogOverlays', () => ({ VotingOverlay: () => null, SuccessOverlay: () => null }));
vi.mock('@/components/client/vote/dialogs/VoteBalanceDisplay', () => ({ VoteBalanceDisplay: () => null }));
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const passthrough = (tag: string) =>
    React.forwardRef(({ initial, animate, exit, transition, whileHover, whileTap, ...rest }: any, ref: any) =>
      React.createElement(tag, { ...rest, ref }),
    );
  return {
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: { div: passthrough('div'), button: passthrough('button') },
  };
});

import VoteDialog from '@/components/client/vote/dialogs/VoteDialog';

const onClose = vi.fn();
const renderDialog = () =>
  render(<VoteDialog isOpen onClose={onClose} voteId={1} voteItemId={2} artistName="아이유" />);

describe('VoteDialog — 접근성', () => {
  beforeEach(() => onClose.mockClear());

  it('아티스트 이름으로 라벨된 modal dialog 다', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: '아이유' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('열리면 수량 입력으로 포커스가 이동하고 입력은 라벨을 가진다', () => {
    renderDialog();
    const input = screen.getByRole('spinbutton', { name: 'vote_popup_vote_amount' });
    expect(input).toHaveFocus();
  });

  it('아이콘·글리프 버튼은 접근 가능한 이름을 가진다', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'dialog_button_close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'vote_popup_increase' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'vote_popup_decrease' })).toBeInTheDocument();
  });

  it('Esc 로 닫힌다', () => {
    renderDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab 포커스가 대화상자 안에서 순환한다', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
});
