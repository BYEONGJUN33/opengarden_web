// GET /api/catalog?group=immediate|preorder
// 에어테이블 Master DB를 View 단위로 읽어 사이트에 전달합니다.
// 가격 필드(단가_EUR, 원화 단가)는 FIELDS 화이트리스트에 없으므로
// 서버 밖으로 절대 나가지 않습니다.

const BASE = process.env.AIRTABLE_BASE_ID;   // 예: appzLstFHtHcQlWSu
const TABLE = process.env.AIRTABLE_TABLE_ID; // 예: tblm8bjSeDCflcIzk (Master DB)
const TOKEN = process.env.AIRTABLE_TOKEN;

const VIEWS = {
  immediate: process.env.AIRTABLE_VIEW_IMMEDIATE || '즉시 출하 가능 카탈로그',
  preorder: process.env.AIRTABLE_VIEW_PREORDER || '사전 예약용 카탈로그',
};

// 사이트에 내보낼 필드만 명시 (실제 에어테이블 필드명과 정확히 일치해야 함)
const FIELDS = [
  '국명', '학명', 'SKU', 'Size (규격)', '카테고리', '내한성',
  'Status', '공급가능시기', '이미지_URL', 'Web Image', '재고',
];

module.exports = async (req, res) => {
  try {
    if (!BASE || !TABLE || !TOKEN) {
      return res.status(500).json({ error: '환경변수가 설정되지 않았습니다.' });
    }
    const group = req.query.group === 'preorder' ? 'preorder' : 'immediate';
    const view = VIEWS[group];

    // 에어테이블은 100건씩 페이지네이션 → 전부 모아서 응답
    let records = [];
    let offset;
    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
      url.searchParams.set('view', view);
      url.searchParams.set('pageSize', '100');
      FIELDS.forEach((f) => url.searchParams.append('fields[]', f));
      if (offset) url.searchParams.set('offset', offset);

      const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (!r.ok) throw new Error(`Airtable ${r.status}`);
      const data = await r.json();
      records = records.concat(data.records);
      offset = data.offset;
    } while (offset);

    const items = records.map(({ id, fields: f }) => ({
      id,
      sku: f['SKU'] || '',
      kname: f['국명'] || '',
      sname: f['학명'] || '',
      size: f['Size (규격)'] || '',
      cat: Array.isArray(f['카테고리']) ? f['카테고리'] : f['카테고리'] ? [f['카테고리']] : [],
      zone: f['내한성'] || '',
      status: f['Status'] || '',
      seasons: f['공급가능시기'] || [],
      // 재고 '수량'은 내부 정보 → 유무(boolean)만 노출
      inStock: typeof f['재고'] === 'number' ? f['재고'] > 0 : null,
      // 이미지: 고정 URL(이미지_URL) 우선. 첨부(Web Image) URL은 만료되므로 임시용
      image: f['이미지_URL'] || (Array.isArray(f['Web Image']) && f['Web Image'][0] && f['Web Image'][0].url) || null,
      group,
    }));

    // 10분 캐시 → 에어테이블 API 한도(초당 5회) 보호 + 빠른 응답
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.status(200).json({ group, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: '카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
