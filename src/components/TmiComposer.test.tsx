import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TmiComposer, type TmiComposerProps } from './TmiComposer';

const EXAMPLES = ['원정투수가 경기 전 짜장면 곱빼기를 먹었다', '오늘 기온 35도, 폭염'];

const props = (over: Partial<TmiComposerProps> = {}): TmiComposerProps => ({
  examples: EXAMPLES,
  disabled: false,
  locked: false,
  busy: false,
  count: 0,
  max: 3,
  notice: '',
  onSubmit: vi.fn(),
  ...over,
});

const input = () => screen.getByLabelText('TMI 한 줄');
const submitButton = () => screen.getByRole('button', { name: 'TMI 걸기' });

describe('TmiComposer', () => {
  it('label이 붙은 80자 입력과 글자 수를 보여준다', async () => {
    const user = userEvent.setup();
    render(<TmiComposer {...props()} />);
    expect(input()).toHaveAttribute('maxlength', '80');
    expect(input()).toHaveAttribute('id');
    expect(screen.getByText('80자 중 0자')).toBeInTheDocument();
    await user.type(input(), '오늘 폭염');
    expect(screen.getByText('80자 중 5자')).toBeInTheDocument();
  });

  it('예시 칩을 누르면 입력에 채우고 제출하지는 않는다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TmiComposer {...props({ onSubmit })} />);
    await user.click(screen.getByRole('button', { name: EXAMPLES[1] }));
    expect(input()).toHaveValue(EXAMPLES[1]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('빈 입력이면 "TMI 걸기"가 비활성이고, 쓰면 활성', async () => {
    const user = userEvent.setup();
    render(<TmiComposer {...props()} />);
    expect(submitButton()).toBeDisabled();
    await user.type(input(), '   ');
    expect(submitButton()).toBeDisabled();
    await user.type(input(), '폭염');
    expect(submitButton()).toBeEnabled();
  });

  it('제출하면 앞뒤 공백을 지운 문장을 넘기고 입력을 비운다 (Enter도 된다)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TmiComposer {...props({ onSubmit })} />);
    await user.type(input(), '  오늘 폭염  ');
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledWith('오늘 폭염');
    expect(input()).toHaveValue('');
    await user.type(input(), '관중 떼창{Enter}');
    expect(onSubmit).toHaveBeenLastCalledWith('관중 떼창');
    expect(input()).toHaveValue('');
  });

  it('busy면 버튼을 잠그고 "해석 중…"을 보여준다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TmiComposer {...props({ busy: true, onSubmit })} />);
    expect(screen.getByText('해석 중…')).toBeInTheDocument();
    await user.type(input(), '오늘 폭염{Enter}');
    expect(submitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('locked면 입력·예시·버튼을 잠그고 다시 하는 방법을 안내한다', () => {
    render(<TmiComposer {...props({ locked: true })} />);
    expect(screen.getByText('처음부터 다시 하면 TMI를 바꿀 수 있어요.')).toBeInTheDocument();
    expect(input()).toBeDisabled();
    expect(screen.getByRole('button', { name: EXAMPLES[0] })).toBeDisabled();
    expect(submitButton()).toBeDisabled();
  });

  it('disabled면 잠그고, count가 max면 더 걸 수 없다고 알린다', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TmiComposer {...props({ disabled: true })} />);
    expect(input()).toBeDisabled();
    unmount();

    render(<TmiComposer {...props({ count: 3, max: 3 })} />);
    await user.type(input(), '오늘 폭염');
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText('TMI는 3개까지 걸 수 있어요.')).toBeInTheDocument();
  });

  it('notice는 aria-live="polite" 줄에 보인다', () => {
    render(<TmiComposer {...props({ notice: 'AI 해석을 쓸 수 없어 규칙으로 계산했어요.' })} />);
    expect(screen.getByText('AI 해석을 쓸 수 없어 규칙으로 계산했어요.')).toHaveAttribute('aria-live', 'polite');
  });
});
