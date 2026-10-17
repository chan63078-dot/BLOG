// 네이버 블로그 스마트에디터 ONE에 글을 입력하고 발행한다.
// 단독 실행: node scripts/publish.mjs output/파일.txt [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { IMAGE_LINE, LOG_DIR, PROFILE_DIR, browserOptions, loadConfig, log, parsePost } from './common.mjs';

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

// 서식 표기(CLAUDE.md 9장)를 에디터 서식으로 바꿔 입력한다.
// 서식 적용에 실패하면 굵은 글씨/일반 글자로 대신 넣어서 발행 자체는 멈추지 않게 한다.
const INLINE = /(\*\*[^*]+\*\*|==[^=]+==)/;

async function typeBold(page, text) {
  await page.keyboard.press('Control+B');
  await page.keyboard.insertText(text);
  await page.keyboard.press('Control+B');
}

const HIGHLIGHT_COLOR = '#fff8b2'; // 글자 배경색 팔레트의 연노랑

async function setBackgroundColor(frame, color) {
  await frame.locator('button.se-background-color-toolbar-button:visible').first().click({ timeout: 3000 });
  await frame.locator(`button.se-color-palette[data-color="${color}"]:visible`).first().click({ timeout: 3000 });
}

// 형광펜: 글자를 넣고 선택한 뒤 배경색을 칠하고, 뒤에 이어 쓰는 글자는 '색상 없음'으로 되돌린다
async function typeHighlight(page, frame, text) {
  await page.keyboard.insertText(text);
  try {
    for (let i = 0; i < text.length; i++) await page.keyboard.press('Shift+ArrowLeft');
    await setBackgroundColor(frame, HIGHLIGHT_COLOR);
    await page.keyboard.press('ArrowRight');
    await setBackgroundColor(frame, '');
  } catch {
    await page.keyboard.press('Escape');
    await page.keyboard.press('End');
    log(`형광펜 적용 실패 → 일반 글자로 둡니다: ${text}`);
  }
}

async function typeInline(page, frame, line) {
  for (const part of line.split(INLINE).filter(Boolean)) {
    const marked = part.match(/^(\*\*|==)(.+)\1$/);
    if (marked?.[1] === '**') await typeBold(page, marked[2]);
    else if (marked) await typeHighlight(page, frame, marked[2]);
    else await page.keyboard.insertText(part);
  }
}

// 문단 서식 메뉴의 항목은 글자("소제목 소제목")보다 data-value로 고르는 편이 확실하다
const TEXT_FORMAT_VALUE = { 본문: 'text', 소제목: 'sectionTitle', 인용구: 'quotation' };

async function setTextFormat(frame, name) {
  await frame.locator('button.se-text-format-toolbar-button:visible').first().click({ timeout: 3000 });
  await frame
    .locator(`button[data-name="text-format"][data-value="${TEXT_FORMAT_VALUE[name]}"]:visible`)
    .first()
    .click({ timeout: 3000 });
}

async function typeHeading(page, frame, text) {
  try {
    await setTextFormat(frame, '소제목');
    await page.keyboard.insertText(text);
    await page.keyboard.press('Enter');
    await setTextFormat(frame, '본문').catch(() => page.keyboard.press('Escape'));
  } catch {
    await page.keyboard.press('Escape');
    log(`소제목 서식 적용 실패 → 굵은 글씨로 대신: ${text}`);
    await typeBold(page, text);
    await page.keyboard.press('Enter');
  }
}

// 사진·구분선처럼 블록을 넣은 뒤, 그 아래 새 문단 끝으로 커서를 옮긴다
async function focusEnd(page, frame) {
  await frame.locator('.se-component.se-text:not(.se-documentTitle) .se-text-paragraph').last().click();
  await page.keyboard.press('End');
}

async function insertImage(page, frame, file, caption) {
  const images = frame.locator('.se-component.se-image');
  const before = await images.count();
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      frame
        .locator('button[data-name="image"], .se-image-toolbar-button')
        .or(frame.locator('button:has-text("사진")'))
        .first()
        .click(),
    ]);
    await chooser.setFiles(file);
    await images.nth(before).waitFor({ timeout: 60000 });
    // 올리는 중(전송중...)에는 사진 칸이 1px이라 설명 칸을 누를 수 없다 → 전송이 끝날 때까지 기다린다
    await images.nth(before).locator('.se-is-progress').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
    await sleep(1000);
  } catch (err) {
    log(`사진 넣기 실패 (${path.basename(file)}): ${err.message.split('\n')[0]}`);
    return false;
  }

  let captioned = false;
  if (caption) {
    try {
      // 설명 칸은 사진을 선택해야 보인다
      await images.nth(before).locator('img.se-image-resource').first().click({ timeout: 5000 });
      await sleep(500);
      await images.nth(before).locator('.se-caption .se-text-paragraph').first().click({ timeout: 5000 });
      await page.keyboard.insertText(caption);
      captioned = true;
    } catch {
      log('사진 설명 칸을 찾지 못해 본문 줄로 넣습니다.');
    }
  }
  await focusEnd(page, frame);
  if (caption && !captioned) {
    await page.keyboard.insertText(caption);
    await page.keyboard.press('Enter');
  }
  return captioned || !caption;
}

async function insertDivider(page, frame) {
  try {
    await frame
      .locator('button[data-name="horizontal-line"], .se-insert-horizontal-line-default-toolbar-button')
      .or(frame.locator('button:has-text("구분선")'))
      .first()
      .click({ timeout: 3000 });
    await sleep(500);
    await focusEnd(page, frame);
  } catch {
    log('구분선 삽입 실패 → 글자 구분선으로 대신');
    await page.keyboard.insertText('────────────');
    await page.keyboard.press('Enter');
  }
}

export async function typeBody(page, frame, body, baseDir) {
  const lines = body.split('\n');
  let afterBlock = false; // 사진·구분선 바로 뒤 빈 줄은 건너뛴다 (에디터가 이미 새 문단을 만듦)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    if (afterBlock && !line.trim()) continue;
    afterBlock = false;
    const image = line.trim().match(IMAGE_LINE);
    if (image) {
      // 설명을 본문 줄로 넣었으면 다음 빈 줄은 살려서 소제목과 붙지 않게 한다
      afterBlock = await insertImage(page, frame, path.resolve(baseDir, image[1]), image[2]);
      continue;
    }
    if (/^##\s+/.test(line)) {
      await typeHeading(page, frame, line.replace(/^##\s+/, ''));
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      await insertDivider(page, frame);
      afterBlock = true;
      continue;
    }
    const cells = line.match(/^\|(.+)\|\s*$/)?.[1].split('|').map((c) => c.trim());
    if (cells?.every((c) => /^:?-+:?$/.test(c))) continue; // 표 머리글 구분줄
    if (cells) {
      // 2열 표는 "항목: 내용" 줄로 입력한다
      await typeBold(page, cells[0]);
      if (cells[1]) await typeInline(page, frame, `: ${cells.slice(1).join(' / ')}`);
    } else if (line) {
      await typeInline(page, frame, line);
    }
    if (!isLast) await page.keyboard.press('Enter');
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
    ...browserOptions(config),
    headless: !!config.headless,
    viewport: { width: 1400, height: 900 },
    locale: 'ko-KR',
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
    await typeBody(page, frame, post.body, post.baseDir);
    log(`에디터 입력 완료: ${post.title} (${post.plainLength}자, 사진 ${post.images.length}장, 태그 ${post.tags.length}개)`);

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
  const post = parsePost(fs.readFileSync(file, 'utf8'), path.dirname(path.resolve(file)));
  const url = await publishPost(post, loadConfig(), { dryRun: process.argv.includes('--dry-run') });
  if (url) log(`발행 완료: ${url}`);
}
