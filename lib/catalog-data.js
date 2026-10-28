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

    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const data = await r.json();
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// 대분류 예외 표 (에어테이블 '속 분류' 테이블).
// 평소엔 비어 있고, 카탈로그에 '기타'가 뜨거나 분류를 바꾸고 싶을 때만 한 줄 추가합니다.
// 여기 적힌 값이 프론트의 기본 매핑보다 우선합니다.
// 테이블이 없거나 조회에 실패해도 카탈로그는 정상 동작해야 하므로 조용히 {}를 돌려줍니다.
const GROUP_TABLE = process.env.AIRTABLE_GROUP_TABLE || 'tbl7iGQoFTeGUTXyd';
async function fetchGroupOverrides() {
  try {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${GROUP_TABLE}`);
    url.searchParams.set('pageSize', '100');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return {};
    const { records = [] } = await r.json();
    const map = {};
    for (const rec of records) {
      const f = rec.fields || {};
      const key = String(f['속'] || '').trim();
      const val = f['대분류'];
      const name = typeof val === 'object' && val ? val.name : val;
      if (key && name) map[key] = String(name);
    }
    return map;
  } catch (e) {
    return {};
  }
}

async function loadCatalog(group) {
    if (!BASE || !TOKEN) {
      throw new Error('Catalog unavailable');
    }
    const src = SOURCES[group];
    const F = src.fields;

    const [records, overrides] = await Promise.all([fetchAll(src), fetchGroupOverrides()]);
    // 규격이 미확정인 품목은 카탈로그에서 감춥니다.
    // 에어테이블에서 규격을 채우면 별도 배포 없이 자동으로 다시 노출됩니다.
    const BAD_SIZE = ['확인필요', '??', '확인중', '미정'];
    const cleanSize = (v) => {
      if (Array.isArray(v)) return v.filter((s) => s && !BAD_SIZE.includes(String(s).trim()));
      const s = String(v || '').trim();
      return !s || BAD_SIZE.includes(s) ? '' : s;
    };
    const hasSize = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

    // 첨부는 여러 장 등록될 수 있습니다(국내 라인업의 약 절반이 2~4장).
    // 카드용으로는 원본(수 MB) 대신 large 썸네일(~512px)을 우선 씁니다.
    const pickUrl = (a) =>
      (a && ((a.thumbnails && a.thumbnails.large && a.thumbnails.large.url) || a.url)) || null;

    const items = records.map(({ id, fields: f }) => {
      const atts = Array.isArray(f[F.image]) ? f[F.image] : [];
      const images = atts.map(pickUrl).filter(Boolean);
      return {
        id,
        sku: (F.sku && f[F.sku]) || '',
        kname: f[F.kname] || '',
        sname: f[F.sname] || '',
        size: cleanSize(f[F.size]),
        cat: f[F.cat] ? [f[F.cat]] : [],
        zone: (F.zone && f[F.zone]) || '',
        desc: (F.desc && f[F.desc]) || '',
        use: (F.use && f[F.use]) || '',
        moq: (F.moq && f[F.moq]) || null, // 최소주문수량 (국내 라인업만)
        // 첨부 URL은 수 시간 뒤 만료되지만 캐시(10분)가 더 짧아 항상 유효한 URL이 나감.
        image: images[0] || null, // 대표 사진 — 기존 소비자 호환용으로 계속 내보냄
        images,                   // 전체 사진 (상세 모달 갤러리용)
        group,
      };
    });

    const shown = items.filter((it) => hasSize(it.size));

    // 10분 캐시 → 에어테이블 API 한도(초당 5회) 보호 + 빠른 응답

    return {
      group,
      count: shown.length,
      items: shown,
      hidden: items.length - shown.length, // 규격 미확정으로 감춘 건수
      groupOverrides: overrides,
    };
}

const cache = new Map();
async function getCatalog(group) {
  if (!['immediate', 'preorder'].includes(group)) throw new Error('Invalid group');
  const hit = cache.get(group);
  if (hit && hit.until > Date.now()) return hit.promise;
  const entry = { until: Date.now() + 60000, promise: null };
  entry.promise = loadCatalog(group).catch(error => { if (cache.get(group) === entry) cache.delete(group); throw error; });
  cache.set(group, entry);
  return entry.promise;
}
const imagePath = (group, id, index = 0) => `/api/plant-image?group=${group}&id=${encodeURIComponent(id)}&index=${index}`;
function publicItem(item) {
  const images = item.images.map((_, i) => imagePath(item.group, item.id, i));
  return { ...item, image: images[0] || null, images, page: `/plants/${item.group}/${item.id}` };
}
module.exports = { getCatalog, publicItem, imagePath };
