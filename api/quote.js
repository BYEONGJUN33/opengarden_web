// POST /api/quote
// body: { name, phone, memo, items: [{ sku, kname, size, qty }], website }
// 구조(2026-07-19 확정): 고객은 품목+연락처만 접수하면 끝, 연락은 오픈가든이 먼저 한다.
// phone(연락처)은 필수 — 이게 없으면 응대 자체가 불가능하므로 서버에서도 검증.
// website 필드는 honeypot(봇 트랩) — 사람에게는 보이지 않는 입력칸.
// 값이 차 있으면 봇이므로 조용히 성공 응답만 하고 기록하지 않습니다.

const BASE = process.env.AIRTABLE_BASE_ID;
const QTABLE = process.env.AIRTABLE_QUOTE_TABLE || '견적요청';
const TOKEN = process.env.AIRTABLE_TOKEN;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }
  try {
    if (!BASE || !TOKEN) {
      return res.status(500).json({ error: '환경변수가 설정되지 않았습니다.' });
    }
    const { name = '', phone = '', memo = '', items = [], website = '' } = req.body || {};

    if (website) return res.status(200).json({ ok: true }); // 봇 무시
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '담긴 품목이 없습니다.' });
    }
    const cleanPhone = String(phone).replace(/[^\d\-+() ]/g, '').slice(0, 30);
    if (cleanPhone.replace(/\D/g, '').length < 9) {
      return res.status(400).json({ error: '연락처를 확인해주세요.' });
    }

    // 입력값 정리 (길이 제한 + 수량 범위 강제)
    const clean = items.slice(0, 100).map((i) => ({
      sku: String(i.sku || '').slice(0, 50),
      kname: String(i.kname || '').slice(0, 100),
      size: String(i.size || '').slice(0, 30),
      qty: Math.max(1, Math.min(100000, parseInt(i.qty, 10) || 1)),
    }));

    // 요청번호: Q-YYYYMMDD-XXX
    const no =
      'Q-' +
      new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      '-' +
      Math.random().toString(36).slice(2, 5).toUpperCase();

    const summary = clean
      .map((i, n) => `${n + 1}. ${i.kname} · ${i.size} · ${i.qty}개`)
      .join('\n');

    const r = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(QTABLE)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                요청번호: no,
                요청자: String(name).slice(0, 100),
                연락처: cleanPhone,
                요청사항: String(memo).slice(0, 1000),
                품목요약: summary,
                품목JSON: JSON.stringify(clean),
                상태: '신규',
                접수일시: new Date().toISOString(), // 접수 시각 (에어테이블이 KST로 표시)
              },
            },
          ],
        }),
      }
    );
    if (!r.ok) throw new Error(`Airtable ${r.status}`);

    res.status(200).json({ ok: true, requestNo: no });
  } catch (e) {
    res.status(500).json({
      error: '접수에 실패했습니다. 카카오톡 채널로 직접 문의해주세요.',
    });
  }
};
