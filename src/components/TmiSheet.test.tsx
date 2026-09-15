import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TmiEntry } from '../types/domain';
import { TmiSheet, type TmiSheetProps } from './TmiSheet';

const entry = (id: string, text: string): TmiEntry => ({
  id,
  text,
  interpretation: {
    source: 'rules',
    refused: false,
    reason: '',
    comment: '',
    parts: [{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '' }],
  },
});

function props(over: Partial<TmiSheetProps> = {}): TmiSheetProps {
  return {
    open: true,
    onClose: vi.fn(),
    odds: { label: 'KT 승리확률', base: 0.543, value: 0.547, hasTmi: true },
    tmis: [entry('tmi-1', '박투수가 짜장면 곱빼기를 먹었다')],
    verdicts: {},
    judgingId: null,
    canEdit: true,
    busy: false,
    max: 3,
    notice: '',
    examples: ['오늘 기온 35도, 폭염', '원정팀이 버스로 5시간 이동했다'],
    names: { batter: '김타자', pitcher: '박투수', battingTeam: 'KT', fieldingTeam: 'NC' },
    onSubmit: vi.fn(),
    onRemove: vi.fn(),
    onJudge: vi.fn(),
    ...over,
  };
}

describe('TmiSheet', () => {
  it('시트 위 승률 한 줄(전 → 후, 변화)·걸린 TMI 카드(선수 이름)·입력 줄·예시 (시안 TMI 카드)', () => {
    render(<TmiSheet {...props()} />);
    const dialog = screen.getByRole('dialog', { name: 'TMI 걸기' });
    expect(within(dialog).getByText('KT 승리확률')).toBeInTheDocument();
    // 화살표는 흐린 글자(<i>)라 텍스트 조각이 나뉜다
    expect(within(dialog).getByText((_, el) => el?.tagName === 'B' && el.textContent === '54.3% → 54.7%')).toBeInTheDocument();
    expect(within(dialog).getByText('+0.40%p')).toHaveAttribute('data-trend', 'up');
    const card = within(dialog).getByRole('article', { name: 'TMI 박투수가 짜장면 곱빼기를 먹었다' });
    expect(within(card).getByText('투수 체력')).toBeInTheDocument();
    expect(within(card).getByText('박투수 · 경기 내내')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('TMI 한 줄')).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: '오늘 기온 35도, 폭염' })).toBeInTheDocument();
  });

  it('TMI가 없으면 승률 한 줄에 지금 값만, 계산 전이면 계산 중', () => {
    const { rerender } = render(<TmiSheet {...props({ tmis: [], odds: { label: 'KT 승리확률', base: 0.543, value: 0.543, hasTmi: false } })} />);
    expect(screen.getByText('54.3%')).toBeInTheDocument();
    expect(screen.queryByText(/%p$/)).toBeNull();
    rerender(<TmiSheet {...props({ odds: null })} />);
    expect(screen.getByText('계산 중…')).toBeInTheDocument();
  });

  it('입력하고 "걸기"를 누르면 공백을 지운 문장을 넘기고, TMI가 늘기 전까지 입력을 지우지 않는다', async () => {
    const user = userEvent.setup();
    const p = props({ tmis: [] });
    const { rerender } = render(<TmiSheet {...p} />);
    const input = screen.getByLabelText('TMI 한 줄');
    await user.type(input, '  오늘 폭염 ');
    await user.click(screen.getByRole('button', { name: '걸기' }));
    expect(p.onSubmit).toHaveBeenCalledWith('오늘 폭염');
    expect(input).toHaveValue('  오늘 폭염 ');
    rerender(<TmiSheet {...p} tmis={[entry('tmi-1', '오늘 폭염')]} />);
    expect(screen.getByLabelText('TMI 한 줄')).toHaveValue('');
  });

  it('예시를 누르면 입력칸을 채운다', async () => {
    const user = userEvent.setup();
    render(<TmiSheet {...props()} />);
    await user.click(screen.getByRole('button', { name: '원정팀이 버스로 5시간 이동했다' }));
    expect(screen.getByLabelText('TMI 한 줄')).toHaveValue('원정팀이 버스로 5시간 이동했다');
  });

  it('편집할 수 없으면 입력·걸기·예시가 비활성이고 안내, 해석 중이면 "해석 중…"', () => {
    const { rerender } = render(<TmiSheet {...props({ canEdit: false })} />);
    expect(screen.getByLabelText('TMI 한 줄')).toBeDisabled();
    expect(screen.getByRole('button', { name: '오늘 기온 35도, 폭염' })).toBeDisabled();
    expect(screen.getByText('공을 던진 뒤에는 TMI를 바꿀 수 없어요. "처음부터"를 누르면 다시 걸 수 있어요.')).toBeInTheDocument();
    rerender(<TmiSheet {...props({ busy: true })} />);
    expect(screen.getByText('해석 중…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '걸기' })).toBeDisabled();
  });

  it('3개가 차면 안내하고 걸 수 없다, 알림 줄을 보여준다', () => {
    const three = [entry('a', '하나'), entry('b', '둘'), entry('c', '셋')];
    render(<TmiSheet {...props({ tmis: three, notice: '실존 인물에게 민감한 내용이라 계산하지 않았어요.' })} />);
    expect(screen.getByText('TMI는 3개까지 걸 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '걸기' })).toBeDisabled();
    expect(screen.getByText('실존 인물에게 민감한 내용이라 계산하지 않았어요.')).toBeInTheDocument();
  });

  it('닫기 버튼이 onClose를 부른다', async () => {
    const user = userEvent.setup();
    const p = props();
    render(<TmiSheet {...p} />);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(p.onClose).toHaveBeenCalled();
  });
});
