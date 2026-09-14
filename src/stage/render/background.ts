import { H, W, mulberry, project } from '../math';

type Ground = ReadonlyArray<readonly [number, number]>;

/**
 * 포수 뒤 중계 시점의 경기장 배경을 논리 좌표(960×540)로 그린다: 밤하늘·조명탑·관중·전광판 틀·펜스·
 * 잔디 줄무늬·내야 흙·마운드·배터 박스·파울 라인·홈플레이트·비네트. 컨트롤러가 오프스크린 캔버스에
 * 한 번 그려 캐시한다(배율 변환은 호출한 쪽이 먼저 설정한다).
 */
export function buildBackground(b: CanvasRenderingContext2D): void {
  const sky = b.createLinearGradient(0, 0, 0, 175);
  sky.addColorStop(0, '#040A11');
  sky.addColorStop(1, '#10263A');
  b.fillStyle = sky;
  b.fillRect(0, 0, W, 180);
  const lights = [[96, 16, 250], [864, 16, 250], [480, -60, 320]] as const;
  for (const [lx, ly, r] of lights) {
    const glow = b.createRadialGradient(lx, ly, 0, lx, ly, r);
    glow.addColorStop(0, 'rgba(255, 243, 210, 0.30)');
    glow.addColorStop(1, 'rgba(255, 243, 210, 0)');
    b.fillStyle = glow;
    b.fillRect(0, 0, W, 200);
  }
  b.fillStyle = '#FFF4D6';
  for (const lx of [96, 864]) {
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) b.fillRect(lx - 30 + k * 9, 8 + r * 6, 6, 3);
  }

  const wallTop = project(0, 385, 10).y;
  const wallBot = project(0, 385, 0).y;
  b.fillStyle = '#0A1622';
  b.fillRect(0, 56, W, wallTop - 56);
  const rnd = mulberry(11);
  const crowd = ['rgba(214, 96, 92, 0.5)', 'rgba(205, 210, 220, 0.38)', 'rgba(96, 136, 214, 0.45)', 'rgba(255, 196, 90, 0.35)'];
  for (let i = 0; i < 2600; i++) {
    b.fillStyle = crowd[Math.floor(rnd() * crowd.length)];
    b.fillRect(rnd() * W, 60 + rnd() * (wallTop - 64), 2, 2);
  }
  b.fillStyle = '#03070C';
  b.fillRect(386, 64, 188, 54);
  b.strokeStyle = '#2A4054';
  b.lineWidth = 1;
  b.strokeRect(386.5, 64.5, 187, 53);
  b.fillStyle = '#0D3325';
  b.fillRect(0, wallTop, W, wallBot - wallTop + 1);
  b.fillStyle = '#E2C443';
  b.fillRect(0, wallTop - 1, W, 2);
  for (let y = 385, i = 0; y > -4; y -= 14, i++) {
    const top = project(0, y, 0).y;
    const bot = project(0, Math.max(y - 14, -4), 0).y;
    b.fillStyle = i % 2 ? '#1D5635' : '#22613D';
    b.fillRect(0, top, W, Math.min(bot, H) - top + 1);
  }

  const poly = (pts: Ground, fill: string, z = 0) => {
    b.beginPath();
    pts.forEach(([x, y], i) => {
      const p = project(x, y, z);
      if (i) b.lineTo(p.x, p.y);
      else b.moveTo(p.x, p.y);
    });
    b.closePath();
    b.fillStyle = fill;
    b.fill();
  };
  const ring = (cx: number, cy: number, r: number, n: number): Ground =>
    Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)] as const);
  const outfieldEdge: Array<readonly [number, number]> = [];
  for (let deg = -58; deg <= 58; deg += 4) {
    outfieldEdge.push([95 * Math.sin((deg * Math.PI) / 180), 60.5 + 95 * Math.cos((deg * Math.PI) / 180)]);
  }
  poly([[-6, -3], [-80, 74], ...outfieldEdge, [80, 74], [6, -3]], '#83573A');
  poly([[0, 16], [56, 64], [0, 112], [-56, 64]], '#24673F');
  poly(ring(0, 59, 9, 28), '#8F6242');
  poly([[-1, 60.5], [1, 60.5], [1, 61], [-1, 61]], '#F2F2EC', 0.83);
  poly(ring(0, 0.7, 13, 40), '#83573A');

  b.strokeStyle = 'rgba(238, 242, 233, 0.8)';
  b.lineWidth = 2;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const p = project(x1, y1, 0);
    const q = project(x2, y2, 0);
    b.beginPath();
    b.moveTo(p.x, p.y);
    b.lineTo(q.x, q.y);
    b.stroke();
  };
  for (const sx of [-1, 1]) {
    line(sx * 1.2, -2.3, sx * 5.2, -2.3);
    line(sx * 5.2, -2.3, sx * 5.2, 3.7);
    line(sx * 5.2, 3.7, sx * 1.2, 3.7);
    line(sx * 1.2, 3.7, sx * 1.2, -2.3);
    line(sx * 6, 6, sx * 320, 320);
  }
  poly([[-0.708, 1.417], [0.708, 1.417], [0.708, 0.708], [0, 0], [-0.708, 0.708]], '#F4F4EE');

  const vignette = b.createRadialGradient(W / 2, 300, 200, W / 2, 300, 640);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  b.fillStyle = vignette;
  b.fillRect(0, 0, W, H);
}
