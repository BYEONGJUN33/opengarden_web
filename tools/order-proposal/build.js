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
const KAKAO = 'https://pf.kakao.com/_lGfxhX/chat';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));
const won = (n) => '₩' + Number(n).toLocaleString('en-US');
const stockTxt = (st) => (st == null ? '' : typeof st === 'string' ? st.replace('+', '') + '구 이상' : Number(st).toLocaleString('en-US') + '구');

function card(it) {
  const k = it.k;
  if (!fs.existsSync(path.join(OUT, 'img', `${k}.jpg`))) throw new Error(`사진 없음: public/p/${spec.id}/img/${k}.jpg`);
  let badge = '';
  if (it.mark === 'req') badge = '<span class="badge req">★ 요청 품종</span>';
  else if (it.mark === 'alt') badge = `<span class="badge alt">◇ ${esc(it.alt)}</span>`;
  const rows = it.rows.map(([sp, st, price]) => {
    const few = it.note === '소량' ? ' <em class="few">소량</em>' : '';
    return `
        <div class="opt" data-id="${esc(k + '|' + sp)}" data-grp="${esc(it.grp)}" data-name="${esc(it.name)}" data-spec="${esc(sp)}" data-price="${price}" data-max="${Number.isInteger(st) ? st : ''}">
          <div class="opt-info">
            <span class="o-spec">${esc(sp)}</span>
            <span class="o-stock">재고 ${esc(stockTxt(st))}${few}</span>
            <span class="o-price">${won(price)}<small>/구</small></span>
          </div>
          <div class="stepper">
            <button type="button" class="st-btn minus" aria-label="${esc(it.name)} ${esc(sp)} 100구 빼기">−</button>
            <input type="number" inputmode="numeric" min="0" step="100" value="0" aria-label="${esc(it.name)} ${esc(sp)} 수량(구)">
            <button type="button" class="st-btn plus" aria-label="${esc(it.name)} ${esc(sp)} 100구 더하기">+</button>
          </div>
          <div class="o-warn" hidden></div>
        </div>`;
  }).join('');
  const note = it.note && it.note !== '소량' ? `<p class="c-note">${esc(it.note)}</p>` : '';
  const feats = it.feat.map((f) => `<li>${esc(f)}</li>`).join('');
  return `
    <article class="card" id="i-${k}">
      <div class="c-photo"><img src="img/${k}.jpg" alt="${esc(it.name)}" loading="lazy" decoding="async"></div>
      <div class="c-body">
        <div class="c-top"><span class="c-grp">${esc(it.grp)}</span>${badge}</div>
        <h3 class="c-name">${esc(it.name)}</h3>
        <p class="c-latin">${esc(it.latin)}</p>
        <div class="chips"><span class="chip size">${esc(it.size)}</span><span class="chip">${esc(it.head)}</span><span class="chip">키 ${it.h[0]}~${it.h[1]}cm</span></div>
        <ul class="feat">${feats}</ul>
        ${note}
        <div class="opts">${rows}
        </div>
      </div>
    </article>`;
}

let nav = '';
let sections = '';
for (const [g, latin] of spec.groups) {
  const its = spec.items.filter((it) => it.grp === g);
  if (!its.length) continue;
  const id = 'g-' + latin.toLowerCase();
  nav += `<a href="#" data-to="${id}">${esc(g)} <span>${its.length}</span></a>`;
  sections += `
  <section class="grp" id="${id}">
    <h2><span>${esc(g)}</span><small>${esc(latin)} · ${its.length}품종</small></h2>
    <div class="cards">${its.map(card).join('')}</div>
  </section>`;
}

// terms·notice는 굵게(<b>)만 쓰는 신뢰된 문구 (제안서 JSON = 사내 작성)
const terms = spec.terms.map((t) => `<li>${t}</li>`).join('');
const notice = spec.notice.map((t) => `<li>${t}</li>`).join('\n  ');
const payload = Buffer.from(JSON.stringify({ sections, customer: spec.customer || null }), 'utf8');
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(spec.key, 'base64url'), iv);
const ct = Buffer.concat([cipher.update(payload), cipher.final(), cipher.getAuthTag()]); // WebCrypto 형식: 암호문+태그
const cfg = JSON.stringify({
  pid: spec.id, title: spec.title, date: spec.date, min: spec.minOrder || 0, minLabel: spec.minLabel || '',
  enc: { iv: iv.toString('base64url'), ct: ct.toString('base64url') },
}).replace(/</g, '\\u003c');
const pageUrl = `https://open-garden.co.kr/p/${spec.id}/`;
const ogImage = fs.existsSync(path.join(OUT, 'og.jpg')) ? pageUrl + 'og.jpg' : 'https://open-garden.co.kr/assets/og.jpg';

const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const html = tpl
  .split('%%TITLE%%').join(esc(spec.title))
  .split('%%DATE%%').join(esc(spec.date))
  .split('%%BASIS%%').join(esc(spec.basis))
  .replace('%%NOTICE%%', notice)
  .replace('%%NAV%%', nav)
  .replace('%%PAGEURL%%', pageUrl)
  .replace('%%OGIMAGE%%', ogImage)
  .replace('%%TERMS%%', terms)
  .replace('%%CFG%%', cfg)
  .split('https://pf.kakao.com/_lGfxhX/chat').join(KAKAO);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
if (/%%[A-Z]+%%/.test(html)) throw new Error('채워지지 않은 자리표시자가 남아 있습니다');
console.log(`생성: public/p/${spec.id}/index.html (${spec.items.length}품종)`);
console.log(`고객에게 보낼 링크: ${pageUrl}#k=${spec.key}`);
