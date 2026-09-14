import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../../test/fixtures/appData';
import { renderWithGame } from '../../test/gameHarness';
import type { AppData, EvidenceData, EvidenceItem } from '../../types/data';
import { EvidenceScreen } from './EvidenceScreen';

const MINUS = '−';
const INTRO =
  '기온·바람·이동 거리처럼 기록에 남는 변수는 2021~2025년 경기로 효과를 재고, 2026년 경기로 정말 맞는지 확인했어요. ' +
  '기록에서 효과가 보여도 다음 해 경기 예측까지 좋아지는지는 따로 확인해요.';

function fixtureEvidence(): EvidenceData {
  if (!fixtureAppData.evidence) throw new Error('픽스처에 evidence가 없다');
  return fixtureAppData.evidence;
}

const BASE = fixtureEvidence();
/** 픽스처: temp_c maybe · day_game useless */
const [TEMP, DAY] = BASE.items;
const WIND: EvidenceItem = { ...TEMP, id: 'wind_ms', verdict: 'real', test: { ...TEMP.test, ciLow: 0.0001 }, note: '픽스처: 진짜 효과 행' };
const HOME: EvidenceItem = { ...DAY, id: 'home', verdict: 'useless', note: '픽스처: 기준점 행' };
/** 판정: real 1 · maybe 1 · useless 1 + 기준점 home(useless) */
const DATA: AppData = { ...fixtureAppData, evidence: { ...BASE, items: [HOME, TEMP, WIND, DAY] } };

const renderEvidence = (data: AppData = DATA) => renderWithGame(<EvidenceScreen />, { data });

describe('EvidenceScreen', () => {
  it('제목 "판정소", 부제, 소개 문단을 보여준다', () => {
    renderEvidence();
    expect(screen.getByRole('heading', { level: 2, name: '판정소' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '판정소' })).toHaveTextContent('쓸모없는 변수, 진짜 쓸모없을까?');
    expect(screen.getByText(INTRO)).toBeInTheDocument();
  });

  it('method 문단, 학습·검증 경기 수, 전체 변수를 함께 넣었을 때의 검증 개선량을 파일 값으로 보여준다', () => {
    renderEvidence();
    const method = screen.getByRole('region', { name: '어떻게 판정했나' });
    expect(within(method).getByText(BASE.method)).toBeInTheDocument();
    expect(within(method).getByText('2021~2025 시즌 3,600경기')).toBeInTheDocument();
    expect(within(method).getByText('2026 시즌 620경기')).toBeInTheDocument();
    expect(within(method).getByText('전체 변수를 함께 넣었을 때 2026 예측 개선')).toBeInTheDocument();
    expect(within(method).getByText(`경기당 이탈도 +0.0012 (95% 구간 ${MINUS}0.0004 ~ +0.0029)`)).toBeInTheDocument();
    expect(within(method).getByText('전체 변수를 함께 넣어도 2026 경기 예측이 좋아졌다고 말할 수 없어요.')).toBeInTheDocument();
  });

  it('전체 개선 구간이 0보다 크면 좋아졌다고, 0보다 작으면 오히려 나빠졌다고 쓴다', () => {
    const withJoint = (joint: EvidenceData['joint']): AppData => ({ ...DATA, evidence: { ...BASE, joint } });
    const better = renderEvidence(withJoint({ devianceGainPerGame: 0.003, ciLow: 0.001, ciHigh: 0.005 }));
    expect(screen.getByText('전체 변수를 함께 넣으면 2026 경기 예측이 좋아졌어요.')).toBeInTheDocument();
    better.unmount();
    renderEvidence(withJoint({ devianceGainPerGame: -0.003, ciLow: -0.005, ciHigh: -0.001 }));
    expect(screen.getByText('전체 변수를 함께 넣으면 2026 경기 예측이 오히려 나빠졌어요.')).toBeInTheDocument();
  });

  it('판정 요약 한 줄은 기준점 home을 뺀 items의 판정 개수를 파일에서 센다', () => {
    renderEvidence();
    expect(screen.getByText('진짜 효과 1개 · 애매해요 1개 · 쓸모없음 1개')).toBeInTheDocument();
  });

  it('판정표 다음에 "엔진은 믿을 만한가" 제목과 신뢰도 패널을 둔다', () => {
    renderEvidence();
    const table = screen.getByRole('table', { name: '득점 변화는 팀 득점 기준, 막대는 95% 구간' });
    const heading = screen.getByRole('heading', { level: 3, name: '엔진은 믿을 만한가' });
    expect(table.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const trust = screen.getByRole('region', { name: '엔진은 믿을 만한가' });
    expect(within(trust).getByRole('list', { name: 'Brier 점수' })).toBeInTheDocument();
    expect(within(trust).getByRole('img', { name: /보정 차트/ })).toBeInTheDocument();
  });

  it('evidence·trust 파일이 없으면 각 안내 문장을 보여주고 방법·요약은 숨긴다', () => {
    renderEvidence({ ...fixtureAppData, evidence: null, trust: null });
    expect(screen.getByRole('heading', { level: 2, name: '판정소' })).toBeInTheDocument();
    expect(screen.getByText('판정 데이터가 아직 없어요. 파이프라인으로 evidence.json을 만들면 보여요.')).toBeInTheDocument();
    expect(screen.getByText('엔진 신뢰도 리포트가 아직 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '어떻게 판정했나' })).toBeNull();
    expect(screen.queryByText(/^진짜 효과 \d+개/)).toBeNull();
  });

  it('"장면으로 돌아가기"는 열린 장면이 없으면 첫 화면, 있으면 그 장면으로 간다', async () => {
    const { game } = renderEvidence();
    expect(screen.getByRole('link', { name: '장면으로 돌아가기' })).toHaveAttribute('href', '#/');
    await act(async () => {
      await game().actions.openScene('fixture-walkoff', null);
    });
    expect(screen.getByRole('link', { name: '장면으로 돌아가기' })).toHaveAttribute('href', '#/scene/fixture-walkoff');
  });
});
