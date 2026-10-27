const sharp = require('sharp');
const path = require('node:path');
const { getCatalog } = require('../lib/catalog-data');
const LIMIT = 10 * 1024 * 1024;
function allowedImage(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (u.hostname.endsWith('.airtableusercontent.com') || u.hostname === 'dl.airtable.com');
  } catch { return false; }
}
async function readImage(response) {
  if (!response.ok || !/^image\/(jpeg|png|webp|avif|gif)(;|$)/i.test(response.headers.get('content-type') || '') ||
      Number(response.headers.get('content-length')) > LIMIT) throw new Error('Invalid image');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > LIMIT) throw new Error('Image too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function watermark(input) {
  const photo = await sharp(input, { limitInputPixels: 40000000 }).rotate()
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .removeAlpha().jpeg().toBuffer({ resolveWithObject: true });
  const { width, height } = photo.info;
  const stripHeight = Math.min(height, Math.max(24, Math.round(height * .12)));
  const strip = Buffer.from(`<svg width="${width}" height="${stripHeight}"><rect width="100%" height="100%" fill="white" fill-opacity=".82"/></svg>`);
  const logo = await sharp(path.join(__dirname, '../public/assets/logo.png'))
    .resize({ width: Math.max(1, Math.round(width * .28)), height: Math.max(1, stripHeight - 8), fit: 'inside' }).png().toBuffer();
  return sharp(photo.data).composite([
    { input: strip, gravity: 'south' }, { input: logo, gravity: 'southeast' }
  ]).webp({ quality: 82 }).toBuffer();
}
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const { group, id } = req.query, index = String(req.query.index ?? '0');
  if (!['immediate', 'preorder'].includes(group) || typeof id !== 'string' || !/^rec[A-Za-z0-9]{14}$/.test(id) || !/^\d{1,2}$/.test(index)) return res.status(400).end();
  try {
    const data = await getCatalog(group);
    const url = data.items.find(p => p.id === id)?.images[Number(index)];
    if (!url) return res.status(404).end();
    if (!allowedImage(url)) throw new Error('Untrusted attachment');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const output = await watermark(await readImage(response));
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    return res.status(200).end(output);
  } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).end(); }
};
module.exports.allowedImage = allowedImage;
module.exports.watermark = watermark;
module.exports.readImage = readImage;
