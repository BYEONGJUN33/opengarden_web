// GET/POST /api/stock — 현장 재고조정 앱(public/stock.html) 전용 백엔드.
// 원래 Hostinger 시절엔 Google Apps Script가 구글시트에 기록했으나,
// 이제 같은 프론트엔드가 이 서버리스 함수를 통해 Airtable(재고/작업자 테이블)에 직접 읽고 씁니다.
// 이력(누가 언제 얼마나 조정했는지)은 남기지 않음 — 현재고 값을 그 자리에서 덮어씁니다.

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const STOCK_TABLE = process.env.AIRTABLE_STOCK_TABLE || '재고';
const WORKER_TABLE = process.env.AIRTABLE_WORKER_TABLE || '작업자';

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
  return { farm: zoneId.slice(0, idx), zone: zoneId.slice(idx + 2) };
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

async function fetchAllStock() {
  let records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(STOCK_TABLE)}`);
    url.searchParams.set('pageSize', '100');
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
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(WORKER_TABLE)}`);
  url.searchParams.set('filterByFormula', `{코드}="${esc(pin)}"`);
  url.searchParams.set('pageSize', '1');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable ${r.status}`);
  const data = await r.json();
  const rec = data.records[0];
  if (!rec || rec.fields['활성'] !== 'Y') return null;
  return { id: rec.id, name: rec.fields['이름'] || '' };
}

async function handleAll(req, res) {
  const records = await fetchAllStock();

  const farmSet = new Set();
  const zoneHasItems = new Set(); // "농장||구역"
  const items = [];

  for (const r of records) {
    const f = r.fields;
    const farm = f['농장'] || '';
    const zone = f['구역'] || '';
    if (!farm) continue;
    farmSet.add(farm);
    if (zone) zoneHasItems.add(`${farm}||${zone}`);
    items.push({
      zone_id: makeZoneId(farm, zone),
      plant: f['품목명'] || '',
      size: f['규격'] || '',
      expected: typeof f['현재고'] === 'number' ? f['현재고'] : 0,
    });
  }

  const farms = [...farmSet].sort().map((name) => ({
    id: name,
    name,
    use_zones: [...zoneHasItems].some((z) => z.startsWith(`${name}||`)) ? 'Y' : 'N',
  }));

  const zones = [...zoneHasItems].map((key) => {
    const [farm, zone] = key.split('||');
    return { id: makeZoneId(farm, zone), farm_id: farm, name: zone };
  });

  res.status(200).json({ farms, zones, items });
}

async function handleAddItem(body, res) {
  const { zone_id, plant, size, expected } = body;
  if (!plant) return res.status(400).json({ error: '품목명이 없습니다.' });
  const { farm, zone } = parseZoneId(zone_id);
  const label = `${plant}${size ? ' ' + size : ''} · ${farm}`;

  await atFetch(encodeURIComponent(STOCK_TABLE), {
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
          },
        },
      ],
    }),
  });
  res.status(200).json({ ok: true });
}

async function findStockRecord(farm, zone, plant, size) {
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(STOCK_TABLE)}`);
  url.searchParams.set('filterByFormula', `{농장}="${esc(farm)}"`);
  url.searchParams.set('pageSize', '100');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable ${r.status}`);
  const data = await r.json();
  return data.records.find(
    (rec) =>
      (rec.fields['구역'] || '') === (zone || '') &&
      rec.fields['품목명'] === plant &&
      (rec.fields['규격'] || '') === (size || '')
  );
}

async function handleUpdateItem(body, res) {
  const { zone_id, old_plant, old_size, new_plant, new_size } = body;
  if (!new_plant) return res.status(400).json({ error: '품목명이 없습니다.' });
  const { farm, zone } = parseZoneId(zone_id);

  const rec = await findStockRecord(farm, zone, old_plant, old_size);
  if (!rec) return res.status(404).json({ error: '품목을 찾을 수 없습니다.' });

  const label = `${new_plant}${new_size ? ' ' + new_size : ''} · ${farm}`;
  await atFetch(encodeURIComponent(STOCK_TABLE), {
    method: 'PATCH',
    body: JSON.stringify({
      typecast: true,
      records: [
        {
          id: rec.id,
          fields: {
            품목표시: label,
            품목명: String(new_plant).slice(0, 200),
            규격: String(new_size || '').slice(0, 50),
          },
        },
      ],
    }),
  });
  res.status(200).json({ ok: true });
}

async function handleSubmit(body, res) {
  const { zone_id, worker_name, adjustments } = body;
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    return res.status(400).json({ error: '조정 내역이 없습니다.' });
  }
  const { farm, zone } = parseZoneId(zone_id);
  const who = String(worker_name || '').slice(0, 50);

  // 이 농장의 재고 레코드를 한 번에 불러와 품목별로 매칭 (조회 왕복 최소화)
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(STOCK_TABLE)}`);
  url.searchParams.set('filterByFormula', `{농장}="${esc(farm)}"`);
  url.searchParams.set('pageSize', '100');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable ${r.status}`);
  const data = await r.json();

  const toPatch = [];
  for (const adj of adjustments.slice(0, 100)) {
    const rec = data.records.find(
      (rc) =>
        (rc.fields['구역'] || '') === (zone || '') &&
        rc.fields['품목명'] === adj.plant &&
        (rc.fields['규격'] || '') === (adj.size || '')
    );
    if (!rec) continue;
    toPatch.push({
      id: rec.id,
      fields: {
        현재고: Math.max(0, parseInt(adj.final, 10) || 0),
        최종작업자: who,
      },
    });
  }

  // Airtable PATCH는 한 번에 최대 10건
  for (let i = 0; i < toPatch.length; i += 10) {
    await atFetch(encodeURIComponent(STOCK_TABLE), {
      method: 'PATCH',
      body: JSON.stringify({ records: toPatch.slice(i, i + 10) }),
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
        const pin = String(req.query.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return res.status(200).json({ error: 'invalid pin' });
        const worker = await findWorker(pin);
        if (!worker) return res.status(200).json({ error: 'invalid pin' });
        return res.status(200).json(worker);
      }
      if (action === 'all') return await handleAll(req, res);
      return res.status(400).json({ error: '알 수 없는 action' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'addItem') return await handleAddItem(body, res);
      if (body.action === 'updateItem') return await handleUpdateItem(body, res);
      return await handleSubmit(body, res);
    }

    res.status(405).json({ error: 'GET 또는 POST만 허용됩니다.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
};
