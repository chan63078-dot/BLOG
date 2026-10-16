# 네이버 블로그 자동 발행 에이전트

`topics.txt`에 적어 둔 주제를 매일 하나씩 꺼내서
**Claude가 글 작성 → 네이버 블로그에 자동 발행 → 완료 기록**까지 처리합니다.

```
topics.txt ─▶ claude -p (조사·작성, CLAUDE.md 규칙) ─▶ output/주제_날짜.txt
          ─▶ Edge 브라우저 자동 조작 (스마트에디터에 입력 → 발행) ─▶ topics-done.txt
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
| `minChars` | 본문 최소 글자 수. 모자라면 Claude가 보강하고, 그래도 모자라면 발행하지 않음 |

## 3. 네이버 로그인 (최초 1회)

```powershell
npm run login
```

Edge 창이 열리면 직접 로그인하세요(**로그인 상태 유지** 체크). 로그인이 확인되면 창이 자동으로 닫힙니다.
비밀번호는 어디에도 저장되지 않고, 로그인 상태만 `.naver-profile` 폴더에 남습니다.

## 4. 주제 입력

`topics.txt`에 한 줄에 하나씩 적습니다. 위에서부터 순서대로 발행됩니다.

```
대전 엑셀 학원 추천
2026 근로장려금 신청 방법
대전 코딩학원 | 홍보: SBS컴퓨터아트학원 파이썬 과정 수강생 모집
```

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
- 링크·학원 주소·이미지 자리 표시·인용구·이모지·3열 이상 표 없음

에디터 서식: `## 소제목` → 소제목, `**굵게**` → 굵게, `---` → 구분선, `| 항목 | 내용 |` → "항목: 내용" 줄.
(형광펜 `==...==`은 아직 굵은 글씨로 들어갑니다.)

## 결과 확인

| 위치 | 내용 |
|---|---|
| `topics-done.txt` | 발행한 날짜, 주제, 글 주소 |
| `output/` | 작성된 글 원본 |
| `logs/날짜.log` | 실행 기록 |
| `logs/error-*.png` | 실패했을 때의 화면 캡처 |

발행에 실패하면 주제는 `topics.txt`에 그대로 남고, 다음 실행 때 **이미 쓴 글로 발행만 다시 시도**합니다.

## 문제 해결

| 증상 | 해결 |
|---|---|
| `네이버 로그인이 풀렸습니다` | `npm run login` 다시 실행 |
| `claude 실행 실패` | PowerShell에서 `claude --version`이 되는지 확인, 한 번 `claude` 실행해 로그인 |
| 에디터 입력/발행 단계에서 멈춤 | 네이버 에디터 화면이 바뀐 경우입니다. `logs/error-*.png`를 Claude에게 보여주고 `scripts/publish.mjs` 수정을 요청하세요 |
| 수동으로 특정 글만 발행 | `node scripts/publish.mjs output\파일.txt` |

## 주의

- 네이버는 자동화 도구 사용을 제한할 수 있습니다. 하루 1~2개 이내로 운영하고, 글 품질(CLAUDE.md 규칙)을 유지하세요.
- 사실 정보(금액·날짜·연락처)는 가끔 직접 확인하세요. AI가 틀릴 수 있습니다.
