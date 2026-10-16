// 에디터 구조 진단: npm run inspect
// 글쓰기 화면을 열어 툴바 버튼, 소제목 메뉴, 글자 배경색 메뉴, 사진 블록의 구조를 logs/editor-dom.txt 에 기록한다.
// 발행하지 않는다. 진단용 문장이 임시저장에 남을 수 있으니 끝나면 지워 주세요.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { LOG_DIR, PROFILE_DIR, browserOptions, loadConfig } from './common.mjs';

const config = loadConfig();
fs.mkdirSync(LOG_DIR, { recursive: true });
const out = [];
const section = (name, lines) => out.push(`\n===== ${name} =====`, ...(Array.isArray(lines) ? lines : [lines]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 화면에 보이는 버튼·메뉴 항목을 속성과 함께 나열
const visibleControls = (frame) =>
  frame.evaluate(() =>
    [...document.querySelectorAll('button, li, [role="option"], [role="menuitem"], [data-color], [data-value]')]
      .filter((e) => e.offsetParent !== null || e.getClientRects().length)
      .map((e) => {
        const data = [...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}="${a.value}"`);
        const text = (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        return `${e.tagName} class="${e.className}" ${data.join(' ')} title="${e.title || ''}" aria="${e.getAttribute('aria-label') || ''}" text="${text}"`;
      }),
  );

async function clickFirst(frame, selectors) {
  for (const sel of selectors) {
    const loc = frame.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click();
      return sel;
    }
  }
  return null;
}

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  ...browserOptions(config),
  headless: false,
  viewport: { width: 1400, height: 900 },
  locale: 'ko-KR',
});
const page = context.pages()[0] ?? (await context.newPage());
try {
  await page.goto(`https://blog.naver.com/${config.blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const iframe = await page.waitForSelector('iframe#mainFrame', { timeout: 15000 }).catch(() => null);
  const frame = iframe ? await iframe.contentFrame() : page.mainFrame();
  await frame.waitForSelector('.se-documentTitle', { timeout: 30000 });
  for (const sel of ['.se-popup-button-cancel', '.se-help-panel-close-button']) {
    await frame.locator(sel).first().click({ timeout: 2000 }).catch(() => {});
  }

  const base = new Set(await visibleControls(frame));
  section('A. 툴바와 화면의 버튼', [...base]);

  await frame.locator('.se-component.se-text:not(.se-documentTitle) .se-text-paragraph').first().click();
  await page.keyboard.insertText('진단용 문장입니다 배경색 시험');

  // B. 소제목(문단 서식) 메뉴
  const formatBtn = await clickFirst(frame, [
    'button[data-name="text-format"]',
    '.se-text-format-toolbar-button',
    'button[class*="text-format"]',
    'button:has-text("본문")',
  ]);
  await sleep(800);
  section('B. 문단 서식 버튼', `클릭한 버튼: ${formatBtn}`);
  section('B. 문단 서식 메뉴 (새로 보인 것)', (await visibleControls(frame)).filter((l) => !base.has(l)));
  await page.screenshot({ path: path.join(LOG_DIR, 'inspect-format.png') });
  await page.keyboard.press('Escape');
  await sleep(500);

  // C. 글자 배경색 메뉴 (방금 쓴 문장을 선택한 뒤)
  await frame.locator('.se-component.se-text:not(.se-documentTitle) .se-text-paragraph').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  const bgBtn = await clickFirst(frame, [
    'button[data-name="background-color"]',
    '.se-background-color-toolbar-button',
    'button[class*="background-color"]',
    'button[class*="bg-color"]',
    'button[title*="배경"]',
    'button[aria-label*="배경"]',
  ]);
  await sleep(800);
  section('C. 배경색 버튼', `클릭한 버튼: ${bgBtn}`);
  section('C. 배경색 메뉴 (새로 보인 것)', (await visibleControls(frame)).filter((l) => !base.has(l)));
  await page.screenshot({ path: path.join(LOG_DIR, 'inspect-bgcolor.png') });
  await page.keyboard.press('Escape');
  await sleep(500);

  // D. 사진 블록 구조 (작은 시험 사진을 올려 본다)
  const png = path.join(LOG_DIR, 'inspect-test.png');
  fs.writeFileSync(
    png,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  );
  await frame.locator('.se-component.se-text:not(.se-documentTitle) .se-text-paragraph').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      frame.locator('button[data-name="image"], .se-image-toolbar-button').or(frame.locator('button:has-text("사진")')).first().click(),
    ]);
    await chooser.setFiles(png);
    await frame.locator('.se-component.se-image').last().waitFor({ timeout: 30000 });
    await sleep(1500);
    const html = await frame.locator('.se-component.se-image').last().evaluate((e) => e.outerHTML);
    section('D. 사진 블록 HTML', html.slice(0, 6000));
    const after = await frame.evaluate(() =>
      [...document.querySelectorAll('.se-component')].map((e) => e.className).join('\n'),
    );
    section('D. 사진을 넣은 뒤 블록 순서', after);
  } catch (err) {
    section('D. 사진 블록', `실패: ${err.message.split('\n')[0]}`);
  }
  await page.screenshot({ path: path.join(LOG_DIR, 'inspect-image.png') });
} catch (err) {
  section('오류', err.stack ?? String(err));
} finally {
  const file = path.join(LOG_DIR, 'editor-dom.txt');
  fs.writeFileSync(file, out.join('\n'), 'utf8');
  console.log(`진단 결과 저장: ${file}`);
  console.log('이 파일을 Claude에게 첨부해 주세요. (진단용 문장은 임시저장에서 지워 주세요)');
  await context.close().catch(() => {});
}
