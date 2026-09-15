import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import { SituationCard, weekdayOf } from './SituationCard';

const SCENE = fixtureAppData.scenes[0]; // 2026-08-15 픽스처 구장, KIA 4 : 4 롯데, 9회말 2사 만루

describe('weekdayOf', () => {
  it('YYYY-MM-DD의 한국어 요일 한 글자, 틀린 날짜는 빈 문자열', () => {
    expect(weekdayOf('2026-08-15')).toBe('토');
    expect(weekdayOf('2026-09-15')).toBe('화');
    expect(weekdayOf('2026-02-30')).toBe('');
    expect(weekdayOf('nope')).toBe('');
  });
});

describe('SituationCard', () => {
  it('날짜·구장·두 팀 점수·공격 팀·상황·타자 vs 투수를 한 링크로 보여주고 실제 결과는 숨긴다', () => {
    render(<SituationCard scene={SCENE} batterName="홈타자6" pitcherName="원정투수" href="#/scene/fixture-walkoff" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '#/scene/fixture-walkoff');
    expect(within(link).getByText('8.15 (토)')).toBeInTheDocument();
    expect(within(link).getByText('픽스처 구장')).toBeInTheDocument();
    const rows = within(link).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([`KIA${SCENE.state.away}`, `롯데${SCENE.state.home}`]);
    expect(rows.map((row) => row.getAttribute('data-batting'))).toEqual(['false', 'true']);
    expect(within(link).getByText('9회말 2사 만루')).toBeInTheDocument();
    expect(within(link).getByText('홈타자6')).toBeInTheDocument();
    expect(within(link).getByText('원정투수')).toBeInTheDocument();
    expect(screen.queryByText(SCENE.actual.result)).toBeNull();
    expect(screen.queryByText('이 타석에 TMI 걸기')).toBeNull();
  });

  it('feature 카드는 행동 문구를 함께 둔다', () => {
    render(<SituationCard scene={SCENE} batterName="홈타자6" pitcherName="원정투수" href="#/scene/fixture-walkoff" variant="feature" />);
    expect(within(screen.getByRole('link')).getByText('이 타석에 TMI 걸기')).toBeInTheDocument();
  });
});
