// 정리 이미지(카드) 만들기: node scripts/make-card.mjs <설정.json> <저장할.png>
// 설정 예시:
//   {"type":"cover","title":"2026 독감 예방접종","subtitle":"대상·기간·장소 한눈에","source":"정리: 직접 제작"}
//   {"type":"list"|"steps"|"checklist","title":"…","items":["…","…"],"source":"출처: 질병관리청 (2026.10.16 확인)"}
//   {"type":"table","title":"…","rows":[["항목","내용"],["…","…"]],"source":"…"}
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { browserOptions, readConfig } from './common.mjs';

const [specFile, outFile] = process.argv.slice(2);
if (!specFile || !outFile) {
  console.error('사용법: node scripts/make-card.mjs <설정.json> <저장할.png>');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

// 글마다 카드 색과 머리 모양을 바꾼다 (같은 글 안에서는 같게).
// 글 폴더 이름(20261027-3, tistory-20261027-3)의 날짜·번호로 고르므로 이어지는 글끼리 겹치지 않는다.
// 설정에 "theme": 0~5 를 주면 그 색을 쓴다.
const THEMES = [
  { main: '#1f3a5f', accent: '#ffd66b', bg: '#eef2f7', soft: '#f4f7fb', check: '#1a8f5a' },
  { main: '#1e5b4f', accent: '#ffe08a', bg: '#edf5f2', soft: '#f1f8f5', check: '#1e7a4f' },
  { main: '#6b2737', accent: '#ffd1a1', bg: '#f7eff0', soft: '#fbf4f5', check: '#2f7d4f' },
  { main: '#2f3640', accent: '#7fd1ff', bg: '#f0f1f3', soft: '#f5f6f8', check: '#1a8f5a' },
  { main: '#0f5e78', accent: '#ffe66d', bg: '#ebf4f7', soft: '#f1f8fa', check: '#1a8f5a' },
  { main: '#4a3b7a', accent: '#ffd66b', bg: '#f2f0f8', soft: '#f6f4fb', check: '#2f7d4f' },
];
function themeIndex() {
  if (Number.isInteger(spec.theme)) return spec.theme % THEMES.length;
  const m = path.resolve(outFile).replaceAll('\\', '/').match(/(\d{4})(\d{2})(\d{2})-(\d+)\/images\//);
  if (!m) return 0;
  const day = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  return (day * 3 + +m[4]) % THEMES.length;
}
const ti = themeIndex();
const T = THEMES[ti];
// 머리 모양: 짝수는 색 띠, 홀수는 흰 바탕에 왼쪽 굵은 선
const lineHead = ti % 2 === 1;
const esc =(s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function content() {
  const items = spec.items ?? [];
  switch (spec.type) {
    case 'cover':
      return `<div class="cover"><h1>${esc(spec.title)}</h1>${spec.subtitle ? `<p>${esc(spec.subtitle)}</p>` : ''}</div>`;
    case 'steps':
      return `<ol class="steps">${items.map((t, i) => `<li><b>${i + 1}</b><span>${esc(t)}</span></li>`).join('')}</ol>`;
    case 'checklist':
      return `<ul class="check">${items.map((t) => `<li><b>✓</b><span>${esc(t)}</span></li>`).join('')}</ul>`;
    case 'table':
      return `<table>${(spec.rows ?? []).map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
    default:
      return `<ul class="list">${items.map((t) => `<li><b>•</b><span>${esc(t)}</span></li>`).join('')}</ul>`;
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1000px; background: ${T.bg}; padding: 40px;
    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'WenQuanYi Zen Hei', sans-serif; color: #1d2733; }
  .card { background: #fff; border-radius: ${lineHead ? 12 : 24}px; overflow: hidden; box-shadow: 0 6px 24px rgba(20,40,70,.12); }
  .head { background: ${T.main}; color: #fff; padding: 36px 48px; font-size: 44px; font-weight: 800; line-height: 1.3; word-break: keep-all; }
  .line .head { background: #fff; color: ${T.main}; border-left: 16px solid ${T.main}; border-bottom: 2px solid #edf0f4; padding: 36px 40px 30px; }
  .body { padding: 40px 48px; }
  .cover { background: ${T.main}; color: #fff; padding: 120px 60px; text-align: center; word-break: keep-all; }
  .cover h1 { font-size: 64px; line-height: 1.3; font-weight: 800; }
  .cover p { margin-top: 28px; font-size: 38px; color: ${T.accent}; font-weight: 700; }
  li { list-style: none; display: flex; gap: 20px; align-items: flex-start; font-size: 36px; line-height: 1.45;
    padding: 18px 0; border-bottom: 2px solid #edf0f4; word-break: keep-all; }
  li:last-child { border-bottom: 0; }
  li b { flex: none; color: ${T.main}; }
  .steps li b { width: 56px; height: 56px; border-radius: ${lineHead ? 12 : 28}px; background: ${T.main}; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 30px; }
  .check li b { color: ${T.check}; }
  table { width: 100%; border-collapse: collapse; font-size: 34px; line-height: 1.45; word-break: keep-all; }
  th, td { padding: 22px 16px; border-bottom: 2px solid #edf0f4; text-align: left; vertical-align: top; }
  th { width: 34%; color: ${T.main}; background: ${T.soft}; font-weight: 800; }
  .src { padding: 18px 48px 28px; font-size: 24px; color: #6b7785; text-align: right; }
  .cv .src { background: ${T.main}; color: rgba(255,255,255,.7); }
</style></head><body><div class="card ${spec.type === 'cover' ? 'cv' : lineHead ? 'line' : ''}">
  ${spec.type === 'cover' ? content() : `<div class="head">${esc(spec.title)}</div><div class="body">${content()}</div>`}
  <div class="src">${esc(spec.source || '정리: 직접 제작')}</div>
</div></body></html>`;

const browser = await chromium.launch({ ...browserOptions(readConfig()), headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.setContent(html, { waitUntil: 'load' });
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
await page.locator('body').screenshot({ path: outFile });
await browser.close();
console.log(`저장: ${outFile}`);
