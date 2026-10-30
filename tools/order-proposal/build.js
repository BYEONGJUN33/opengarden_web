// 주문형 제안서 생성기 — 고객 카톡방에 보내는 "수량 입력 → 견적 요청" 링크 페이지
//
//   node tools/order-proposal/build.js <제안서 JSON 경로>
//   → public/p/<제안서ID>/index.html 생성 (사진은 public/p/<제안서ID>/img/<k>.jpg, 카톡 미리보기는 og.jpg)
//
// 저장소가 공개라서 품목·가격·고객정보는 AES-256-GCM으로 암호화해 넣는다.
// 열쇠는 공유 링크의 # 뒤(#k=…)에만 있다 — # 뒤는 서버로 전송되지 않으므로 링크를 받은 사람만 열람 가능.
// 제안서 JSON(가격·고객 연락처·열쇠 포함)은 저장소에 커밋하지 않는다 (.gitignore).
//
// 흐름: 고객이 링크 열기 → 품목별 수량(구) 입력 → 연락처·동의 → POST /api/quote
//      → 에어테이블 견적요청 기록 → (기존 자동화 '카톡알림 · 웹 견적 신청') → Make → 대표 카톡
// 외부 의존성 0. 자세한 내용은 같은 폴더 README.md.

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const specPath = process.argv[2];
if (!specPath) {
  console.error('사용법: node tools/order-proposal/build.js <제안서 JSON 경로>');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
if (!/^[a-z0-9-]{8,64}$/.test(spec.id)) throw new Error('제안서 ID 형식 오류');
// 열쇠는 제안서마다 고정 (다시 빌드해도 보낸 링크가 유지되도록 JSON에 저장)
if (!spec.key) {
  spec.key = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 1));
}
const OUT = path.join(ROOT, 'public', 'p', spec.id);

const { renderSections, renderPage } = require('../../lib/order-page');

for (const it of spec.items) {
  if (!fs.existsSync(path.join(OUT, 'img', `${it.k}.jpg`))) throw new Error(`사진 없음: public/p/${spec.id}/img/${it.k}.jpg`);
  it.img = `img/${it.k}.jpg`;
}
const { nav, sections } = renderSections(spec);

// terms·notice는 굵게(<b>)만 쓰는 신뢰된 문구 (제안서 JSON = 사내 작성)
const payload = Buffer.from(JSON.stringify({ sections, customer: spec.customer || null }), 'utf8');
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(spec.key, 'base64url'), iv);
const ct = Buffer.concat([cipher.update(payload), cipher.final(), cipher.getAuthTag()]); // WebCrypto 형식: 암호문+태그
const pageUrl = `https://open-garden.co.kr/p/${spec.id}/`;
const hasOg = fs.existsSync(path.join(OUT, 'og.jpg'));
const html = renderPage(spec, {
  word: '견적', unit: '구', nav, pageUrl,
  ogImage: hasOg ? pageUrl + 'og.jpg' : 'https://open-garden.co.kr/assets/og.jpg', ogDim: hasOg,
  secure: '<p class="lock" id="lockMsg">제안서를 여는 중…</p>',
  terms: spec.terms, notice: spec.notice,
  cfg: { pid: spec.id, title: spec.title, date: spec.date, min: spec.minOrder || 0, minLabel: spec.minLabel || '',
    enc: { iv: iv.toString('base64url'), ct: ct.toString('base64url') } },
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`생성: public/p/${spec.id}/index.html (${spec.items.length}품종)`);
console.log(`고객에게 보낼 링크: ${pageUrl}#k=${spec.key}`);
