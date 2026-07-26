// GET/POST /api/stock — 현장 재고조정 앱(public/stock.html) 전용 백엔드.
// 원래 Hostinger 시절엔 Google Apps Script가 구글시트에 기록했으나,
// 이제 같은 프론트엔드가 이 서버리스 함수를 통해 Airtable(재고/작업자 테이블)에 직접 읽고 씁니다.
// 이력(누가 언제 얼마나 조정했는지)은 남기지 않음 — 현재고 값을 그 자리에서 덮어씁니다.
//
// 설계상 중요한 두 가지:
//  1) 품목은 이름이 아니라 Airtable 레코드 ID로 지목합니다.
//     같은 품목명·규격이 두 줄 있어도(실제로 있음) 각각 정확히 수정됩니다.
//  2) 조정은 최종값이 아니라 증감(delta)으로 받아, 서버가 읽은 "현재값 + delta"를 씁니다.
//     두 사람이 같은 농장을 동시에 조사해도 서로의 조정을 지우지 않습니다.

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const STOCK_TABLE = process.env.AIRTABLE_STOCK_TABLE || '재고';
const WORKER_TABLE = process.env.AIRTABLE_WORKER_TABLE || '작업자';

// 농장 목록. 재고가 아직 한 건도 없는 농장(예: 4농장)도 선택 화면에 떠야
// 그 농장에 첫 품목을 추가할 수 있으므로, 재고에서 뽑은 목록과 이 기본값을 합칩니다.
// 농장이 늘면 Vercel 환경변수 STOCK_FARMS(쉼표 구분)만 고치면 됩니다.
const DEFAULT_FARMS = (process.env.STOCK_FARMS || '1농장,2농장,3농장,4농장')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const NO_ZONE = '구역 미지정';

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// 구역을 안 쓰는 농장은 zone_id가 곧 농장명, 구역을 쓰면 "농장명||구역명"
function makeZoneId(farm, zone) {
  return zone ? `${farm}||${zone}` : farm;
}
function parseZoneId(zoneId) {
  const idx = String(zoneId || '').indexOf('||');
  if (idx === -1) return { farm: zoneId || '', zone: '' };
  const zone = zoneId.slice(idx + 2);
  return { farm: zoneId.slice(0, idx), zone: zone === NO_ZONE ? '' : zone };
}

async function atFetch(path, opts = {}) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
  return r.json();
}

// filterByFormula(선택)에 맞는 재고 레코드를 100건 단위 페이지 끝까지 모아옵니다.
// 페이지를 끊으면 뒤쪽 품목이 "못 찾음"으로 조용히 누락되므로 반드시 전체를 훑습니다.
async function fetchStock(formula) {
  let records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(STOCK_TABLE)}`);
    url.searchParams.set('pageSize', '100');
    if (formula) url.searchParams.set('filterByFormula', formula);
    if (offset) url.searchParams.set('offset', offset);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const data = await r.json();
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

async function findWorker(pin) {
  if (!/^\d{4}$/.test(String(pin || '').trim())) return null;
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(WORKER_TABLE)}`);
  url.searchParams.set('filterByFormula', `{코드}="${esc(String(pin).trim())}"`);
  url.searchParams.set('pageSize', '1');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable ${r.status}`);
  const data = await r.json();
  const rec = data.records[0];
  if (!rec || rec.fields['활성'] !== 'Y') return null;
  return { id: rec.id, name: rec.fields['이름'] || '' };
}

async function handleAll(req, res) {
  const records = await fetchStock();

  const farmSet = new Set();
  const zoneSet = new Set(); // "농장||구역" (구역 없는 항목은 "농장||구역 미지정")
  const unzoned = new Set(); // 구역이 비어 있는 항목이 있는 농장
  const items = [];

  for (const r of records) {
    const f = r.fields;
    // 농장은 singleSelect — API 응답이 문자열 또는 {name} 형태 둘 다 올 수 있어 양쪽 처리
    const farmRaw = f['농장'];
    const farm = typeof farmRaw === 'object' && farmRaw ? farmRaw.name : farmRaw || '';
    const zone = f['구역'] || '';
    if (!farm) continue;
    farmSet.add(farm);
    if (zone) zoneSet.add(`${farm}||${zone}`);
    else unzoned.add(farm);
    items.push({
      id: r.id, // 품목 지목은 이름이 아니라 이 레코드 ID로 (중복 품목도 정확히 구분)
      zone_id: makeZoneId(farm, zone),
      plant: f['품목명'] || '',
      size: f['규격'] || '',
      expected: typeof f['현재고'] === 'number' ? f['현재고'] : 0,
    });
  }

  DEFAULT_FARMS.forEach((f) => farmSet.add(f));

  const farms = [...farmSet].sort().map((name) => ({
    id: name,
    name,
    use_zones: [...zoneSet].some((z) => z.startsWith(`${name}||`)) ? 'Y' : 'N',
  }));

  const zones = [...zoneSet].map((key) => {
    const [farm, zone] = key.split('||');
    return { id: makeZoneId(farm, zone), farm_id: farm, name: zone };
  });

  // 구역을 쓰는 농장에 구역이 빈 품목이 섞여 있으면 그 품목들은 어느 구역에서도
  // 보이지 않게 됩니다. "구역 미지정" 칸을 만들어 접근 가능하게 둡니다.
  for (const farm of unzoned) {
    if (farms.find((f) => f.name === farm && f.use_zones === 'Y')) {
      zones.push({ id: makeZoneId(farm, NO_ZONE), farm_id: farm, name: NO_ZONE });
      // 이 농장의 구역 없는 품목들의 zone_id도 같은 값으로 맞춰줍니다.
      items.forEach((it) => {
        if (it.zone_id === farm) it.zone_id = makeZoneId(farm, NO_ZONE);
      });
    }
  }

  res.status(200).json({ farms, zones, items });
}

async function handleAddItem(body, worker, res) {
  const { zone_id, plant, size, expected } = body;
  if (!plant) return res.status(400).json({ error: '품목명이 없습니다.' });
  const { farm, zone } = parseZoneId(zone_id);
  const label = `${plant}${size ? ' ' + size : ''} · ${farm}`;

  const out = await atFetch(encodeURIComponent(STOCK_TABLE), {
    method: 'POST',
    body: JSON.stringify({
      typecast: true,
      records: [
        {
          fields: {
            품목표시: label,
            농장: farm,
            구역: zone,
            품목명: String(plant).slice(0, 200),
            규격: String(size || '').slice(0, 50),
            현재고: Math.max(0, parseInt(expected, 10) || 0),
            최종작업자: worker.name,
          },
        },
      ],
    }),
  });
  // 프론트가 방금 만든 품목을 바로 조정할 수 있도록 레코드 ID를 돌려줍니다.
  res.status(200).json({ ok: true, id: out.records[0].id });
}

async function handleUpdateItem(body, worker, res) {
  const { id, zone_id, new_plant, new_size } = body;
  if (!id) return res.status(400).json({ error: '품목 ID가 없습니다.' });
  if (!new_plant) return res.status(400).json({ error: '품목명이 없습니다.' });
  const { farm } = parseZoneId(zone_id);
  const label = `${new_plant}${new_size ? ' ' + new_size : ''} · ${farm}`;

  await atFetch(encodeURIComponent(STOCK_TABLE), {
    method: 'PATCH',
    body: JSON.stringify({
      typecast: true,
      records: [
        {
          id,
          fields: {
            품목표시: label,
            품목명: String(new_plant).slice(0, 200),
            규격: String(new_size || '').slice(0, 50),
            최종작업자: worker.name,
          },
        },
      ],
    }),
  });
  res.status(200).json({ ok: true });
}

async function handleSubmit(body, worker, res) {
  const { zone_id, adjustments } = body;
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    return res.status(400).json({ error: '조정 내역이 없습니다.' });
  }
  const { farm } = parseZoneId(zone_id);

  // 이 농장의 재고를 전부(페이지 끝까지) 읽어 레코드 ID로 현재값을 찾습니다.
  const records = await fetchStock(`{농장}="${esc(farm)}"`);
  const byId = new Map(records.map((r) => [r.id, r]));

  const toPatch = [];
  const missing = [];
  for (const adj of adjustments.slice(0, 200)) {
    const rec = byId.get(adj.id);
    if (!rec) {
      missing.push(adj.id);
      continue;
    }
    // 화면에 캐시된 값이 아니라 방금 읽은 현재값에 증감을 적용 →
    // 같은 농장을 동시에 조사하는 다른 사람의 조정을 덮어쓰지 않습니다.
    const current = typeof rec.fields['현재고'] === 'number' ? rec.fields['현재고'] : 0;
    const delta = parseInt(adj.delta, 10) || 0;
    if (delta === 0) continue;
    toPatch.push({
      id: rec.id,
      fields: { 현재고: Math.max(0, current + delta), 최종작업자: worker.name },
    });
  }

  // Airtable PATCH는 한 번에 최대 10건
  for (let i = 0; i < toPatch.length; i += 10) {
    await atFetch(encodeURIComponent(STOCK_TABLE), {
      method: 'PATCH',
      body: JSON.stringify({ records: toPatch.slice(i, i + 10) }),
    });
  }

  // 일부라도 반영되지 않았으면 프론트가 성공으로 표시하지 않도록 알려줍니다.
  if (missing.length) {
    return res.status(409).json({
      error: '일부 품목을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.',
      updated: toPatch.length,
      missing: missing.length,
    });
  }
  res.status(200).json({ ok: true, updated: toPatch.length });
}

module.exports = async (req, res) => {
  try {
    if (!BASE || !TOKEN) {
      return res.status(500).json({ error: '환경변수가 설정되지 않았습니다.' });
    }

    if (req.method === 'GET') {
      const action = req.query.action || '';
      if (action === 'ping') return res.status(200).json({ ok: true });
      if (action === 'worker') {
        const worker = await findWorker(req.query.pin);
        if (!worker) return res.status(200).json({ error: 'invalid pin' });
        return res.status(200).json(worker);
      }
      if (action === 'all') return await handleAll(req, res);
      return res.status(400).json({ error: '알 수 없는 action' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      // 쓰기는 매번 PIN을 다시 확인합니다. 기록에 남는 작업자 이름도
      // 클라이언트가 보낸 값이 아니라 이때 확인된 이름을 씁니다(이름 위조 방지).
      const worker = await findWorker(body.pin);
      if (!worker) return res.status(401).json({ error: '작업자 인증이 필요합니다. 다시 로그인해주세요.' });

      if (body.action === 'addItem') return await handleAddItem(body, worker, res);
      if (body.action === 'updateItem') return await handleUpdateItem(body, worker, res);
      return await handleSubmit(body, worker, res);
    }

    res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
};
