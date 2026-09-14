import { EVIDENCE_LABEL, MODE_LABEL, josa } from '../../domain/format';
import { KNOB_IDS } from '../../domain/knobs';
import { TOON_FACTOR } from '../../engine';
import styles from './AboutScreen.module.css';

interface AboutSection {
  id: string;
  title: string;
  body: string;
}

/* 개인·팀 정보(이름, 연락처, 팀원, 대회 순위, 노션 내용)는 넣지 않는다: 공개 작품이고 팀원 동의가 없다 */
const SECTIONS: readonly AboutSection[] = [
  {
    id: 'about-origin',
    title: '위기에 약한 투수는 정말 있을까',
    body:
      '만든 사람은 LG Aimers 투수 제구 예측 대회에서 모델링과 가설 검증을 맡아 134번의 실험을 했어요. ' +
      '사람들이 믿는 멘탈·클러치 변수 5개(클러치, 3볼 카운트, 주자 상황, 득점권, 후반기)를 넣었더니 모두 효과가 없거나 오히려 점수를 떨어뜨렸어요. ' +
      '그래서 반대로 쓸모없는 변수를 마음껏 넣어 보고, 진짜 효과는 기록으로 판정하는 게임을 만들었어요.',
  },
  {
    id: 'about-engine',
    title: '어떻게 계산하나',
    body:
      '타석 → 이닝 → 경기 순서로 계산해요. 타석은 타자와 투수 기록을 리그 평균 대비로 맞대결시키고, ' +
      '이닝은 아웃·주자·타순을 모두 따라가며 정확히 계산하고, 경기는 11회까지 승부가 나지 않으면 무승부로 끝나는 규칙대로 계산해요. ' +
      '무작위로 여러 번 돌려 보는 방식이 아니라 정확한 계산이라 0.1%p 차이도 흔들리지 않아요.',
  },
  {
    id: 'about-ai',
    title: 'AI는 무엇을 하나',
    body:
      `Claude가 자유 문장을 ${KNOB_IDS.length}개 조절 항목과 실측 변수로 번역하고, "진짜야?"를 누르면 기록표를 조회해 설명해요. ` +
      '확률 숫자는 AI가 만들지 않고 엔진이 계산해요. AI를 쓸 수 없으면 규칙 사전으로 대신해요.',
  },
  {
    id: 'about-grades',
    title: '근거 등급과 모드',
    body:
      `근거 등급은 세 가지예요. ${josa(EVIDENCE_LABEL.measured, '은/는')} 기록으로 효과를 추정한 변수, ` +
      `${josa(EVIDENCE_LABEL.plausible, '은/는')} 야구에서 그럴듯한 근거가 있는 변수, ${josa(EVIDENCE_LABEL.fun, '은/는')} 순전히 재미로 넣은 변수예요. ` +
      `${josa(MODE_LABEL.real, '은/는')} 효과 크기를 그대로 쓰고, ${josa(MODE_LABEL.toon, '은/는')} 효과를 ${TOON_FACTOR}배 과장해요.`,
  },
  {
    id: 'about-data',
    title: '데이터와 한계',
    body:
      '기록과 중계는 네이버 스포츠의 KBO 기록·문자 중계(2026년 8월 1일~9월 13일 140경기 중계, 2021~2026 일정)이고, 날씨는 Open-Meteo 기록이에요. ' +
      '선수 교체와 도루는 계산하지 않고, 장면 투수는 그 반이닝까지만 던진 뒤 이후 이닝은 팀 불펜 평균으로 던지며, 주루 확률은 고정값이에요. ' +
      '선수 사진과 구단 로고는 쓰지 않아요.',
  },
];

/** 만든 이유: 출발점, 계산, AI의 역할, 근거 등급과 모드, 데이터와 한계 */
export function AboutScreen() {
  return (
    <section className={styles.screen} aria-labelledby="about-title">
      <h2 id="about-title" className={styles.title}>
        만든 이유
      </h2>
      {SECTIONS.map((section) => (
        <section key={section.id} className={styles.section} aria-labelledby={section.id}>
          <h3 id={section.id} className={styles.sectionTitle}>
            {section.title}
          </h3>
          <p className={styles.body}>{section.body}</p>
        </section>
      ))}
      <a className={styles.textLink} href="#/evidence">
        판정소에서 변수별 판정 보기
      </a>
    </section>
  );
}
