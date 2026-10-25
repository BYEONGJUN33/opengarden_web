// 솔라피에서 SOLAPI_PFID(카카오 채널 ID)와 SOLAPI_TEMPLATE_ID(알림톡 템플릿 ID)를 찾아줍니다.
// 콘솔에서 못 찾을 때 쓰세요. 조회만 하고 아무것도 보내지 않습니다.
//
//   node tools/solapi-ids.js <API_KEY> <API_SECRET>
//   (또는 SOLAPI_API_KEY·SOLAPI_API_SECRET 환경변수)
//
// 값은 솔라피 콘솔 → 개발/연동 → API Key 관리에서 발급합니다.

const crypto = require('crypto');

const KEY = (process.argv[2] || process.env.SOLAPI_API_KEY || '').trim();
const SECRET = (process.argv[3] || process.env.SOLAPI_API_SECRET || '').trim();
if (!KEY || !SECRET) {
  console.error('사용법: node tools/solapi-ids.js <API_KEY> <API_SECRET>');
  process.exit(1);
}

// api/quote.js와 같은 인증 방식
function auth() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(20).toString('hex');
  const signature = crypto.createHmac('sha256', SECRET).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 채널·템플릿 목록 경로는 버전에 따라 달라, 되는 것을 찾을 때까지 차례로 시도합니다
const CHANNELS = ['/kakao/v2/channels', '/kakao/v1/plus-friends', '/kakao/v2/plus-friends'];
const TEMPLATES = ['/kakao/v2/templates', '/kakao/v1/templates'];

async function get(path) {
  const r = await fetch('https://api.solapi.com' + path, { headers: { Authorization: auth() } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

// 응답 구조가 제각각이라, 원하는 키를 가진 객체를 통째로 훑어 찾습니다
function collect(node, keys, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return out;
  if (Array.isArray(node)) { node.forEach((n) => collect(n, keys, out, depth + 1)); return out; }
  if (keys.some((k) => typeof node[k] === 'string')) out.push(node);
  Object.values(node).forEach((v) => collect(v, keys, out, depth + 1));
  return out;
}

(async () => {
  for (const [label, paths, idKeys, nameKeys] of [
    ['SOLAPI_PFID       (카카오 채널)', CHANNELS, ['pfId', 'channelId'], ['searchId', 'name', 'plusFriendId']],
    ['SOLAPI_TEMPLATE_ID (알림톡 템플릿)', TEMPLATES, ['templateId'], ['name', 'status']],
  ]) {
    console.log('\n━━ ' + label + ' ━━');
    let done = false;
    for (const p of paths) {
      let r;
      try { r = await get(p); } catch (e) { console.log(`  ${p} → 요청 실패: ${e.message}`); continue; }
      if (!r.ok) { console.log(`  ${p} → ${r.status}`); continue; }
      const found = collect(r.body, idKeys);
      if (!found.length) { console.log(`  ${p} → 200이지만 항목 없음`); continue; }
      found.forEach((f) => {
        const id = idKeys.map((k) => f[k]).find(Boolean);
        const name = nameKeys.map((k) => f[k]).filter(Boolean).join(' · ');
        console.log(`  ${id}${name ? '   ← ' + name : ''}`);
      });
      done = true;
      break;
    }
    if (!done) console.log('  찾지 못했습니다. API Key 권한을 확인하거나 콘솔에서 직접 확인하세요.');
  }
  console.log('\n템플릿이 여러 개면 상태가 승인(APPROVED)인 것을 쓰세요.\n');
})();
