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
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
  body { width: 1000px; background: #eef2f7; padding: 40px;
    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'WenQuanYi Zen Hei', sans-serif; color: #1d2733; }
  .card { background: #fff; border-radius: 24px; overflow: hidden; box-shadow: 0 6px 24px rgba(20,40,70,.12); }
  .head { background: #1f3a5f; color: #fff; padding: 36px 48px; font-size: 44px; font-weight: 800; line-height: 1.3; word-break: keep-all; }
  .body { padding: 40px 48px; }
  .cover { background: #1f3a5f; color: #fff; padding: 120px 60px; text-align: center; word-break: keep-all; }
  .cover h1 { font-size: 64px; line-height: 1.3; font-weight: 800; }
  .cover p { margin-top: 28px; font-size: 38px; color: #ffd66b; font-weight: 700; }
  li { list-style: none; display: flex; gap: 20px; align-items: flex-start; font-size: 36px; line-height: 1.45;
    padding: 18px 0; border-bottom: 2px solid #edf0f4; word-break: keep-all; }
  li:last-child { border-bottom: 0; }
  li b { flex: none; color: #1f3a5f; }
  .steps li b { width: 56px; height: 56px; border-radius: 50%; background: #1f3a5f; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 30px; }
  .check li b { color: #1a8f5a; }
  table { width: 100%; border-collapse: collapse; font-size: 34px; line-height: 1.45; word-break: keep-all; }
  th, td { padding: 22px 16px; border-bottom: 2px solid #edf0f4; text-align: left; vertical-align: top; }
  th { width: 34%; color: #1f3a5f; background: #f4f7fb; font-weight: 800; }
  .src { padding: 18px 48px 28px; font-size: 24px; color: #6b7785; text-align: right; }
  .cv .src { background: #1f3a5f; color: #b8c7da; }
</style></head><body><div class="card ${spec.type === 'cover' ? 'cv' : ''}">
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
