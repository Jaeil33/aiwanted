import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MEASURED } from '../domain/measured';
import type { TmiEntry, VerdictResult } from '../types/domain';
import { TmiCard } from './TmiCard';

const ENTRY: TmiEntry = {
  id: 'tmi-1',
  text: '박투수가 짜장면 곱빼기를 먹었다',
  interpretation: {
    source: 'rules',
    refused: false,
    reason: '',
    comment: '배가 부르면 몸이 무거워진다는 가정이에요.',
    parts: [{ kind: 'knob', knob: 'stamina', subject: 'pitcher', strength: -2, scope: 'game', evidence: 'fun', why: '배부름' }],
  },
};

const noop = () => undefined;

describe('TmiCard', () => {
  it('출처·등급·인용·손잡이 행(방향·이름·대상·범위·세기)·이유와 "진짜야?"', async () => {
    const user = userEvent.setup();
    const onJudge = vi.fn();
    render(<TmiCard entry={ENTRY} verdict={null} judging={false} canRemove={false} onRemove={noop} onJudge={onJudge} />);
    const card = screen.getByRole('article', { name: 'TMI 박투수가 짜장면 곱빼기를 먹었다' });
    expect(within(card).getByText('규칙 해석')).toBeInTheDocument();
    expect(within(card).getByText('상상')).toHaveAttribute('data-grade', 'fun');
    expect(within(card).getByText('“박투수가 짜장면 곱빼기를 먹었다”')).toBeInTheDocument();
    const row = within(card).getByRole('listitem');
    expect(row).toHaveAttribute('data-dir', 'down');
    expect(within(row).getByText('체력')).toBeInTheDocument();
    expect(within(row).getByText('투수 · 경기 내내')).toBeInTheDocument();
    expect(within(row).getByLabelText('세기 −2')).toBeInTheDocument();
    expect(within(card).getByText('배가 부르면 몸이 무거워진다는 가정이에요.')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /빼기/ })).toBeNull();
    await user.click(within(card).getByRole('button', { name: '진짜야?' }));
    expect(onJudge).toHaveBeenCalledTimes(1);
  });

  it('실측 변수 행은 변수 이름과 값, 등급은 실측', () => {
    const def = MEASURED.find((d) => d.id === 'temp_c');
    if (!def) throw new Error('temp_c 정의가 없어요');
    const entry: TmiEntry = {
      ...ENTRY,
      interpretation: { ...ENTRY.interpretation, source: 'ai', comment: '', parts: [{ kind: 'measured', variable: 'temp_c', value: 33, subject: 'everyone', why: '폭염' }] },
    };
    render(<TmiCard entry={entry} verdict={null} judging={false} canRemove={false} onRemove={noop} onJudge={noop} />);
    expect(screen.getByText('AI 해석')).toBeInTheDocument();
    expect(screen.getByText('실측')).toHaveAttribute('data-grade', 'measured');
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(def.label)).toBeInTheDocument();
    expect(within(row).getByText(`33${def.unit}`)).toBeInTheDocument();
    expect(screen.getByText('폭염')).toBeInTheDocument();
  });

  it('판정 중이면 버튼이 "기록을 뒤지는 중…"(비활성), 판정이 오면 판정 글자·제목·본문·출처', () => {
    const { rerender } = render(<TmiCard entry={ENTRY} verdict={null} judging canRemove={false} onRemove={noop} onJudge={noop} />);
    expect(screen.getByRole('button', { name: '기록을 뒤지는 중…' })).toBeDisabled();
    const verdict: VerdictResult = { source: 'rules', variables: [], verdict: 'unmeasurable', headline: '기록으로 잴 수 없는 이야기예요', body: '짜장면 기록은 없어요.' };
    rerender(<TmiCard entry={ENTRY} verdict={verdict} judging={false} canRemove={false} onRemove={noop} onJudge={noop} />);
    expect(screen.queryByRole('button', { name: '진짜야?' })).toBeNull();
    expect(screen.getByText('잴 수 없음')).toHaveAttribute('data-verdict', 'unmeasurable');
    expect(screen.getByText('기록으로 잴 수 없는 이야기예요')).toBeInTheDocument();
    expect(screen.getByText('짜장면 기록은 없어요.')).toBeInTheDocument();
    expect(screen.getByText('기록표 판정')).toBeInTheDocument();
  });

  it('거부 카드: 거부 이유와 계산 안 함, "진짜야?" 없음', () => {
    const refused: TmiEntry = {
      ...ENTRY,
      interpretation: { ...ENTRY.interpretation, refused: true, reason: '선수 건강·사생활·범죄 이야기는 계산하지 않아요.', parts: [] },
    };
    render(<TmiCard entry={refused} verdict={null} judging={false} canRemove={false} onRemove={noop} onJudge={noop} />);
    const card = screen.getByRole('article');
    expect(card).toHaveAttribute('data-refused', 'true');
    expect(screen.getByText('계산 안 함')).toBeInTheDocument();
    expect(screen.getByText('선수 건강·사생활·범죄 이야기는 계산하지 않아요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '진짜야?' })).toBeNull();
  });

  it('뺄 수 있으면 빼기 버튼이 onRemove를 부른다', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<TmiCard entry={ENTRY} verdict={null} judging={false} canRemove onRemove={onRemove} onJudge={noop} />);
    await user.click(screen.getByRole('button', { name: '“박투수가 짜장면 곱빼기를 먹었다” 빼기' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
