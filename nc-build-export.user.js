// ==UserScript==
// @name         Night Camp Build Export
// @namespace    nightcamp-build-planner
// @version      1.2.0
// @description  Adds a "Copy build" button inside Night Camp. Copies your class, levels, stats, skills, runes and gear as a code for the Night Camp Build Planner. Read-only.
// @author       Zynnlol
// @match        https://play.nightcamp.app/*
// @grant        none
// @sandbox      raw
// @run-at       document-idle
// @noframes
// @homepageURL  https://zynnlolgaming.github.io/nightcamp-planner/
// @updateURL    https://zynnlolgaming.github.io/nightcamp-planner/nc-build-export.user.js
// @downloadURL  https://zynnlolgaming.github.io/nightcamp-planner/nc-build-export.user.js
// ==/UserScript==

/* Optional: put your planner's web address here to get an "Open in planner" button,
   e.g. 'https://yourname.github.io/nightcamp-planner/' */
const PLANNER_URL = 'https://zynnlolgaming.github.io/nightcamp-planner/';

/* Night Camp build exporter — runs inside the game page (MAIN world), read-only.
 * Listens for one 'nightcamp:online-snapshot' (the same event the game already broadcasts),
 * picks out build data only (no name, id, coins, chat, party) and returns a short code. */
async function ncExportBuild(){
  const NC=window.NC;
  if(!NC) return {error:'Night Camp is not loaded in this tab. Open play.nightcamp.app and enter the game first.'};
  const self=await new Promise(res=>{
    let done=false;
    const h=e=>{ const s=e&&e.detail&&e.detail.snapshot&&e.detail.snapshot.self; if(s&&!done){ done=true; window.removeEventListener('nightcamp:online-snapshot',h); res(s); } };
    window.addEventListener('nightcamp:online-snapshot',h);
    setTimeout(()=>{ if(!done){ done=true; window.removeEventListener('nightcamp:online-snapshot',h); res(null); } },4000);
  });
  const P=(NC.game&&NC.game.player)||null;
  const src=[self,P].filter(Boolean);
  if(!src.length) return {error:'No character data yet. Enter the game world (not the menu) and try again.'};
  const pick=k=>{ for(const o of src) if(o[k]!=null) return o[k]; return null; };
  const SK=['str','agi','vit','int','dex','luk'];
  // stat blocks: any object with all six stats (the smallest one is the allocation)
  const statC=[]; const seen=new Set();
  const walk=(o,path,d)=>{ if(!o||typeof o!=='object'||d>3||seen.has(o)) return; seen.add(o);
    if(SK.every(k=>typeof o[k]==='number')) statC.push({path,v:Object.fromEntries(SK.map(k=>[k,o[k]]))});
    for(const k of Object.keys(o).slice(0,300)){ const v=o[k]; if(v&&typeof v==='object'&&!Array.isArray(v)&&!/^(monsters|players|loot|mats|party|chat|inv|inventory|bag|mirrors)$/i.test(k)) walk(v,path+'.'+k,d+1); } };
  src.forEach((o,i)=>walk(o,i?'player':'self',0));
  // point counters: numeric fields named like points
  const pts={}; src.forEach(o=>Object.keys(o).forEach(k=>{ if(typeof o[k]==='number'&&/pt|point/i.test(k)&&!(k in pts)) pts[k]=o[k]; }));
  const num=v=>typeof v==='number'?v:(v&&typeof v==='object'?(v.lv??v.level??v.lvl??null):null);
  const skills={}; const rawSk=pick('skills')||{};
  for(const [k,v] of Object.entries(rawSk)){ const n=num(v); if(n!=null) skills[k]=n; }
  const equip={}; const rawEq=pick('equip')||{};
  for(const [k,v] of Object.entries(rawEq)){ const id=typeof v==='string'?v:(v&&(v.id||v.itemId))||null; if(id) equip[k]=id; }
  const bl=pick('buildLoot')||{}; const runes={};
  if(bl.runes&&typeof bl.runes==='object') for(const [k,v] of Object.entries(bl.runes)) if(Array.isArray(v)) runes[k]=v.map(x=>typeof x==='string'?x:null);
  const job=pick('job');
  const names={job:NC.JOBS&&NC.JOBS[job]?NC.JOBS[job].name:null,sk:{},it:{}};
  Object.keys(skills).concat(Object.keys(runes)).forEach(k=>{ const S=NC.SKILLS&&NC.SKILLS[k]; if(S&&S.name) names.sk[k]=S.name; });
  Object.values(equip).forEach(id=>{ const I=NC.ITEMS&&NC.ITEMS[id]; if(I&&I.name) names.it[id]=I.name; });
  // the game's own numbers: gear totals with your real rolls, final stats (base + gear + costume…), points left
  let gear=null, total=null, left=null, skLeft=null, skPts=null;
  try{ if(P&&typeof NC.gearStats==='function'){ const g=NC.gearStats.call(P,P.equip); if(g&&typeof g==='object'){ gear={}; for(const [k,v] of Object.entries(g)) if(typeof v==='number'&&v) gear[k]=Math.round(v*10000)/10000; } } }catch(e){}
  const dv=self&&self.derived; if(dv&&SK.every(k=>typeof dv[k]==='number')) total=Object.fromEntries(SK.map(k=>[k,dv[k]]));
  try{ if(P&&typeof NC.statusLeft==='function') left=NC.statusLeft(P); }catch(e){}
  try{ if(P&&typeof NC.skillLeft==='function') skLeft=NC.skillLeft(P); if(P&&typeof NC.skillPoints==='function') skPts=NC.skillPoints(P); }catch(e){}
  // each worn item as you actually have it: rolled stats (with ranges), grade (background colour), options and empty sockets
  let copies=null;
  try{ if(P&&NC.ItemRoll){ const R=NC.ItemRoll, bag=Array.isArray(P.bag)?P.bag:Object.values(P.bag||{}); copies={};
    for(const [sl,id] of Object.entries(P.equip||{})){ if(!id||/^(hair|fhat|frobe|tail)$/.test(sl)) continue; const it=NC.ITEMS&&NC.ITEMS[id]; if(!it) continue;
      const u=P.wu&&P.wu[sl], c=u?bag.find(x=>x&&x.u===u):null, o={id};
      try{ const st=R.statsFor(P.equip,sl,it)||{}; o.st={}; for(const [k,v] of Object.entries(st)) if(typeof v==='number'&&v) o.st[k]=v; }catch(e){}
      try{ o.lines=(R.lines(it,c||undefined)||[]).map(l=>({k:l.k,label:String(l.label||''),value:String(l.value||''),range:String(l.range||'')})); }catch(e){}
      if(c){ o.g=c.g||0; o.rows=(c.rows||[]).map(r=>{ let t=''; try{ t=String(NC.rowText(r)||'').replace(/<[^>]*>/g,''); }catch(e){} return {k:r.k,v:r.v,tier:r.tier||0,sub:r.sub||null,t}; }); }
      if(sl==='weapon'){ try{ const v=R.held(P); if(v&&Array.isArray(v.dmg)) o.dmg=v.dmg; }catch(e){} }
      copies[sl]=o; } } }catch(e){}
  const base=self&&self.base&&SK.every(k=>typeof self.base[k]==='number')?Object.fromEntries(SK.map(k=>[k,self.base[k]])):null;
  const out={v:1,t:Date.now(),job,lv:pick('lv'),jobLv:pick('jobLv'),skills,equip,runes,stats:statC.slice(0,6),pts,names,base,total,gear,left,skLeft,skPts,copies,
    keys:{self:self?Object.keys(self).slice(0,120):[],player:P?Object.keys(P).slice(0,120):[]}};
  const json=JSON.stringify(out);
  const b64=btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return {code:'NCB1.'+b64,summary:{job:names.job||job,lv:out.lv,jobLv:out.jobLv,skills:Object.keys(skills).length,items:Object.keys(equip).length,runes:Object.values(runes).flat().filter(Boolean).length,stats:statC.length}};
}


(function(){
  'use strict';
  if (window.__ncbExport) return; window.__ncbExport = true;
  const css = `
  #ncb-wrap{position:fixed;z-index:2147483000;display:flex;gap:4px;align-items:center;font:600 13px system-ui,"Segoe UI","Noto Sans Thai",sans-serif;user-select:none}
  #ncb-wrap button{border:0;cursor:pointer;font:inherit;border-radius:10px;padding:7px 12px;box-shadow:0 4px 14px rgba(0,0,0,.35)}
  #ncb-copy{background:linear-gradient(180deg,#ffb53b,#ff7a2f);color:#1c1305}
  #ncb-copy:hover{filter:brightness(1.08)}
  #ncb-open{background:#1b2133;color:#e8ebf4;border:1px solid #33405f!important}
  #ncb-grip{width:14px;height:30px;cursor:grab;border-radius:6px;background:repeating-linear-gradient(0deg,rgba(255,255,255,.35) 0 2px,transparent 2px 5px);opacity:.6}
  #ncb-toast{position:fixed;z-index:2147483001;left:50%;top:70px;transform:translateX(-50%);background:#0c0f17;color:#e8ebf4;border:1px solid #f5a524;border-radius:10px;padding:9px 14px;font:13px system-ui,"Noto Sans Thai",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:420px;display:none}
  #ncb-toast b{color:#f5a524}
  #ncb-toast textarea{display:block;width:380px;height:60px;margin-top:6px;background:#111522;color:#9ba3bd;border:1px solid #263049;border-radius:8px;font:11px monospace}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const wrap = document.createElement('div'); wrap.id = 'ncb-wrap';
  wrap.innerHTML = `<div id="ncb-grip" title="Drag to move"></div><button id="ncb-copy" title="Copy your build code for the Night Camp Build Planner">📋 Copy build</button>${PLANNER_URL?'<button id="ncb-open" title="Open your build in the planner">↗</button>':''}`;
  const toast = document.createElement('div'); toast.id = 'ncb-toast';
  document.body.append(wrap, toast);
  // position: remembered, default bottom-left above the chat icons
  let pos; try{ pos = JSON.parse(localStorage.getItem('ncb-pos')||'null'); }catch(e){}
  const place = p => { wrap.style.left = p.x+'px'; wrap.style.top = p.y+'px'; };
  place(pos || {x:12, y:Math.max(80, innerHeight-200)});
  const grip = wrap.querySelector('#ncb-grip');
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    const r = wrap.getBoundingClientRect(), ox = e.clientX-r.left, oy = e.clientY-r.top;
    const mv = ev => place({x:Math.max(0,Math.min(innerWidth-60,ev.clientX-ox)), y:Math.max(0,Math.min(innerHeight-30,ev.clientY-oy))});
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); const r2 = wrap.getBoundingClientRect(); try{ localStorage.setItem('ncb-pos', JSON.stringify({x:r2.left,y:r2.top})); }catch(e){} };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
  let hideT;
  const say = (html, ms=3500) => { toast.innerHTML = html; toast.style.display = 'block'; clearTimeout(hideT); if (ms) hideT = setTimeout(()=>toast.style.display='none', ms); };
  // only show the button once you're in the game world
  const tick = () => { const inGame = !!(window.NC && window.NC.game && window.NC.game.player && window.NC.game.player.lv); wrap.style.display = inGame ? 'flex' : 'none'; };
  tick(); setInterval(tick, 2000);
  let busy = false;
  async function run(open){
    if (busy) return; busy = true; say('Reading your character…', 0);
    try{
      const r = await ncExportBuild();
      if (!r || r.error){ say('⚠ '+((r&&r.error)||'Could not read the game.')); return; }
      const s = r.summary;
      const info = `<b>${s.job||'?'}</b> · Lv ${s.lv} · Job Lv ${s.jobLv} · ${s.skills} skills · ${s.runes} runes · ${s.items} items`;
      if (open && PLANNER_URL){ window.open(PLANNER_URL.split('#')[0]+'#ncb='+r.code, '_blank'); say('Opened in the planner · '+info); return; }
      try{ await navigator.clipboard.writeText(r.code); say('✓ Build copied! Paste it in the planner (📥 Import build).<br>'+info, 4500); }
      catch(e){ say('Copy this code (Ctrl+C), then paste it in the planner:<br>'+info+'<textarea readonly>'+r.code+'</textarea>', 0); const ta = toast.querySelector('textarea'); ta.focus(); ta.select(); toast.onclick = ev => { if (ev.target!==ta) toast.style.display='none'; }; }
    } finally { busy = false; }
  }
  wrap.querySelector('#ncb-copy').addEventListener('click', () => run(false));
  const ob = wrap.querySelector('#ncb-open'); if (ob) ob.addEventListener('click', () => run(true));
})();
