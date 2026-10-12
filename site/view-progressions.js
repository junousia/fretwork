import { parseChord, detectKey, suggest, keyName, spell, chordFlats, board, play, esc, PROGRESSION_LIBRARY, progressionText } from './theory.js';
import { getInstrument, onInstrumentChange } from './instrument.js';

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
    <nav class="strip" id="pr-strip" aria-label="Chords in the progression"></nav>
    <section id="pr-detail"></section>
    <p class="foot">Separate chords with spaces. Understands names like C, Am, F#m7b5, Bb7, Ebmaj7, G7b9, Dsus4, Cdim7 and slash chords like G/B. Use the arrow keys to step through the chords.</p>
  `;

  const prog=root.querySelector('#pr-prog'), keySel=root.querySelector('#pr-key'), strip=root.querySelector('#pr-strip'),
        detail=root.querySelector('#pr-detail'), err=root.querySelector('#pr-err'), ex=root.querySelector('#pr-examples'),
        libProgSel=root.querySelector('#pr-libprog'), libKeySel=root.querySelector('#pr-libkey');

  const state={text:EXAMPLES[0][1],key:'auto',labels:'notes',sel:0,pick:{}};
  try{const saved=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(saved) Object.assign(state,{text:saved.text??state.text,key:saved.key||'auto',labels:saved.labels||'notes'});}catch(e){}
  function save(){try{localStorage.setItem(STORE_KEY,JSON.stringify({text:state.text,key:state.key,labels:state.labels}));}catch(e){}}

  prog.value=state.text;
  EXAMPLES.forEach(([label,text])=>{const b=document.createElement('button');b.type='button';b.textContent=label;
    b.onclick=()=>{prog.value=text;state.text=text;state.sel=0;state.pick={};save();render();};ex.appendChild(b);});

  libProgSel.innerHTML=PROGRESSION_LIBRARY.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('');
  let libKeyHtml='';
  for(const mode of ['major','minor']) for(let t=0;t<12;t++){const k={t,mode};libKeyHtml+=`<option value="${t}:${mode}">${esc(keyName(k))}</option>`;}
  libKeySel.innerHTML=libKeyHtml; libKeySel.value='0:major';
  function applyLibrary(){
    const tpl=PROGRESSION_LIBRARY[+libProgSel.value]; const [t,mode]=libKeySel.value.split(':');
    const text=progressionText(tpl,{t:+t,mode});
    prog.value=text;state.text=text;state.sel=0;state.pick={};save();render();
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
      return `<button class="chip" type="button" data-i="${i}" aria-pressed="${i===state.sel}"><b>${esc(c.name)}</b><span>${p?esc(p.s.short):'No match'}</span></button>`;
    }).join('');
    strip.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{state.sel=+b.dataset.i;render();});
    renderDetail();
  }
  function pickFor(i){const list=sugs[i]; if(!list||!list.length) return null; const id=state.pick[i]; return list.find(x=>x.s.id===id)||list[0];}
  function renderDetail(){
    const i=state.sel, c=parsed[i], list=sugs[i], cur=pickFor(i), flats=chordFlats(c,key);
    const tones=c.iv.map(x=>spell(c.root+x,flats)).join(' ');
    let h=`<div class="chordhead"><h2>${esc(c.name)}</h2><p>Chord tones ${esc(tones)}, in ${esc(keyName(key))}</p></div>`;
    if(!cur){detail.innerHTML=h+'<p class="empty">No scale in the list fits this chord cleanly.</p>';return;}
    h+=`<div class="boardbar"><div class="scaletitle">${esc(spell(c.root,flats))} ${esc(cur.s.name)}</div>
      <div class="controls"><div class="seg" role="group" aria-label="Fretboard labels">
        <button type="button" data-l="notes" aria-pressed="${state.labels==='notes'}">Note names</button>
        <button type="button" data-l="intervals" aria-pressed="${state.labels==='intervals'}">Intervals</button></div>
        <button type="button" class="play" id="pr-play">Play chord and scale</button></div></div>
      <div class="board" tabindex="0" aria-label="Fretboard, scroll sideways">${board(c,cur,state.labels,flats,{tuning:getInstrument().tuning,stringWidths:getInstrument().stringWidths})}</div>
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
    detail.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{state.labels=b.dataset.l;save();renderDetail();});
    detail.querySelector('#pr-play').onclick=()=>play(c,cur.s,getInstrument().audioOffset);
  }

  let deb;
  prog.addEventListener('input',()=>{clearTimeout(deb);deb=setTimeout(()=>{state.text=prog.value;state.pick={};save();render();},250);});
  keySel.addEventListener('change',()=>{state.key=keySel.value;save();render();});
  document.addEventListener('keydown',e=>{
    if(root.hidden) return;
    if(/^(TEXTAREA|SELECT|INPUT)$/.test(document.activeElement.tagName)||!parsed.length) return;
    if(e.key==='ArrowRight'){state.sel=(state.sel+1)%parsed.length;render();strip.querySelector('[aria-pressed="true"]')?.focus();}
    if(e.key==='ArrowLeft'){state.sel=(state.sel-1+parsed.length)%parsed.length;render();strip.querySelector('[aria-pressed="true"]')?.focus();}
  });
  render();
  onInstrumentChange(() => { if(parsed.length) renderDetail(); });
}
