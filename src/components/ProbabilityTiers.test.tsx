import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TierView } from '../game';
import { ProbabilityTiers, type ProbabilityTiersProps } from './ProbabilityTiers';

const TIERS: TierView[] = [
  {
    id: 'pa',
    title: '타석 승부',
    leftLabel: '홈타자6 출루',
    leftValue: 0.356,
    rightLabel: '원정투수 아웃',
    rightValue: 0.644,
    extra: null,
    delta: 0.006,
    deltaText: '+0.6%p',
  },
  {
    id: 'inning',
    title: '이닝 승부',
    leftLabel: '롯데 득점',
    leftValue: 0.4071,
    rightLabel: 'KIA 무실점',
    rightValue: 0.5929,
    extra: '기대 득점 1.23점',
    delta: -0.0071,
    deltaText: '−0.7%p',
  },
  {
    id: 'game',
    title: '경기 승부',
    leftLabel: '롯데 승리',
    leftValue: 0.626,
    rightLabel: 'KIA 승리',
    rightValue: 0.339,
    extra: '무승부 3.5%',
    delta: 0,
    deltaText: '±0.00%p',
  },
];

const props = (over: Partial<ProbabilityTiersProps> = {}): ProbabilityTiersProps => ({
  tiers: TIERS,
  mode: 'real',
  tones: [],
  pending: false,
  batColor: '#5C8DF6',
  fldColor: '#F0474B',
  ...over,
});

describe('ProbabilityTiers', () => {
  it('타석·이닝·경기 세 줄의 제목·좌우 라벨·퍼센트를 보여준다', () => {
    render(<ProbabilityTiers {...props()} />);
    for (const title of ['타석 승부', '이닝 승부', '경기 승부']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    for (const text of ['홈타자6 출루', '원정투수 아웃', '롯데 득점', 'KIA 무실점', '롯데 승리', 'KIA 승리']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    for (const pct of ['35.6%', '64.4%', '40.7%', '59.3%', '62.6%', '33.9%']) {
      expect(screen.getByText(pct)).toBeInTheDocument();
    }
  });

  it('변화 칩: 양수는 up, 음수는 down, 0은 flat 톤', () => {
    render(<ProbabilityTiers {...props()} />);
    expect(screen.getByText('+0.6%p')).toHaveAttribute('data-tone', 'up');
    expect(screen.getByText('−0.7%p')).toHaveAttribute('data-tone', 'down');
    expect(screen.getByText('±0.00%p')).toHaveAttribute('data-tone', 'flat');
  });

  it('extra 문구(기대 득점·무승부)를 보여준다', () => {
    render(<ProbabilityTiers {...props()} />);
    expect(screen.getByText('기대 득점 1.23점')).toBeInTheDocument();
    expect(screen.getByText('무승부 3.5%')).toBeInTheDocument();
  });

  it('좌우 비율 막대: 공격 색 | 수비 색', () => {
    render(<ProbabilityTiers {...props()} />);
    const bar = screen.getByRole('img', { name: '홈타자6 출루 35.6%, 원정투수 아웃 64.4%' });
    const left = bar.querySelector('[data-side="left"]');
    const right = bar.querySelector('[data-side="right"]');
    expect(left).toHaveStyle({ width: '35.6%', backgroundColor: '#5C8DF6' });
    expect(right).toHaveStyle({ width: '64.4%', backgroundColor: '#F0474B' });
  });

  it('현실 모드 칩', () => {
    render(<ProbabilityTiers {...props({ mode: 'real' })} />);
    expect(screen.getByText('현실 모드')).toHaveAttribute('data-mode', 'real');
    expect(screen.queryByText('효과 6배 과장')).toBeNull();
  });

  it('만화 모드 칩에는 "효과 6배 과장" 문구를 붙인다', () => {
    render(<ProbabilityTiers {...props({ mode: 'toon' })} />);
    expect(screen.getByText('만화 모드')).toHaveAttribute('data-mode', 'toon');
    expect(screen.getByText('효과 6배 과장')).toBeInTheDocument();
  });

  it('근거 등급 칩은 중복을 없애고 처음 나온 순서대로', () => {
    render(<ProbabilityTiers {...props({ tones: ['fun', 'measured', 'fun', 'refused', 'plausible'] })} />);
    const chips = within(screen.getByRole('list', { name: '근거 등급' })).getAllByRole('listitem');
    expect(chips.map((chip) => chip.textContent)).toEqual(['상상', '실측', '계산 거부', '그럴듯함']);
    expect(chips.map((chip) => chip.getAttribute('data-tone'))).toEqual(['fun', 'measured', 'refused', 'plausible']);
  });

  it('TMI가 없으면 근거 등급 칩 목록이 없다', () => {
    render(<ProbabilityTiers {...props({ tones: [] })} />);
    expect(screen.queryByRole('list', { name: '근거 등급' })).toBeNull();
  });

  it('pending이면 막대는 두고 "계산 중…"을 붙인다', () => {
    render(<ProbabilityTiers {...props({ pending: true })} />);
    expect(screen.getByText('계산 중…')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });
});
