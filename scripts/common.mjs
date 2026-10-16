import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILE_DIR = path.join(ROOT, '.naver-profile');
export const LOG_DIR = path.join(ROOT, 'logs');

export function readConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}

export function loadConfig() {
  const config = readConfig();
  if (!config.blogId || config.blogId.startsWith('여기에')) {
    throw new Error('config.json의 blogId에 네이버 아이디를 입력하세요.');
  }
  return config;
}

// browserChannel: msedge/chrome, browserPath: 브라우저 실행 파일을 직접 지정할 때
export function browserOptions(config) {
  return {
    channel: config.browserPath ? undefined : config.browserChannel || undefined,
    executablePath: config.browserPath || undefined,
    chromiumSandbox: config.sandbox !== false,
  };
}

// 날짜는 한국 시간 기준
export function today(sep = '') {
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return sep === '-' ? d : d.replaceAll('-', sep);
}

export function log(...args) {
  const line = `[${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] ${args.join(' ')}`;
  console.log(line);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(path.join(LOG_DIR, `${today('-')}.log`), line + '\n', 'utf8');
}

const RULE = /^═{5,}\s*$/;
const TAG_LINE = /^(#\S+\s*)+$/;
const IMAGE_PLACEHOLDER = /^\[이미지 위치:.*\]\s*$/;
// [[사진: images/01.png | 설명 (출처: …)]]
export const IMAGE_LINE = /^\[\[사진:\s*([^|\]]+?)\s*(?:\|\s*(.*?))?\s*\]\]\s*$/;

// 글 파일을 제목·본문·태그·사진으로 나눈다 (CLAUDE.md "파일 형식" 참고)
// baseDir: 사진 경로의 기준 폴더 (글 파일이 있는 폴더)
export function parsePost(text, baseDir = ROOT) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  const titleHeader = lines.findIndex((l) => l.includes('제목 칸'));
  const bodyHeader = lines.findIndex((l) => l.includes('본문 칸'));
  if (titleHeader < 0 || bodyHeader < 0) {
    throw new Error('글 파일 형식이 맞지 않습니다 (제목 칸/본문 칸 머리글 없음).');
  }

  const title = lines
    .slice(titleHeader + 1, bodyHeader)
    .find((l) => l.trim() && !RULE.test(l))
    ?.trim();
  if (!title) throw new Error('제목이 비어 있습니다.');

  let start = bodyHeader + 1;
  if (RULE.test(lines[start] ?? '')) start++;
  const bodyLines = lines.slice(start).filter((l) => !IMAGE_PLACEHOLDER.test(l.trim()));

  // 끝부분의 #태그 줄을 본문에서 떼어낸다
  const tags = [];
  while (bodyLines.length) {
    const last = bodyLines[bodyLines.length - 1].trim();
    if (!last) bodyLines.pop();
    else if (TAG_LINE.test(last)) {
      tags.unshift(...last.split(/\s+/).map((t) => t.replace(/^#/, '')));
      bodyLines.pop();
    } else break;
  }
  while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();

  const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n');
  const plainLength = plainText(body).length;
  if (plainLength < 500) throw new Error(`본문이 너무 짧습니다 (${plainLength}자).`);
  const images = body
    .split('\n')
    .map((l) => l.trim().match(IMAGE_LINE))
    .filter(Boolean)
    .map((m) => ({ file: path.resolve(baseDir, m[1]), caption: m[2] ?? '' }));
  return { title, body, plainLength, images, baseDir, tags: [...new Set(tags)].slice(0, 30) };
}

// 서식 기호를 뺀 실제 글자 (분량 계산용)
export function plainText(body) {
  return body
    .split('\n')
    .filter((l) => !/^-{3,}\s*$/.test(l) && !/^\|[\s:|-]+\|\s*$/.test(l) && !IMAGE_LINE.test(l.trim()))
    .map((l) => l.replace(/^##\s+/, '').replace(/\*\*|==/g, '').replace(/^\||\|\s*$/g, '').replace(/\|/g, ' '))
    .join('\n');
}

// CLAUDE.md 규칙 중 기계적으로 확인할 수 있는 것을 점검한다. 문제 목록을 돌려준다.
export function checkPost(post, { minChars = 1500, minImages = 5 } = {}) {
  const problems = [];
  const missing = post.images.filter((img) => !fs.existsSync(img.file));
  if (post.images.length < minImages) problems.push(`사진이 ${post.images.length}장입니다. ${minImages}장 이상 넣어야 합니다.`);
  if (missing.length) problems.push(`없는 사진 파일: ${missing.map((i) => path.basename(i.file)).join(', ')}`);
  if (post.images.some((img) => !img.caption)) problems.push('설명(캡션)이 없는 사진이 있습니다.');
  const headings = post.body.split('\n').filter((l) => /^##\s+/.test(l)).length;
  if (post.plainLength < minChars) problems.push(`본문이 ${post.plainLength}자로 ${minChars}자보다 짧습니다.`);
  if (post.plainLength > 3000) problems.push(`본문이 ${post.plainLength}자로 너무 깁니다 (2,500자 안팎).`);
  if (headings < 4 || headings > 6) problems.push(`소제목(##)이 ${headings}개입니다. 4~6개여야 합니다.`);
  if (/koreait-daegu\.com|https?:\/\//i.test(post.body)) problems.push('본문에 링크가 있습니다. 링크를 빼야 합니다.');
  if (/\[이미지 위치/.test(post.body)) problems.push('이미지 자리 표시가 있습니다.');
  if (/^>\s/m.test(post.body)) problems.push('인용구(>)가 있습니다.');
  if (post.body.split('\n').some((l) => /^\|.+\|\s*$/.test(l) && l.split('|').length - 2 > 2)) {
    problems.push('3열 이상인 표가 있습니다. 2열까지만 씁니다.');
  }
  if (/\p{Extended_Pictographic}/u.test(post.body)) problems.push('본문에 이모지가 있습니다.');
  if (post.tags.length < 5) problems.push(`태그가 ${post.tags.length}개입니다. 8~10개를 넣어야 합니다.`);
  return problems;
}
