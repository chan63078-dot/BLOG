// 네이버 블로그 스마트에디터 ONE에 글을 입력하고 발행한다.
// 단독 실행: node scripts/publish.mjs output/파일.txt [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { LOG_DIR, PROFILE_DIR, loadConfig, log, parsePost } from './common.mjs';

const POST_URL = /logNo=\d+|blog\.naver\.com\/[^/?]+\/\d{6,}/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickIfVisible(locator, timeout = 3000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    await locator.first().click();
    return true;
  } catch {
    return false;
  }
}

async function editorFrame(page) {
  const iframe = await page.waitForSelector('iframe#mainFrame', { timeout: 15000 }).catch(() => null);
  const frame = iframe ? await iframe.contentFrame() : page.mainFrame();
  await frame.waitForSelector('.se-documentTitle', { timeout: 30000 });
  return frame;
}

async function typeBody(page, body) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.insertText(lines[i]);
    if (i < lines.length - 1) await page.keyboard.press('Enter');
    if (i % 15 === 14) await sleep(300);
  }
}

async function findPostUrl(page) {
  for (let i = 0; i < 30; i++) {
    for (const url of [page.url(), ...page.frames().map((f) => f.url())]) {
      if (POST_URL.test(url)) return url;
    }
    await sleep(1000);
  }
  return null;
}

export async function publishPost(post, config, { dryRun = false } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: config.browserChannel || undefined,
    headless: !!config.headless,
    viewport: { width: 1400, height: 900 },
    locale: 'ko-KR',
    chromiumSandbox: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(`https://blog.naver.com/${config.blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    if (page.url().includes('nid.naver.com')) {
      throw new Error('네이버 로그인이 풀렸습니다. npm run login 으로 다시 로그인하세요.');
    }

    const frame = await editorFrame(page);
    // "작성 중인 글이 있습니다" 팝업 → 새로 쓰기, 도움말 패널 닫기
    await clickIfVisible(frame.locator('.se-popup-button-cancel'));
    await clickIfVisible(frame.locator('.se-help-panel-close-button'), 1500);

    await frame.locator('.se-documentTitle .se-text-paragraph').first().click();
    await page.keyboard.insertText(post.title);

    await frame.locator('.se-component.se-text:not(.se-documentTitle) .se-text-paragraph').first().click();
    await typeBody(page, post.body);
    log(`에디터 입력 완료: ${post.title} (${post.body.length}자, 태그 ${post.tags.length}개)`);

    if (dryRun) {
      log('시험 실행: 발행 버튼은 누르지 않았습니다. 브라우저를 닫으면 끝납니다.');
      await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
      return null;
    }

    // 상단 "발행" 버튼 → 발행 설정 창
    await frame
      .locator('button[class*="publish_btn"]')
      .or(frame.getByRole('button', { name: '발행', exact: true }))
      .first()
      .click();
    await sleep(1500);

    const tagInput = frame.locator('input[placeholder*="태그"], #tag-input').first();
    if (post.tags.length && (await tagInput.isVisible().catch(() => false))) {
      for (const tag of post.tags) {
        await tagInput.click();
        await page.keyboard.insertText(tag);
        await page.keyboard.press('Enter');
        await sleep(200);
      }
    }

    // 발행 설정 창의 최종 "발행" 버튼
    await frame
      .locator('button[class*="confirm_btn"]')
      .or(frame.locator('[class*="layer_btn"] button:has-text("발행")'))
      .first()
      .click();

    const url = await findPostUrl(page);
    if (!url) throw new Error('발행 버튼은 눌렀지만 글 주소를 확인하지 못했습니다. 블로그에서 직접 확인하세요.');
    return url;
  } catch (err) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const shot = path.join(LOG_DIR, `error-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    err.message += ` (화면 캡처: ${shot})`;
    throw err;
  } finally {
    await context.close().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: node scripts/publish.mjs output/파일.txt [--dry-run]');
    process.exit(1);
  }
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  const url = await publishPost(post, loadConfig(), { dryRun: process.argv.includes('--dry-run') });
  if (url) log(`발행 완료: ${url}`);
}
