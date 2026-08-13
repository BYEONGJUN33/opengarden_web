// FAQ 본문(<details>)과 FAQPage JSON-LD를 한 소스에서 생성해 src/faq.html에 반영합니다.
// 문항을 고칠 때는 아래 FAQ 배열만 수정하고 `node tools/gen_faq.js` 실행.
// (본문과 JSON-LD가 따로 놀지 않도록 항상 함께 갱신됩니다)
const fs = require('fs');
const path = require('path');

// cat: q=견적·주문, v=품종·규격, d=수입·납품·계약
const FAQ = [
  ['q', '견적은 어떻게 요청하나요?', '카탈로그에서 품종을 담고 연락처를 남겨주시면 접수됩니다. 48시간 내 회신드립니다. 급하시면 카카오톡 채널로 품목·수량을 바로 보내주셔도 됩니다.'],
  ['q', '카탈로그에 없는 품종도 되나요?', '됩니다. 학명이나 사진, 원하는 규격을 주시면 국내 농가와 해외 농장을 확인해 조달 가능 여부와 단가를 알려드립니다.'],
  ['q', '견적 요청 후 얼마나 걸리나요?', '48시간 이내에 회신드립니다. 접수 시 발급되는 요청번호(Q-…)를 알려주시면 더 빠르게 조회됩니다.'],
  ['q', '가격은 왜 사이트에 없나요?', '수량·시기·규격에 따라 단가가 달라져 견적서로 안내드립니다. 수입 품목은 인보이스 기준 원가 구조를 함께 공개합니다.'],
  ['q', '최소 주문 수량이 있나요?', '품종에 따라 다릅니다. 카탈로그 상세와 견적 과정에서 안내드리니 편하게 요청해주세요.'],
  ['v', '규격 표기(P9, C2 등)는 어떤 의미인가요?', '유럽 묘목 규격으로 화분 크기와 형태를 나타냅니다. 상세 기준은 카탈로그에서 확인할 수 있습니다.'],
  ['v', '내한성 존(Zone)은 무엇인가요?', '식물이 견딜 수 있는 최저 기온 범위를 나타내는 기준입니다. 수입 품종에 표기되어 있어 현장 기후에 맞는 선택을 도와드립니다. 참고로 우리나라는 대체로 Zone 6a~8b에 해당합니다.'],
  ['v', '즉시 출하와 사전 예약의 차이는 무엇인가요?', '즉시 출하는 현재 재고에서 바로 공급 가능한 품목, 사전 예약은 시즌에 맞춰 수입·공급되는 품목입니다.'],
  ['v', '원하는 품종이 목록에 없어요.', '목록에 없는 품종도 요청해주시면 국내외 농가 네트워크에서 찾아 제안드립니다. 카탈로그 견적 요청이나 카카오톡 채널로 알려주세요.'],
  ['d', '수입 식물의 검역은 어떻게 처리되나요?', '수입 검역·식물위생증명서·통관을 오픈가든이 전담합니다. 요청 시 인보이스·수입신고필증 사본을 드려 원산지와 통관 이력을 직접 확인하실 수 있습니다.'],
  ['d', '수입 품종은 주문 후 얼마나 걸리나요?', '품종과 생산 국가, 시즌에 따라 달라집니다. 검역 절차상 격리재배가 필요한 품목은 기간이 더 소요되므로, 견적 시 예상 일정을 함께 안내드립니다.'],
  ['d', '납품은 어떻게 진행되나요?', '견적과 수량이 확정되면 요청하신 장소와 일정에 맞춰 현장으로 납품해드립니다.'],
  ['d', '계약·결제는 어떻게 하나요?', '수량과 납기를 확정한 뒤 결제를 진행합니다. 자세한 방식은 담당자가 안내드립니다.'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 1) 화면용 — JS 없이도 펼쳐지는 <details>
const block = FAQ.map(([cat, q, a]) =>
  `    <details class="qa" data-cat="${cat}">
      <summary><span class="q">Q</span><span class="t">${esc(q)}</span></summary>
      <div class="a">${esc(a)}</div>
    </details>`).join('\n');

// 2) 검색엔진용 구조화 데이터
const jsonld = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(([, q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}, null, 2);

// 3) src/faq.html의 두 구간을 교체
const target = process.argv[2] || path.join(__dirname, '..', 'src', 'faq.html');
let s = fs.readFileSync(target, 'utf8');

// 줄바꿈(LF/CRLF)에 무관하도록 \r? 허용
const flist = /(<div id="flist">\r?\n)[\s\S]*?(\r?\n\s*<\/div>)/;
if (!flist.test(s)) throw new Error('faq.html: #flist 구간을 찾지 못했습니다');
s = s.replace(flist, (m, a, b) => a + block + b);

const ld = /(<script type="application\/ld\+json">\r?\n)[\s\S]*?(\r?\n<\/script>)/;
if (!ld.test(s)) throw new Error('faq.html: JSON-LD 구간을 찾지 못했습니다');
s = s.replace(ld, (m, a, b) => a + jsonld + b);

fs.writeFileSync(target, s, 'utf8');
console.log(`FAQ ${FAQ.length}문항 반영 → ${path.relative(process.cwd(), target)} (본문 + JSON-LD)`);
