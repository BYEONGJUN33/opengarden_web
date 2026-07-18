// GET /api/catalog?group=immediate|preorder
// immediate = 국내 라인업 (국내 재고 → 즉시 출하)
// preorder  = 판매 라인업 (유럽 수입 구근 → 사전 예약)
// 가격 필드(도매가, 단가_EUR, 정가·할증반영가·관급가·크레이트가 등)는 아래 필드ID
// 화이트리스트에 없으므로 서버 밖으로 절대 나가지 않습니다.
// (예전 Master DB 기준 코드는 git 이력 6e3b205 참고)

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;

// 테이블·필드를 이름이 아닌 ID로 지정 — 에어테이블에서 이름을 바꿔도 안 깨짐 (2026-07-18 실스키마 대조)
const SOURCES = {
  immediate: {
    table: process.env.AIRTABLE_TABLE_DOMESTIC || 'tblDMLlaBwkW1NfhU', // 국내 라인업
    fields: {
      kname: 'fldxfOsqC0b41oxmt', // 국명
      sname: 'fld92Co6Q7JYeyAPe', // 학명
      size: 'fldBy0z3isyaVqCmC',  // Size (규격) — 예: 7치
      cat: 'fldD4hy9yFpeiSN2K',   // 카테고리
      moq: 'fldOntZJg6Qjn1fAd',   // 최소주문수량
      image: 'fldwpaj4TS0bW9E0x', // image 첨부
    },
  },
  preorder: {
    table: process.env.AIRTABLE_TABLE_IMPORT || 'tblylbZq6PLfzH1Ol', // 판매 라인업 (유럽 수입)
    fields: {
      sku: 'fldbSwnIpkkGqKkpC',   // SKU (실제 필드명 앞에 보이지 않는 BOM 문자가 있어 ID 지정이 특히 중요)
      kname: 'fldM4cqde0Qn5qiIy', // 국명
      sname: 'fldh1PgjsPs6zAwwS', // 학명
      cat: 'fldin9Roj1xTXYYHY',   // 속 (튤립·크로커스 등) → 카테고리로 사용
      size: 'fldrQ830PgqMwsmiL',  // Size (규격) — 예: 11/12 규격
      zone: 'fldvnaxRNwATuI8JK',  // 내한성 — 예: -20℃
      desc: 'fldLgt242IX3HfZje',  // 특징 (상세 모달용)
      use: 'fldZuyylSbD2YBfXn',   // 쓰임새 추천
      image: 'fldPSrlViJFjaUerf', // image 첨부
    },
  },
};

async function fetchAll(src) {
  // 에어테이블은 100건씩 페이지네이션 → 전부 모아서 반환
  let records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${src.table}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    // 이름(국명·학명)이 둘 다 빈 행은 서버에서 제외
    url.searchParams.set('filterByFormula', 'OR({국명}!="",{학명}!="")');
    url.searchParams.set('pageSize', '100');
    Object.values(src.fields).forEach((f) => url.searchParams.append('fields[]', f));
    if (offset) url.searchParams.set('offset', offset);

    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const data = await r.json();
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

module.exports = async (req, res) => {
  try {
    if (!BASE || !TOKEN) {
      return res.status(500).json({ error: '환경변수가 설정되지 않았습니다.' });
    }
    const group = req.query.group === 'preorder' ? 'preorder' : 'immediate';
    const src = SOURCES[group];
    const F = src.fields;

    const records = await fetchAll(src);
    const items = records.map(({ id, fields: f }) => {
      const att = Array.isArray(f[F.image]) && f[F.image][0];
      return {
        id,
        sku: (F.sku && f[F.sku]) || '',
        kname: f[F.kname] || '',
        sname: f[F.sname] || '',
        size: f[F.size] || '',
        cat: f[F.cat] ? [f[F.cat]] : [],
        zone: (F.zone && f[F.zone]) || '',
        desc: (F.desc && f[F.desc]) || '',
        use: (F.use && f[F.use]) || '',
        moq: (F.moq && f[F.moq]) || null, // 최소주문수량 (국내 라인업만)
        // 카드용으로는 원본(수 MB) 대신 large 썸네일(~512px) 우선.
        // 첨부 URL은 수 시간 뒤 만료되지만 캐시(10분)가 더 짧아 항상 유효한 URL이 나감.
        image: (att && ((att.thumbnails && att.thumbnails.large && att.thumbnails.large.url) || att.url)) || null,
        group,
      };
    });

    // 10분 캐시 → 에어테이블 API 한도(초당 5회) 보호 + 빠른 응답
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.status(200).json({ group, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: '카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
