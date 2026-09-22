/* Explicit display fields only. Adding an Airtable field still requires an API whitelist mapping. */
(function(root){
  'use strict';
  const missing=/^(?:[-–—]+|n\/?a|null|undefined|미정|미입력|확인\s*(?:필요|중))$/i;
  function text(value){
    if(Array.isArray(value))return value.map(text).filter(Boolean).join(' · ');
    if(typeof value!=='string'&&typeof value!=='number')return '';
    const s=String(value).trim();
    return s&&!missing.test(s)?s:'';
  }
  const fields=[
    ['zone','내한성'],['height','성목 높이'],['spread','성목 너비'],
    ['light','일조'],['soil','토양'],['moisture','수분·배수'],
    ['foliage','잎의 특성'],['flowering','개화 시기']
  ];
  function facts(plant){return fields.map(([key,label])=>({key,label,value:text(plant[key])})).filter(f=>f.value);}
  function matchesVariant(plant,zone,status){return (!zone||text(plant.zone)===zone)&&(!status||plant.status===status);}
  const api={text,facts,matchesVariant};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.CatalogInfo=api;
})(typeof window==='undefined'?globalThis:window);
