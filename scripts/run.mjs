// 주제 정하기(topics.txt 또는 자동 선정) → claude로 글·사진 작성 → 규칙 점검 → 네이버 블로그 발행 → 기록
// 옵션: --dry-run (발행 버튼 직전에 멈춤), --no-publish (글만 작성)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, checkPost, loadConfig, log, parsePost, today } from './common.mjs';
import { publishPost } from './publish.mjs';

const TOPICS = path.join(ROOT, 'topics.txt');
const DONE = path.join(ROOT, 'topics-done.txt');
const STATE = path.join(ROOT, 'state.json');
const dryRun = process.argv.includes('--dry-run');
const noPublish = process.argv.includes('--no-publish');

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
  const base = path.join(ROOT, 'output', today());
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

async function writePost(topicLine, config) {
  const dir = newPostDir();
  const file = path.join(dir, 'post.txt');
  const prompt = [
    'CLAUDE.md의 절차와 규칙에 따라 네이버 블로그 글과 사진을 만들어서 저장해줘.',
    `오늘 날짜: ${today('-')}`,
    topicLine
      ? `주제: ${topicLine}`
      : '주제: 자동 선정 — CLAUDE.md "자동 주제 선정" 절차대로 오늘 검색 수요가 높은 주제를 직접 골라줘.',
    `글 파일: ${rel(file)}`,
    `사진 폴더: ${rel(path.join(dir, 'images'))}`,
  ].join('\n');

  log(`글 작성 시작: ${topicLine ?? '(주제 자동 선정)'} → ${rel(dir)}`);
  await runClaude(prompt, config.claudeTimeoutMinutes ?? 30);
  if (!fs.existsSync(file)) throw new Error(`글 파일이 만들어지지 않았습니다: ${rel(file)}`);
  log(`글 작성 완료: ${rel(file)}`);
  return file;
}

function readPost(file) {
  return parsePost(fs.readFileSync(file, 'utf8'), path.dirname(file));
}

// 규칙 점검에 걸리면 claude에게 한 번 고치게 하고, 그래도 안 되면 발행하지 않는다
async function checkedPost(file, config) {
  const limits = { minChars: config.minChars ?? 1500, minImages: config.minImages ?? 5 };
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
      `${rel(file)} 글이 CLAUDE.md 규칙에 맞지 않습니다. 아래 문제를 고쳐서 같은 경로에 다시 저장해줘.`,
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
    fs.writeFileSync(STATE, JSON.stringify({ pending: { topic: topicLine, file } }, null, 2), 'utf8');
  }

  const post = await checkedPost(file, config);
  if (noPublish) {
    log(`--no-publish: 발행하지 않음 (${post.title})`);
    return false;
  }

  const url = await publishPost(post, config, { dryRun });
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
