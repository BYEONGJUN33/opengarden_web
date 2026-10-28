(function(root){
  const normalize = v => String(v ?? '').normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\-_'’"“”·.,/]+/g,'');
  function searchText(p){return normalize([p.kname,p.sname,p.cat,...(p.variants||[p]).flatMap(v=>[v.id,v.sku,v.size,v.plantCode])].flat().join(' '));}
  function matches(text,query){return String(query).trim().split(/\s+/).filter(Boolean).every(q=>text.includes(normalize(q)));}
  function encodeSelection(plants,cart,origin){
    const entries=Object.entries(cart).filter(([,qty])=>Number(qty)>0);
    if(!entries.length||entries.length>20)throw new Error('한 번에 1~20개 품목을 선택해주세요.');
    const items=entries.map(([id,qty])=>{
      const p=plants.find(p=>p.id===id);
      if(!p || !p.recordId)throw new Error('실제 카탈로그 품목을 선택해주세요.');
      const image=p.image ? new URL(p.image,origin) : null;
      return {kname:String(p.kname||'').slice(0,100),sname:String(p.sname||'').slice(0,160),
        size:String(Array.isArray(p.size)?p.size.join(', '):p.size||'').slice(0,40),
        qty:Math.min(999999,Math.max(1,Math.floor(Number(qty)||1))),plantCode:String(p.plantCode||p.recordId),
        image:image && image.origin===origin && image.pathname==='/api/plant-image' ? image.href : ''};
    });
    const bytes=new TextEncoder().encode(JSON.stringify({version:1,items}));
    const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    if(encoded.length>7000)throw new Error('선택 목록이 너무 깁니다. 품목을 나눠서 보내주세요.');
    return encoded;
  }
  const api={normalize,searchText,matches,encodeSelection};
  if(typeof module==='object')module.exports=api;else root.CatalogTools=api;
})(typeof window==='object'?window:globalThis);
