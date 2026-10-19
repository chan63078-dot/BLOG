// 최초 1회: 브라우저를 열어 카카오 계정으로 티스토리에 직접 로그인한다.
// 로그인을 마치면 브라우저 창을 직접 닫는다. 그동안 로그인 상태를 계속 저장해 둔다.
// 로그인 정보는 .tistory-profile 폴더에 저장되고(네이버와 따로), 이후 자동 발행에서 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, browserOptions, readConfig } from './common.mjs';

const TISTORY_PROFILE_DIR = path.join(ROOT, '.tistory-profile');
const SESSION_FILE = path.join(TISTORY_PROFILE_DIR, 'session.json');

const config = readConfig();
const context = await chromium.launchPersistentContext(TISTORY_PROFILE_DIR, {
  ...browserOptions(config),
  headless: false,
  viewport: null,
  locale: 'ko-KR',
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://www.tistory.com/auth/login');

console.log('열린 브라우저에서 "카카오계정으로 로그인"을 눌러 로그인하세요. ("로그인 상태 유지"를 체크하세요)');
console.log('로그인이 끝나면 브라우저 창을 직접 닫으세요. (최대 15분)');

// 화면을 건드리지 않고 로그인 상태(쿠키)만 몇 초마다 저장한다.
// 세션 쿠키(만료 없는 쿠키)는 브라우저를 닫으면 사라지므로 이 파일로 발행 때 다시 넣는다.
// 창을 닫거나 logs/tistory-login-done 파일이 생기면 끝낸다 (최대 2시간)
const DONE_FILE = path.join(ROOT, 'logs', 'tistory-login-done');
fs.rmSync(DONE_FILE, { force: true });
const deadline = Date.now() + 120 * 60 * 1000;
let saved = false;
// 기다리는 동안 브라우저에는 아무 요청도 보내지 않는다 (화면 깜빡임 방지)
while (Date.now() < deadline && !page.isClosed() && !fs.existsSync(DONE_FILE)) {
  await new Promise((r) => setTimeout(r, 3000));
}
try {
  await context.storageState({ path: SESSION_FILE });
  saved = true;
} catch {
  // 창을 먼저 닫으면 저장하지 못한다
}
await context.close().catch(() => {});
console.log(saved ? '로그인 상태를 저장했습니다. 이제 로그인이 됐는지 확인합니다.' : '❌ 로그인 상태를 저장하지 못했습니다. 다시 실행하세요.');

// 확인: 저장한 로그인 상태로 화면 없이 티스토리를 열어 본다
if (saved) {
  const browser = await chromium.launch({ ...browserOptions(config), headless: true });
  const check = await browser.newContext({ storageState: SESSION_FILE, locale: 'ko-KR' });
  const p = await check.newPage();
  await p.goto('https://www.tistory.com/', { waitUntil: 'domcontentloaded' });
  await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const loggedOut = await p.getByText('카카오계정으로 시작하기').first().isVisible().catch(() => false);
  const html = await p.content().catch(() => '');
  await browser.close();
  const blogs = [...new Set([...html.matchAll(/https?:\/\/([a-z0-9-]+)\.tistory\.com\/manage/gi)].map((m) => m[1]))].filter(
    (n) => n !== 'www',
  );
  fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'logs', 'tistory-blogs.txt'), blogs.join('\n'), 'utf8');
  if (loggedOut) {
    console.log('❌ 로그인이 확인되지 않았습니다. 다시 실행해서 로그인을 끝까지 마친 뒤 창을 닫으세요.');
    process.exit(1);
  }
  console.log('✅ 티스토리 로그인 확인 완료.');
  console.log(blogs.length ? `내 블로그 주소: ${blogs.map((b) => `${b}.tistory.com`).join(', ')}` : '내 블로그 주소는 찾지 못했습니다.');
}
