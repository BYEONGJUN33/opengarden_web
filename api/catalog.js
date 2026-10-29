const { getCatalog, publicItem, GROUPS } = require('../lib/catalog-data');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const group = typeof req.query.group === 'string' ? req.query.group : 'immediate';
    if (!GROUPS.includes(group)) return res.status(400).json({ error: 'Invalid catalog group' });
    const data = await getCatalog(group);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ ...data, items: data.items.map(publicItem) });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: '카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
