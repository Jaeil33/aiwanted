import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { measuredById } from '../domain/measured';
import { fixtureAppData } from '../test/fixtures/appData';
import type { EvidenceData, EvidenceItem } from '../types/data';
import type { MeasuredId } from '../types/domain';
import { EvidenceTable } from './EvidenceTable';

const MINUS = '−';
const CAPTION = '득점 변화는 팀 득점 기준, 막대는 95% 구간';

function fixtureEvidence(): EvidenceData {
  if (!fixtureAppData.evidence) throw new Error('픽스처에 evidence가 없다');
  return fixtureAppData.evidence;
}

const BASE = fixtureEvidence();
/** 픽스처 두 행: temp_c(maybe, 검증 개선 없음) · day_game(useless) */
const [TEMP, DAY] = BASE.items;
/** 합성 real 행: 학습 구간 +5.1%~+16.2%(축 +10%를 넘는다), 검증 개선 구간 하한 > 0 */
const WIND: EvidenceItem = {
  ...TEMP,
  id: 'wind_ms',
  beta: 0.1,
  ciLow: 0.05,
  ciHigh: 0.15,
  runsPctPerUnit: 10.5171,
  test: { ...TEMP.test, ciLow: 0.0001 },
  verdict: 'real',
  note: '픽스처: 학습 구간과 검증 개선이 모두 0보다 크다.',
};
/** 합성 기준점 행: 학습 구간 −18.1%~+2.0%(축 −10%를 넘는다) */
const HOME: EvidenceItem = {
  ...DAY,
  id: 'home',
  beta: -0.07,
  ciLow: -0.2,
  ciHigh: 0.02,
  runsPctPerUnit: -6.7606,
  note: '픽스처: 홈 경기는 참고용 기준점이다.',
};
/** 파일 순서는 일부러 home을 맨 앞에 둔다 */
const EVIDENCE: EvidenceData = { ...BASE, items: [HOME, TEMP, WIND, DAY] };

/** 변수 라벨(measured.json)로 그 행을 찾는다 */
function rowOf(id: MeasuredId): HTMLElement {
  const row = screen.getByText(measuredById(id).label).closest('tr');
  if (!row) throw new Error(`${id} 행이 없다`);
  return row;
}

const barOf = (id: MeasuredId) => within(rowOf(id)).getByRole('img', { name: /^95% 구간/ });
const numberAttr = (el: Element | null, name: string) => Number(el?.getAttribute(name));

describe('EvidenceTable', () => {
  it('evidence가 없으면 안내 문장만 보여준다', () => {
    render(<EvidenceTable evidence={null} />);
    expect(screen.getByText('판정 데이터가 아직 없어요. 파이프라인으로 evidence.json을 만들면 보여요.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('표 머리에 득점 기준과 막대 뜻을 적고, 표는 이름 붙은 자체 스크롤 영역 안에 둔다', () => {
    render(<EvidenceTable evidence={EVIDENCE} />);
    const region = screen.getByRole('region', { name: '실측 변수 판정표' });
    const table = within(region).getByRole('table', { name: CAPTION });
    for (const name of ['변수', '득점 변화', '2026 검증', '판정', '설명']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });

  it('적용 가능한 변수를 파일 순서대로 먼저, 기준점 home은 맨 아래에 "기준점"으로 둔다', () => {
    render(<EvidenceTable evidence={EVIDENCE} />);
    const heads = screen.getAllByRole('rowheader');
    const order: MeasuredId[] = ['temp_c', 'wind_ms', 'day_game', 'home'];
    expect(heads).toHaveLength(order.length);
    order.forEach((id, i) => {
      const def = measuredById(id);
      expect(within(heads[i]).getByText(def.label)).toBeInTheDocument();
      expect(within(heads[i]).getByText(def.perLabel)).toBeInTheDocument();
    });
    expect(within(heads[3]).getByText('기준점')).toBeInTheDocument();
    expect(screen.getAllByText('기준점')).toHaveLength(1);
  });

  it('득점 변화는 runsPctPerUnit을 부호와 소수 첫째 자리 퍼센트로 쓴다', () => {
    render(<EvidenceTable evidence={EVIDENCE} />);
    expect(within(rowOf('temp_c')).getByText('+2.1%')).toBeInTheDocument();
    expect(within(rowOf('wind_ms')).getByText('+10.5%')).toBeInTheDocument();
    expect(within(rowOf('day_game')).getByText(`${MINUS}0.4%`)).toBeInTheDocument();
    expect(within(rowOf('home')).getByText(`${MINUS}6.8%`)).toBeInTheDocument();
  });

  it('검증 칩은 test.ciLow > 0일 때만 "개선 있음", 판정 칩은 real·maybe·useless 문구, 행마다 note', () => {
    render(<EvidenceTable evidence={EVIDENCE} />);
    const wind = rowOf('wind_ms');
    expect(within(wind).getByText('2026 예측 개선 있음')).toBeInTheDocument();
    expect(within(wind).getByText('진짜 효과')).toBeInTheDocument();
    expect(within(wind).getByText(WIND.note)).toBeInTheDocument();

    const temp = rowOf('temp_c');
    expect(within(temp).getByText('2026 예측 개선 없음')).toBeInTheDocument();
    expect(within(temp).getByText('애매해요')).toBeInTheDocument();
    expect(within(temp).getByText(TEMP.note)).toBeInTheDocument();

    const day = rowOf('day_game');
    expect(within(day).getByText('2026 예측 개선 없음')).toBeInTheDocument();
    expect(within(day).getByText('쓸모없음')).toBeInTheDocument();
    expect(within(day).getByText(DAY.note)).toBeInTheDocument();
  });

  it('검증 시즌은 evidence.testSeason에서 읽는다', () => {
    render(<EvidenceTable evidence={{ ...EVIDENCE, testSeason: 2027 }} />);
    expect(screen.getByRole('columnheader', { name: '2027 검증' })).toBeInTheDocument();
    expect(within(rowOf('wind_ms')).getByText('2027 예측 개선 있음')).toBeInTheDocument();
    expect(within(rowOf('temp_c')).getByText('2027 예측 개선 없음')).toBeInTheDocument();
  });

  it('행마다 95% 구간 막대 SVG: 0 기준선 기준 위치, 축(−10%~+10%) 밖으로 나가면 그 끝에 화살표', () => {
    render(<EvidenceTable evidence={EVIDENCE} />);

    const temp = barOf('temp_c');
    expect(temp.tagName.toLowerCase()).toBe('svg');
    expect(temp).toHaveAccessibleName('95% 구간 +0.3% ~ +3.9%');
    const tempZero = numberAttr(temp.querySelector('[data-zero]'), 'x1');
    expect(numberAttr(temp.querySelector('[data-ci]'), 'x')).toBeGreaterThan(tempZero);
    expect(temp.querySelector('[data-arrow]')).toBeNull();

    const day = barOf('day_game');
    expect(day).toHaveAccessibleName(`95% 구간 ${MINUS}3.3% ~ +2.6%`);
    const dayZero = numberAttr(day.querySelector('[data-zero]'), 'x1');
    const dayCi = day.querySelector('[data-ci]');
    expect(numberAttr(dayCi, 'x')).toBeLessThan(dayZero);
    expect(numberAttr(dayCi, 'x') + numberAttr(dayCi, 'width')).toBeGreaterThan(dayZero);
    expect(day.querySelector('[data-arrow]')).toBeNull();

    const wind = barOf('wind_ms');
    expect(wind).toHaveAccessibleName('95% 구간 +5.1% ~ +16.2%');
    expect(wind.querySelector('[data-arrow="high"]')).not.toBeNull();
    expect(wind.querySelector('[data-arrow="low"]')).toBeNull();

    const home = barOf('home');
    expect(home).toHaveAccessibleName(`95% 구간 ${MINUS}18.1% ~ +2.0%`);
    expect(home.querySelector('[data-arrow="low"]')).not.toBeNull();
    expect(home.querySelector('[data-arrow="high"]')).toBeNull();
  });

  it('모르는 변수 id나 숫자가 아닌 값이 있어도 멈추지 않고 그 칸만 비운다', () => {
    const odd: EvidenceItem = { ...TEMP, id: 'mystery' as MeasuredId, runsPctPerUnit: Number.NaN, ciLow: Number.NaN };
    render(<EvidenceTable evidence={{ ...EVIDENCE, items: [odd, ...EVIDENCE.items] }} />);
    const heads = screen.getAllByRole('rowheader');
    expect(heads).toHaveLength(5);
    expect(within(heads[4]).getByText('기준점')).toBeInTheDocument();
    const row = screen.getByText('mystery').closest('tr');
    if (!row) throw new Error('mystery 행이 없다');
    expect(within(row).queryByRole('img')).toBeNull();
    expect(within(row).getByText('—')).toBeInTheDocument();
  });
});
