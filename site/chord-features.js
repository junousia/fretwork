
// Chord "builder" features, derived from a chord's intervals (so any chord
// added to CHORDS is picked up automatically). Pick-one groups: third,
// seventh. The rest are independent on/off flags.
/** @type {{id:string, label:string, radio?:boolean, items:[string, string][]}[]} */
export const FEATURE_GROUPS=[
  {id:'third',label:'Third',radio:true,items:[['major','Major'],['minor','Minor'],['sus2','sus2'],['sus4','sus4'],['power','No 3rd']]},
  {id:'seventh',label:'Seventh',radio:true,items:[['6','6'],['7','7'],['maj7','maj7'],['dim7','dim7']]},
  {id:'fifth',label:'Fifth',items:[['b5','\u266d5'],['#5','\u266f5']]},
  {id:'ext',label:'Extensions',items:[['add9','add9'],['9','9'],['11','11'],['13','13']]},
  {id:'alt',label:'Alterations',items:[['b9','\u266d9'],['#9','\u266f9'],['#11','\u266f11'],['b13','\u266d13']]},
];
/** The builder features of a chord, derived from its intervals. @param {number[]} iv @returns {Set<string>} */
export function chordFeatures(iv){
  const h=new Set(iv.map(x=>x%12)), f=new Set();
  const major=h.has(4), minor=h.has(3)&&!major;
  const third=major?'major':minor?'minor':h.has(2)&&!h.has(5)?'sus2':h.has(5)?'sus4':'power';
  f.add(third);
  const b5=h.has(6)&&!h.has(7), s5=h.has(8)&&!h.has(7);
  if(b5) f.add('b5'); if(s5) f.add('#5');
  const dim7=minor&&b5&&h.has(9)&&!h.has(10)&&!h.has(11);
  const seventh=h.has(11)?'maj7':h.has(10)?'7':dim7?'dim7':null;
  if(seventh) f.add(seventh);
  if(h.has(9)&&!seventh&&!dim7) f.add('6');
  if(h.has(9)&&seventh&&!dim7) f.add('13');
  if(h.has(2)&&third!=='sus2') f.add(!seventh&&!h.has(9)&&(major||minor)?'add9':'9');
  if(h.has(5)&&(major||minor)) f.add('11');
  if(h.has(6)&&h.has(7)) f.add('#11');
  if(h.has(1)) f.add('b9');
  if(h.has(3)&&major) f.add('#9');
  if(h.has(8)&&h.has(7)) f.add('b13');
  return f;
}

