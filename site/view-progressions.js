import { parseChord, detectKey, suggest, keyName, spell, chordFlats, getPositions, positionFrets, board, play, chordMidiNotes, esc, PROGRESSION_LIBRARY, progressionText } from './theory.js';
import { getInstrument, getInstrumentId, setInstrument, onInstrumentChange } from './instrument.js';
import { encodeProgression, decodeProgression, tabOf } from './share.js';
import { clampBpm, clampBeats } from './transport.js';
import { startProgression } from './player.js';
import { loadVoicings, getVoicings, voicingLabel, voicingDiagram } from './voicings.js';

const STORE_KEY = 'gtr-progressions-v1';

const EXAMPLES=[
  ['Autumn-style changes','Am7 D7 Gmaj7 Cmaj7 F#m7b5 B7 Em'],
  ['ii–V–I in C','Dm7 G7 Cmaj7'],
  ['12-bar blues in A','A7 D7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7'],
  ['Pop in G','G D Em C'],
  ['Minor groove','Am7 Dm7 Am7 E7']
];
const BLUES_NOTE='Blues sound: the minor 3rd rubs against the chord’s major 3rd on purpose. Bend it up a little.';

export function mount(root){
  root.innerHTML = `
    <header>
      <h1>Over the changes</h1>
      <p class="lead">Type a chord progression. Each chord gets the scales that fit it, ranked for the key you're in, with the notes laid out on the neck.</p>
    </header>
    <section>
      <label class="big" for="pr-prog">Chords</label>
      <textarea id="pr-prog" rows="2" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
      <div class="row">
        <label class="keylab">Key <select id="pr-key"></select></label>
      </div>
      <div class="examples" id="pr-examples">Try one:</div>
      <div class="row">
        <label class="keylab">Common progressions <select id="pr-libprog"></select></label>
        <label class="keylab">in <select id="pr-libkey"></select></label>
      </div>
      <p id="pr-err" class="err" hidden></p>
    </section>
    <div class="transport" role="group" aria-label="Playback and sharing">
      <button type="button" class="play" id="pr-run">\u25B6 Play progression</button>
      <label class="keylab">Tempo <input id="pr-bpm" type="number" min="40" max="220" step="1" inputmode="numeric"> BPM</label>
      <label class="keylab">Beats per chord <select id="pr-beats"><option>1</option><option>2</option><option>4</option><option>8</option></select></label>
      <label class="chk"><input type="checkbox" id="pr-loop"> Loop</label>
      <label class="chk"><input type="checkbox" id="pr-metro"> Click</label>
      <button type="button" class="share" id="pr-share">Copy link</button>
      <span class="vometa" id="pr-msg" role="status" aria-live="polite"></span>
    </div>
    <nav class="strip" id="pr-strip" aria-label="Chords in the progression"></nav>
    <section id="pr-detail"></section>
    <p class="foot">Separate chords with spaces. Understands names like C, Am, F#m7b5, Bb7, Ebmaj7, G7b9, Dsus4, Cdim7 and slash chords like G/B. Use the arrow keys to step through the chords.</p>
  `;

  const prog=root.querySelector('#pr-prog'), keySel=root.querySelector('#pr-key'), strip=root.querySelector('#pr-strip'),
        detail=root.querySelector('#pr-detail'), err=root.querySelector('#pr-err'), ex=root.querySelector('#pr-examples'),
        libProgSel=root.querySelector('#pr-libprog'), libKeySel=root.querySelector('#pr-libkey');

  const state={text:EXAMPLES[0][1],key:'auto',labels:'notes',sel:0,pick:{},pos:{},vo:{},bpm:90,beats:4,loop:true,metro:false};
  try{const saved=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(saved) Object.assign(state,{text:saved.text??state.text,key:saved.key||'auto',labels:saved.labels||'notes',pos:saved.pos||{},vo:saved.vo||{},bpm:clampBpm(saved.bpm??90),beats:clampBeats(saved.beats),loop:saved.loop!==false,metro:!!saved.metro});}catch(e){}
  // A shared link (#progressions?c=...) wins over the saved state.
  function applyShared(sh){ state.text=sh.text; state.key=sh.key||'auto'; state.pick=sh.pick||{}; state.pos=sh.pos||{}; state.vo=sh.vo||{}; state.sel=0; }
  if(tabOf(location.hash)==='progressions'){ const sh=decodeProgression(location.hash); if(sh) applyShared(sh); }
  // Only the per-chord choices that still apply to the current chords.
  function sharedState(){
    const names=new Set(parsed.map(c=>c.name));
    const keep=(o,pick)=>Object.fromEntries(Object.entries(o).filter(([k])=>!parsed.length||pick(k)));
    return {text:state.text,key:state.key,instrument:getInstrumentId(),pick:keep(state.pick,k=>+k<parsed.length),
      pos:keep(state.pos,k=>names.has(k.split('|')[0])),vo:keep(state.vo,k=>names.has(k))};
  }
  function syncUrl(){
    if(tabOf(location.hash)!=='progressions') return;
    try{history.replaceState(null,'','#progressions?'+encodeProgression(sharedState()));}catch(e){}
  }
  function save(){try{localStorage.setItem(STORE_KEY,JSON.stringify({text:state.text,key:state.key,labels:state.labels,pos:state.pos,vo:state.vo,bpm:state.bpm,beats:state.beats,loop:state.loop,metro:state.metro}));}catch(e){} syncUrl();}

  prog.value=state.text;
  EXAMPLES.forEach(([label,text])=>{const b=document.createElement('button');b.type='button';b.textContent=label;
    b.onclick=()=>{stopPlayback();prog.value=text;state.text=text;state.sel=0;state.pick={};save();render();};ex.appendChild(b);});

  libProgSel.innerHTML=PROGRESSION_LIBRARY.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('');
  let libKeyHtml='';
  for(const mode of ['major','minor']) for(let t=0;t<12;t++){const k={t,mode};libKeyHtml+=`<option value="${t}:${mode}">${esc(keyName(k))}</option>`;}
  libKeySel.innerHTML=libKeyHtml; libKeySel.value='0:major';
  function applyLibrary(){
    const tpl=PROGRESSION_LIBRARY[+libProgSel.value]; const [t,mode]=libKeySel.value.split(':');
    const text=progressionText(tpl,{t:+t,mode});
    stopPlayback();prog.value=text;state.text=text;state.sel=0;state.pick={};save();render();
  }
  libProgSel.addEventListener('change',applyLibrary);
  libKeySel.addEventListener('change',applyLibrary);

  let parsed=[], key=null, sugs=[];
  function buildKeySelect(detected){
    let h=`<option value="auto">Auto${detected?' ('+esc(keyName(detected))+')':''}</option>`;
    for(const mode of ['major','minor']) for(let t=0;t<12;t++){const k={t,mode};h+=`<option value="${t}:${mode}">${esc(keyName(k))}</option>`;}
    keySel.innerHTML=h; keySel.value=state.key;
    if(keySel.value!==state.key){state.key='auto';keySel.value='auto';}
  }
  function render(){
    const toks=state.text.split(/[\s,|]+/).filter(t=>t&&!/^[-–—.:]+$/.test(t));
    const bad=[]; parsed=[];
    toks.forEach(t=>{const c=parseChord(t); if(c) parsed.push(c); else bad.push(t);});
    if(bad.length){err.hidden=false;err.textContent=`Couldn’t read ${bad.map(b=>'“'+b+'”').join(', ')}. Use chord names like Am7, F#m7b5, Bb7 or G/B.`;}
    else err.hidden=true;
    const detected=parsed.length?detectKey(parsed):null;
    buildKeySelect(detected);
    if(!parsed.length){strip.innerHTML='';detail.innerHTML='<p class="empty">Type some chords above, separated by spaces. For example: Dm7 G7 Cmaj7</p>';return;}
    if(state.key==='auto') key=detected; else {const [t,mode]=state.key.split(':');key={t:+t,mode};}
    if(state.sel>=parsed.length) state.sel=0;
    sugs=parsed.map(c=>suggest(c,key));
    strip.innerHTML=parsed.map((c,i)=>{
      const p=pickFor(i);
      const vc=voicingChoice(i);
      return `<button class="chip" type="button" data-i="${i}" aria-pressed="${i===state.sel}"><b>${esc(c.name)}</b>${vc.idx>=0?voicingDiagram(vc.list[vc.idx],{size:.85,label:false}):''}<span>${p?esc(p.s.short):'No match'}</span></button>`;
    }).join('');
    strip.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{state.sel=+b.dataset.i;render();});
    markPlaying();
    renderDetail();
  }
  // Selected scale position(s) + chosen scale for chord i, or null.
  function posInfo(i){
    const c=parsed[i], cur=pickFor(i); if(!cur) return null;
    const inst=getInstrument(), positions=getPositions(cur.s.iv,c.root,inst.tuning), posKey=`${c.name}|${cur.s.id}`;
    let pCur=state.pos[posKey]??'all';
    if(Array.isArray(pCur)){ pCur=pCur.filter(n=>positions.some(p=>p.n===n)); if(!pCur.length) pCur='all'; }
    else if(pCur!=='all'&&!positions.some(p=>p.n===pCur)) pCur='all';
    return {c,cur,inst,positions,posKey,pCur};
  }
  // The voicing shown for chord i: the one the user picked, else the one that
  // best fits the selected scale position(s), else the lowest on the neck.
  function voicingChoice(i){
    const info=posInfo(i); if(!info) return {list:[],idx:-1,info:null};
    const {c,inst,positions,cur,pCur}=info, list=getVoicings(inst.id,c.root,c.suf);
    if(!list.length) return {list,idx:-1,info};
    const ov=state.vo[c.name]; if(Number.isInteger(ov)&&list[ov]) return {list,idx:ov,info};
    if(pCur==='all') return {list,idx:0,info};
    let lo=99,hi=0;
    for(const n of (Array.isArray(pCur)?pCur:[pCur])){
      const k=positions.findIndex(p=>p.n===n);
      positionFrets(positions,k,cur.s.iv,c.root,inst.tuning,inst.midi).forEach(set=>set.forEach(f=>{lo=Math.min(lo,f);hi=Math.max(hi,f);}));
    }
    const mid=(lo+hi)/2; let best=0,bd=1e9;
    list.forEach((v,k)=>{ const fs=v.f.filter(f=>f>0), vm=fs.length?(Math.min(...fs)+Math.max(...fs))/2:0, d=Math.abs(vm-mid); if(d<bd){bd=d;best=k;} });
    return {list,idx:best,info};
  }
  // The scale position that contains the most of a voicing's fretted notes.
  function positionForVoicing(info,v){
    let best=info.positions[0].n,bc=-1;
    info.positions.forEach((p,k)=>{
      const sets=positionFrets(info.positions,k,info.cur.s.iv,info.c.root,info.inst.tuning,info.inst.midi);
      const hit=v.f.filter((f,j)=>f>=0&&sets[j].has(f)).length;
      if(hit>bc){bc=hit;best=p.n;}
    });
    return best;
  }
  function pickFor(i){const list=sugs[i]; if(!list||!list.length) return null; const id=state.pick[i]; return list.find(x=>x.s.id===id)||list[0];}
  function renderDetail(){
    const i=state.sel, c=parsed[i], list=sugs[i], cur=pickFor(i), flats=chordFlats(c,key);
    const tones=c.iv.map(x=>spell(c.root+x,flats)).join(' ');
    let h=`<div class="chordhead"><h2>${esc(c.name)}</h2><p>Chord tones ${esc(tones)}, in ${esc(keyName(key))}</p></div>`;
    if(!cur){detail.innerHTML=h+'<p class="empty">No scale in the list fits this chord cleanly.</p>';return;}
    const inst=getInstrument();
    const positions=getPositions(cur.s.iv,c.root,inst.tuning);
    const posKey=`${c.name}|${cur.s.id}`;
    let pCur=state.pos[posKey]??'all';
    if(Array.isArray(pCur)){ pCur=pCur.filter(n=>positions.some(p=>p.n===n)); if(!pCur.length) pCur='all'; }
    else if(pCur!=='all'&&!positions.some(p=>p.n===pCur)) pCur='all';
    const boardOpts={tuning:inst.tuning,stringWidths:inst.stringWidths};
    let runNotes=null; // MIDI list: the actual notes of the selected position(s)
    if(pCur!=='all'){
      const idxs=(Array.isArray(pCur)?pCur:[pCur]).map(n=>positions.findIndex(p=>p.n===n));
      boardOpts.dimRange={s:Math.min(...idxs.map(i=>positions[i].s)),e:Math.max(...idxs.map(i=>positions[i].e))};
      const sets=idxs.map(i=>positionFrets(positions,i,cur.s.iv,c.root,inst.tuning,inst.midi));
      boardOpts.brightSets=inst.tuning.map((_,j)=>{ const set=new Set();
        for(const s of sets) s[j].forEach(f=>set.add(f));
        return set;
      });
      runNotes=inst.midi.flatMap((open,j)=>[...boardOpts.brightSets[j]].map(f=>open+f));
    }
    const vc=voicingChoice(i), vo=vc.idx>=0?vc.list[vc.idx]:null;
    if(vo) boardOpts.voicingRing=vo;
    const voRow=vo?`<div class="row"><label class="keylab">Voicing <div class="seg" id="pr-voseg" role="group" aria-label="Chord voicing">${vc.list.map((v,k)=>
        `<button type="button" data-vo="${k}" title="${esc(voicingLabel(v))}" aria-pressed="${k===vc.idx}">${k+1}</button>`).join('')}</div></label>
        <span class="vometa">${esc(voicingLabel(vo))}${vo.b?' \u00b7 barre':''}</span></div>
      <div class="vobig">${voicingDiagram(vo,{size:1.5})}</div>`:'';
    h+=`<div class="boardbar"><div class="scaletitle">${esc(spell(c.root,flats))} ${esc(cur.s.name)}</div>
      <div class="controls"><div class="seg" role="group" aria-label="Fretboard labels">
        <button type="button" data-l="notes" aria-pressed="${state.labels==='notes'}">Note names</button>
        <button type="button" data-l="intervals" aria-pressed="${state.labels==='intervals'}">Intervals</button></div>
        <button type="button" class="play" id="pr-play">Play chord and scale</button></div></div>
      <div class="row"><label class="keylab">Position <div class="seg" id="pr-posseg" role="group" aria-label="Fretboard position">${['all',...positions.map(p=>p.n)].map(p=>
        `<button type="button" data-pos="${p}" title="${p==='all'?'Whole neck':'Toggle this position'}" aria-pressed="${p==='all'?pCur==='all':(Array.isArray(pCur)?pCur.includes(p):pCur===p)}">${p==='all'?'All':p}</button>`).join('')}</div></label></div>
      ${voRow}
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(c,cur,state.labels,flats,boardOpts)}</div>
      <div class="legend"><span><i style="background:#C23B2E"></i>Root</span><span><i style="background:#E3A21A"></i>Chord tone, safe landing note</span><span><i style="background:#EDE6D6;border:1px solid var(--muted)"></i>Other scale note</span></div>
      <h3>Scales that fit ${esc(c.name)}</h3><div class="scales">`;
    list.forEach(x=>{
      const badge=x.extra?'<span class="badge alt">Blues sound</span>':x.inKey?'<span class="badge">In key</span>':x.inHarm?'<span class="badge">In key, harmonic minor</span>':'';
      h+=`<button type="button" class="srow" data-id="${x.s.id}" aria-pressed="${x.s.id===cur.s.id}">
        <div class="top"><span class="nm">${esc(spell(c.root,flats))} ${esc(x.s.name)}</span>${badge}<span class="notes">${esc(x.abs.map(p=>spell(p,flats)).join(' '))}</span></div>
        <div class="ds">${esc(x.extra?BLUES_NOTE:x.s.d)}</div></button>`;
    });
    h+='</div>';
    detail.innerHTML=h;
    detail.querySelectorAll('.srow').forEach(b=>b.onclick=()=>{state.pick[i]=b.dataset.id;render();});
    detail.querySelectorAll('.seg button').forEach(b=>{ if(b.dataset.l) b.onclick=()=>{state.labels=b.dataset.l;save();renderDetail();};});
    detail.querySelectorAll('#pr-voseg button').forEach(b=>b.onclick=()=>{
      const k=+b.dataset.vo; state.vo[c.name]=k;
      state.pos[posKey]=[positionForVoicing(vc.info,vc.list[k])];
      save();render();
    });
    detail.querySelectorAll('#pr-posseg button').forEach(b=>b.onclick=()=>{
      delete state.vo[c.name]; // follow the position again
      const v=b.dataset.pos;
      if(v==='all'){ state.pos[posKey]='all'; }
      else{
        const list=Array.isArray(pCur)?[...pCur]:(pCur==='all'?[]:[pCur]);
        const n=+v, at=list.indexOf(n);
        if(at>=0) list.splice(at,1); else list.push(n);
        list.sort((a,b)=>a-b);
        state.pos[posKey]=list.length?list:'all';
      }
      save();renderDetail();
    });
    detail.querySelector('#pr-play').onclick=()=>play(c,cur.s,getInstrument().audioOffset,runNotes,vo?vo.f.map((f,j)=>f>=0?inst.midi[j]+f:null).filter(m=>m!==null):null);
  }

  let deb;
  prog.addEventListener('input',()=>{clearTimeout(deb);deb=setTimeout(()=>{stopPlayback();state.text=prog.value;state.pick={};save();render();},250);});
  keySel.addEventListener('change',()=>{state.key=keySel.value;save();render();});
  document.addEventListener('keydown',e=>{
    if(root.hidden) return;
    if(/^(TEXTAREA|SELECT|INPUT)$/.test(document.activeElement.tagName)||!parsed.length) return;
    if(e.key==='ArrowRight'){state.sel=(state.sel+1)%parsed.length;render();strip.querySelector('[aria-pressed="true"]')?.focus();}
    if(e.key==='ArrowLeft'){state.sel=(state.sel-1+parsed.length)%parsed.length;render();strip.querySelector('[aria-pressed="true"]')?.focus();}
  });
  // --- playback -----------------------------------------------------------
  const runBtn=root.querySelector('#pr-run'), bpmIn=root.querySelector('#pr-bpm'), beatsSel=root.querySelector('#pr-beats'),
        loopCb=root.querySelector('#pr-loop'), metroCb=root.querySelector('#pr-metro'), shareBtn=root.querySelector('#pr-share'), msg=root.querySelector('#pr-msg');
  let player=null, playIdx=-1;
  bpmIn.value=state.bpm; beatsSel.value=String(state.beats); loopCb.checked=state.loop; metroCb.checked=state.metro;
  function markPlaying(){ strip.querySelectorAll('.chip').forEach((b,k)=>b.classList.toggle('playing',k===playIdx)); }
  function stopPlayback(){ if(player){ const p=player; player=null; p.stop(); } }
  function chordsToPlay(){
    const inst=getInstrument();
    return parsed.map((c,i)=>{ const vc=voicingChoice(i);
      const midi=vc.idx>=0?vc.list[vc.idx].f.map((f,j)=>f>=0?inst.midi[j]+f:null).filter(m=>m!==null):chordMidiNotes(c,inst.audioOffset);
      return {midi}; });
  }
  function setRunning(on){ runBtn.textContent=on?'\u25A0 Stop':'\u25B6 Play progression'; runBtn.setAttribute('aria-pressed',String(on)); }
  runBtn.onclick=()=>{
    if(player){ stopPlayback(); return; }
    if(!parsed.length) return;
    setRunning(true);
    player=startProgression({chords:chordsToPlay(),bpm:state.bpm,beats:state.beats,loop:state.loop,metronome:state.metro,
      onChord:i=>{ playIdx=i; markPlaying(); if(i>=0&&i!==state.sel){ state.sel=i; strip.querySelectorAll('.chip').forEach((b,k)=>b.setAttribute('aria-pressed',String(k===i))); renderDetail(); } },
      onEnd:()=>{ player=null; setRunning(false); }});
  };
  bpmIn.onchange=()=>{ state.bpm=clampBpm(bpmIn.value); bpmIn.value=state.bpm; save(); };
  beatsSel.onchange=()=>{ state.beats=clampBeats(beatsSel.value); save(); };
  loopCb.onchange=()=>{ state.loop=loopCb.checked; save(); };
  metroCb.onchange=()=>{ state.metro=metroCb.checked; save(); };
  // Tempo/beat/loop/click changes apply from the next start (stop + play again).
  shareBtn.onclick=async()=>{
    const url=`${location.origin}${location.pathname}#progressions?${encodeProgression(sharedState())}`;
    try{
      if(navigator.share&&matchMedia('(pointer:coarse)').matches){ await navigator.share({title:'Fretwork progression',url}); msg.textContent=''; return; }
      await navigator.clipboard.writeText(url); msg.textContent='Link copied';
    }catch(e){ if(e&&e.name==='AbortError') return; window.prompt('Copy this link',url); }
    setTimeout(()=>{msg.textContent='';},2500);
  };
  // Someone pasted a different shared link into the address bar.
  window.addEventListener('hashchange',()=>{
    if(tabOf(location.hash)!=='progressions') return;
    const sh=decodeProgression(location.hash); if(!sh) return;
    if(encodeProgression({...sh,instrument:sh.instrument||getInstrumentId()})===encodeProgression(sharedState())) return;
    stopPlayback(); applyShared(sh); prog.value=state.text;
    if(sh.instrument&&sh.instrument!==getInstrumentId()) setInstrument(sh.instrument);
    render();
  });
  render();
  loadVoicings().then(()=>render());
  onInstrumentChange(() => { stopPlayback(); if(parsed.length) render(); syncUrl(); });
}
