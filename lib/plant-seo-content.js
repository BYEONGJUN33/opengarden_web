const { summary, text } = require('../public/assets/catalog-info');
const trim = (value, max=4000) => Array.from(text(value)).slice(0,max).join('');
const labels = new Set(['개화 시기','USDA Zone','USDA 내한성 Zone','추천 식재 시기','관리 난이도','태그']);
function extractNotes(description){
  return String(description||'').split(/\r?\n/).filter(line=>{
    const match=line.match(/^\s*([^:：]+)[:：]/);
    return !match || !labels.has(match[1].trim());
  }).map(line=>line.trim()).filter(Boolean).join('\n');
}
function pageContent(plant) {
  const brief=summary(plant);
  const sections=[];
  const add=(heading,value)=>{
    const content=trim(value);
    if(content)sections.push({heading,content});
  };
  add('품종의 특징과 관상 포인트',extractNotes(plant.desc));
  add('정원·조경 활용과 식재 제안',plant.use);
  add('개화 및 계절별 감상',plant.flowering);
  add('내한성·기후 참고',plant.zone);
  add('추천 식재 시기',plant.planting);
  add('관리 난이도',plant.difficulty);
  const faqs=[];
  const name=trim(plant.kname||plant.sname,120);
  const ask=(question,answer)=>{if(trim(answer))faqs.push({question,answer:trim(answer,400)});};
  ask(`${name}의 개화 시기는 언제인가요?`,plant.flowering);
  ask(`${name}의 내한성 정보는 어떻게 되나요?`,plant.zone);
  ask(`${name}의 추천 식재 시기는 언제인가요?`,plant.planting);
  ask(`${name}의 관리 난이도는 어떻게 되나요?`,plant.difficulty);
  const size=Array.isArray(plant.size)?plant.size.join(', '):plant.size;
  ask(`${name}은 어떤 규격으로 소개되나요?`,size);
  // No machine-invented zone, awards, procurement status, testimonials or star ratings.
  return {brief,sections,faqs};
}
module.exports={pageContent,extractNotes};
