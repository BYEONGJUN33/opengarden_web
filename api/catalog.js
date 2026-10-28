const { getCatalog, publicItem } = require('../lib/catalog-data');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const data = await getCatalog(req.query.group === 'preorder' ? 'preorder' : 'immediate');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({ ...data, items: data.items.map(publicItem) });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: '카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
