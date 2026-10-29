(function(root){
  const normalize = v => String(v ?? '').normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\-_'’"“”·.,/]+/g,'');
  // Cross-supplier grouping is cultivar-specific: never merge plants by genus or flower color.
  // A scientific cultivar epithet is stronger evidence than localized Korean display names.
  function cultivarKey(p){
    const latin=String(p.sname||'').normalize('NFKC').replace(/[‘’“”]/g,"'").trim();
    const genus=(latin.match(/^([a-z]+)/i)||[])[1]?.toLowerCase()||'';
    const quoted=latin.match(/'([^']{2,100})'/);
    if(genus&&quoted){
      let cultivar=quoted[1];
      // 'Living Cotton Cream' and Living 'Cotton Cream' are the same series naming.
      if(genus==='hydrangea' && /\bLiving\b/i.test(latin))cultivar=cultivar.replace(/^Living\s+/i,'');
      return 'cv:'+genus+':'+normalize(cultivar);
    }
    const binomial=latin.match(/^([a-z]+)\s+([a-z][a-z.-]{2,})\b/i);
    if(binomial){
      const species=binomial[2].toLowerCase().replace(/\.$/,'');
      // Abbreviated species names are not sufficient for automatic matching.
      if(species.length>=5)return 'sp:'+binomial[1].toLowerCase()+':'+species+':'+normalize(p.kname||'');
    }
    // Uncertain cultivar identity: keep isolated rather than accidentally merging unrelated stock.
    return 'unverified:'+normalize(p.kname||p.sname||p.id)+':'+normalize(p.sname||'')+':'+normalize(p.source||'');
  }
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
  const api={normalize,cultivarKey,searchText,matches,encodeSelection};
  if(typeof module==='object')module.exports=api;else root.CatalogTools=api;
})(typeof window==='object'?window:globalThis);
