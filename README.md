# OpenGarden 웹사이트 스타터

정적 사이트(public/) + 서버리스 API(api/) + 에어테이블 연동 구조.
`OpenGarden_아키텍처_v1.md`, `OpenGarden_인수인계_v1.md`와 함께 보세요.

## 폴더 구조

```
public/
  index.html        홈 원페이지 (소개 · 서비스 · 사례 · 이용안내 · FAQ 통합)
  catalog.html      카탈로그 (API 연동 코드 포함 — 미배포 상태에선 샘플 데이터로 동작)
  assets/           로고 · og.jpg(카톡 공유 미리보기) · 사진
api/
  catalog.js        GET  /api/catalog?group=immediate|preorder
  quote.js          POST /api/quote
package.json
```

## 배포 전 준비 (1회)

### 1. 에어테이블 토큰 발급
- https://airtable.com/create/tokens
- Scopes: `data.records:read`, `data.records:write`
- Access: **OpenGarden 베이스 하나만** 지정 (최소 권한 원칙)

### 2. 견적요청 테이블 생성 (OpenGarden 베이스 안에)
필드: 요청번호(텍스트, primary) / 요청자(텍스트) / 요청사항(장문) / 품목요약(장문) / 품목JSON(장문) / 상태(단일선택: 신규·제안서발송·계약·종료) / 접수일시(Created time)

### 3. 필드명 확인
`api/catalog.js`의 `FIELDS` 배열이 실제 Master DB 필드명과 정확히 일치해야 합니다.
특히 `Size (규격)` 같은 필드는 에어테이블에서 실제 이름을 복사해 붙여넣으세요.

## 배포 (Vercel 기준)

```bash
npm i -g vercel
vercel login
vercel            # 프로젝트 연결
vercel env add AIRTABLE_TOKEN
vercel env add AIRTABLE_BASE_ID        # appzLstFHtHcQlWSu
vercel env add AIRTABLE_TABLE_ID       # tblm8bjSeDCflcIzk
# (선택) View 이름이 다르면:
# vercel env add AIRTABLE_VIEW_IMMEDIATE
# vercel env add AIRTABLE_VIEW_PREORDER
# vercel env add AIRTABLE_QUOTE_TABLE
vercel --prod
```

배포 후 Vercel 대시보드 → Domains에서 보유 도메인 연결.

## 배포 후 교체할 것

- [ ] `public/catalog.html`의 `KAKAO_URL` → 실제 카카오톡 채널 채팅 주소
- [ ] 각 페이지 푸터의 사업자 정보
- [ ] `assets/`에 로고·사진 업로드 후 플레이스홀더 교체
- [ ] 이미지: 에어테이블 `이미지_URL` 필드에 **고정 URL** 입력
      (첨부파일 URL은 몇 시간 후 만료됨 — 아키텍처 문서 4번 참고)

## 동작 확인

- `https://도메인/api/catalog?group=immediate` → JSON에 items가 오는지
- 응답에 가격 관련 필드가 **없는지** (있으면 안 됨)
- 카탈로그 페이지에서 담기 → 견적 요청 → 에어테이블 견적요청 테이블에 레코드 생성 확인

## 견적 API 사용 예 (프론트)

```js
const r = await fetch('/api/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, memo, items, website: '' }),
});
const { ok, requestNo } = await r.json();
```

`requestNo`를 카톡 복사 텍스트 첫 줄에 넣으면 카톡 문의 ↔ 에어테이블 기록이 매칭됩니다.
