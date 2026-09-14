import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../test/fixtures/appData';
import type { TrustData } from '../types/data';
import { TrustPanel } from './TrustPanel';

function fixtureTrust(): TrustData {
  if (!fixtureAppData.trust) throw new Error('픽스처에 trust가 없다');
  return fixtureAppData.trust;
}

const TRUST = fixtureTrust();

const brierItems = () => within(screen.getByRole('list', { name: 'Brier 점수' })).getAllByRole('listitem');
const chart = () => screen.getByRole('img', { name: /보정 차트/ });

describe('TrustPanel', () => {
  it('리포트가 없으면 안내 문장만 보여준다', () => {
    render(<TrustPanel trust={null} />);
    expect(screen.getByText('엔진 신뢰도 리포트가 아직 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('적용 범위 설명에 경기·타석 수(games, plateAppearances)를 넣고 note를 함께 보여준다', () => {
    render(<TrustPanel trust={{ ...TRUST, plateAppearances: 12345 }} />);
    expect(
      screen.getByText(/^2025 시즌 기록만으로 만든 엔진을 2026년 8월 1일~9월 13일 중계 타석에 적용했어요\(12경기 · 12,345타석\)\./),
    ).toBeInTheDocument();
    expect(screen.getByText(TRUST.note)).toBeInTheDocument();
  });

  it('Brier 점수 막대 세 개: 엔진·네이버·항상 50% 순서, 값은 소수 셋째 자리, "낮을수록 정확해요"', () => {
    render(<TrustPanel trust={TRUST} />);
    const items = brierItems();
    expect(items).toHaveLength(3);
    const expected = [
      ['TMI 야구 엔진', '0.041'],
      ['네이버 승리확률', '0.040'],
      ['항상 50%', '0.061'],
    ];
    expected.forEach(([label, value], i) => {
      expect(within(items[i]).getByText(label)).toBeInTheDocument();
      expect(within(items[i]).getByText(value)).toBeInTheDocument();
    });
    expect(screen.getByText('낮을수록 정확해요')).toBeInTheDocument();
  });

  it('Brier 막대 폭은 세 값 중 가장 큰 값을 100%로 잡는다', () => {
    render(<TrustPanel trust={{ ...TRUST, brier: { engine: 0.15, naver: 0.2, constant: 0.25 } }} />);
    const widths = brierItems().map((li) => li.querySelector<HTMLElement>('[data-fill]')?.style.width);
    expect(widths).toEqual(['60%', '80%', '100%']);
  });

  it('로그 손실은 작은 표로 보여준다', () => {
    render(<TrustPanel trust={TRUST} />);
    const table = screen.getByRole('table', { name: '로그 손실' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['TMI 야구 엔진', '네이버 승리확률', '항상 50%']);
    expect(rows.map((row) => within(row).getByRole('cell').textContent)).toEqual(['0.162', '0.157', '0.231']);
  });

  it('보정 차트 SVG: 대각선, 두 축의 0·50·100% 라벨, 점 개수 = calibration 길이', () => {
    render(<TrustPanel trust={TRUST} />);
    const svg = chart();
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.querySelector('[data-diagonal]')).not.toBeNull();
    for (const label of ['0%', '50%', '100%']) expect(within(svg).getAllByText(label)).toHaveLength(2);
    expect(svg.querySelectorAll('[data-point]')).toHaveLength(TRUST.calibration.length);
  });

  it('보정 점은 예측 평균이 클수록 오른쪽, 실제 홈 승률이 클수록 위, n이 클수록 크다', () => {
    const calibration = [
      { lo: 0, hi: 0.4, predicted: 0.2, actual: 0.3, n: 50 },
      { lo: 0.4, hi: 0.7, predicted: 0.55, actual: 0.5, n: 200 },
      { lo: 0.7, hi: 1, predicted: 0.9, actual: 0.95, n: 800 },
    ];
    render(<TrustPanel trust={{ ...TRUST, calibration }} />);
    const points = Array.from(chart().querySelectorAll('[data-point]')).map((p) => ({
      cx: Number(p.getAttribute('cx')),
      cy: Number(p.getAttribute('cy')),
      r: Number(p.getAttribute('r')),
    }));
    expect(points).toHaveLength(calibration.length);
    expect(points[0].cx).toBeLessThan(points[1].cx);
    expect(points[1].cx).toBeLessThan(points[2].cx);
    expect(points[0].cy).toBeGreaterThan(points[1].cy);
    expect(points[1].cy).toBeGreaterThan(points[2].cy);
    expect(points[0].r).toBeLessThan(points[1].r);
    expect(points[1].r).toBeLessThan(points[2].r);
  });
});
