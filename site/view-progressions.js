import { parseChord, detectKey, BLUES_NOTE, keyName, spell, chordFlats, esc } from './music.js';
import { getPositions, positionFrets } from './positions.js';
import { board, fitBoard, voicingSpan } from './board.js';
import { play, chordMidiNotes } from './audio.js';
import { PROGRESSION_LIBRARY, progressionText, libraryOptions, keyForTemplate, keyValue } from './progressions.js';
import { getInstrument, getInstrumentId, getSetup, applySetup, onInstrumentChange } from './instrument.js';
import { encodeProgression, decodeProgression, tabOf } from './share.js';
import { clampBpm, clampBeats } from './transport.js';
import { startProgression, playNotes } from './player.js';
import { arpeggioAround, arpeggioInSets, arpeggioNotes, upAndDown } from './arpeggio.js';
import { playbackFold, bindStrum } from './playback-ui.js';
import { getStrum } from './strum-patterns.js';
import { lightNotes, clearLit, createScope } from './live.js';
import { expandChart } from './chart.js';
import { setFocus } from './focus.js';
import { chordScales, scalesInKey, readPick, pickId } from './scalefit.js';
import { loadVoicings, getVoicings, voicingDiagram, voicingGallery } from './voicings.js';

const STORE_KEY = 'gtr-progressions-v1';


export function mount(root){
  root.innerHTML = `
    <header>
      <h1>Progressions</h1>
      <p class="lead">Type a chord progression. Each chord gets the scales that fit it, ranked for the key you're in, with the notes laid out on the neck.</p>
    </header>
    <section>
      <label class="big" for="pr-prog">Chords</label>
      <textarea id="pr-prog" rows="2" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
      <div class="row">
        <label class="keylab" title="The key the chords are analysed in. Auto works it out from the chords; pick a key to set it yourself - and to play a loaded progression in that key.">Key <select id="pr-key"></select></label>
        <label class="keylab">Load <select id="pr-libprog" aria-label="Load an example or common progression"></select></label>
        <button type="button" class="share" id="pr-clear" title="Remove all the chords and start again (press again to bring them back)">Clear</button>
      </div>
      <details class="fold" id="pr-syntax"><summary>Repeats and bar lines</summary>
        <p class="hint"><code>(Am F)x2</code> plays a group twice, <code>|: Am F :|</code> a repeat (<code>:|x3</code> three times), <code>%</code> the previous bar, <code>|</code> a bar line.</p></details>
      <p id="pr-err" class="err" hidden></p>
    </section>
    <div class="stickybar" role="group" aria-label="Playback">
      <button type="button" class="play" id="pr-run">\u25B6 Play progression</button>
    </div>
    <canvas class="scope" id="pr-scope" hidden aria-hidden="true"></canvas>
    <div class="sharebar" role="group" aria-label="Sharing">
      <button type="button" class="share" id="pr-share">Copy link</button>
      <span class="vometa" id="pr-msg" role="status" aria-live="polite"></span>
    </div>
    ${playbackFold('pr', '<label class="keylab">Beats per chord <select id="pr-beats"><option>1</option><option>2</option><option>4</option><option>8</option></select></label>')}
    <nav class="strip" id="pr-strip" aria-label="Chords in the progression"></nav>
    <section id="pr-detail"></section>
    <p class="foot">Separate chords with spaces. Understands names like C, Am, F#m7b5, Bb7, Ebmaj7, G7b9, Dsus4, Cdim7 and slash chords like G/B. Use the arrow keys to step through the chords.</p>
  `;

  const prog=root.querySelector('#pr-prog'), keySel=root.querySelector('#pr-key'), strip=root.querySelector('#pr-strip'),
        detail=root.querySelector('#pr-detail'), err=root.querySelector('#pr-err'),
        libProgSel=root.querySelector('#pr-libprog');

  const state={text:'Am7 D7 Gmaj7 Cmaj7 F#m7b5 B7 Em',key:'auto',labels:'notes',sel:0,pick:{},pos:{},vo:{},bpm:90,beats:4,loop:true,metro:false};
  try{const saved=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(saved) Object.assign(state,{text:saved.text??state.text,key:saved.key||'auto',labels:saved.labels||'notes',pos:saved.pos||{},vo:saved.vo||{},bpm:clampBpm(saved.bpm??90),beats:clampBeats(saved.beats),loop:saved.loop!==false,metro:!!saved.metro});}catch(e){}
  // A shared link (#progressions?c=...) wins over the saved state.
  function applyShared(sh){ state.text=sh.text; state.key=sh.key||'auto'; state.pick=sh.pick||{}; state.pos=sh.pos||{}; state.vo=sh.vo||{}; state.sel=0; }
  if(tabOf(location.hash)==='progressions'){ const sh=decodeProgression(location.hash); if(sh) applyShared(sh); }
  // Only the per-chord choices that still apply to the current chords.
  function sharedState(){
    const names=new Set(parsed.map(c=>c.name));
    const keep=(o,pick)=>Object.fromEntries(Object.entries(o).filter(([k])=>!parsed.length||pick(k)));
    const su=getSetup();
    return {text:state.text,key:state.key,instrument:su.instrument,tuning:su.tuning,capo:su.capo,leftHanded:su.leftHanded,pick:keep(state.pick,k=>+k<parsed.length),
      pos:keep(state.pos,k=>names.has(k.split('|')[0])),vo:keep(state.vo,k=>names.has(k))};
  }
  function syncUrl(){
    if(tabOf(location.hash)!=='progressions') return;
    try{history.replaceState(null,'','#progressions?'+encodeProgression(sharedState()));}catch(e){}
  }
  function save(){try{localStorage.setItem(STORE_KEY,JSON.stringify({text:state.text,key:state.key,labels:state.labels,pos:state.pos,vo:state.vo,bpm:state.bpm,beats:state.beats,loop:state.loop,metro:state.metro}));}catch(e){} syncUrl();}

  prog.value=state.text;
  // Playback options start folded on phones, open where there is room.

  // One menu of progressions (common ones, blues, jazz, classics). They are written as degrees and played in the key chosen in the Key
  // menu (the tonic of that key, with the progression's own mode); picking a key while one is loaded transposes it.
  libProgSel.innerHTML=libraryOptions(esc);
  let loadedText=null; // the text of the loaded progression, until you edit it
  function applyLibrary(){
    const v=libProgSel.value;
    if(!v) return;
    const tpl=PROGRESSION_LIBRARY[+v], k=keyForTemplate(tpl,state.key);
    state.key=keyValue(k);
    const text=progressionText(tpl,k); loadedText=text;
    stopPlayback();prog.value=text;state.text=text;state.sel=0;state.pick={};save();render();
  }
  libProgSel.addEventListener('change',applyLibrary);
  // Clear empties the chord box (and the scale and voicing choices made for it); pressing it again brings the chords back
  const clearBtn=root.querySelector('#pr-clear'); let cleared=null;
  function syncClear(){ clearBtn.textContent=cleared?'Undo clear':'Clear'; clearBtn.disabled=!cleared&&!state.text.trim(); }
  clearBtn.onclick=()=>{
    stopPlayback();
    if(cleared){ Object.assign(state,cleared); cleared=null; prog.value=state.text; }
    else { cleared={text:state.text,pick:state.pick,pos:state.pos,vo:state.vo,sel:state.sel}; Object.assign(state,{text:'',pick:{},pos:{},vo:{},sel:0}); prog.value=''; libProgSel.value=''; loadedText=null; }
    save(); render(); if(!cleared) return; prog.focus();
  };

  let parsed=[], key=null, sugs=[];
  function buildKeySelect(detected){
    let h=`<option value="auto">Auto${detected?' ('+esc(keyName(detected))+')':''}</option>`;
    for(const mode of /** @type {('major'|'minor')[]} */ (['major','minor'])) for(let t=0;t<12;t++){const k={t,mode};h+=`<option value="${t}:${mode}">${esc(keyName(k))}</option>`;}
    keySel.innerHTML=h; keySel.value=state.key;
    if(keySel.value!==state.key){state.key='auto';keySel.value='auto';}
  }
  function render(){
    syncClear();
    const chart=expandChart(state.text), toks=chart.bars.flat();
    const bad=[]; parsed=[];
    toks.forEach(t=>{const c=parseChord(t); if(c) parsed.push(c); else bad.push(t);});
    const msgs=[];
    if(bad.length) msgs.push(`Couldn’t read ${[...new Set(bad)].map(b=>'“'+b+'”').join(', ')}. Use chord names like Am7, F#m7b5, Bb7 or G/B.`);
    msgs.push(...chart.problems.map(p=>p[0].toUpperCase()+p.slice(1)+'.'));
    if(msgs.length){err.hidden=false;err.textContent=msgs.join(' ');}
    else err.hidden=true;
    const detected=parsed.length?detectKey(parsed):null;
    buildKeySelect(detected);
    if(!parsed.length){strip.innerHTML='';detail.innerHTML='<p class="empty">Type some chords above, separated by spaces. For example: Dm7 G7 Cmaj7. Repeat with (Am F)x2 or |: Am F :|.</p>';return;}
    if(state.key==='auto') key=detected; else {const [t,mode]=state.key.split(':');key={t:+t,mode};}
    if(state.sel>=parsed.length) state.sel=0;
    sugs=parsed.map(c=>({inKey:scalesInKey(c,key,parsed),chord:chordScales(c,key,parsed)}));
    strip.innerHTML=parsed.map((c,i)=>{
      const p=pickFor(i);
      const vc=voicingChoice(i);
      return `<button class="chip" type="button" data-i="${i}" aria-pressed="${i===state.sel}"><b>${esc(c.name)}</b>${vc.idx>=0?voicingDiagram(vc.list[vc.idx],{size:.85,label:false,mirror:getInstrument().leftHanded}):''}<span>${p?esc(p.s.short):'No match'}</span></button>`;
    }).join('');
    strip.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{state.sel=+b.dataset.i;render();});
    markPlaying();
    renderDetail();
  }
  // Selected scale position(s) + chosen scale for chord i, or null.
  function posInfo(i){
    const c=parsed[i], cur=pickFor(i); if(!cur) return null;
    const inst=getInstrument(), positions=getPositions(cur.s.iv,cur.root,inst.tuning), posKey=`${c.name}|${pickId(cur.s.id,cur.root,c.root)}`;
    let pCur=state.pos[posKey]??'all';
    if(Array.isArray(pCur)){ pCur=pCur.filter(n=>positions.some(p=>p.n===n)); if(!pCur.length) pCur='all'; }
    else if(pCur!=='all'&&!positions.some(p=>p.n===pCur)) pCur='all';
    return {c,cur,inst,positions,posKey,pCur};
  }
  // The voicing shown for chord i: the one the user picked, else the one that
  // best fits the selected scale position(s), else the lowest on the neck.
  function voicingChoice(i){
    const info=posInfo(i); if(!info) return {list:[],idx:-1,info:null};
    const {c,inst,positions,cur,pCur}=info, list=getVoicings(inst,c.root,c.suf);
    if(!list.length) return {list,idx:-1,info};
    const ov=state.vo[c.name]; if(Number.isInteger(ov)&&list[ov]) return {list,idx:ov,info};
    if(pCur==='all') return {list,idx:0,info};
    let lo=99,hi=0;
    for(const n of (Array.isArray(pCur)?pCur:[pCur])){
      const k=positions.findIndex(p=>p.n===n);
      positionFrets(positions,k,cur.s.iv,cur.root,inst.tuning,inst.midi).forEach(set=>set.forEach(f=>{lo=Math.min(lo,f);hi=Math.max(hi,f);}));
    }
    const mid=(lo+hi)/2; let best=0,bd=1e9;
    list.forEach((v,k)=>{ const fs=v.f.filter(f=>f>0), vm=fs.length?(Math.min(...fs)+Math.max(...fs))/2:0, d=Math.abs(vm-mid); if(d<bd){bd=d;best=k;} });
    return {list,idx:best,info};
  }
  // The scale position that contains the most of a voicing's fretted notes.
  function positionForVoicing(info,v){
    let best=info.positions[0].n,bc=-1;
    info.positions.forEach((p,k)=>{
      const sets=positionFrets(info.positions,k,info.cur.s.iv,info.cur.root,info.inst.tuning,info.inst.midi);
      const hit=v.f.filter((f,j)=>f>=0&&sets[j].has(f)).length;
      if(hit>bc){bc=hit;best=p.n;}
    });
    return best;
  }
  function pickFor(i){
    const g=sugs[i]; if(!g) return null;
    const all=[...g.chord,...g.inKey]; if(!all.length) return null;
    const pk=readPick(state.pick[i],parsed[i].root);
    return (pk&&all.find(x=>x.s.id===pk.id&&x.root===pk.root))||all[0];
  }
  let refit=()=>{};
  root.addEventListener('fw-shown',()=>refit());
  function renderDetail(){
    const i=state.sel, c=parsed[i], groups=sugs[i], cur=pickFor(i), flats=chordFlats(c,key);
    if(cur) setFocus({chord:{root:c.root,suffix:c.suf},scale:{root:cur.root,id:cur.s.id}}); // Scales and Chords open on this chord and scale
    const tones=c.iv.map(x=>spell(c.root+x,flats)).join(' ');
    let h=`<div class="chordhead"><h2>${esc(c.name)}</h2><p>Chord tones ${esc(tones)}, in ${esc(keyName(key))}</p></div>`;
    if(!cur){detail.innerHTML=h+'<p class="empty">No scale in the list fits this chord cleanly.</p>';return;}
    const inst=getInstrument();
    const positions=getPositions(cur.s.iv,cur.root,inst.tuning);
    const posKey=`${c.name}|${pickId(cur.s.id,cur.root,c.root)}`;
    let pCur=state.pos[posKey]??'all';
    if(Array.isArray(pCur)){ pCur=pCur.filter(n=>positions.some(p=>p.n===n)); if(!pCur.length) pCur='all'; }
    else if(pCur!=='all'&&!positions.some(p=>p.n===pCur)) pCur='all';
    // the board draws a scale from the chord it is given: when the scale starts elsewhere than the chord (A minor pentatonic over Dm7) it is drawn from the scale's root
    const boardChord=cur.root===c.root?c:{...c,root:cur.root,iv:c.iv.map(x=>((c.root+x-cur.root)%12+12)%12)};
    const boardOpts={tuning:inst.tuning,stringWidths:inst.stringWidths,leftHanded:inst.leftHanded,capo:inst.capo};
    let runNotes=null; // MIDI list: the actual notes of the selected position(s)
    if(pCur!=='all'){
      const idxs=(Array.isArray(pCur)?pCur:[pCur]).map(n=>positions.findIndex(p=>p.n===n));
      boardOpts.dimRange={s:Math.min(...idxs.map(i=>positions[i].s)),e:Math.max(...idxs.map(i=>positions[i].e))};
      const sets=idxs.map(i=>positionFrets(positions,i,cur.s.iv,cur.root,inst.tuning,inst.midi));
      boardOpts.brightSets=inst.tuning.map((_,j)=>{ const set=new Set();
        for(const s of sets) s[j].forEach(f=>set.add(f));
        return set;
      });
      runNotes=inst.midi.flatMap((open,j)=>[...boardOpts.brightSets[j]].map(f=>open+f));
    }
    const vc=voicingChoice(i), vo=vc.idx>=0?vc.list[vc.idx]:null;
    if(vo) boardOpts.voicingRing=vo;
    const voRow=vo?`<h3 class="vh">Voicings <span class="hint">tap one to use it here and in the playback</span></h3>${voicingGallery(vc.list,vc.idx,{id:'pr-voseg',mirror:inst.leftHanded})}`:'';
    h+=`<div class="boardbar"><div class="scaletitle">${esc(spell(cur.root,flats))} ${esc(cur.s.name)}</div>
      <div class="controls"><div class="seg" role="group" aria-label="Fretboard labels">
        <button type="button" data-l="notes" aria-pressed="${state.labels==='notes'}">Note names</button>
        <button type="button" data-l="intervals" aria-pressed="${state.labels==='intervals'}">Intervals</button></div>
        <button type="button" class="play" id="pr-play">\u25B6 Play chord and scale</button>
        <button type="button" class="share" id="pr-arpplay" title="The chord tones shown: inside the selected position, else around the chosen voicing">Play arpeggio</button></div></div>
      <div class="row"><a class="share open" id="pr-tochords" href="#chords?r=${c.root}&s=${encodeURIComponent(c.suf)}">Voicings in Chords</a><a class="share open" id="pr-toscales" href="#scales?r=${cur.root}&s=${cur.s.id}&cr=${c.root}&cs=${encodeURIComponent(c.suf)}">${esc(spell(cur.root,flats))} ${esc(cur.s.short||cur.s.name)} in Scales</a></div>
      <div class="row"><label class="keylab">Position <div class="seg" id="pr-posseg" role="group" aria-label="Fretboard position">${['all',...positions.map(p=>p.n)].map(p=>
        `<button type="button" data-pos="${p}" title="${p==='all'?'Whole neck':'Toggle this position'}" aria-pressed="${p==='all'?pCur==='all':(Array.isArray(pCur)?pCur.includes(p):pCur===p)}">${p==='all'?'All':p}</button>`).join('')}</div></label></div>
      ${voRow}
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(boardChord,cur,state.labels,flats,boardOpts)}</div>
      <div class="legend"><span><i style="background:#C23B2E"></i>Root</span><span><i style="background:#E3A21A"></i>Chord tone, safe landing note</span><span><i style="background:#EDE6D6;border:1px solid var(--muted)"></i>Other scale note</span></div>
      `;
    /** @param {string} title @param {string} note @param {any[]} list */
    const SHOWN=6;
    /** @param {any} x */
    const row=x=>{
      const pk=pickId(x.s.id,x.root,c.root), cover=Math.round(x.cover*100);
      const badge=x.inKey===1?'<span class="badge">In key</span>':'';
      const blue=x.blue.length?` ${BLUES_NOTE}`:'';
      return `<button type="button" class="srow" data-id="${pk}" aria-pressed="${x.s.id===cur.s.id&&x.root===cur.root}">
          <div class="top"><span class="nm">${esc(spell(x.root,flats))} ${esc(x.s.name)}</span>${badge}<span class="notes">${esc(x.abs.map(p=>spell(p,flats)).join(' '))}</span></div>
          <div class="ds">${esc(x.s.d)}${esc(blue)} <span class="fit">Fit ${Math.round(x.score*100)}% (${cover}% of the chord’s notes).</span></div></button>`;
    };
    /** @param {string} title @param {string} note @param {any[]} list */
    const section=(title,note,list)=>{
      // keep a chosen scale in view even when it ranks below the first rows
      const chosen=list.findIndex(x=>x.s.id===cur.s.id&&x.root===cur.root), open=chosen>=SHOWN;
      h+=`<div class="scalecol"><h3>${esc(title)}</h3><p class="hint">${esc(note)}</p><div class="scales">`;
      if(!list.length) h+='<p class="empty">Nothing here fits this chord well enough.</p>';
      h+=list.slice(0,SHOWN).map(row).join('');
      if(list.length>SHOWN) h+=`<details class="more"${open?' open':''}><summary>${list.length-SHOWN} more</summary>${list.slice(SHOWN).map(row).join('')}</details>`;
      h+='</div></div>';
    };
    h+='<div class="scalecols">';
    section('Scales in the key','The scales of '+keyName(key)+' itself (from '+spell(key.t,chordFlats(c,key))+', using only its notes and any the chords borrow), ranked by how well they fit '+c.name+'.',groups.inKey);
    section('Scales for '+c.name,'Scales starting on '+spell(c.root,flats)+', ranked by how well they describe the chord and how much of the key they stay in.',groups.chord);
    h+='</div>';
    detail.innerHTML=h;
    detail.querySelectorAll('.srow').forEach(b=>b.onclick=()=>{state.pick[i]=b.dataset.id;render();});
    const span=boardOpts.dimRange||(vo?voicingSpan(vo):null);
    refit=()=>fitBoard(detail.querySelector('.board'),span,inst.leftHanded); refit();
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
    // Arpeggio: the chord tones inside the selected scale position, else the
    // arpeggio shape around the chosen voicing.
    const arpBtn=detail.querySelector('#pr-arpplay');
    const chordPcs=c.iv.map(x=>(c.root+x)%12);
    const arpSets=boardOpts.brightSets?arpeggioInSets(boardOpts.brightSets,inst,chordPcs):(vo?arpeggioAround(vo,inst,chordPcs):null);
    if(arpSets&&arpeggioNotes(arpSets,inst).length) arpBtn.onclick=()=>playNotes(upAndDown(arpeggioNotes(arpSets,inst))); else arpBtn.disabled=true;
    detail.querySelector('#pr-play').onclick=()=>play(c,cur.s,getInstrument().audioOffset,runNotes,vo?vo.f.map((f,j)=>f>=0?inst.midi[j]+f:null).filter(m=>m!==null):null,cur.root);
  }

  let deb;
  prog.addEventListener('input',()=>{cleared=null; clearTimeout(deb);libProgSel.value=''; loadedText=null; deb=setTimeout(()=>{stopPlayback();state.text=prog.value;state.pick={};save();render();},250);});
  keySel.addEventListener('change',()=>{state.key=keySel.value; if(libProgSel.value&&loadedText!==null&&prog.value===loadedText&&state.key!=='auto') applyLibrary(); else {save();render();}});
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
      const shape=vc.idx>=0?vc.list[vc.idx].f.map((f,j)=>f>=0?{s:j,f,m:inst.midi[j]+f}:null).filter(x=>x!==null):undefined;
      return {midi,shape}; });
  }
  const scope=createScope(root.querySelector('#pr-scope'));
  function setRunning(on){ runBtn.textContent=on?'\u25A0 Stop':'\u25B6 Play progression'; runBtn.setAttribute('aria-pressed',String(on)); if(on) scope.start(); else { scope.stop(); clearLit(detail); } }
  runBtn.onclick=()=>{
    if(player){ stopPlayback(); return; }
    if(!parsed.length) return;
    setRunning(true);
    player=startProgression({chords:chordsToPlay(),bpm:state.bpm,beats:state.beats,loop:state.loop,metronome:state.metro,strum:getStrum(),onNotes:(notes,ms)=>lightNotes(detail,getInstrument(),notes,ms),
      onChord:i=>{ playIdx=i; markPlaying(); if(i>=0&&i!==state.sel){ state.sel=i; strip.querySelectorAll('.chip').forEach((b,k)=>b.setAttribute('aria-pressed',String(k===i))); renderDetail(); } },
      onEnd:()=>{ player=null; setRunning(false); }});
  };
  bindStrum(root,'pr');
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
    if(encodeProgression({...sh,instrument:sh.instrument||'guitar'})===encodeProgression(sharedState())) return;
    stopPlayback(); applyShared(sh); prog.value=state.text;
    applySetup({instrument:sh.instrument||'guitar',tuning:sh.tuning||'standard',capo:sh.capo||0,leftHanded:sh.leftHanded===true});
    render();
  });
  render();
  loadVoicings().then(()=>render());
  onInstrumentChange(() => { stopPlayback(); if(parsed.length) render(); syncUrl(); });
}
