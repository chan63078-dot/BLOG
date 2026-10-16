import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILE_DIR = path.join(ROOT, '.naver-profile');
export const LOG_DIR = path.join(ROOT, 'logs');

export function loadConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  if (!config.blogId || config.blogId.startsWith('여기에')) {
    throw new Error('config.json의 blogId에 네이버 아이디를 입력하세요.');
  }
  return config;
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

// output/*.txt 형식을 제목·본문·태그로 나눈다 (CLAUDE.md "파일 형식" 참고)
export function parsePost(text) {
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
  if (body.length < 500) throw new Error(`본문이 너무 짧습니다 (${body.length}자).`);
  return { title, body, tags: [...new Set(tags)].slice(0, 30) };
}
