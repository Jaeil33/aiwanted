import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OddsHeadline } from '../game/headline';
import { ResultSheet, type ResultSheetProps } from './ResultSheet';

const H: OddsHeadline = { kind: 'actual', event: 0, label: '김타자 삼진 확률', base: 0.231, tmi: 0.312, deltaPp: 8.1 };

function props(over: Partial<ResultSheetProps> = {}): ResultSheetProps {
  return {
    open: true,
    onClose: vi.fn(),
    playedHeadline: '삼진',
    actualText: '실제: 우익수 앞 1루타, 2점',
    headline: H,
    counts: { tmi: [312, 80, 25, 4, 40, 120, 419], base: [231, 90, 30, 5, 45, 140, 459] },
    hasTmi: true,
    win: { team: 'KT', base: 0.543, tmi: 0.521, deltaPp: -2.2 },
    toon: 0.52,
    onReplay: vi.fn(),
    onShare: vi.fn(),
    shareNote: '',
    ...over,
  };
}

describe('ResultSheet', () => {
  it('쳐본 결과 헤드라인·실제 결과 칩·1,000타석 점·범례·승리확률·만화 모드 한 줄', () => {
    render(<ResultSheet {...props()} />);
    expect(screen.getByRole('dialog', { name: '삼진!' })).toBeInTheDocument();
    expect(screen.getByText('한 타석 쳐본 결과')).toBeInTheDocument();
    expect(screen.getByText('실제: 우익수 앞 1루타, 2점')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^1,000번 중 삼진 312번/ })).toBeInTheDocument();
    expect(screen.getByText('1,000번 치면 삼진 312번 · TMI 없이 231번')).toBeInTheDocument();
    expect(screen.getByText('KT 승리확률 54.3% → 52.1% (−2.2%p)')).toBeInTheDocument();
    expect(screen.getByText('만화 모드(효과 6배)였다면 52.0%')).toBeInTheDocument();
    expect(screen.getByText('만화 모드')).toHaveAttribute('data-mode', 'toon');
  });

  it('TMI가 없으면 비교·만화 줄이 없고, 출루 확률이면 출루 수를 센다', () => {
    const onBase: OddsHeadline = { kind: 'onBase', event: null, label: '김타자 출루 확률', base: 0.31, tmi: 0.31, deltaPp: 0 };
    const counts = [231, 90, 30, 5, 45, 140, 459];
    render(<ResultSheet {...props({ headline: onBase, counts: { tmi: counts, base: counts }, hasTmi: false, toon: null, actualText: null })} />);
    expect(screen.getByText('1,000번 치면 출루 310번')).toBeInTheDocument();
    expect(screen.queryByText(/만화 모드/)).toBeNull();
    expect(screen.queryByText(/^실제:/)).toBeNull();
  });

  it('헤드라인이 !로 끝나면 덧붙이지 않는다', () => {
    render(<ResultSheet {...props({ playedHeadline: '만루 홈런!' })} />);
    expect(screen.getByRole('dialog', { name: '만루 홈런!' })).toBeInTheDocument();
  });

  it('"같은 TMI로 다시"·"결과 카드 공유"가 각각 부르고, 공유 안내를 읽어 준다', async () => {
    const user = userEvent.setup();
    const p = props({ shareNote: '링크를 복사했어요.' });
    render(<ResultSheet {...p} />);
    await user.click(screen.getByRole('button', { name: '같은 TMI로 다시' }));
    await user.click(screen.getByRole('button', { name: '결과 카드 공유' }));
    expect(p.onReplay).toHaveBeenCalledTimes(1);
    expect(p.onShare).toHaveBeenCalledTimes(1);
    expect(screen.getByText('링크를 복사했어요.')).toBeInTheDocument();
  });
});
