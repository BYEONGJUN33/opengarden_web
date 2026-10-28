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
    assert.equal(u.searchParams.getAll('fields[]').length,10);
    assert.ok(!u.searchParams.getAll('fields[]').includes('price'));calls++;
    return {ok:true,json:async()=>u.searchParams.has('offset')?{records:[{id:'rec00000000000000',fields:{fldxfOsqC0b41oxmt:'Hidden',fldBy0z3isyaVqCmC:'미정'}},{id:'rec00000000000001',fields:{fldxfOsqC0b41oxmt:'Private',fldBy0z3isyaVqCmC:'C2',flda4BMnsROcUcBVF:'비공개'}},{id:'rec00000000000002',fields:{fldxfOsqC0b41oxmt:'Draft',fldBy0z3isyaVqCmC:'C2',flda4BMnsROcUcBVF:'미검토'}}]}:{offset:'next',records:[{id,fields:{fldxfOsqC0b41oxmt:'수국',fldBy0z3isyaVqCmC:'C2',price:12345,fldwpaj4TS0bW9E0x:[{url:'https://v5.airtableusercontent.com/photo'}]}}]}};
  };
  try{
    const data=await getCatalog('immediate');assert.equal(calls,2);assert.equal(data.items.length,1);assert.equal(data.hidden,1);
    const p=publicItem(data.items[0]);assert.match(p.image,/^\/api\/plant-image\?/);assert.equal(p.price,undefined);
    assert.ok(!JSON.stringify(data).includes('Private'));assert.ok(!JSON.stringify(data).includes('Draft'));
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
test('watermark preserves wide/tall images with one translucent inset logo and no opaque band',async()=>{
  for(const [width,height] of [[400,300],[300,800],[1000,250]]){
    const input=await sharp({create:{width,height,channels:3,background:'#1f4d33'}}).png().toBuffer();
    const result=await watermark(input), meta=await sharp(result).metadata();
    assert.equal(meta.format,'webp');assert.equal(meta.width,width);assert.equal(meta.height,height);
    const {data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true});
    const at=(x,y)=>data[(y*info.width+x)*info.channels];
    assert.ok(Math.abs(at(10,height-10)-31)<12,'no opaque bottom strip');
    let changed=0;
    for(let y=Math.floor(height*.6);y<height;y++)for(let x=Math.floor(width*.65);x<width;x++)if(Math.abs(at(x,y)-31)>12)changed++;
    assert.ok(changed>10,'translucent logo changes bottom right pixels');
    assert.ok(Math.abs(at(width-1,height-1)-31)<12,'safe edge margin');
  }
});
test('summary shares a 600-character budget, preserves known values and does not invent plant facts',()=>{
  const {summary}=require('../public/assets/catalog-info');
  const empty=summary({});assert.equal(empty.facts.length,4);assert.ok(empty.facts.every(f=>f.value==='미확인'));
  const long=summary({desc:'꽃🌷'.repeat(600),use:'정원'.repeat(200),zone:'-20℃',tags:['우수상'.repeat(40)]});
  assert.ok(Array.from(long.text).length<=600);assert.equal(long.facts[1].label,'내한성 (등록값)');
  const structured=summary({desc:'개화 시기: 5~6월\nUSDA Zone: Zone 5–8\n추천 식재 시기: 봄\n관리 난이도: 쉬움\n태그: 우수상, 나라장터 등록\n향기로운 꽃'});
  assert.equal(structured.facts[0].value,'5~6월');assert.equal(structured.facts[1].value,'Zone 5–8');assert.equal(structured.description,'향기로운 꽃');assert.equal(structured.tags.length,2);
  const html=renderPlant({id,kname:'수국',sname:'Hydrangea',size:'C2',group:'immediate',page:'/plants/immediate/'+id,images:[],desc:'가'.repeat(2000)});
  assert.ok(!html.includes('가'.repeat(601)));assert.ok(html.includes('미확인'));
});
test('every inline JavaScript block parses after build',()=>{
  for(const file of fs.readdirSync('dist').filter(f=>f.endsWith('.html'))){
    for(const m of fs.readFileSync('dist/'+file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
      if(/application\/ld\+json/.test(m[1])){JSON.parse(m[2]);continue;}
      if(!/src=/.test(m[1]))new vm.Script(m[2],{filename:file});
    }
  }
});
