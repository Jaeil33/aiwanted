import styles from './Screen.module.css';

/** 자리 표시: 실측 변수 판정·엔진 신뢰도는 step 6에서 채운다 */
export function EvidenceScreen() {
  return (
    <section className={styles.screen} aria-labelledby="evidence-title">
      <h2 id="evidence-title" className={styles.title}>
        판정소
      </h2>
    </section>
  );
}
