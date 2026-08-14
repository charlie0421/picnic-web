import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockProfile: { value: Record<string, unknown> | null } = { value: null };

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        label_tabbar_vote_active: '진행중',
        label_tabbar_vote_end: '종료됨',
        label_tabbar_vote_upcoming: '예정됨',
      };
      return map[key] || key;
    },
    currentLanguage: 'ko',
  }),
}));

vi.mock('@/hooks/useTranslationReady', () => ({
  useTranslationReady: () => true,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userProfile: mockProfile.value }),
}));

import VoteStatusFilter from '@/components/client/vote/list/VoteStatusFilter';

/**
 * 앱 `vote_list_page.dart` 의 `_buildStatusDropdown` · `_statusColor` 와 웹을
 * 같은 계약으로 묶는다. 색 값의 출처는 `picnic_lib/lib/ui/style.dart` 와
 * `picnic_app/config/prod.json` 이다.
 */
describe('VoteStatusFilter — 앱 동기화', () => {
  beforeEach(() => {
    mockProfile.value = null;
  });

  const openMenu = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { expanded: false }));
    return user;
  };

  it('비관리자에게는 진행중·종료·예정 3개만 앱 순서로 보인다', async () => {
    render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
    await openMenu();

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['진행중', '종료됨', '예정됨']);
  });

  it('관리자에게는 (Admin) 이 마지막에 추가된다', async () => {
    mockProfile.value = { is_admin: true };
    render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
    await openMenu();

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '진행중',
      '종료됨',
      '예정됨',
      '(Admin)',
    ]);
  });

  it('super-admin 도 (Admin) 을 볼 수 있다', async () => {
    mockProfile.value = { is_admin: false, is_super_admin: true };
    render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
    await openMenu();

    expect(screen.getByRole('option', { name: '(Admin)' })).toBeInTheDocument();
  });

  it('상태 점 색이 앱 값과 정확히 같다', async () => {
    mockProfile.value = { is_admin: true };
    render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
    await openMenu();

    // 앱: secondary500(#83FBC8) / grey400(#A6A8AF) / #FFB020 / statusError(#FF4242)
    const expected = [
      'rgb(131, 251, 200)',
      'rgb(166, 168, 175)',
      'rgb(255, 176, 32)',
      'rgb(255, 66, 66)',
    ];

    screen.getAllByRole('option').forEach((option, index) => {
      const dot = option.querySelector('span[aria-hidden="true"]') as HTMLElement;
      expect(dot).toBeTruthy();
      expect(dot.style.backgroundColor).toBe(expected[index]);
    });
  });

  it('선택하면 해당 상태로 변경을 알린다', async () => {
    const onStatusChange = vi.fn();
    render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={onStatusChange} />);
    const user = await openMenu();

    await user.click(screen.getByRole('option', { name: '예정됨' }));
    expect(onStatusChange).toHaveBeenCalledWith('upcoming');
  });

  it('비관리자는 admin 항목이 아예 없다 — URL 로 admin 을 넣어도 노출되지 않는다', async () => {
    render(<VoteStatusFilter selectedStatus='admin' onStatusChange={vi.fn()} />);
    await openMenu();

    expect(screen.queryByRole('option', { name: '(Admin)' })).not.toBeInTheDocument();
  });

  it('프로필 로딩 중(userProfile=null)에 상태를 강제로 되돌리지 않는다', () => {
    // 지연 로드된 프로필 때문에 정상 관리자가 강등되면 안 된다.
    const onStatusChange = vi.fn();
    render(<VoteStatusFilter selectedStatus='admin' onStatusChange={onStatusChange} />);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  describe('listbox 키보드 계약', () => {
    it('열면 포커스가 선택된 option 으로 들어간다', async () => {
      render(<VoteStatusFilter selectedStatus='upcoming' onStatusChange={vi.fn()} />);
      await openMenu();

      expect(screen.getByRole('option', { name: '예정됨' })).toHaveFocus();
    });

    it('ArrowDown / ArrowUp 으로 option 사이를 이동한다', async () => {
      render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
      const user = await openMenu();

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('option', { name: '종료됨' })).toHaveFocus();

      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('option', { name: '진행중' })).toHaveFocus();
    });

    it('ArrowUp 은 첫 항목에서 마지막으로 순환한다', async () => {
      render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
      const user = await openMenu();

      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('option', { name: '예정됨' })).toHaveFocus();
    });

    it('Home / End 로 처음·끝으로 이동한다', async () => {
      render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
      const user = await openMenu();

      await user.keyboard('{End}');
      expect(screen.getByRole('option', { name: '예정됨' })).toHaveFocus();

      await user.keyboard('{Home}');
      expect(screen.getByRole('option', { name: '진행중' })).toHaveFocus();
    });

    it('Escape 로 닫고 포커스를 트리거로 되돌린다', async () => {
      render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);
      const user = await openMenu();

      await user.keyboard('{Escape}');
      const trigger = screen.getByRole('button', { expanded: false });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('트리거에서 ArrowDown 으로도 열린다', async () => {
      const user = userEvent.setup();
      render(<VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />);

      screen.getByRole('button', { expanded: false }).focus();
      await user.keyboard('{ArrowDown}');

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  it('열려 있는 목록 밖을 클릭하면 닫힌다', async () => {
    render(
      <div>
        <VoteStatusFilter selectedStatus='ongoing' onStatusChange={vi.fn()} />
        <button type='button'>바깥</button>
      </div>,
    );
    const user = await openMenu();

    await user.click(screen.getByRole('button', { name: '바깥' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('area 칩은 tablist 가 아니라 aria-pressed 버튼이다', async () => {
    // 연결된 tabpanel 도 화살표 이동 계약도 없으므로 tab 의미를 쓰지 않는다.
    const VoteAreaFilter = (await import('@/components/client/vote/list/VoteAreaFilter')).default;
    render(<VoteAreaFilter selectedArea='kpop' onAreaChange={vi.fn()} />);

    const group = screen.getByRole('group', { name: 'Vote type' });
    expect(within(group).queryAllByRole('tab')).toHaveLength(0);

    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'ALL',
      'PICNIC',
      'PIC CHART',
      'MUSICAL',
      'SPOTLIGHT',
    ]);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
  });
});
