# OpenGarden 웹사이트

유럽 직수입 식물(정원수·관목·초화·그라스) B2B 공급사 **오픈가든**의 공식 홈페이지.
정적 사이트 + 서버리스 함수 2개 + 에어테이블(유일한 데이터 원본) 구조.

## 구조

```
public/
  index.html      홈 원페이지 (히어로→밴드→지표→소개→서비스→사례→이용안내→FAQ→CTA→푸터)
  catalog.html    카탈로그: 검색/필터 → 담기 → 견적 모달 → API 기록 + 클립보드 복사 + 카톡 열기
  assets/         로고, og.jpg(카톡 공유 미리보기), 사진
api/
  catalog.js      GET  /api/catalog?group=immediate|preorder — 에어테이블 읽기
  quote.js        POST /api/quote — 견적요청 기록 + 요청번호(Q-YYYYMMDD-XXX) 발급
docs/             아키텍처·구조·인수인계 문서 + 사용자 플로우 다이어그램 (작업 전 필독)
```

## 절대 원칙 (위반 금지)

1. **가격 비노출**: 단가_EUR·원화 단가 필드는 어떤 경로로도 브라우저에 도달하면 안 됨.
   `api/catalog.js`의 `FIELDS` 화이트리스트가 유일한 관문 — 가격 필드를 추가하지 말 것.
2. **토큰 보안**: 에어테이블 토큰은 호스팅 환경변수로만. 코드·커밋·클라이언트에 절대 포함 금지.
3. **단일 데이터 원본**: 품종·재고 데이터를 HTML에 하드코딩하지 않는다.
   `catalog.html`의 `PLANTS` 샘플 배열은 미연동 상태의 폴백 전용.
4. **저작권 원칙**: 레퍼런스(rootrix.com)는 레이아웃 구성 벤치마킹만.
   문구·사진·수치를 가져오지 않는다. 모든 카피는 오픈가든 자체 작성.
5. **디자인 토큰 유지**: `:root` CSS 변수(--green 등)와 Noto Sans KR 체계를 임의 변경하지 않는다.
   색·폰트 변경은 사용자 확인 후에만.

## 기술 결정사항

- 순수 HTML/CSS/JS. 프레임워크·빌드 도구 없음 (필요해지면 사용자와 상의 후 도입)
- `api/`는 Node 18+ 기준, 외부 의존성 0 (네이티브 fetch)
- 호스팅 미정 — "정적 파일 + 서버리스 함수" 지원이면 어디든 가능 (Vercel/Netlify/Cloudflare Pages 등).
  사용자와 상의해 선택할 것.
- 단, `api/*.js`는 Node (req, res) 형식(Vercel 계열 기준)으로 작성됨.
  Netlify/Cloudflare 선택 시 핸들러 형식 변환 필요 — 로직은 그대로, 겉모양만 바꾸면 됨.
- 카카오톡 채널은 메시지 사전 채움 불가 → "API 기록 + 클립보드 복사 + 채팅 열기" 방식이 확정 설계.
  `catalog.html`의 `KAKAO_URL` 상수를 실제 채널 주소로 교체 필요.

## 환경변수 (호스팅에 설정)

```
AIRTABLE_TOKEN            (scopes: data.records:read/write, OpenGarden 베이스만)
AIRTABLE_BASE_ID          appzLstFHtHcQlWSu
AIRTABLE_TABLE_ID         tblm8bjSeDCflcIzk   (Master DB, 1,924종)
AIRTABLE_VIEW_IMMEDIATE   기본값: 즉시 출하 가능 카탈로그
AIRTABLE_VIEW_PREORDER    기본값: 사전 예약용 카탈로그
AIRTABLE_QUOTE_TABLE      기본값: 견적요청
```

## 남은 작업 (우선순위)

1. git 초기화 + 로컬 미리보기 환경
2. 에어테이블 준비: 견적요청 테이블 생성(README 참고), `catalog.js`의 `FIELDS`가 실제 필드명과 일치하는지 검증
3. 호스팅 선택 → 배포 → 자체 도메인 연결
4. 콘텐츠 교체: KAKAO_URL, 푸터 사업자 정보, 실사진(히어로·사례·서비스), 지표 수치 확정,
   실제 로고로 assets/logo.svg 교체, og:image를 배포 도메인의 절대 URL로 교체(카톡 미리보기용),
   privacy.html 빈칸 채우고 검토
5. FAQ의 "(확정 후 기재)" 답변 채우기
6. (2차) 카카오 알림톡/상담톡 API 검토, 애널리틱스, sitemap

## 검증 체크리스트 (배포 후)

- `/api/catalog?group=immediate` 응답에 items 존재 + **가격 필드 부재** 확인
- 카탈로그 담기→견적 요청 시 에어테이블 견적요청 테이블에 레코드 생성 확인
- 카톡에 사이트 링크 공유 시 og 미리보기 표시 확인
- 모바일(카톡 인앱 브라우저) 화면 확인 — 주 유입 경로
