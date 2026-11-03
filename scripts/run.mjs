// 주제 정하기(topics.txt 또는 자동 선정) → claude로 글·사진 작성 → 규칙 점검 → 네이버 블로그 발행 → 기록
// 옵션: --dry-run (발행 버튼 직전에 멈춤), --no-publish (글만 작성), --tistory (티스토리용: TISTORY.md 규칙, 별도 주제·기록 파일)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, checkPost, loadConfig, log as baseLog, parsePost, today } from './common.mjs';
import { publishPost } from './publish.mjs';
import { publishTistory } from './tistory.mjs';

const tistory = process.argv.includes('--tistory');
const suffix = tistory ? '-tistory' : '';
const TOPICS = path.join(ROOT, `topics${suffix}.txt`);
const DONE = path.join(ROOT, `topics-done${suffix}.txt`);
const STATE = path.join(ROOT, `state${suffix}.json`);
const dryRun = process.argv.includes('--dry-run');
const noPublish = process.argv.includes('--no-publish');
const log = (...args) => baseLog(...(tistory ? ['[티스토리]', ...args] : args));

// topics.txt에 적힌 주제가 있으면 그것부터, 없으면 null (자동 선정)
function nextTopicLine() {
  if (!fs.existsSync(TOPICS)) return null;
  return (
    fs
      .readFileSync(TOPICS, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#')) ?? null
  );
}

function removeTopicLine(line) {
  const lines = fs.readFileSync(TOPICS, 'utf8').split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim() === line);
  if (i >= 0) lines.splice(i, 1);
  fs.writeFileSync(TOPICS, lines.join('\r\n'), 'utf8');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return {};
  }
}

const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/');

// 글마다 output/날짜-번호/ 폴더를 만든다 (post.txt, images/)
function newPostDir() {
  const base = path.join(ROOT, 'output', `${tistory ? 'tistory-' : ''}${today()}`);
  let n = 1;
  while (fs.existsSync(`${base}-${n}`)) n++;
  const dir = `${base}-${n}`;
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  return dir;
}

// 사용 가능한 도구는 .claude/settings.json 의 permissions.allow 에 있다
function runClaude(prompt, timeoutMinutes) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--permission-mode', 'acceptEdits'], { cwd: ROOT, shell: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude가 ${timeoutMinutes}분 안에 끝나지 않았습니다.`));
    }, timeoutMinutes * 60 * 1000);
    child.on('error', (e) => reject(new Error(`claude 실행 실패: ${e.message}`)));
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`claude 종료 코드 ${code}: ${out.slice(-500)}`));
    });
    child.stdin.end(prompt, 'utf8');
  });
}

// 두 블로그의 최근 발행 제목 (같은 제목 틀·주제를 피하게 claude에게 알려준다)
function recentTitles(n = 10) {
  const read = (f) =>
    fs.existsSync(f)
      ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')[1]?.replace(/^자동: /, '')).filter(Boolean)
      : [];
  return {
    naver: read(path.join(ROOT, 'topics-done.txt')).slice(-n),
    tistory: read(path.join(ROOT, 'topics-done-tistory.txt')).slice(-n),
  };
}

async function writePost(topicLine, config) {
  const dir = newPostDir();
  const recent = recentTitles();
  const mine = tistory ? recent.tistory : recent.naver;
  const other = tistory ? recent.naver : recent.tistory;
  const file = path.join(dir, 'post.txt');
  const prompt = [
    tistory
      ? 'TISTORY.md를 먼저 읽고, TISTORY.md가 우선하는 항목 외에는 CLAUDE.md의 절차와 규칙에 따라 티스토리 블로그 글과 사진을 만들어서 저장해줘.'
      : 'CLAUDE.md의 절차와 규칙에 따라 네이버 블로그 글과 사진을 만들어서 저장해줘.',
    `오늘 날짜: ${today('-')}`,
    topicLine
      ? `주제: ${topicLine}`
      : tistory
        ? '주제: 자동 선정 — TISTORY.md "자동 주제 선정" 절차대로 직접 골라줘.'
        : '주제: 자동 선정 — CLAUDE.md "자동 주제 선정" 절차대로 오늘 검색 수요가 높은 주제를 직접 골라줘.',
    `글 파일: ${rel(file)}`,
    `사진 폴더: ${rel(path.join(dir, 'images'))}`,
    '하루에 이 글 1건만 올립니다. 서두르지 말고 공고문 원문까지 읽어서, 같은 주제의 다른 글보다 구체적인 글(대상·금액·서류·접수처·문의처, 헷갈리는 예외)로 써줘.',
    '',
    `최근 발행 제목 (이 블로그, 오래된 것부터) — 제목 틀·도입·주제가 겹치지 않게 CLAUDE.md 5-2장대로 피해줘. 아래 예전 제목은 길이·틀을 따라 하지 말고 7장(25~35자) 기준으로:`,
    ...mine.map((t) => `- ${t}`),
    `다른 블로그(${tistory ? '네이버' : '티스토리'})에 최근 올라간 주제 — 이것과도 겹치지 않는 주제로:`,
    ...other.map((t) => `- ${t}`),
  ].join('\n');

  log(`글 작성 시작: ${topicLine ?? '(주제 자동 선정)'} → ${rel(dir)}`);
  await runClaude(prompt, config.claudeTimeoutMinutes ?? 30);
  if (!fs.existsSync(file)) throw new Error(`글 파일이 만들어지지 않았습니다: ${rel(file)}`);
  log(`글 작성 완료: ${rel(file)}`);
  return file;
}

// 다 쓴 글을 편집자처럼 한 번 더 검토한다 (사실 재확인·내용 보강·사진 확인).
// 검토가 실패하거나 시간이 넘으면 검토 전 글로 되돌려 발행은 그대로 진행한다.
async function reviewPost(file, config) {
  const backup = `${file}.before-review`;
  fs.copyFileSync(file, backup);
  const prompt = [
    `${rel(file)} 글을 발행 전에 편집자로서 검토하고, 고칠 곳은 고쳐서 같은 경로에 저장해줘.`,
    `규칙: ${tistory ? 'TISTORY.md·CLAUDE.md' : 'CLAUDE.md'}. 사진 폴더: ${rel(path.join(path.dirname(file), 'images'))}`,
    `오늘 날짜: ${today('-')}`,
    '1. 사실: 글의 핵심 수치·날짜·대상·기관명을 WebFetch로 1차 출처(정부·지자체 공고문)에서 다시 확인해. 틀리거나 확인 안 되는 문장은 고치거나 뺀다.',
    '2. 내용: 독자가 이 글만 보고 신청·확인까지 할 수 있는지 본다. 빠진 것(준비서류, 접수처, 문의 전화, 헷갈리는 예외)을 확인된 것만 보충한다.',
    '3. 읽기: 휴대폰 기준으로 어색한 문장, 같은 끝맺음 반복, 기계적으로 보이는 틀을 다듬는다. 제목은 25~35자.',
    '4. 사진: images/의 사진을 모두 Read로 열어 보고, 내용과 안 맞거나 잘리거나 오래된 화면은 다시 만든다.',
    '5. CLAUDE.md 11장 체크리스트를 다시 점검한다.',
    '고칠 것이 없으면 그대로 둔다. 끝나면 DONE만 출력.',
  ].join('\n');
  log('편집 검토 시작');
  try {
    await runClaude(prompt, config.reviewTimeoutMinutes ?? 25);
    readPost(file);
    log('편집 검토 완료');
  } catch (err) {
    fs.copyFileSync(backup, file);
    log(`편집 검토 실패 → 검토 전 글로 진행: ${err.message.split('\n')[0]}`);
  } finally {
    fs.rmSync(backup, { force: true });
  }
}

function readPost(file) {
  return parsePost(fs.readFileSync(file, 'utf8'), path.dirname(file));
}

// 규칙 점검에 걸리면 claude에게 한 번 고치게 하고, 그래도 안 되면 발행하지 않는다
async function checkedPost(file, config) {
  const limits = { minChars: config.minChars ?? 1500, minImages: config.minImages ?? 5, maxTitle: tistory ? 0 : 40 };
  for (let attempt = 0; ; attempt++) {
    let problems;
    let post;
    try {
      post = readPost(file);
      problems = checkPost(post, limits);
    } catch (err) {
      problems = [err.message];
    }
    if (!problems.length) return post;
    log(`규칙 점검에 걸림: ${problems.join(' / ')}`);
    if (attempt >= 1) throw new Error(`고친 뒤에도 규칙에 맞지 않아 발행하지 않았습니다: ${rel(file)}`);
    const prompt = [
      `${rel(file)} 글이 ${tistory ? 'TISTORY.md·CLAUDE.md' : 'CLAUDE.md'} 규칙에 맞지 않습니다. 아래 문제를 고쳐서 같은 경로에 다시 저장해줘.`,
      `사진은 ${rel(path.join(path.dirname(file), 'images'))} 폴더에 만들어줘.`,
      `오늘 날짜: ${today('-')}`,
      ...problems.map((p) => `- ${p}`),
      '내용을 보강할 때도 CLAUDE.md의 사실 확인 규칙을 지켜줘.',
    ].join('\n');
    log('claude에게 수정 요청');
    await runClaude(prompt, config.claudeTimeoutMinutes ?? 30);
  }
}

async function processOne(config) {
  const topicLine = nextTopicLine();
  if (!topicLine && config.autoTopic === false) {
    log('topics.txt에 남은 주제가 없습니다. (autoTopic 꺼짐)');
    return false;
  }

  // 이전 실행에서 글은 썼지만 발행에 실패했다면 그 글로 다시 시도한다
  const state = readState();
  let file =
    state.pending && state.pending.topic === topicLine && fs.existsSync(state.pending.file) ? state.pending.file : null;
  if (file) log(`이전에 작성한 글로 다시 시도: ${rel(file)}`);
  else {
    file = await writePost(topicLine, config);
    if (config.reviewPass !== false) await reviewPost(file, config);
    fs.writeFileSync(STATE, JSON.stringify({ pending: { topic: topicLine, file } }, null, 2), 'utf8');
  }

  const post = await checkedPost(file, config);
  if (noPublish) {
    log(`--no-publish: 발행하지 않음 (${post.title})`);
    return false;
  }

  const url = await (tistory ? publishTistory : publishPost)(post, config, { dryRun });
  if (dryRun) return false;

  log(`✅ 발행 완료: ${post.title} → ${url}`);
  const topicLabel = topicLine ?? `자동: ${post.title}`;
  fs.appendFileSync(DONE, `${today('-')}\t${topicLabel}\t${url}\r\n`, 'utf8');
  if (topicLine) removeTopicLine(topicLine);
  fs.rmSync(STATE, { force: true });
  return true;
}

try {
  const config = loadConfig();
  const count = dryRun || noPublish ? 1 : Math.max(1, config.postsPerRun ?? 1);
  for (let i = 0; i < count; i++) {
    if (!(await processOne(config))) break;
  }
} catch (err) {
  log(`❌ 실패: ${err.message}`);
  process.exitCode = 1;
}
