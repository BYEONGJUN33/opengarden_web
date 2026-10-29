const { getCatalog, publicItem, GROUPS } = require('../lib/catalog-data');
const { renderPlant } = require('../lib/plant-page');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const { group, id } = req.query;
  if (!GROUPS.includes(group) || typeof id !== 'string' || !/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(404).end('Not found');
  try {
    const data = await getCatalog(group), item = data.items.find(p => p.id === id);
    if (!item) return res.status(404).end('품종을 찾을 수 없습니다.');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=1200');
    if (process.env.VERCEL_ENV === 'preview') res.setHeader('X-Robots-Tag','noindex');
    return res.status(200).end(renderPlant(publicItem(item)));
  } catch {
    res.setHeader('Cache-Control','no-store');
    return res.status(503).end('카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
};
