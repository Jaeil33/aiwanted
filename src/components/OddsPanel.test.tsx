import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OddsHeadline } from '../game/headline';
import { OddsPanel } from './OddsPanel';

const H: OddsHeadline = { kind: 'actual', event: 0, label: '김타자 삼진 확률', base: 0.231, tmi: 0.312, deltaPp: 8.1 };

describe('OddsPanel', () => {
  it('계산 전이면 "계산 중…"', () => {
    render(<OddsPanel headline={null} hasTmi={false} grade={null} win={null} />);
    expect(screen.getByText('계산 중…')).toBeInTheDocument();
  });

  it('TMI가 없으면 큰 숫자는 하나(TMI 없음 값)이고 승리확률 한 줄은 값만', () => {
    render(
      <OddsPanel
        headline={{ ...H, tmi: H.base, deltaPp: 0 }}
        hasTmi={false}
        grade={null}
        win={{ team: 'KT', base: 0.543, tmi: 0.543, deltaPp: 0 }}
      />,
    );
    expect(screen.getByText('김타자 삼진 확률')).toBeInTheDocument();
    expect(screen.getByLabelText('김타자 삼진 확률 23.1%')).toHaveTextContent('23.1%');
    expect(screen.queryByText(/TMI 없이/)).toBeNull();
    expect(screen.getByText('KT 승리확률 54.3%')).toBeInTheDocument();
  });

  it('TMI가 있으면 TMI 값을 크게, TMI 없음 값·변화 칩·근거 등급·승리확률 변화를 함께', () => {
    render(<OddsPanel headline={H} hasTmi grade="fun" win={{ team: 'KT', base: 0.543, tmi: 0.521, deltaPp: -2.2 }} />);
    expect(screen.getByLabelText('김타자 삼진 확률 31.2%')).toHaveTextContent('31.2%');
    expect(screen.getByText('TMI 없이 23.1%')).toBeInTheDocument();
    expect(screen.getByText('+8.1%p')).toHaveAttribute('data-trend', 'up');
    expect(screen.getByText('상상')).toHaveAttribute('data-grade', 'fun');
    expect(screen.getByText('KT 승리확률 54.3% → 52.1% (−2.2%p)')).toBeInTheDocument();
  });

  it('변화가 작으면 ±0.00%p이고 flat, 줄면 down', () => {
    const { rerender } = render(<OddsPanel headline={{ ...H, tmi: 0.23102, deltaPp: 0.002 }} hasTmi grade="plausible" win={null} />);
    expect(screen.getByText('±0.00%p')).toHaveAttribute('data-trend', 'flat');
    rerender(<OddsPanel headline={{ ...H, tmi: 0.2, deltaPp: -3.1 }} hasTmi grade="measured" win={null} />);
    expect(screen.getByText('−3.1%p')).toHaveAttribute('data-trend', 'down');
    expect(screen.getByText('실측')).toHaveAttribute('data-grade', 'measured');
  });
});
