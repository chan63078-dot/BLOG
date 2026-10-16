// 최초 1회: 브라우저를 열어 직접 네이버에 로그인한다.
// 로그인 정보는 .naver-profile 폴더에 저장되고, 이후 자동 발행에서 그대로 쓴다.
import { chromium } from 'playwright';
import { PROFILE_DIR, browserOptions, loadConfig } from './common.mjs';

const config = loadConfig();
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  ...browserOptions(config),
  headless: false,
  viewport: null,
  locale: 'ko-KR',
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com%2F' + config.blogId);

console.log('열린 브라우저에서 네이버에 로그인하세요. ("로그인 상태 유지"를 꼭 체크하세요)');
console.log('로그인이 확인되면 자동으로 닫힙니다. (최대 10분 대기)');

const deadline = Date.now() + 10 * 60 * 1000;
let ok = false;
while (Date.now() < deadline) {
  const cookies = await context.cookies('https://www.naver.com').catch(() => []);
  if (cookies.some((c) => c.name === 'NID_AUT') && cookies.some((c) => c.name === 'NID_SES')) {
    ok = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 3000));
await context.close();
console.log(ok ? '✅ 로그인 저장 완료. 이제 npm run test-run 으로 시험해 보세요.' : '❌ 시간 안에 로그인이 확인되지 않았습니다. 다시 실행하세요.');
process.exit(ok ? 0 : 1);
