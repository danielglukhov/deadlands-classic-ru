const MOD = 'deadlands-classic-ru';
const VERSION = '0.7.0';
const LIBRARY_URL='modules/deadlands-classic-ru/data/library.json';
let localLibrary=[];
async function getLocalLibrary(){if(localLibrary.length)return localLibrary;const r=await fetch(LIBRARY_URL);if(!r.ok)throw new Error('Не загружен каталог Deadlands: '+r.status);localLibrary=await r.json();return localLibrary;}
const ICON_BASE=`modules/${MOD}/assets/icons/`;
const ICON_FALLBACK='icons/svg/item-bag.svg';
const LIBRARY_PACKS={equipment:'deadlands-ru-equipment',abilities:'deadlands-ru-abilities',ancestries:'deadlands-ru-ancestries'};
function iconFor(x){return `${ICON_BASE}${x.icon||'compass'}.svg`;}
function itemDescription(x){
 const lines=[`<p>${esc(x.description||'')}</p>`];
 if(x.rules)lines.push(`<p><strong>Применение:</strong> ${esc(x.rules)}</p>`);
 if(x.mechanics?.damage)lines.push(`<p><strong>Урон:</strong> ${esc(x.mechanics.damage)}${x.mechanics.range?' · Дистанция: '+esc(x.mechanics.range):''}${x.mechanics.shots?' · Зарядов: '+esc(x.mechanics.shots):''}</p>`);
 lines.push(`<p><em>${esc(x.source||'Авторская адаптация Deadlands RU')}</em></p>`);
 return lines.join('');
}
function localItem(x){
 const sys={description:itemDescription(x)};
 if(x.price!==null&&x.price!==undefined){sys.price=x.price;sys.weight=x.weight??0;}
 if(x.type==='weapon'&&x.mechanics){
  const m=x.mechanics;Object.assign(sys,{damage:m.damage||'',range:m.range||'',shots:m.shots||0,currentShots:m.shots||0,rof:m.rof||1,ap:m.ap||0,ammo:m.ammo||'',actions:{trait:m.trait||'Shooting',traitMod:'',dmgMod:'',additional:{}}});
 }
 if(x.type==='gear'&&x.isAmmo)sys.isAmmo=true;
 if(x.type==='ability')sys.subtype='special';
 return {name:x.name,type:x.type,img:iconFor(x),system:sys,flags:{[MOD]:{key:x.key,source:x.source,homebrew:true,libraryVersion:VERSION}}};
}
async function ensurePack(key,label){let pack=game.packs.get(`world.${key}`);if(!pack)pack=await CompendiumCollection.createCompendium({name:key,label,type:'Item',package:'world'});return pack;}
async function installLibrary(){
 if(!game.user.isGM)throw new Error('Требуются права Маршала');
 const definitions=await getLocalLibrary();let created=0,updated=0;
 const groups=[['equipment',definitions.filter(x=>['weapon','gear','armor','consumable','shield'].includes(x.type)),'Deadlands RU | Оружие и снаряжение'],['abilities',definitions.filter(x=>x.type==='ability'),'Deadlands RU | Особенности'],['ancestries',definitions.filter(x=>x.type==='ancestry'),'Deadlands RU | Народы']];
 for(const [kind,entries,label] of groups){
  const pack=await ensurePack(LIBRARY_PACKS[kind],label);
  const index=await pack.getIndex({fields:[`flags.${MOD}.key`]});
  const byKey=new Map(index.filter(x=>x.flags?.[MOD]?.key).map(x=>[x.flags[MOD].key,x]));
  const missing=entries.filter(x=>!byKey.has(x.key));
  if(missing.length){await Item.createDocuments(missing.map(localItem),{pack:pack.collection});created+=missing.length;}
  // Update previously installed items too, including icon paths and weapon stats.
  const changes=entries.filter(x=>byKey.has(x.key)).map(x=>({...localItem(x),_id:byKey.get(x.key)._id}));
  if(changes.length){await Item.updateDocuments(changes,{pack:pack.collection});updated+=changes.length;}
 }
 ui.notifications.info(`Deadlands RU: создано ${created}, обновлено ${updated}. Старый смешанный справочник сохранён для совместимости.`);
 return {created,updated};
}

const STEPS = ['Герой','Карты','Характеристики','Навыки','Черты','Изъяны','Особенности','Снаряжение','Итог'];
const ATTRS = [['agi','Ловкость'],['sma','Смекалка'],['spi','Характер'],['str','Сила'],['vig','Выносливость']];
const SKILLS = [['shooting','Стрельба','agi'],['fighting','Драка','agi'],['notice','Внимание','sma'],['intimidation','Запугивание','spi'],['survival','Выживание','sma'],['gambling','Азартные игры','sma'],['guts','Храбрость','spi'],['riding','Верховая езда','agi'],['persuasion','Убеждение','spi'],['stealth','Маскировка','agi'],['tracking','Выслеживание','sma']];
const DIE = [0,4,6,8,10,12];
const rank = v => v==='JOKER'?12:['A','K'].includes(v)?10:['10','J','Q'].includes(v)?8:['2','3'].includes(v)?4:6;
const points = v => v==='JOKER'?20:['A','K'].includes(v)?18:['10','J','Q'].includes(v)?16:['2','3'].includes(v)?13:15;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deck = () => {const d=[];for(const suit of ['♠','♥','♦','♣'])for(const value of ['2','3','4','5','6','7','8','9','10','J','Q','K','A'])d.push({id:value+suit,value,suit});d.push({id:'joker1',value:'JOKER',suit:'🃏'},{id:'joker2',value:'JOKER',suit:'🃏'});for(let i=d.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;};
const sel=(key,options,chosen,disabled=[])=>`<select data-field="${key}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(chosen)===String(v)?'selected':''} ${disabled.includes(String(v))&&String(chosen)!==String(v)?'disabled':''}>${esc(t)}</option>`).join('')}</select>`;
class Builder extends foundry.applications.api.ApplicationV2 {
 static DEFAULT_OPTIONS={id:'deadlands-classic-builder',window:{title:'Deadlands Classic — создание героя',resizable:true},position:{width:920,height:760},actions:{}};
 constructor(options={}){super(options);this.step=0;this.data={name:'Билли Бой',age:42,ancestry:'Человек',archetype:'Бродяга',bio:'',appearance:'',goals:'',notes:'',nightmare:'',cards:[],discard:'',assigned:{},attrs:{agi:4,sma:4,spi:4,str:4,vig:4},skills:{},chosen:[],gear:[],cash:250};this.catalog=[];this.loading=false;this.catalogLoaded=false;this.catalogErrors=[];this.query='';this.showDetails=new Set();}
 async _renderHTML(){return this.html();}
 _replaceHTML(result,content){
  const oldMain=content.querySelector('.dl-builder main');
  const oldList=content.querySelector('.dl-catalog');
  const mainY=oldMain?.scrollTop||0, listY=oldList?.scrollTop||0;
  const focused=document.activeElement;
  const focusedField=focused?.dataset?.search!==undefined?'search':focused?.dataset?.field||null;
  const selection=focused && typeof focused.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd]:null;
  content.innerHTML=result;this.wire(content);content.querySelectorAll('img.dl-item-icon').forEach(img=>img.addEventListener('error',()=>{if(!img.dataset.fallback){img.dataset.fallback='1';img.src=ICON_FALLBACK;}}));
  const main=content.querySelector('.dl-builder main');if(main)main.scrollTop=mainY;
  const list=content.querySelector('.dl-catalog');if(list)list.scrollTop=listY;
  if(focusedField){const target=focusedField==='search'?content.querySelector('[data-search]'):Array.from(content.querySelectorAll('[data-field]')).find(x=>x.dataset.field===focusedField);if(target){target.focus({preventScroll:true});if(selection&&typeof target.setSelectionRange==='function')target.setSelectionRange(...selection);}}
 }
 skillBreakdown(key,value){const result=[];const attr=this.data.attrs[SKILLS.find(s=>s[0]===key)?.[2]]||4;for(let die=4;die<=value;die+=2)result.push({die,cost:die>attr?2:1});return result;}
 skillCost(key,value){let cost=0;const attr=this.data.attrs[SKILLS.find(s=>s[0]===key)?.[2]]||4;for(let d=4;d<=value;d+=2)cost+=d>attr?2:1;return cost;}
 used(){return Object.entries(this.data.skills).reduce((n,[k,v])=>n+this.skillCost(k,v),0);}
 budget(){const c=this.data.cards.find(c=>c.id===this.data.assigned.skill);return c?points(c.value):15;}
 async loadCatalog(){
  if(this.loading)return;
  this.loading=true;
  try{
   const items=[];this.catalogErrors=[];
   // SWADE packs, other installed compendiums, and world items share one source list.
   const packs=game.packs.filter(p=>p.documentName==='Item' && p.visible);
   for(const p of packs){
    try{
     const index=await p.getIndex({fields:['type','system.price','system.weight','system.requirements','system.severity','system.major','system.description','flags.deadlands-classic-ru.key']});
     for(const i of index){
      if(!['edge','hindrance','ability','ancestry','power','weapon','armor','gear','consumable','shield'].includes(i.type))continue;
      const sys=i.system||{};
      items.push({id:`Compendium.${p.collection}.Item.${i._id}`,key:i.flags?.[MOD]?.key,name:i.name,type:i.type,source:p.metadata?.label||p.collection,pack:p.collection,
       price:sys.price,weight:sys.weight,requirements:sys.requirements,description:sys.description||'',severity:sys.severity,major:sys.major});
     }
    }catch(e){this.catalogErrors.push(p.collection);console.warn(MOD,'Compendium unavailable',p.collection,e);}
   }
   for(const i of game.items.contents){
    if(!['edge','hindrance','ability','ancestry','power','weapon','armor','gear','consumable','shield'].includes(i.type))continue;
    items.push({id:i.uuid,key:i.flags?.[MOD]?.key,name:i.name,type:i.type,source:'Предметы мира',price:i.system.price,weight:i.system.weight,
     requirements:i.system.requirements,description:i.system.description||'',severity:i.system.severity,major:i.system.major});
   }
   const own=await getLocalLibrary();
   for(const x of own){
    const img=iconFor(x);
    items.push({id:'builtin:'+x.key,key:x.key,name:x.name,type:x.type,img,source:x.source,price:x.price,weight:x.weight,description:itemDescription(x),builtin:true,homebrew:true});
   }
   const unique=new Map();
   for(const x of items){const key=x.key?`own:${x.key}`:`${x.type}:${x.name.toLocaleLowerCase('ru')}`;if(!unique.has(key)||x.builtin)unique.set(key,x);}
   this.catalog=[...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
   this.catalogLoaded=true;
  }finally{this.loading=false;this.render();}
 }
 getChosen(){return this.data.chosen.map(id=>this.catalog.find(x=>x.id===id)).filter(Boolean);}
 itemPrice(item){const n=Number(item?.price);return item?.price!==undefined && item?.price!==null && item?.price!=='' && Number.isFinite(n) ? n : null;}
 equipmentTotal(){return this.getChosen().filter(x=>['weapon','armor','gear','consumable','shield'].includes(x.type)).reduce((v,x)=>v+(this.itemPrice(x)||0),0);}

 html(){const d=this.data;let body='';const input=(k,v,placeholder='')=>`<input data-field="${k}" value="${esc(v)}" placeholder="${esc(placeholder)}"/>`;
 if(this.step===0)body=`<h2>Кто ты, странник?</h2><div class="dl-grid"><label>Имя${input('name',d.name)}</label><label>Возраст<input data-field="age" type="number" min="1" value="${d.age}"></label><label>Архетип${input('archetype',d.archetype)}</label><label>Народ${sel('ancestry',[['Человек','Человек (Deadlands)']],d.ancestry)}</label><label>Стартовый капитал<input data-field="cash" type="number" value="${d.cash}"></label></div><label>Внешность<textarea data-field="appearance">${esc(d.appearance)}</textarea></label><label>Цели<textarea data-field="goals">${esc(d.goals)}</textarea></label><label>Заметки<textarea data-field="notes">${esc(d.notes)}</textarea></label><label>Биография<textarea data-field="bio">${esc(d.bio)}</textarea></label><label>Наихудший кошмар<textarea data-field="nightmare">${esc(d.nightmare)}</textarea></label><p class="dl-note">Народ — происхождение героя, не профессия. В базовом Deadlands выбран человек. Стартовый ранг — Новичок, 0 повышений. Дополнительная черта человека проверяется по правилам вашей редакции.</p>`;
 if(this.step===1){body=`<h2>Охота за джокером</h2><p>Раздай семь карт, сбрось одну (нельзя сбрасывать двойку или джокера). Остальные шесть назначь пяти характеристикам и запасу навыков.</p><button type="button" data-act="deal">Перетасовать и раздать</button><div class="dl-cards">${d.cards.map(c=>`<button type="button" class="dl-card ${d.discard===c.id?'discard':''}" data-act="discard" data-id="${c.id}" ${['2','JOKER'].includes(c.value)?'disabled':''}><span>${c.suit}</span><b>${c.value==='JOKER'?'🃏':c.value}</b><small>${c.value==='JOKER'?'d12':'d'+rank(c.value)}</small></button>`).join('')}</div>${d.discard?'<p class="dl-ok">Сброс выбран. Перейди к характеристикам.</p>':''}`;}
  if(this.step===2){
    const available=d.cards.filter(c=>c.id!==d.discard);
    const occupied=Object.values(d.assigned).filter(Boolean);
    const cardBadges=available.map(c=>{const entry=Object.entries(d.assigned).find(([,id])=>id===c.id);const label=entry?(entry[0]==='skill'?'Навыки':ATTRS.find(x=>x[0]===entry[0])?.[1]):'Свободна';return `<span class="dl-chip ${entry?'dl-chip-used':''}" title="${esc(label)}">${esc(c.value+' '+c.suit)} <small>${esc(label)}</small></span>`;}).join('');
    const choices=[['','— выбери карту —'],...available.map(c=>[c.id,`${c.value} ${c.suit} → d${rank(c.value)}`])];
    const skillChoices=[['','— выбери карту —'],...available.map(c=>[c.id,`${c.value} ${c.suit} → ${points(c.value)} пунктов`])];
    body=`<h2>Характеристики</h2><p>Выбранная карта становится недоступна в остальных полях. Чтобы освободить её, выбери «— выбери карту —».</p><div class="dl-chipbar">${cardBadges}</div><div class="dl-rows">${ATTRS.map(([k,n])=>`<label>${n}${sel('assign.'+k,choices,d.assigned[k],occupied)}<strong>d${d.attrs[k]}</strong></label>`).join('')}<label>Пункты навыков${sel('assign.skill',skillChoices,d.assigned.skill,occupied)}<strong>${d.assigned.skill?this.budget():'Карта не выбрана'}</strong></label></div>`;
  }
  if(this.step===3)body=`<h2>Навыки</h2><p>Потрачено: <strong>${this.used()} / ${this.budget()}</strong>. Каждая ступень до связанной характеристики стоит 1 очко, выше — 2.</p><div class="dl-rows">${SKILLS.map(([k,n,a])=>{const attr=d.attrs[a];const value=d.skills[k]||0;const breakdown=this.skillBreakdown(k,value);const price=breakdown.map(x=>`d${x.die}: ${x.cost}`).join(' + ')||'Не изучен';return `<label>${n} <small>(${ATTRS.find(x=>x[0]===a)[1]} d${attr})</small>${sel('skill.'+k,[[0,'— нет —'],...DIE.slice(1).map(v=>[v,'d'+v])],value)}<span class="dl-breakdown">${price}</span><strong>Итого: ${this.skillCost(k,value)} оч.</strong></label>`;}).join('')}</div><p class="dl-note">Это тестовый список навыков, не полный каталог.</p>`;
 if(this.step>=4&&this.step<=7){
  const traits=this.step!==7;
  const terms=this.step===4?['edge']:this.step===5?['hindrance']:this.step===6?['ability']:['weapon','armor','gear','consumable','shield'];
  const items=this.catalog.filter(x=>terms.includes(x.type));
  const query=(this.query||'').toLowerCase();
  const filtered=items.filter(x=>`${x.name} ${x.source} ${x.type}`.toLowerCase().includes(query));
  const chosen=this.getChosen().filter(x=>terms.includes(x.type));
  const money=Number(d.cash)||0;
  body=`<h2>${this.step===4?'Черты':this.step===5?'Изъяны':this.step===6?'Особенности':'Стартовое снаряжение'}</h2>
   <p>Каталог объединяет доступные справочники SWADE и нашу авторскую библиотеку. Предметы библиотеки можно отдельно установить в Compendium мира.</p>
   <div class="dl-catalog-toolbar"><button type="button" data-act="reload-catalog">↻ Обновить справочники</button>
   <button type="button" data-act="install-library">📚 Создать библиотеку Deadlands RU</button><span>${this.loading?'Загрузка…':`Найдено: ${items.length}`}</span></div>
   ${!traits?`<p><strong>Капитал: $${money}</strong> · Известная стоимость выбранного: $${this.equipmentTotal()} · Остаток: $${money-this.equipmentTotal()}</p>`:''}
   <input data-search placeholder="Поиск по названию или источнику" value="${esc(this.query||'')}"/>
   <div class="dl-catalog">${filtered.slice(0,250).map(x=>{
    const price=this.itemPrice(x);
    const detail=traits?({edge:'Черта',hindrance:'Изъян',ability:'Особенность'}[x.type]||x.type):`${x.type}${price===null?' · цена не указана':' · $'+price}${x.weight==null?'':' · вес '+x.weight}`;
    const req=Array.isArray(x.requirements)&&x.requirements.length?' · требования в SWADE':'';
    const description=String(x.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,350);
    return `<label class="dl-entry"><input type="checkbox" data-item="${esc(x.id)}" ${d.chosen.includes(x.id)?'checked':''}/><span><strong>${x.img?`<img class="dl-item-icon" src="${esc(x.img)}" alt=""/>`:''}${esc(x.name)}</strong><small>${esc(detail+req)} · ${esc(x.source)}</small>${description?`<small class="dl-entry-desc">${esc(description)}</small>`:''}${x.homebrew?'<small class="dl-warning">Авторская адаптация · параметры неофициальные</small>':''}</span></label>`;
   }).join('')||'<p>Ничего не найдено. Проверь, установлены ли доступные справочники, или добавь свои Item в мир.</p>'}</div>
   ${filtered.length>250?`<p>Показаны первые 250 из ${filtered.length}. Уточни поиск.</p>`:''}
   ${this.catalogErrors.length?`<p class="dl-note">Некоторые справочники не прочитаны: ${esc(this.catalogErrors.join(', '))}</p>`:''}
   <p class="dl-note">${traits?'Проверяй требования, ранг и лимиты по используемой редакции правил.':'Авторские цены и вес — игровые оценки, не официальные значения из книг. Проверяй с Маршалом.'}</p>
   <p>Выбрано: ${chosen.length}${!traits?' · Вещи переносятся в инвентарь персонажа':''}</p>`;
 }

 if(this.step===8)body=`<h2>Проверка героя</h2><dl class="dl-summary"><dt>Имя</dt><dd>${esc(d.name)}, ${esc(d.age)} лет</dd><dt>Народ / ранг</dt><dd>${esc(d.ancestry)} · Новичок (0 повышений)</dd><dt>Архетип</dt><dd>${esc(d.archetype)}</dd><dt>Характеристики</dt><dd>${ATTRS.map(([k,n])=>`${n} d${d.attrs[k]}`).join(' · ')}</dd><dt>Навыки</dt><dd>${SKILLS.filter(([k])=>d.skills[k]).map(([k,n])=>`${n} d${d.skills[k]}`).join(' · ')||'Не выбраны'}</dd><dt>Пункты</dt><dd>${this.used()} / ${this.budget()}</dd><dt>Черты, изъяны и предметы</dt><dd>${d.chosen.length}</dd><dt>Стоимость снаряжения (известная)</dt><dd>$${this.equipmentTotal()}</dd><dt>Остаток</dt><dd>$${(Number(d.cash)||0)-this.equipmentTotal()}</dd><dt>Кошмар</dt><dd>${esc(d.nightmare||'Не указан')}</dd></dl><button type="button" class="dl-primary" data-act="create">Создать персонажа в Foundry</button><p class="dl-note">Создаётся Actor типа character. Исходные карточные данные сохраняются в flags модуля. Классические правила не заменяют автоматизацию SWADE.</p>`;
 return `<section class="dl-builder"><header><div class="dl-eyebrow">DEADLANDS · CLASSIC RU · v0.7.0</div><h1>Создание героя</h1><nav>${STEPS.map((s,i)=>`<button type="button" data-act="step" data-step="${i}" class="${i===this.step?'active':''}">${i+1}. ${s}</button>`).join('')}</nav></header><main>${body}</main><footer><button type="button" data-act="prev" ${this.step===0?'disabled':''}>← Назад</button><span>Шаг ${this.step+1} из ${STEPS.length}</span><button type="button" data-act="next" ${this.step===8?'disabled':''}>Далее →</button></footer></section>`;}
 wire(el){el.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',async()=>{const a=b.dataset.act;if(a==='step'){this.step=Number(b.dataset.step);this.query='';this.render();if((this.step>=4&&this.step<=7)&&!this.catalogLoaded)await this.loadCatalog();}if(a==='prev'){this.step=Math.max(0,this.step-1);this.render();}if(a==='next'){if(this.step===2&&this.data.cards.length&&Object.values(this.data.assigned).filter(Boolean).length!==6){ui.notifications.warn('Назначь все шесть карт.');return;}if(this.step===3&&this.used()>this.budget()){ui.notifications.warn('Превышен бюджет навыков.');return;}this.step=Math.min(8,this.step+1);this.query='';this.render();if((this.step>=4&&this.step<=7)&&!this.catalogLoaded)await this.loadCatalog();}if(a==='deal'){this.data.cards=deck().slice(0,7);this.data.discard='';this.data.assigned={};this.data.attrs={agi:4,sma:4,spi:4,str:4,vig:4};this.render();}if(a==='discard'){this.data.discard=b.dataset.id;this.data.assigned={};this.data.attrs={agi:4,sma:4,spi:4,str:4,vig:4};this.render();}if(a==='reload-catalog')await this.loadCatalog();if(a==='install-library'){try{await installLibrary();this.catalogLoaded=false;await this.loadCatalog();}catch(e){console.error(MOD,e);ui.notifications.error(e.message);}}if(a==='create')await this.createActor();}));
 el.querySelectorAll('[data-field]').forEach(x=>x.addEventListener('change',()=>{const k=x.dataset.field,v=x.value;if(k.startsWith('assign.')){const name=k.slice(7);if(v&&Object.entries(this.data.assigned).some(([other,id])=>other!==name&&id===v)){ui.notifications.warn('Эта карта уже назначена');this.render();return;}if(v) this.data.assigned[name]=v; else delete this.data.assigned[name];if(name!=='skill'){const card=this.data.cards.find(c=>c.id===v);this.data.attrs[name]=card?rank(card.value):4;}this.render();}else if(k.startsWith('skill.')){this.data.skills[k.slice(6)]=Number(v);this.render();}else this.data[k]=['age','cash'].includes(k)?Number(v):v;}));
 el.querySelectorAll('[data-item]').forEach(x=>x.addEventListener('change',()=>{this.data.chosen=x.checked?[...new Set([...this.data.chosen,x.dataset.item])]:this.data.chosen.filter(i=>i!==x.dataset.item);this.render();}));const search=el.querySelector('[data-search]');if(search)search.addEventListener('change',()=>{this.query=search.value;this.render();});}
 async createActor(){
  if(!game.user.isGM){ui.notifications.error('Создание персонажа доступно Маршалу.');return;}
  if(this.used()>this.budget()){ui.notifications.error('Превышен бюджет навыков.');return;}
  if(this.equipmentTotal()>(Number(this.data.cash)||0)){ui.notifications.error('Стоимость выбранного снаряжения превышает стартовый капитал.');return;}
  const d=this.data;
  if(d.cards.length && (Object.values(d.assigned).filter(Boolean).length!==6 || !d.discard)){
   ui.notifications.error('Сначала сбрось одну карту и назначь остальные шесть.');return;
  }
  const attributeNames={agi:'agility',sma:'smarts',spi:'spirit',str:'strength',vig:'vigor'};
  let actor=null;
  try{
   // SWADE 5.2.6 initializes core skills and currency in CharacterData._preCreate.
   // Apply our values after creation, so the system's defaults cannot overwrite them.
   actor=await Actor.create({name:d.name||'Новый герой',type:'character',flags:{[MOD]:{
    version:VERSION,age:d.age,ancestry:d.ancestry,archetype:d.archetype,bio:d.bio,appearance:d.appearance,goals:d.goals,notes:d.notes,nightmare:d.nightmare,
    cards:d.cards,discard:d.discard,assigned:d.assigned,skills:d.skills,cash:d.cash
   }}});
   if(!actor)throw new Error('Actor.create не вернул персонажа');
   const update={
    'system.details.archetype':d.archetype||'',
    'system.details.biography.value':d.bio||'',
    'system.details.appearance':d.appearance||'',
    'system.details.goals':d.goals||'',
    'system.details.notes':d.notes||'',
    'system.details.currency':Math.max(0,(Number.isFinite(Number(d.cash))?Number(d.cash):0)-this.equipmentTotal())
   };
   for(const [short,long] of Object.entries(attributeNames)){
    update[`system.attributes.${long}.die.sides`]=d.attrs[short]||4;
   }
   await actor.update(update);

   const imported=[];
   for(const id of d.chosen){
    try{
     const doc=id.startsWith('builtin:')?null:await fromUuid(id);
     if(doc && doc.documentName==='Item' && ['edge','hindrance','ability','weapon','armor','gear','consumable','shield'].includes(doc.type)){
      const data=doc.toObject();delete data._id;imported.push(data);
     }
    }catch(e){console.warn(MOD,'Не удалось импортировать предмет',id,e);}
   }
   // Module-local original adaptations with clearly labelled estimated prices and weights.
   for(const id of d.chosen.filter(x=>x.startsWith('builtin:'))){
    const entry=this.catalog.find(x=>x.id===id);
    if(!entry)continue;
    const local=(await getLocalLibrary()).find(x=>x.key===entry.key);if(local)imported.push(localItem(local));
   }
   const ancestry=(await getLocalLibrary()).find(x=>x.type==='ancestry'&&x.name===d.ancestry);
   if(ancestry)imported.unshift(localItem(ancestry));
   if(imported.length)await actor.createEmbeddedDocuments('Item',imported);
   if(imported.length-(ancestry?1:0)!==d.chosen.length)ui.notifications.warn('Некоторые выбранные предметы не импортированы — проверь инвентарь и черты.');

   const itemUpdates=[];
   const newSkills=[];
   const seen=new Set();
   for(const [key,value] of Object.entries(d.skills)){
    if(!value)continue;
    const info=SKILLS.find(s=>s[0]===key);
    if(!info)continue;
    const attribute=attributeNames[info[2]];
    if(!attribute)throw new Error(`Неизвестная характеристика навыка ${key}: ${info[2]}`);
    // Match SWADE core skills by stable swid rather than translated display name.
    const existing=actor.items.find(i=>i.type==='skill' &&
     (i.system.swid===key || i.name.toLocaleLowerCase('ru')===info[1].toLocaleLowerCase('ru')));
    if(existing){
     itemUpdates.push({_id:existing.id,'system.attribute':attribute,'system.die.sides':value});
    }else if(!seen.has(key)){
     // Fresh item data: never copy Athletics metadata, translations, icons or flags.
     newSkills.push({name:info[1],type:'skill',
      img:'systems/swade/assets/icons/skill.svg',
      system:{attribute,die:{sides:value,modifier:0},isCoreSkill:false,swid:key}});
     seen.add(key);
    }
   }
   if(itemUpdates.length)await actor.updateEmbeddedDocuments('Item',itemUpdates);
   if(newSkills.length)await actor.createEmbeddedDocuments('Item',newSkills);
   const invalid=actor.items.filter(i=>i.type==='skill' && i.system.attribute &&
    !Object.values(attributeNames).includes(i.system.attribute));
   if(invalid.length)throw new Error('Некорректные атрибуты навыков: '+invalid.map(i=>i.name).join(', '));
   ui.notifications.info(`Герой «${actor.name}» создан. Проверь его лист.`);
   this.close();
  }catch(e){
   console.error(MOD,'Ошибка создания персонажа',e);
   ui.notifications.error('Ошибка создания персонажа: '+e.message);
   if(actor)ui.notifications.warn('Персонаж создан частично. Проверь его перед игрой: '+actor.name);
  }
 }

}
Hooks.once('ready',()=>{game.deadlandsClassicRU={open:()=>new Builder().render(true),installLibrary};if(game.user.isGM){ui.notifications.info('Deadlands Classic RU готов: кнопка в Актёрах.');}});
Hooks.on('renderActorDirectory',(app,html)=>{if(!game.user.isGM)return;const root=html instanceof HTMLElement?html:html?.[0];if(!root||root.querySelector('.dl-open'))return;const btn=document.createElement('button');btn.className='dl-open';btn.innerHTML='🤠 Создать героя Deadlands';btn.addEventListener('click',()=>new Builder().render(true));(root.querySelector('.directory-header .header-actions')||root.querySelector('.directory-header')||root).append(btn);});

// Native SWADE 5.2.6 advancement data: system.advances.mode/list/value/rank.
// Only append advances through the supported schema, never maintain a second counter.
class AdvancesPanel extends foundry.applications.api.ApplicationV2 {
 static DEFAULT_OPTIONS={id:'deadlands-advances-panel',window:{title:'Deadlands RU — Повышения',resizable:true},position:{width:650,height:640}};
 constructor(actor,options={}){super(options);this.actor=actor;this.kind='0';this.note='';this.planned=true;}
 async _renderHTML(){
  const a=this.actor,adv=a.system.advances||{},list=Array.from(adv.list||[]),awarded=list.filter(x=>!x.planned).length;
  const ranks=['Новичок','Закалённый','Ветеран','Герой','Легенда'];const r=ranks[Math.min(4,Math.floor(awarded/4))];
  const canEdit=a.isOwner&&game.user.isGM;
  return `<section class="dl-adv"><h2>${esc(a.name)}</h2><div class="dl-adv-stats"><div><small>Ранг</small><strong>${r}</strong></div><div><small>Получено</small><strong>${awarded}</strong></div><div><small>Запланировано</small><strong>${list.length-awarded}</strong></div><div><small>До следующего ранга</small><strong>${awarded>=16?'—':4-awarded%4}</strong></div></div><p class="dl-note">Повышение — не уровень D&D. Каждые 4 полученных повышения меняют ранг. Редактор использует стандартный список SWADE, а не отдельный счётчик модуля.</p><h3>История повышений</h3><div class="dl-adv-history">${list.length?list.map((x,i)=>`<div><b>№ ${x.sort||i+1}</b> ${x.planned?'Запланировано':'Получено'} · ${esc(x.notes?.replace(/<[^>]*>/g,'')||'Без заметки')}</div>`).join(''):'<p>Повышений пока нет.</p>'}</div><h3>Добавить повышение</h3><label>Тип<select data-adv-kind><option value="0">Черта</option><option value="1">Навык</option><option value="2">Два навыка</option><option value="3">Характеристика</option><option value="4">Устранение изъяна</option></select></label><label>Что изменилось<textarea data-adv-note placeholder="Например: Стрельба d6 → d8"></textarea></label><label class="dl-adv-check"><input type="checkbox" data-adv-planned checked> Запланировать (не выдавать сейчас)</label><div class="dl-adv-actions"><button data-adv-sheet>Открыть лист героя</button><button data-adv-add ${canEdit?'':'disabled'}>Сохранить повышение</button></div><p class="dl-note">Запись фиксирует выбор, но не повышает кубик навыка автоматически: изменение характеристики/черты производится в листе SWADE. Типы повышений и допустимость выбора проверяет Маршал.</p></section>`;
 }
 _replaceHTML(result,content){content.innerHTML=result;content.querySelector('[data-adv-sheet]')?.addEventListener('click',()=>this.actor.sheet.render(true));content.querySelector('[data-adv-add]')?.addEventListener('click',async()=>{
  if(!game.user.isGM||!this.actor.isOwner)return;
  const list=Array.from(this.actor.system.advances?.list||[]).map(x=>typeof x.toObject==='function'?x.toObject():foundry.utils.deepClone(x));
  const planned=content.querySelector('[data-adv-planned]').checked;
  const type=Number(content.querySelector('[data-adv-kind]').value);
  const notes=esc(content.querySelector('[data-adv-note]').value.trim());
  const sort=list.length+1;list.push({id:foundry.utils.randomID(),sort,planned,type,notes,rank:Math.min(4,Math.floor((sort-1)/4))});
  await this.actor.update({'system.advances.mode':'expanded','system.advances.list':list});
  ui.notifications.info(`Повышение ${planned?'запланировано':'выдано'}: ${this.actor.name}`);this.render();
 });}
}
Hooks.on('renderActorDirectory',(app,html)=>{if(!game.user.isGM)return;const root=html instanceof HTMLElement?html:html?.[0];if(!root||root.querySelector('.dl-adv-open'))return;const btn=document.createElement('button');btn.className='dl-open dl-adv-open';btn.textContent='⭐ Повышения Deadlands';btn.addEventListener('click',async()=>{const actors=game.actors.contents.filter(a=>a.type==='character');if(!actors.length){ui.notifications.warn('Сначала создай героя');return;}const opts=actors.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');const content=`<form><label>Выбери героя<select name="actor">${opts}</select></label></form>`;const result=await foundry.applications.api.DialogV2.prompt({window:{title:'Повышения Deadlands'},content,ok:{label:'Открыть',callback:(event,button)=>button.form.elements.actor.value}});const actor=game.actors.get(result);if(actor)new AdvancesPanel(actor).render(true);});(root.querySelector('.directory-header .header-actions')||root.querySelector('.directory-header')||root).append(btn);});
Hooks.once('ready',()=>{game.deadlandsClassicRU.openAdvances=(actor)=>new AdvancesPanel(actor).render(true);});
