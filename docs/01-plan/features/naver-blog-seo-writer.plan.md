# naver-blog-seo-writer Planning Document

> **Summary**: 메인 키워드 입력 시 네이버 상위 블로그를 분석하여 SEO 최적화 글을 .txt로 저장하는 Claude 기반 워크플로우
>
> **Project**: 글쓰기
> **Version**: 1.0.0
> **Author**: SBS
> **Date**: 2026-04-23
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 네이버 블로그 홈판 노출을 위해 매번 상위 글을 수동 분석하고 SEO에 맞게 글을 써야 하는 반복 작업이 어렵고 시간이 많이 걸림 |
| **Solution** | Claude에 메인 키워드를 입력하면 WebSearch로 네이버 상위 블로그를 자동 분석하고, SEO 구조에 맞는 새 글을 작성 후 .txt로 저장 |
| **Function/UX Effect** | 키워드 입력 한 번으로 제목 패턴·소제목 구성·연관 키워드가 반영된 블로그 글 즉시 생성. 홍보 목적 명시 시 CTA 포함 |
| **Core Value** | 네이버 SEO 지식 없이도 검색 상위 노출 가능성이 높은 블로그 글을 빠르게 생산 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 네이버 블로그 홈판 노출·SEO 최적화 글 작성의 반복 수고를 줄이기 위해 |
| **WHO** | 네이버 블로그를 운영하는 개인 사용자 (SBS) |
| **RISK** | 네이버 검색 결과 접근 제한, WebSearch 결과의 품질 편차 |
| **SUCCESS** | 키워드 입력 후 3분 내 SEO 구조 갖춘 블로그 글 .txt 저장 완료 |
| **SCOPE** | Phase 1 - 분석·작성 워크플로우 / Phase 2 - 출력 템플릿 고도화 |

---

## 1. Overview

### 1.1 Purpose

사용자가 메인 키워드를 Claude에 입력하면:
1. Claude가 WebSearch로 네이버 상위 블로그 글 5~10개를 수집·분석
2. 제목 패턴, 소제목 구성, 연관 키워드, 글 길이, CTA 스타일을 파악
3. 분석 결과를 바탕으로 새로운 SEO 최적화 블로그 글 작성
4. 작성된 글을 .txt 파일로 지정 경로에 저장

### 1.2 Background

네이버 블로그 홈판 노출(VIEW 탭)은 키워드 최적화, 글 구조, 제목 패턴이 중요하다.
매번 경쟁 글을 직접 읽고 분석하는 것은 시간이 걸리므로, Claude의 WebSearch와 글쓰기 능력을 활용해 이 과정을 단축한다.

### 1.3 Related Documents

- 저장 경로: `C:\Users\SBS\Desktop\글쓰기\output\`

---

## 2. Scope

### 2.1 In Scope

- [x] 메인 키워드 입력 → WebSearch로 네이버 상위 블로그 분석
- [x] 제목 패턴·소제목 구성·연관 키워드·글 길이 분석
- [x] 정보성 SEO 블로그 글 작성 (기본값)
- [x] 홍보 목적 명시 시 CTA 포함 글 작성
- [x] 작성된 글을 .txt 파일로 저장 (`output/키워드_YYYYMMDD.txt`)

### 2.2 Out of Scope

- 자동 스케줄링 (주기적 자동 실행)
- 네이버 블로그 직접 포스팅 API 연동
- Python 크롤러 별도 실행 (로봇 차단 우려로 제외)
- 이미지 생성·삽입

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 메인 키워드 입력 시 네이버 상위 블로그 5~10개 WebSearch 수집 | High | Pending |
| FR-02 | 수집된 글에서 제목 패턴, 소제목 구성, 연관 키워드, 글 길이 추출·분석 | High | Pending |
| FR-03 | 분석 결과 기반으로 SEO 최적화 블로그 글 작성 (제목 1개 + 소제목 4~6개 + 본문) | High | Pending |
| FR-04 | 사용자가 홍보 목적을 명시한 경우 CTA 문단 추가 | Medium | Pending |
| FR-05 | 작성 완료 글을 `output/키워드_YYYYMMDD.txt`로 저장 | High | Pending |
| FR-06 | 분석 요약 (제목 패턴, 평균 글자 수, 연관 키워드 목록)을 대화에 출력 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 속도 | 키워드 입력 후 글 완성까지 3분 이내 | 실제 실행 시간 측정 |
| 글 품질 | 네이버 VIEW 탭 SEO 기준 충족 (제목 키워드 포함, 소제목 구조화, 800자 이상) | 글 구조 체크리스트 |
| 저장 안정성 | 파일명 중복 방지 (날짜+시간 suffix) | 파일 생성 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 키워드 입력 → 분석 → 글 작성 → .txt 저장이 한 대화 흐름에서 완료
- [ ] SEO 구조 체크리스트 항목 80% 이상 충족
- [ ] CTA 조건부 포함 로직 정상 동작
- [ ] 저장된 .txt 파일을 네이버 에디터에 그대로 붙여넣기 가능한 형식

### 4.2 Quality Criteria

- [ ] 글 길이: 최소 800자 (네이버 VIEW 노출 기준)
- [ ] 제목: 메인 키워드 포함, 25자 이내
- [ ] 소제목: 4~6개, 연관 키워드 포함
- [ ] 첫 문단: 메인 키워드 2회 이상 자연스럽게 포함

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| WebSearch가 네이버 블로그 본문 내용을 충분히 가져오지 못함 | Medium | Medium | 검색 쿼리를 `site:blog.naver.com 키워드`로 최적화, 스니펫 기반 분석으로 보완 |
| 생성된 글이 기존 글과 유사도가 높아 복사글로 감지될 위험 | High | Low | 문장 구조·표현을 창의적으로 재구성하는 프롬프트 지침 적용 |
| 네이버 SEO 알고리즘 변경으로 분석 기준이 달라질 수 있음 | Medium | Low | 분석 기준을 사용자가 직접 조정할 수 있도록 프롬프트 파라미터화 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `output/` 폴더 | 파일시스템 | 키워드별 .txt 글 파일 누적 생성 |
| Claude 대화 워크플로우 | 프롬프트/워크플로우 | 분석→작성→저장 3단계 표준 흐름 정의 |

### 6.2 Current Consumers

해당 없음 (신규 워크플로우)

### 6.3 Verification

- [ ] output 폴더 파일 생성 확인
- [ ] .txt 파일 인코딩 UTF-8 확인 (네이버 에디터 호환)

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Selected |
|-------|-----------------|:--------:|
| **Starter** | 단순 Claude 대화 워크플로우 + 파일 저장 | ✅ |

### 7.2 워크플로우 구조

```
사용자 입력
 └─ "메인키워드: {키워드}" [+ 선택: "홍보글: {업체명/목적}"]
      │
      ▼
[Step 1] WebSearch
 └─ site:blog.naver.com {키워드} 상위 결과 5~10개 수집
      │
      ▼
[Step 2] 분석
 └─ 제목 패턴 | 소제목 구성 | 연관 키워드 | 평균 글자수
      │
      ▼
[Step 3] 글 작성
 └─ SEO 제목 → 도입부 → 소제목 4~6개 본문 → [CTA if 홍보]→ 마무리
      │
      ▼
[Step 4] 저장
 └─ output/{키워드}_{YYYYMMDD_HHMM}.txt
```

### 7.3 SEO 글 구조 템플릿

```
[제목] 메인키워드 포함, 25자 이내, 숫자/혜택/이유 패턴 활용
[도입부] 메인키워드 2회 이상, 독자 공감 문장
[소제목1] 연관키워드 포함 (H2)
[본문1] 200~300자
...
[소제목4~6] 연관키워드 포함
[본문4~6]
[CTA] (홍보 목적 명시 시만 포함)
[마무리] 메인키워드 재언급, 정보 요약
```

---

## 8. Convention Prerequisites

### 8.1 파일 저장 규칙

| 항목 | 규칙 |
|------|------|
| 저장 경로 | `C:\Users\SBS\Desktop\글쓰기\output\` |
| 파일명 | `{메인키워드}_{YYYYMMDD_HHMM}.txt` |
| 인코딩 | UTF-8 |
| 줄바꿈 | Windows 스타일 (CRLF) |

### 8.2 입력 형식 규칙

| 입력 예시 | 동작 |
|-----------|------|
| `메인키워드: 고유가 피해지원금` | 정보성 글 작성 (CTA 없음) |
| `메인키워드: 대전컴퓨터학원 / 홍보글: 대전 코딩학원 수강생 모집` | CTA 포함 홍보글 작성 |

---

## 9. Next Steps

1. [ ] `output/` 폴더 생성
2. [ ] 워크플로우 실제 실행 테스트 (키워드 1개로 검증)
3. [ ] SEO 체크리스트 기준 미달 시 프롬프트 수정

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-23 | Initial draft | SBS |
