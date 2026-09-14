import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';
import styles from './Tabs.module.css';

type Tier = 'pa' | 'inning' | 'game';
const ITEMS = [
  { id: 'pa', label: '타석' },
  { id: 'inning', label: '이닝' },
  { id: 'game', label: '경기' },
] as const satisfies readonly { id: Tier; label: string }[];

function Controlled({ onChange, initial = 'game' }: { onChange: (id: Tier) => void; initial?: Tier }) {
  const [value, setValue] = useState<Tier>(initial);
  return (
    <Tabs
      label="승률 단계"
      items={ITEMS}
      value={value}
      onChange={(id) => {
        onChange(id);
        setValue(id);
      }}
    />
  );
}

const selected = () => screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected'));

describe('Tabs', () => {
  it('이름 붙은 tablist 안에 tab 버튼을 두고, 선택된 탭만 aria-selected·탭 순서에 넣는다', () => {
    render(<Tabs label="승률 단계" items={ITEMS} value="game" onChange={vi.fn()} />);
    const list = screen.getByRole('tablist', { name: '승률 단계' });
    expect(list).toHaveClass(styles.list);
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['타석', '이닝', '경기']);
    expect(selected()).toEqual(['false', 'false', 'true']);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
    expect(tabs.every((tab) => tab.getAttribute('type') === 'button' && tab.classList.contains(styles.tab))).toBe(true);
  });

  it('탭을 누르면 onChange(id), 이미 선택된 탭을 누르면 부르지 않는다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: '경기' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: '타석' }));
    expect(onChange).toHaveBeenCalledWith('pa');
    expect(selected()).toEqual(['true', 'false', 'false']);
  });

  it('좌우 화살표로 선택을 옮기고(끝에서 반대쪽으로 돈다) 포커스가 따라간다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    screen.getByRole('tab', { name: '경기' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('pa');
    expect(selected()).toEqual(['true', 'false', 'false']);
    expect(screen.getByRole('tab', { name: '타석' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('game');
    expect(screen.getByRole('tab', { name: '경기' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('inning');
    expect(selected()).toEqual(['false', 'true', 'false']);
  });

  it('Home·End는 처음·마지막 탭으로 간다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} initial="inning" />);
    screen.getByRole('tab', { name: '이닝' }).focus();
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('pa');
    expect(screen.getByRole('tab', { name: '타석' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('game');
    expect(screen.getByRole('tab', { name: '경기' })).toHaveFocus();
  });
});
