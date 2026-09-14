import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlayLogEntry } from '../game';
import { PlayLog } from './PlayLog';

const entry = (over: Partial<PlayLogEntry>): PlayLogEntry => ({
  index: 0,
  inning: 9,
  half: 1,
  batterName: '홈타자6',
  pitcherName: '원정투수',
  headline: '볼넷',
  score: { away: 4, home: 5 },
  wpHomeAfter: null,
  highlight: false,
  ...over,
});

describe('PlayLog', () => {
  it('비었으면 "아직 던진 공이 없어요"', () => {
    render(<PlayLog entries={[]} />);
    expect(screen.getByText('아직 던진 공이 없어요')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('최신 타석이 위: "이닝 · 타자 vs 투수 · 헤드라인 · 원정:홈"', () => {
    render(
      <PlayLog
        entries={[
          entry({ index: 0, inning: 9, half: 1, headline: '삼진', score: { away: 4, home: 4 } }),
          entry({ index: 1, inning: 10, half: 0, batterName: '원정타자4', pitcherName: '롯데 불펜', headline: '솔로 홈런!', score: { away: 5, home: 4 } }),
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '10회초 · 원정타자4 vs 롯데 불펜 · 솔로 홈런! · 5:4',
      '9회말 · 홈타자6 vs 원정투수 · 삼진 · 4:4',
    ]);
  });

  it('승부처 타석을 표시한다', () => {
    render(<PlayLog entries={[entry({ index: 0, highlight: true }), entry({ index: 1, highlight: false })]} />);
    const [latest, first] = screen.getAllByRole('listitem');
    expect(first).toHaveAttribute('data-highlight', 'true');
    expect(latest).not.toHaveAttribute('data-highlight');
  });
});
