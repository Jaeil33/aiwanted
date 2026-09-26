import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import type { PitchRow } from '../types/data';
import { PitchTracker, type PitchTrackerHandle, type PlayerCaption } from './PitchTracker';

/** [구종, 구속, 결과 코드(0 B·1 T·2 S·3 F·4 X), 볼, 스트라이크, 타석, x0, z0, vx0, vy0, vz0, ax, ay, az, 존 위, 존 아래] */
const ROW: PitchRow = [0, 147, 2, 0, 0, 1, -1.645, 5.942, 5.386, -133.458, -5.875, -12.96, 30.399, -12.37, 3.29, 1.596];
const ROW2: PitchRow = [6, 131, 3, 0, 1, 1, -1.737, 6.062, 5.263, -118.459, -1.853, -1.791, 21.13, -28.617, 3.234, 1.568];

const BATTER: PlayerCaption = { role: '타자', name: '김타자', hand: '좌타', stats: '타율 .342 · OPS .884', color: '#D6D6D6' };
const PITCHER: PlayerCaption = { role: '투수', name: '박투수', hand: '우투', stats: 'ERA 2.65 · WHIP 1.53', color: '#86A8EE' };

function renderTracker() {
  const ref = createRef<PitchTrackerHandle>();
  render(<PitchTracker ref={ref} bases={7} zone={null} sky="night" homeColor="#5C8DF6" batter={BATTER} pitcher={PITCHER} />);
  return () => {
    if (!ref.current) throw new Error('트래커 핸들이 없어요');
    return ref.current;
  };
}

describe('PitchTracker', () => {
  it('자막은 두 줄이다: 이름과 손 한 줄, 시즌 기록 한 줄', () => {
    // 21-pitch-stage step 1: 세 줄 120px을 두 줄 64px로 줄여 경기장을 1.44배로 넓혔다
    renderTracker();
    expect(screen.getByText('김타자')).toBeInTheDocument();
    expect(screen.getByText('좌타')).toBeInTheDocument();
    expect(screen.getByText('타율 .342 · OPS .884')).toBeInTheDocument();
    expect(screen.getByText('박투수')).toBeInTheDocument();
    expect(screen.getByText('우투')).toBeInTheDocument();
    expect(screen.getByText('ERA 2.65 · WHIP 1.53')).toBeInTheDocument();
    expect(screen.getByText('VS')).toBeInTheDocument();
    // 역할(타자·투수)은 자리와 색으로 보이지만 읽어 주기 위해 글자로도 남긴다
    expect(screen.getByText('타자')).toBeInTheDocument();
    expect(screen.getByText('투수')).toBeInTheDocument();
    expect(screen.queryByText('타자 · 좌타')).toBeNull();
  });

  it('playPitch는 구종·구속 판과 콜을 보여주고 번호 원을 남긴다', async () => {
    const handle = renderTracker();
    await act(async () => {
      await handle().playPitch({ row: ROW, code: 'S', number: 1, fast: true });
    });
    expect(screen.getByText('1구 직구')).toBeInTheDocument();
    expect(screen.getByText('147')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('헛스윙');
    expect(handle().inspect().markers).toBe(1);
  });

  it('배너가 있으면 콜 자리에 결과 헤드라인을 쓴다', async () => {
    const handle = renderTracker();
    await act(async () => {
      await handle().playPitch({ row: ROW, code: 'X', number: 2, banner: { text: '2타점 적시타', tone: 'big' } });
    });
    expect(screen.getByRole('status')).toHaveTextContent('2타점 적시타');
  });

  it('clearMarkers는 판·콜·번호 원을 지운다', async () => {
    const handle = renderTracker();
    await act(async () => {
      await handle().playPitch({ row: ROW, code: 'B', number: 1 });
    });
    act(() => handle().clearMarkers());
    expect(screen.queryByText('1구 직구')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(handle().inspect().markers).toBe(0);
  });

  it('replay는 실제 투구를 순서대로 다시 날리고 마지막 공의 판과 콜을 남긴다', async () => {
    const handle = renderTracker();
    await act(async () => {
      await handle().replay([ROW, ROW2]);
    });
    expect(handle().inspect().markers).toBe(2);
    expect(screen.getByText('2구 체인지업')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('파울');
  });

  it('markPitches는 연출 없이 번호 원만 찍고, setSkipping(true) 동안 playPitch도 번호 원만 남긴다', async () => {
    const handle = renderTracker();
    act(() => handle().markPitches([ROW, ROW2]));
    expect(handle().inspect().markers).toBe(2);
    expect(screen.queryByText(/구 직구/)).toBeNull();
    act(() => handle().setSkipping(true));
    await act(async () => {
      await handle().playPitch({ row: ROW, code: 'S', number: 1 });
    });
    expect(handle().inspect().markers).toBe(3);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
