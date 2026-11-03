// 웹페이지 화면 캡처: node scripts/capture.mjs <주소> <저장할.png> [화면에 보여야 할 문구]
// 문구를 주면 그 위치로 스크롤해서 찍고, 페이지에 문구가 없으면 실패(종료 코드 1)로 알린다.
// 캡처 후에는 반드시 이미지를 직접 열어 확인한다 (CLAUDE.md "사진" 참고).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { browserOptions, readConfig } from './common.mjs';

const [url, outFile, find] = process.argv.slice(2);
if (!url || !outFile) {
  console.error('사용법: node scripts/capture.mjs <주소> <저장할.png> [보여야 할 문구]');
  process.exit(1);
}

const browser = await chromium.launch({ ...browserOptions(readConfig()), headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
let ok = true;
try {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  if (!res || res.status() >= 400) {
    ok = false;
    console.log(`HTTP 상태 ${res?.status()} — 다른 주소를 쓰세요.`);
  }
  if (find) {
    const target = page.getByText(find, { exact: false }).first();
    if (await target.count()) {
      // 찾은 문구가 화면 위쪽에 오도록 스크롤
      await target.evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -120);
      });
      await page.waitForTimeout(500);
    } else {
      ok = false;
      console.log(`페이지에 "${find}" 문구가 없습니다 — 엉뚱한 페이지일 수 있습니다.`);
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  await page.screenshot({ path: outFile });
  console.log(`저장: ${outFile}\n페이지 제목: ${await page.title()}\n최종 주소: ${page.url()}`);
} catch (err) {
  ok = false;
  console.log(`캡처 실패: ${err.message}`);
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);
