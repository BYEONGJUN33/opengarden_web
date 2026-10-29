const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.AIRTABLE_BASE_ID='test-base';
process.env.AIRTABLE_TOKEN='test-token';
const {getCatalog,publicItem,GROUPS} = require('../lib/catalog-data');
const HG = {id:'rec12345678901234',fields:{
  fld3XAFUiRqL9I5xM:"조팝 '핑크 스파클러'",
  fldHpENoNezkg0YrO:"Spiraea 'Pink Sparkler'",
  fldqrGhf56NzhOusv:'P9',
  fldFMn3AIHfab5jFR:'조팝나무',
  fldDj5Udu4O5dk5Cq:[{url:'https://v5.airtableusercontent.com/photo'}],
  flddWryT0w8bnvmis:42000
}};
const HBM = {id:'rec12345678901235',fields:{
  fldkflZdfkITtotyr:"튤립 '골든 퍼레이드'",
  fldyr29odRIrUr5Vn:"Tulipa 'Golden Parade'",
  fld5QxbbKSmNgm8i3:'11/12',
  flddsP902hzblFS47:'공급확정(260713 HBM 회신)',
  fldERso87TPrDm9F1:'네덜란드산 튤립 구근',
  fldsaDxAp4funWTCf:99999
}};
test('Hoogenraad/HBM adapters publish only eligible rows and hide all financial fields',async()=>{
  const original=global.fetch;
  const formulas=[];
  global.fetch=async request=>{
    const u=new URL(request);
    assert.equal(u.hostname,'api.airtable.com');
    assert.ok(!u.searchParams.getAll('fields[]').some(id=>['fldsaDxAp4funWTCf','flddWryT0w8bnvmis'].includes(id)));
    formulas.push(u.searchParams.get('filterByFormula'));
    if(u.pathname.endsWith('tblVVRTKfyViCI1aW'))return {ok:true,json:async()=>({records:[
      HG,
      {id:'rec12345678901236',fields:{...HG.fields,fldkXhOo3KTpUhuZ6:true}},
      {id:'rec12345678901237',fields:{...HG.fields,fldci5Va4ESSmWZ2E:'비공개'}}
    ]})};
    if(u.pathname.endsWith('tblm8bjSeDCflcIzk'))return {ok:true,json:async()=>({records:[
      HBM,{id:'rec12345678901238',fields:{...HBM.fields,flddsP902hzblFS47:'다른 공급처'}}
    ]})};
    throw Error('unexpected request');
  };
  try{
    assert.ok(GROUPS.includes('hoogenraad') && GROUPS.includes('hbm'));
    const [hg,hbm]=await Promise.all([getCatalog('hoogenraad'),getCatalog('hbm')]);
    assert.equal(hg.items.length,1);
    assert.equal(hbm.items.length,1);
    assert.equal(hg.items[0].source,'호게나르드');
    assert.equal(hbm.items[0].source,'HBM');
    assert.equal(hbm.items[0].size,'11/12');
    assert.match(formulas[0]+formulas[1],/노출제외/);
    assert.match(formulas[0]+formulas[1],/HBM/);
    const serialized=JSON.stringify([publicItem(hg.items[0]),publicItem(hbm.items[0])]);
    assert.ok(!serialized.includes('42000')&&!serialized.includes('99999'));
    assert.ok(!serialized.includes('airtableusercontent.com'));
    assert.match(serialized,/\/api\/plant-image\?group=hoogenraad/);
  }finally{global.fetch=original;}
});

test('single-record thumbnail lookup avoids full table scans and blocks private items',async()=>{
  const {getRecordImage}=require('../lib/catalog-data');
  const original=global.fetch, seen=[];
  global.fetch=async (raw)=>{
    const url=new URL(raw);seen.push(url.pathname);
    assert.equal(url.pathname.split('/').pop().startsWith('rec'),true);
    const hidden=url.pathname.endsWith('rec99999999999999');
    return {ok:true,json:async()=>({fields:{
      fld3XAFUiRqL9I5xM:'조팝',
      fldHpENoNezkg0YrO:'Spiraea',
      fldqrGhf56NzhOusv:'P9',
      fldci5Va4ESSmWZ2E:hidden?'비공개':'공개',
      fldDj5Udu4O5dk5Cq:[{url:'https://v5.airtableusercontent.com/example'}]
    }})};
  };
  try{
    const a=await getRecordImage('hoogenraad','rec12345678901234',0);
    const b=await getRecordImage('hoogenraad','rec12345678901234',0);
    assert.equal(a,'https://v5.airtableusercontent.com/example');
    assert.equal(b,a);
    assert.equal(seen.length,1,'warm cache prevents duplicate Airtable reads');
    assert.equal(await getRecordImage('hoogenraad','rec99999999999999',0),null);
    assert.equal(await getRecordImage('hoogenraad','bad-id',0),null);
    assert.equal(seen.length,2);
  }finally{global.fetch=original;}
});
