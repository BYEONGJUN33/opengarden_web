const ORIGIN = 'https://open-garden.co.kr';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderPlant(p) {
  const url = ORIGIN + p.page, name = String(p.kname || p.sname);
  const description = [name, p.sname, p.size, p.desc].filter(Boolean).join(' · ').slice(0, 200);
  const image = p.image ? ORIGIN + p.image : ORIGIN + '/assets/og.jpg';
  const data = { '@context':'https://schema.org', '@type':'Product', name, description, url,
    image: p.images.map(u => ORIGIN + u), brand: { '@type':'Brand', name:'오픈가든' } };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} | 오픈가든 식물 카탈로그</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}"><meta property="og:url" content="${esc(url)}"><meta property="og:type" content="website">
<meta property="og:title" content="${esc(name)} | 오픈가든"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/site.css"><style>main{max-width:900px;margin:40px auto;padding:20px}img{max-width:100%;height:auto}h1{margin:24px 0 12px}p{margin:12px 0}.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}</style>
<script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script></head><body><main>
<a href="/catalog.html">← 식물 카탈로그</a><h1>${esc(name)}</h1><p>${esc(p.sname)}</p>
<div class="photos">${p.images.map((u,i)=>`<img src="${esc(u)}" alt="${esc(name)} 사진 ${i+1}" ${i?'loading="lazy"':''}>`).join('')}</div>
<p>규격: ${esc(p.size)} · ${p.group==='immediate'?'즉시 출하':'사전 예약'}</p>
${p.zone?`<p>내한성: ${esc(p.zone)}</p>`:''}<p>${esc(p.desc)}</p><p>${esc(p.use)}</p>
<a href="/catalog.html?item=${encodeURIComponent(p.sku||p.id)}">이 품종 선택하고 견적 요청하기 →</a>
<p>가격·재고·납기는 상담 후 안내합니다.</p></main></body></html>`;
}
module.exports = { ORIGIN, esc, renderPlant };
