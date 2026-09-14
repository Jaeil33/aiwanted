import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_LABEL, MODE_LABEL } from '../../domain/format';
import { KNOB_IDS } from '../../domain/knobs';
import { TOON_FACTOR } from '../../engine';
import { AboutScreen } from './AboutScreen';

const SECTIONS = ['위기에 약한 투수는 정말 있을까', '어떻게 계산하나', 'AI는 무엇을 하나', '근거 등급과 모드', '데이터와 한계'];
const section = (name: string) => screen.getByRole('region', { name });

describe('AboutScreen', () => {
  it('제목 "만든 이유"와 다섯 섹션(제목 + 문단)을 순서대로 보여준다', () => {
    render(<AboutScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '만든 이유' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(SECTIONS);
    for (const name of SECTIONS) expect(section(name).querySelector('p')?.textContent).toBeTruthy();
  });

  it('출발점: LG Aimers에서 134번의 실험, 멘탈·클러치 변수 5개가 효과 없거나 점수를 떨어뜨린 경험', () => {
    render(<AboutScreen />);
    const origin = section(SECTIONS[0]);
    expect(origin).toHaveTextContent('LG Aimers 투수 제구 예측 대회');
    expect(origin).toHaveTextContent('134번');
    expect(origin).toHaveTextContent('멘탈·클러치 변수 5개(클러치, 3볼 카운트, 주자 상황, 득점권, 후반기)');
    expect(origin).toHaveTextContent('효과가 없거나 오히려 점수를 떨어뜨렸');
    expect(origin).toHaveTextContent('쓸모없는 변수를 마음껏 넣어 보고, 진짜 효과는 기록으로 판정하는 게임');
  });

  it('계산: 타석 → 이닝 → 경기, 11회 무승부, 정확 계산이라 0.1%p 차이도 흔들리지 않는다', () => {
    render(<AboutScreen />);
    const how = section('어떻게 계산하나');
    for (const phrase of ['타석', '이닝', '11회', '무승부', '0.1%p']) expect(how).toHaveTextContent(phrase);
  });

  it('AI 설명의 조절 항목 수, 근거 등급·모드 이름, 만화 모드 배수는 도메인·엔진 상수에서 온다', () => {
    render(<AboutScreen />);
    const ai = section('AI는 무엇을 하나');
    expect(ai).toHaveTextContent(`Claude가 자유 문장을 ${KNOB_IDS.length}개 조절 항목과 실측 변수로 번역`);
    expect(ai).toHaveTextContent('확률 숫자는 AI가 만들지 않고 엔진이 계산해요');
    expect(ai).toHaveTextContent('규칙 사전');
    const grades = section('근거 등급과 모드');
    for (const label of [...Object.values(EVIDENCE_LABEL), ...Object.values(MODE_LABEL)]) expect(grades).toHaveTextContent(label);
    expect(grades).toHaveTextContent(`효과를 ${TOON_FACTOR}배 과장`);
  });

  it('데이터 출처와 한계를 밝힌다', () => {
    render(<AboutScreen />);
    const limits = section('데이터와 한계');
    for (const phrase of ['네이버 스포츠', 'Open-Meteo', '선수 교체', '도루', '불펜', '주루 확률', '선수 사진']) {
      expect(limits).toHaveTextContent(phrase);
    }
  });

  it('판정소로 가는 링크가 있다', () => {
    render(<AboutScreen />);
    expect(screen.getByRole('link', { name: /판정소/ })).toHaveAttribute('href', '#/evidence');
  });

  it('이름·연락처·팀원·순위 같은 개인·팀 정보를 넣지 않는다', () => {
    const { container } = render(<AboutScreen />);
    const text = container.textContent ?? '';
    expect(text).toContain('만든 사람');
    expect(text).not.toMatch(/@|https?:\/\/|www\./i);
    expect(text).not.toMatch(/\d+\s*(위|등)/);
    for (const word of ['순위', '수상', '팀원', '노션', '저희', '제가']) expect(text).not.toContain(word);
    expect(text).not.toMatch(/notion/i);
  });
});
