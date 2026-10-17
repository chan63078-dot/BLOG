# 네이버 블로그 자동 발행 에이전트

매일 **그날 검색 수요가 높은 주제를 Claude가 직접 골라** 글과 사진을 만들고, 네이버 블로그에 자동 발행합니다.
(`topics.txt`에 주제를 적어 두면 그 주제를 먼저 씁니다.)

```
주제 자동 선정(또는 topics.txt) ─▶ claude -p (조사·작성·사진 제작, CLAUDE.md 규칙)
  ─▶ output/날짜-번호/ (post.txt + images/) ─▶ 규칙 자동 점검
  ─▶ Edge 브라우저 자동 조작 (스마트에디터에 글·사진 입력 → 발행) ─▶ topics-done.txt
```

## 1. 설치 (최초 1회)

PowerShell에서:

```powershell
cd C:\
git clone -b claude/cool-bell-bv1cei https://github.com/chan63078-dot/blog.git blog-agent
cd C:\blog-agent
npm install
```

> 브라우저는 Windows에 기본으로 깔린 **Microsoft Edge**를 씁니다. 따로 설치할 것이 없습니다.

## 2. 설정

`config.json`을 메모장으로 열어 `blogId`를 내 네이버 아이디로 바꿉니다.

```json
{
  "blogId": "내네이버아이디",
  "browserChannel": "msedge",
  "headless": false,
  "postsPerRun": 1,
  "claudeTimeoutMinutes": 15
}
```

| 항목 | 설명 |
|---|---|
| `blogId` | 블로그 주소 `blog.naver.com/○○○`의 ○○○ |
| `browserChannel` | `msedge`(기본) 또는 `chrome` |
| `headless` | `false`면 브라우저 창이 보임. 처음엔 `false` 권장 |
| `postsPerRun` | 한 번 실행할 때 발행할 글 수 (하루 1~2개 권장) |
| `minChars` | (선택) 본문 최소 글자 수. 기본 1500 |
| `minImages` | (선택) 최소 사진 수. 기본 5 |
| `autoTopic` | (선택) `false`면 topics.txt에 주제가 없을 때 쉬기. 기본은 자동 선정 |
| `claudeTimeoutMinutes` | 글 한 편 작성 제한 시간. 사진까지 만들므로 30분 권장 |

## 3. 네이버 로그인 (최초 1회)

```powershell
npm run login
```

Edge 창이 열리면 직접 로그인하세요(**로그인 상태 유지** 체크). 로그인이 확인되면 창이 자동으로 닫힙니다.
비밀번호는 어디에도 저장되지 않고, 로그인 상태만 `.naver-profile` 폴더에 남습니다.

## 4. 주제

**기본은 자동입니다.** `topics.txt`를 비워 두면 Claude가 그날 Google 트렌드, 많이 본 뉴스, 계절 이슈를 조사해서
검색 수요가 높고 정보로 정리할 가치가 있는 주제를 하나 고릅니다. 연예·스포츠·정치 주제와 이미 쓴 주제는 빼고 고릅니다.

꼭 쓰고 싶은 주제가 있으면 `topics.txt`에 한 줄에 하나씩 적으세요. 적힌 주제를 먼저 씁니다.
자동 선정을 끄려면 `config.json`에 `"autoTopic": false`를 넣으세요.

## 5. 시험 실행 (꼭 한 번 해보세요)

```powershell
npm run test-run
```

글을 쓰고 에디터에 입력까지만 한 뒤 **발행 버튼은 누르지 않고** 멈춥니다.
화면을 확인한 다음 브라우저를 닫으면 끝납니다. (입력된 글은 네이버 임시저장에 남을 수 있으니 지워 주세요.)

문제가 없으면 실제 발행:

```powershell
npm start
```

## 6. 매일 자동 실행 등록

```powershell
powershell -ExecutionPolicy Bypass -File setup-schedule.ps1 -Time 09:00
```

매일 09:00~09:30 사이에 자동으로 실행됩니다.
- PC가 켜져 있고 **Windows에 로그인된 상태**여야 합니다 (브라우저를 띄우기 때문).
- 지금 바로 시험: `Start-ScheduledTask -TaskName NaverBlogAgent`
- 해제: `Unregister-ScheduledTask -TaskName NaverBlogAgent -Confirm:$false`

## 글쓰기 규칙

글쓰기 규칙은 `CLAUDE.md`에 있습니다(koreait_128 "세모지" 운영 규칙 기준). 말투·분량·금지 사항을 바꾸려면 이 파일을 고치면 됩니다.

발행 전에 아래 항목을 자동으로 점검합니다. 걸리면 Claude에게 한 번 고치게 하고, 그래도 안 되면 **발행하지 않고** 주제를 남겨 둡니다.
- 본문 1,500자 이상 (서식 기호 제외), 소제목 4~6개, 태그 5개 이상
- 사진 5장 이상, 사진 파일이 실제로 있고 모든 사진에 설명이 있음
- 링크·학원 주소·인용구·이모지·3열 이상 표 없음
- 금칙어(`CLAUDE.md` 2-1장: 여정, 완벽 정리, 최고, 무조건, 100% 등) 없음

**사진**: Claude가 글마다 표지 카드 + 소제목마다 1장씩 만듭니다.
- 정리 카드(`scripts/make-card.mjs`): 표·순서·체크리스트를 휴대폰에서도 크게 보이는 이미지로
- 공식 사이트 캡처(`scripts/capture.mjs`): 질병관리청 등 공공기관 안내 화면
- 만든 사진은 Claude가 직접 열어 보고, 엉뚱한 화면이면 다시 만듭니다.

**모바일 가독성**: 한 줄에 한 문장, 문단 2~3줄, 3개 이상은 목록, 핵심 숫자는 굵게, 소제목 → 짧은 문단 → 사진 순서.

에디터 서식: `## 소제목` → 소제목, `**굵게**` → 굵게, `---` → 구분선, `[[사진: …]]` → 사진 + 설명,
`==강조==` → 글자 배경색(연노랑), `| 항목 | 내용 |` → "항목: 내용" 줄.

## 결과 확인

| 위치 | 내용 |
|---|---|
| `topics-done.txt` | 발행한 날짜, 주제, 글 주소 |
| `output/날짜-번호/` | 글 원본(`post.txt`)과 사진(`images/`) |
| `logs/날짜.log` | 실행 기록 |
| `logs/error-*.png` | 실패했을 때의 화면 캡처 |

발행에 실패하면 주제는 `topics.txt`에 그대로 남고, 다음 실행 때 **이미 쓴 글로 발행만 다시 시도**합니다.

## 문제 해결

| 증상 | 해결 |
|---|---|
| `네이버 로그인이 풀렸습니다` | `npm run login` 다시 실행 |
| `claude 실행 실패` | PowerShell에서 `claude --version`이 되는지 확인, 한 번 `claude` 실행해 로그인 |
| 에디터 입력/발행 단계에서 멈춤 | 네이버 에디터 화면이 바뀐 경우입니다. `logs/error-*.png`를 Claude에게 보여주고 `scripts/publish.mjs` 수정을 요청하세요 |
| 수동으로 특정 글만 발행 | `node scripts/publish.mjs output\20261016-1\post.txt` |
| 사진이 안 들어감 | `logs\날짜.log`의 "사진 넣기 실패" 줄과 화면 캡처를 Claude에게 보여 주세요 |

## 주의

- 네이버는 자동화 도구 사용을 제한할 수 있습니다. 하루 1~2개 이내로 운영하고, 글 품질(CLAUDE.md 규칙)을 유지하세요.
- 사실 정보(금액·날짜·연락처)는 가끔 직접 확인하세요. AI가 틀릴 수 있습니다.
