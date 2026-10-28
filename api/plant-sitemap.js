const { getCatalog, publicItem } = require('../lib/catalog-data');
const { ORIGIN, esc } = require('../lib/plant-page');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const groups = await Promise.all(['immediate','preorder'].map(getCatalog));
    const urls = groups.flatMap(g => g.items).map(publicItem).map(p => `<url><loc>${esc(ORIGIN+p.page)}</loc></url>`).join('');
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=1200');
    return res.status(200).end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  } catch { res.setHeader('Cache-Control','no-store'); return res.status(503).end('Catalog unavailable'); }
};
