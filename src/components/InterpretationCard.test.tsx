import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EntryChip } from '../game';
import type { TmiEntry, VerdictResult } from '../types/domain';
import { InterpretationCard, type InterpretationCardProps } from './InterpretationCard';

const ENTRY: TmiEntry = {
  id: 'tmi-1',
  text: '원정투수가 경기 전 짜장면 곱빼기를 먹었다',
  interpretation: {
    source: 'ai',
    refused: false,
    reason: '',
    comment: '곱빼기는 9회에 무겁죠.',
    parts: [{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -1, scope: 'game', evidence: 'fun', why: '배부름' }],
  },
};
const CHIPS: EntryChip[] = [
  { label: '투수 체력 ▼', tone: 'fun' },
  { label: '기온 33°C', tone: 'measured' },
];
const VERDICT: VerdictResult = {
  source: 'ai',
  variables: ['temp_c'],
  verdict: 'maybe',
  headline: '더위는 조금 보이지만 확신은 없어요',
  body: '2021–2025 기록에서는 10°C당 득점이 늘었지만 2026 검증에서는 예측이 좋아지지 않았어요.',
};

const props = (over: Partial<InterpretationCardProps> = {}): InterpretationCardProps => ({
  entry: ENTRY,
  chips: CHIPS,
  verdict: null,
  judging: false,
  canRemove: true,
  canJudge: true,
  onRemove: vi.fn(),
  onJudge: vi.fn(),
  ...over,
});

describe('InterpretationCard', () => {
  it('인용 문장·출처 라벨·해설·톤별 칩을 보여준다', () => {
    render(<InterpretationCard {...props()} />);
    expect(screen.getByText(ENTRY.text)).toBeInTheDocument();
    expect(screen.getByText('AI 해석')).toBeInTheDocument();
    expect(screen.getByText('곱빼기는 9회에 무겁죠.')).toBeInTheDocument();
    const chips = within(screen.getByRole('list', { name: '해석 결과' })).getAllByRole('listitem');
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute('data-tone')])).toEqual([
      ['투수 체력 ▼', 'fun'],
      ['기온 33°C', 'measured'],
    ]);
  });

  it('규칙 해석이면 출처 라벨이 "규칙 해석"', () => {
    const entry: TmiEntry = { ...ENTRY, interpretation: { ...ENTRY.interpretation, source: 'rules' } };
    render(<InterpretationCard {...props({ entry })} />);
    expect(screen.getByText('규칙 해석')).toBeInTheDocument();
  });

  it('거부면 이유와 거부 칩을 보여준다', () => {
    const entry: TmiEntry = {
      ...ENTRY,
      interpretation: { source: 'rules', refused: true, reason: '실존 선수에게 민감한 내용이라 계산하지 않았어요.', comment: '', parts: [] },
    };
    render(<InterpretationCard {...props({ entry, chips: [{ label: '계산 거부', tone: 'refused' }], canJudge: false })} />);
    expect(screen.getByText('실존 선수에게 민감한 내용이라 계산하지 않았어요.')).toBeInTheDocument();
    expect(screen.getByText('계산 거부')).toHaveAttribute('data-tone', 'refused');
    expect(screen.queryByRole('button', { name: '진짜야?' })).toBeNull();
  });

  it('"진짜야?"를 누르면 onJudge, 판정 중이면 "기록을 뒤지는 중…"으로 잠근다', async () => {
    const user = userEvent.setup();
    const onJudge = vi.fn();
    const { rerender } = render(<InterpretationCard {...props({ onJudge })} />);
    await user.click(screen.getByRole('button', { name: '진짜야?' }));
    expect(onJudge).toHaveBeenCalledTimes(1);
    rerender(<InterpretationCard {...props({ onJudge, judging: true })} />);
    expect(screen.getByRole('button', { name: '기록을 뒤지는 중…' })).toBeDisabled();
    rerender(<InterpretationCard {...props({ onJudge, canJudge: false })} />);
    expect(screen.queryByRole('button', { name: '진짜야?' })).toBeNull();
  });

  it('판정 결과: 판정 칩·헤드라인·본문·판정 출처', () => {
    const { rerender } = render(<InterpretationCard {...props({ verdict: VERDICT })} />);
    expect(screen.getByText('애매해요')).toHaveAttribute('data-verdict', 'maybe');
    expect(screen.getByText(VERDICT.headline)).toBeInTheDocument();
    expect(screen.getByText(VERDICT.body)).toBeInTheDocument();
    expect(screen.getByText('AI 판정')).toBeInTheDocument();

    const labels: Array<[VerdictResult['verdict'], string]> = [
      ['real', '진짜 효과'],
      ['useless', '쓸모없음'],
      ['unmeasurable', '잴 수 없음'],
    ];
    for (const [verdict, label] of labels) {
      rerender(<InterpretationCard {...props({ verdict: { ...VERDICT, verdict, source: 'rules' } })} />);
      expect(screen.getByText(label)).toHaveAttribute('data-verdict', verdict);
      expect(screen.getByText('기록표 판정')).toBeInTheDocument();
    }
  });

  it('canRemove면 "빼기"로 onRemove, 아니면 버튼이 없다', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { rerender } = render(<InterpretationCard {...props({ onRemove })} />);
    const remove = screen.getByRole('button', { name: /빼기/ });
    expect(remove).toHaveTextContent('빼기');
    await user.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
    rerender(<InterpretationCard {...props({ onRemove, canRemove: false })} />);
    expect(screen.queryByRole('button', { name: /빼기/ })).toBeNull();
  });
});
