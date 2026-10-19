// 티스토리 에디터(TinyMCE)에 글을 넣고 발행한다.
// 로그인은 scripts/tistory-login.mjs 로 저장한 .tistory-profile/session.json 을 쓴다 (2차 인증은 로그인할 때 한 번만).
// 본문은 post.txt 서식 기호(##, **, ==, ---, |표|, [[사진: …]])를 HTML로 바꿔 한 번에 넣는다.
// 단독 실행: node scripts/tistory.mjs output/폴더/post.txt [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { IMAGE_LINE, LOG_DIR, ROOT, browserOptions, loadConfig, log, parsePost } from './common.mjs';

export const TISTORY_SESSION = path.join(ROOT, '.tistory-profile', 'session.json');
const HIGHLIGHT_COLOR = '#fff8b2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineHtml(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/==([^=]+)==/g, `<span style="background-color: ${HIGHLIGHT_COLOR};">$1</span>`);
}

const P = (html) => `<p data-ke-size="size16">${html}</p>`;

// post.txt 본문 → HTML. 사진 자리는 imageTags[i](업로드 후 받은 [##_Image…_##])로 채운다.
export function bodyToHtml(body, imageTags) {
  const out = [];
  let list = null; // { tag: 'ul'|'ol', items: [] }
  let table = null; // [[항목, 내용], …]
  let imageIndex = 0;
  const flush = () => {
    if (list) out.push(`<${list.tag} data-ke-list-type="${list.tag === 'ul' ? 'disc' : 'decimal'}">${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`);
    if (table) {
      const rows = table.map((cells) => `<tr>${cells.map((c, i) => (i === 0 ? `<td style="width: 35%;"><b>${c}</b></td>` : `<td>${c}</td>`)).join('')}</tr>`);
      out.push(`<table style="border-collapse: collapse; width: 100%;" border="1" data-ke-align="alignLeft"><tbody>${rows.join('')}</tbody></table>`);
    }
    list = null;
    table = null;
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const image = line.match(IMAGE_LINE);
    const cells = line.match(/^\|(.+)\|$/)?.[1].split('|').map((c) => c.trim());
    const ul = line.match(/^[-·]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);

    if (cells) {
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // 표 머리글 구분줄
      if (list) flush();
      (table ??= []).push(cells.slice(0, 2).map(inlineHtml));
      continue;
    }
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (table || (list && list.tag !== tag)) flush();
      (list ??= { tag, items: [] }).items.push(inlineHtml((ul ?? ol)[1]));
      continue;
    }
    flush();
    if (image) {
      const tag = imageTags[imageIndex++];
      if (tag) out.push(`<p>${tag}</p>`);
      if (image[2]) out.push(`<p data-ke-size="size14" style="text-align: center; color: #666666;">${inlineHtml(image[2])}</p>`);
    } else if (/^##\s+/.test(line)) {
      out.push(`<h3 data-ke-size="size23">${inlineHtml(line.replace(/^##\s+/, ''))}</h3>`);
    } else if (/^-{3,}$/.test(line)) {
      out.push('<hr contenteditable="false" data-ke-type="horizontalRule" data-ke-style="style1" />');
    } else if (!line) {
      out.push(P('&nbsp;'));
    } else {
      out.push(P(inlineHtml(line)));
    }
  }
  flush();
  // 연달아 생긴 빈 문단은 하나로
  return out.join('\n').replace(/(<p data-ke-size="size16">&nbsp;<\/p>\n?){2,}/g, `${P('&nbsp;')}\n`);
}

const editorJs = (fn, arg) => [`(arg) => { const ed = window.tinymce.get('editor-tistory') || window.tinymce.activeEditor; return (${fn})(ed, arg); }`, arg];

export async function inEditor(page, fn, arg) {
  const [src, a] = editorJs(fn, arg);
  return page.evaluate(new Function(`return ${src}`)(), a);
}

// 첨부 → 사진. 티스토리는 파일 입력칸을 문서에 붙이지 않고 바로 click() 하므로 그 입력칸을 가로채서 파일을 넣는다.
export async function uploadImage(page, file) {
  await inEditor(page, (ed) => ed.setContent(''));
  await page.evaluate(() => {
    window.__tsFileInput = null;
    if (!window.__tsPatched) {
      const orig = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        if (this.type === 'file') {
          window.__tsFileInput = this;
          return undefined; // 파일 선택 창은 띄우지 않는다
        }
        return orig.call(this);
      };
      window.__tsPatched = true;
    }
  });
  if (!(await page.locator('#attach-image').isVisible().catch(() => false))) await page.locator('#mceu_0-open').click();
  await page.locator('#attach-image').click({ timeout: 5000 });
  await page.waitForFunction(() => window.__tsFileInput, null, { timeout: 5000 });
  const input = await page.evaluateHandle(() => window.__tsFileInput);
  await input.asElement().setInputFiles(file);
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    // 올리는 중에는 getContent()가 "이미지 업로드가 완료된 후 시도해 주세요." 오류를 낸다 → 끝날 때까지 기다린다
    const html = await inEditor(page, (ed) => ed.getContent()).catch(() => '');
    const tag = html.match(/\[##_Image\|[\s\S]*?_##\]/)?.[0];
    if (tag) return tag.replace(/&amp;/g, '&');
  }
  throw new Error(`사진 업로드 결과를 확인하지 못했습니다: ${path.basename(file)}`);
}

// 발행 후 글 주소: RSS에서 같은 제목을 찾는다
// RSS 제목은 ·를 &amp;middot; 처럼 바꿔 적으므로 글자·숫자만 남겨 비교한다
const titleKey = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

async function findPostUrl(blog, title) {
  for (let i = 0; i < 10; i++) {
    const xml = await fetch(`https://${blog}.tistory.com/rss`).then((r) => r.text()).catch(() => '');
    for (const item of xml.split('<item>').slice(1)) {
      const t = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
      const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
      if (t && link && titleKey(t) === titleKey(title)) return link;
    }
    await sleep(3000);
  }
  return null;
}

// editId: 이미 발행한 글 번호를 주면 새 글 대신 그 글을 고쳐서 다시 발행한다
export async function publishTistory(post, config, { dryRun = false, editId = null } = {}) {
  const blog = config.tistoryBlog;
  if (!blog) throw new Error('config.json에 tistoryBlog(티스토리 주소 앞부분)를 넣으세요.');
  if (!fs.existsSync(TISTORY_SESSION)) throw new Error('티스토리 로그인 정보가 없습니다. node scripts/tistory-login.mjs 로 로그인하세요.');

  // 예약 발행은 화면 없이, 시험 실행은 화면을 띄워 확인할 수 있게
  const browser = await chromium.launch({ ...browserOptions(config), headless: !dryRun });
  const context = await browser.newContext({ storageState: TISTORY_SESSION, viewport: { width: 1400, height: 900 }, locale: 'ko-KR' });
  const page = await context.newPage();
  // "저장된 글이 있습니다. 이어서 작성하시겠습니까?" → 새로 쓰기
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  try {
    await page.goto(`https://${blog}.tistory.com/manage/newpost/${editId ?? ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    if (/auth\/login|accounts\.kakao/.test(page.url())) {
      // 티스토리 세션(TSSESSION)은 몇 시간이면 끝나지만 카카오 간편로그인은 약 30일 유지되므로 그걸로 다시 들어간다
      log('[티스토리] 로그인이 풀려 카카오 간편로그인으로 다시 로그인합니다.');
      const kakao = page.locator('a.link_kakao_id').first();
      if (await kakao.count()) await kakao.click();
      await page.waitForURL(/accounts\.kakao\.com|tistory\.com\/manage/, { timeout: 20000 }).catch(() => {});
      const account = page.getByText(/^\S+@\S+\.\w+$/).first(); // 간편로그인에 저장된 계정
      if (/accounts\.kakao/.test(page.url()) && (await account.count())) await account.click();
      await page.waitForURL(new RegExp(`${blog}\\.tistory\\.com/manage`), { timeout: 30000 }).catch(() => {});
      if (!new RegExp(`${blog}\\.tistory\\.com/manage`).test(page.url())) {
        throw new Error('티스토리 로그인이 풀렸고 자동 재로그인도 안 됐습니다. node scripts/tistory-login.mjs 로 다시 로그인하세요.');
      }
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await context.storageState({ path: TISTORY_SESSION }).catch(() => {});
    }
    await page.waitForFunction(() => window.tinymce && (window.tinymce.get('editor-tistory') || window.tinymce.activeEditor), null, { timeout: 30000 });

    const imageTags = [];
    for (const img of post.images) {
      try {
        imageTags.push(await uploadImage(page, img.file));
      } catch (err) {
        log(`[티스토리] 사진 넣기 실패 (${path.basename(img.file)}): ${err.message.split('\n')[0]}`);
        imageTags.push(null);
      }
    }

    await page.locator('#post-title-inp').fill(post.title);
    await inEditor(page, (ed, html) => ed.setContent(html), bodyToHtml(post.body, imageTags));
    // 티스토리는 입력이 있을 때만 발행할 내용을 갱신한다. setContent 만으로는 마지막 사진 하나만 저장되므로
    // 변경 이벤트를 보내고, 본문 끝에 글자를 하나 쳤다가 지워서 실제 입력으로 알린다.
    await inEditor(page, (ed) => {
      ed.undoManager.add();
      ed.fire('change');
      ed.fire('input');
      ed.nodeChanged();
      ed.save();
    });
    const bodyEnd = page.frameLocator('#editor-tistory_ifr').locator('body > :last-child');
    await bodyEnd.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' ');
    await page.keyboard.press('Backspace');
    await sleep(500);

    for (const tag of post.tags.slice(0, 10)) {
      await page.locator('#tagText').fill(tag);
      await page.keyboard.press('Enter');
      await sleep(150);
    }
    const uploaded = imageTags.filter(Boolean).length;
    log(`[티스토리] 에디터 입력 완료: ${post.title} (${post.plainLength}자, 사진 ${uploaded}/${post.images.length}장, 태그 ${Math.min(post.tags.length, 10)}개)`);

    if (dryRun) {
      log('[티스토리] 시험 실행: 발행하지 않았습니다. 브라우저를 닫으면 끝납니다.');
      await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
      return null;
    }

    await page.locator('#publish-layer-btn').click();
    // 발행 설정 창은 아래에서 밀려 올라오므로 버튼이 보일 때까지 기다린 뒤 "공개"를 고른다
    const publishBtn = page.locator('#publish-btn');
    await publishBtn.waitFor({ state: 'visible', timeout: 15000 });
    await sleep(1000);
    await page.locator('#open20').check({ force: true });
    await sleep(500);
    const btnText = (await publishBtn.innerText()).trim();
    if (btnText.includes('비공개')) throw new Error(`"공개"로 바꾸지 못했습니다 (버튼: ${btnText}). 비공개로 저장하지 않고 멈춥니다.`);
    await publishBtn.click();
    await page.waitForURL((u) => !u.href.includes('/manage/newpost'), { timeout: 30000 }).catch(() => {});
    await sleep(2000);

    // 로그인 상태를 새로 저장해 오래 유지되게 한다
    await context.storageState({ path: TISTORY_SESSION }).catch(() => {});

    const url = await findPostUrl(blog, post.title);
    if (url) return url;
    // 실패로 처리하면 다음 실행이 같은 글을 또 발행하므로, 발행된 것으로 기록하고 경고만 남긴다
    log('[티스토리] ⚠ 발행 버튼은 눌렀지만 글 주소를 찾지 못했습니다. 티스토리 관리 화면에서 확인하세요.');
    return `https://${blog}.tistory.com/manage/posts (주소 미확인)`;
  } catch (err) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const shot = path.join(LOG_DIR, `tistory-error-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    err.message += ` (화면 캡처: ${shot})`;
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: node scripts/tistory.mjs output/폴더/post.txt [--dry-run]');
    process.exit(1);
  }
  const post = parsePost(fs.readFileSync(file, 'utf8'), path.dirname(path.resolve(file)));
  const editId = process.argv.find((a) => a.startsWith('--edit='))?.slice(7) ?? null;
  const url = await publishTistory(post, loadConfig(), { dryRun: process.argv.includes('--dry-run'), editId });
  if (url) log(`[티스토리] 발행 완료: ${url}`);
}
