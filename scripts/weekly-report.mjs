// 주간 조회수 보고: 네이버·티스토리 통계와 지난주 글의 검색 노출 여부를 logs/weekly-날짜.md 로 정리한다.
// 모두 화면 없이 실행한다. 예약: 매주 월요일 아침 (WeeklyBlogReport)
// 단독 실행: node scripts/weekly-report.mjs [--start=2026-10-19]  (start = 보고할 주의 월요일)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { LOG_DIR, PROFILE_DIR, ROOT, browserOptions, readConfig } from './common.mjs';
import { TISTORY_SESSION } from './tistory.mjs';

const config = readConfig();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// 기본: 지난주 월요일 ~ 일요일
const arg = process.argv.find((a) => a.startsWith('--start='))?.slice(8);
const today = new Date();
const start = arg ? new Date(`${arg}T00:00:00`) : addDays(today, -((today.getDay() + 6) % 7) - 7);
const end = addDays(start, 6);
const START = ymd(start);
const END = ymd(end);

const lines = [`# 주간 블로그 보고 (${START} ~ ${END})`, '', `작성: ${ymd(today)} (자동)`, ''];
const out = (...l) => lines.push(...l);

// 지난주에 발행한 글 (날짜, 제목, 주소)
function postsOfWeek(file) {
  const f = path.join(ROOT, file);
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.split('\t'))
    .filter(([d, t]) => t && d >= START && d <= END)
    .map(([date, t, url]) => ({ date, title: t.replace(/^자동: /, ''), url }));
}

async function json(page, url) {
  const res = await page.goto(url).catch(() => null);
  if (!res || res.status() !== 200) return null;
  try {
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

// ── 네이버 ──
async function naverSection() {
  out('## 네이버 koreait_128', '');
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { ...browserOptions(config), headless: true, locale: 'ko-KR' });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto('https://admin.blog.naver.com/koreait_128/stat/today', { waitUntil: 'domcontentloaded' });
    const weekly = await json(page, `https://blog.stat.naver.com/api/blog/daily/cv?timeDimension=WEEK&startDate=${START}`);
    const rows = weekly?.result?.statDataList?.find((s) => s.dataId === 'cv')?.data?.rows;
    if (rows) {
      out('| 주 시작일 | 조회수 |', '|---|---|');
      rows.date.slice(0, 6).forEach((d, i) => out(`| ${d} | ${rows.cv[i]} |`));
      out('');
    } else out('조회수: 가져오지 못함 (네이버 로그인 확인 필요)', '');

    const ref = await json(page, `https://blog.stat.naver.com/api/blog/user/referer/total?timeDimension=WEEK&startDate=${START}`);
    const r = ref?.result?.statDataList?.find((s) => s.dataId === 'refererTotal')?.data?.rows;
    if (r?.referrerDomain?.length) {
      const total = r.cv.reduce((a, b) => a + b, 0);
      const search = r.cv.filter((_, i) => r.referrerSearchEngine[i] === '1').reduce((a, b) => a + b, 0);
      out(`유입 ${total}회 중 **검색 유입 ${search}회 (${Math.round((search / total) * 100)}%)**`, '');
      out('| 유입 경로 | 조회수 |', '|---|---|');
      r.referrerDomain.slice(0, 8).forEach((d, i) => out(`| ${d} | ${r.cv[i]} |`));
      out('');
    }
  } finally {
    await ctx.close();
  }
}

// ── 티스토리 ──
async function tistorySection() {
  const blog = config.tistoryBlog;
  out(`## 티스토리 ${blog}`, '');
  if (!blog || !fs.existsSync(TISTORY_SESSION)) return out('로그인 정보 없음', '');
  const browser = await chromium.launch({ ...browserOptions(config), headless: true });
  const ctx = await browser.newContext({ storageState: TISTORY_SESSION, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const api = (p) => json(page, `https://${blog}.tistory.com/manage/v2/statistics/blog/${p}`);
  try {
    const trend = await api(`trend?granularity=day&metric=pv&startDate=${END}`);
    if (!Array.isArray(trend?.data)) {
      out('통계를 가져오지 못함 (티스토리 로그인이 풀렸을 수 있음)', '');
      return;
    }
    // timestamp 는 UTC 15:00 = 한국 날짜 다음 날 0시
    const days = trend.data
      .map((d) => ({ date: ymd(addDays(new Date(d.timestamp), 0)), ...d }))
      .filter((d) => d.date >= START && d.date <= END);
    const sum = (k) => days.reduce((a, d) => a + (d[k] ?? 0), 0);
    out(`조회수 ${sum('count')}회 (검색엔진 ${sum('searchEngine')}회, SNS ${sum('sns')}회, 기타 ${sum('etc')}회)`, '');
    out('| 날짜 | 조회수 | 검색 유입 |', '|---|---|---|');
    days.forEach((d) => out(`| ${d.date} | ${d.count} | ${d.searchEngine} |`));
    out('');

    const inflow = await api(`inflow?granularity=week&metric=pv&startDate=${START}`);
    const engines = inflow?.data?.result?.searchEngine?.list ?? {};
    if (Object.keys(engines).length) out(`검색엔진별: ${Object.entries(engines).map(([k, v]) => `${k} ${v}`).join(', ')}`, '');

    const kw = await api(`keyword?granularity=week&metric=pv&startDate=${START}`);
    const kws = kw?.data?.result ?? [];
    if (kws.length) out('유입 검색어: ' + kws.slice(0, 10).map((k) => `${k.keyword ?? k.name} (${k.count ?? k.pv})`).join(', '), '');

    const top = await api(`topEntry?metric=pv&startDate=${START}&granularity=week`);
    const tops = top?.data?.result ?? [];
    if (tops.length) {
      out('| 많이 본 글 | 조회수 |', '|---|---|');
      tops.slice(0, 5).forEach((t) => out(`| ${t.title} | ${t.count ?? t.pv ?? ''} |`));
      out('');
    }
    await ctx.storageState({ path: TISTORY_SESSION }).catch(() => {});
  } finally {
    await browser.close();
  }
}

// ── 지난주 글이 검색에 나오는지 (제목 그대로 검색) ──
async function exposureSection() {
  out('## 지난주 글 검색 노출 (제목 그대로 검색)', '');
  const browser = await chromium.launch({ ...browserOptions(config), headless: true });
  const page = await browser.newPage({ locale: 'ko-KR' });
  const check = async (url, needle) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    return (await page.content()).includes(needle);
  };
  try {
    for (const [label, file, search, needle] of [
      ['네이버 블로그 검색', 'topics-done.txt', (t) => `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(t)}`, config.blogId],
      ['다음 검색 (티스토리)', 'topics-done-tistory.txt', (t) => `https://search.daum.net/search?w=tot&q=${encodeURIComponent(t)}`, config.tistoryBlog],
    ]) {
      const posts = postsOfWeek(file);
      if (!posts.length || !needle) continue;
      let shown = 0;
      const rows = [];
      for (const p of posts) {
        const ok = await check(search(p.title), needle);
        if (ok) shown++;
        rows.push(`| ${p.date} | ${ok ? '노출' : '**안 보임**'} | ${p.title} |`);
      }
      out(`### ${label}: ${posts.length}개 중 ${shown}개 노출`, '', '| 날짜 | 결과 | 제목 |', '|---|---|---|', ...rows, '');
    }
  } finally {
    await browser.close();
  }
}

for (const [name, fn] of [['네이버', naverSection], ['티스토리', tistorySection], ['검색 노출', exposureSection]]) {
  try {
    await fn();
  } catch (err) {
    out(`${name}: 확인 중 오류 (${err.message.split('\n')[0]})`, '');
  }
}

fs.mkdirSync(LOG_DIR, { recursive: true });
const file = path.join(LOG_DIR, `weekly-${START}.md`);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
console.log(`\n저장: ${path.relative(ROOT, file)}`);
