// GET /api/catalog?group=immediate|preorder
// 에어테이블 Master DB를 읽어 사이트에 전달합니다.
// 가격 필드(단가_EUR, 단가_WON)는 FIELDS 화이트리스트에 없으므로
// 서버 밖으로 절대 나가지 않습니다. Status 원본값도 내부 정보 → 비노출.

const BASE = process.env.AIRTABLE_BASE_ID;   // 예: appzLstFHtHcQlWSu
const TABLE = process.env.AIRTABLE_TABLE_ID; // 예: tblm8bjSeDCflcIzk (Master DB)
const TOKEN = process.env.AIRTABLE_TOKEN;

// 즉시출하/사전예약 전용 뷰가 에어테이블에 준비되면 환경변수 두 개를 모두 설정하세요
// → 뷰 기준으로 그룹을 나눕니다. 미설정 시(2026-07 현재 뷰 없음)
// 테이블 전체를 읽고 아래 IMMEDIATE_STATUS 규칙으로 나눕니다.
const VIEWS = {
  immediate: process.env.AIRTABLE_VIEW_IMMEDIATE,
  preorder: process.env.AIRTABLE_VIEW_PREORDER,
};

// 뷰가 없을 때의 임시 분류 규칙: Status가 아래 목록이면 '즉시 출하', 나머지는 '사전 예약'
// (주문가능·출하대기 외 옵션: 수입대기, 순화중, 수입예정, 공급확정(…), 가격 재확인 필요(…))
const IMMEDIATE_STATUS = ['주문가능', '출하대기'];

// 사이트에 내보낼 필드만 명시 — 실제 에어테이블 필드명과 대조 완료 (2026-07-17)
const FIELDS = [
  '국명', '학명', 'SKU', 'Size (규격)', '카테고리', '내한성',
  'Status', '공급가능시기', '이미지_URL', 'Web Image (Auto-search)', '재고',
];

async function fetchAll(view) {
  // 에어테이블은 100건씩 페이지네이션 → 전부 모아서 반환
  let records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    if (view) url.searchParams.set('view', view);
    // 국명·학명이 둘 다 빈 행(~1,700건)은 서버에서 제외 — 페이지네이션 낭비 방지
    url.searchParams.set('filterByFormula', 'OR({국명}!="",{학명}!="")');
    url.searchParams.set('pageSize', '100');
    FIELDS.forEach((f) => url.searchParams.append('fields[]', f));
    if (offset) url.searchParams.set('offset', offset);

    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const data = await r.json();
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// 뷰 미사용 모드에서 전체 테이블 조회를 10분간 메모리 캐시
// (immediate/preorder 두 요청이 조회 한 번을 공유)
let cache = { at: 0, records: null };

module.exports = async (req, res) => {
  try {
    if (!BASE || !TABLE || !TOKEN) {
      return res.status(500).json({ error: '환경변수가 설정되지 않았습니다.' });
    }
    const group = req.query.group === 'preorder' ? 'preorder' : 'immediate';

    let records;
    if (VIEWS.immediate && VIEWS.preorder) {
      records = await fetchAll(VIEWS[group]);
    } else {
      if (!cache.records || Date.now() - cache.at > 600000) {
        cache = { at: Date.now(), records: await fetchAll(null) };
      }
      records = cache.records.filter((r) => {
        const s = (r.fields && r.fields['Status']) || '';
        const immediate = IMMEDIATE_STATUS.includes(s);
        return group === 'immediate' ? immediate : !immediate;
      });
    }

    const items = records.map(({ id, fields: f }) => ({
      id,
      sku: f['SKU'] || '',
      kname: f['국명'] || '',
      sname: f['학명'] || '',
      size: f['Size (규격)'] || '',
      cat: Array.isArray(f['카테고리']) ? f['카테고리'] : f['카테고리'] ? [f['카테고리']] : [],
      zone: f['내한성'] || '',
      seasons: f['공급가능시기'] || [],
      // 재고 '수량'은 내부 정보 → 유무(boolean)만 노출
      inStock: typeof f['재고'] === 'number' ? f['재고'] > 0 : null,
      // 이미지: 고정 URL(이미지_URL) 우선. 첨부 URL은 만료되므로 임시용
      image:
        f['이미지_URL'] ||
        (Array.isArray(f['Web Image (Auto-search)']) &&
          f['Web Image (Auto-search)'][0] &&
          f['Web Image (Auto-search)'][0].url) ||
        null,
      group,
    }));

    // 10분 캐시 → 에어테이블 API 한도(초당 5회) 보호 + 빠른 응답
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.status(200).json({ group, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: '카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
