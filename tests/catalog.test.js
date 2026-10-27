const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sharp = require('sharp');
process.env.AIRTABLE_BASE_ID = 'test-base'; process.env.AIRTABLE_TOKEN = 'test-token';
const tools = require('../public/assets/catalog-tools');
const { getCatalog, publicItem } = require('../lib/catalog-data');
const { renderPlant } = require('../lib/plant-page');
const { watermark, allowedImage, readImage } = require('../api/plant-image');
const id = 'rec12345678901234';
test('search normalizes Korean spacing, Latin case, size and SKU with AND tokens', () => {
  const text=tools.searchText({kname:'수국 라임라이트',sname:'Hydrangea Limelight',variants:[{id:'OG-P-001',size:'C 2'}]});
  for(const q of ['수국라임','HYDRANGEA c2','ogp001','라임라이트'])assert.ok(tools.matches(text,q));
  assert.equal(tools.matches(text,'수국 C5'),false);
});
test('selection roundtrips UTF-8, strips private fields and enforces limits', () => {
  const plants=[{id:'one',recordId:id,kname:'수국',size:'C2',image:'/api/plant-image?group=immediate&id='+id,price:999,phone:'private'}];
  const encoded=tools.encodeSelection(plants,{one:2},'https://open-garden.co.kr');
  const data=JSON.parse(Buffer.from(encoded,'base64url').toString());
  assert.equal(data.items[0].kname,'수국');assert.equal(data.items[0].qty,2);
  assert.ok(!encoded.includes('='));assert.equal(data.items[0].price,undefined);assert.equal(data.items[0].phone,undefined);
  assert.throws(()=>tools.encodeSelection(plants,{},'https://open-garden.co.kr'));
  assert.throws(()=>tools.encodeSelection(plants,{sample:1},'https://open-garden.co.kr'));
  assert.throws(()=>tools.encodeSelection(plants,Object.fromEntries(Array.from({length:21},(_,i)=>[i,1])),'https://open-garden.co.kr'));
});
test('catalog whitelists fields, paginates, hides unconfirmed sizes and source URLs',async()=>{
  const old=global.fetch;let calls=0;
  global.fetch=async url=>{
    const u=new URL(url);assert.equal(u.hostname,'api.airtable.com');
    if(u.pathname.endsWith('tbl7iGQoFTeGUTXyd'))return {ok:true,json:async()=>({records:[]})};
    assert.equal(u.searchParams.getAll('fields[]').length,6);
    assert.ok(!u.searchParams.getAll('fields[]').includes('price'));calls++;
    return {ok:true,json:async()=>u.searchParams.has('offset')?{records:[{id:'rec00000000000000',fields:{fldxfOsqC0b41oxmt:'Hidden',fldBy0z3isyaVqCmC:'미정'}}]}:{offset:'next',records:[{id,fields:{fldxfOsqC0b41oxmt:'수국',fldBy0z3isyaVqCmC:'C2',price:12345,fldwpaj4TS0bW9E0x:[{url:'https://v5.airtableusercontent.com/photo'}]}}]}};
  };
  try{
    const data=await getCatalog('immediate');assert.equal(calls,2);assert.equal(data.items.length,1);assert.equal(data.hidden,1);
    const p=publicItem(data.items[0]);assert.match(p.image,/^\/api\/plant-image\?/);assert.equal(p.price,undefined);
    assert.ok(!JSON.stringify(p).includes('airtableusercontent'));await getCatalog('immediate');assert.equal(calls,2);
    const html=renderPlant({...p,kname:'</script><img onerror="x">'});
    assert.ok(html.includes('&lt;/script&gt;'));assert.ok(!html.includes('</script><img'));
    const ld=JSON.parse(html.match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(ld['@type'],'Product');assert.equal(ld.offers,undefined);
    assert.ok(html.includes('rel="canonical"'));assert.ok(html.includes('/plants/immediate/'+id));
  }finally{global.fetch=old;}
});
test('image fetch rejects arbitrary origins, credentials and oversized input',async()=>{
  for(const url of ['http://v5.airtableusercontent.com/x','https://evil.com/x','https://v5.airtableusercontent.com.evil.com/x','https://user:pass@v5.airtableusercontent.com/x'])assert.equal(allowedImage(url),false);
  assert.equal(allowedImage('https://v5.airtableusercontent.com/x'),true);
  await assert.rejects(()=>readImage(new Response('bad',{headers:{'content-type':'text/html'}})));
  await assert.rejects(()=>readImage(new Response('bad',{headers:{'content-type':'image/jpeg','content-length':'11000000'}})));
});
test('watermark produces a bounded WebP with visible changed pixels',async()=>{
  const input=await sharp({create:{width:400,height:300,channels:3,background:'#1f4d33'}}).png().toBuffer();
  const result=await watermark(input), meta=await sharp(result).metadata();
  assert.equal(meta.format,'webp');assert.equal(meta.width,400);assert.equal(meta.height,300);
  const {data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true});
  assert.ok(data[(290*info.width+10)*info.channels]>150,'watermark band is burned into pixels');
});
test('every inline JavaScript block parses after build',()=>{
  for(const file of fs.readdirSync('dist').filter(f=>f.endsWith('.html'))){
    for(const m of fs.readFileSync('dist/'+file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
      if(/application\/ld\+json/.test(m[1])){JSON.parse(m[2]);continue;}
      if(!/src=/.test(m[1]))new vm.Script(m[2],{filename:file});
    }
  }
});
