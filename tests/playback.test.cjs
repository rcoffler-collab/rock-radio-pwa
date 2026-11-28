const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(process.env.RADIO_APP_SOURCE||path.join(__dirname,'../app.js'),'utf8');
const core=require('../core.js');

class Element extends EventTarget {
  constructor(){super();this.children=[];this.attributes={};this.dataset={};this.className='';this.hidden=false;this.value='';this.textContent='';this.style={setProperty(){}};this.classList={toggle(){},add(){},remove(){}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return key==='src'?this.src||null:this.attributes[key]??null;}
  removeAttribute(key){delete this.attributes[key];if(key==='src')this.src='';}
  querySelector(selector){return this.children.find(child=>child.className===selector.slice(1))||new Element();}
  click(){this.dispatchEvent(new Event('click'));}
}
class Audio extends Element {
  constructor(){super();this.currentTime=0;this.duration=NaN;this.readyState=0;this.paused=true;this.ended=false;this.playbackRate=1;this.pauseCalls=0;this.loadCalls=0;}
  get src(){return this.source;}
  set src(value){this.source=value;this.reset();}
  reset(){this.currentTime=0;this.duration=NaN;this.readyState=0;this.ended=false;this.error=null;this.paused=true;}
  load(){this.loadCalls++;this.reset();}
  pause(){this.pauseCalls++;if(!this.paused){this.paused=true;queueMicrotask(()=>this.dispatchEvent(new Event('pause')));}}
  play(){
    if(this.rejectPlay){this.rejectPlay=false;return Promise.reject(new DOMException('Blocked','NotAllowedError'));}
    this.paused=false;queueMicrotask(()=>this.dispatchEvent(new Event('playing')));return Promise.resolve();}
  end(){this.currentTime=this.duration;this.paused=true;this.ended=true;this.dispatchEvent(new Event('pause'));this.dispatchEvent(new Event('ended'));}
  fail(code){this.error={code};this.paused=true;this.dispatchEvent(new Event('error'));}
  metadata(duration=300){this.duration=duration;this.readyState=1;this.dispatchEvent(new Event('loadedmetadata'));}
  position(seconds){this.currentTime=seconds;this.dispatchEvent(new Event('timeupdate'));}
}
async function boot(saved=new Map(),options={}){
  const elements=new Map(),audio=new Audio();elements.set('audio',audio);
  const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const buttons=['verbus','crab'].map(station=>Object.assign(new Element(),{dataset:{selectStation:station}}));
  const timerButton=Object.assign(new Element(),{dataset:{minutes:'1'}});
  get('sleepDialog').close=()=>{};
  const document=Object.assign(new EventTarget(),{body:new Element(),visibilityState:'visible',getElementById:get,querySelectorAll:selector=>selector==='[data-select-station]'?buttons:selector==='[data-minutes]'?[timerButton]:[],createElement:()=>new Element(),createElementNS:()=>new Element(),createTextNode:text=>({textContent:text})});
  const window=Object.assign(new EventTarget(),{ROCK_PREVIEW:true,RadioCore:core,RadioMedia:{metadata:async()=>({})},ROCK_CONFIG:{storageBaseUrl:'https://music.example.test',remoteCatalogs:false},ROCK_CATALOGS:{verbus:Array.from({length:12},(_,i)=>({id:'v'+i,file:'Verbus '+i+'.mp3',title:'Verbus '+i,artist:'Artist'})),crab:Array.from({length:12},(_,i)=>({id:'c'+i,file:'Crab '+i+'.mp3',title:'Crab '+i,artist:'Artist'}))}});
  let now=10000,writes=0;
  const context={window,document,navigator:{},location:{protocol:'https:',href:'https://radio.example.test/'},localStorage:{getItem:key=>{if(options.blockedStorage)throw Error('denied');return saved.get(key)??null;},setItem:(key,value)=>{if(options.blockedStorage)throw Error('denied');saved.set(key,value);writes++;}},URL:class extends URL{static createObjectURL(){return 'blob:local';}static revokeObjectURL(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},Date:class extends Date{static now(){return now;}}};
  vm.runInNewContext(app,context,{filename:'app.js'});
  await Promise.resolve();await Promise.resolve();
  return {get,audio,window,document,saved,buttons,timerButton,bookmark:station=>JSON.parse(saved.get('rock-v2-playback-'+station)||'null'),advance:ms=>{now+=ms;},writes:()=>writes,select:index=>get('trackList').children[index].children[1].click(),switch:station=>buttons.find(b=>b.dataset.selectStation===station).click()};
}

test('song 10 and its precise position survive leaving and reloading, without autoplay',async()=>{
  const first=await boot();first.select(9);first.audio.metadata();first.audio.position(87.25);
  first.window.dispatchEvent(new Event('pagehide'));
  assert.equal(first.bookmark('verbus').trackId,'v9');assert.equal(first.bookmark('verbus').position,87.25);
  const reloaded=await boot(first.saved);
  assert.equal(reloaded.get('trackTitle').textContent,'Verbus 9');assert.equal(reloaded.audio.paused,true);
  reloaded.audio.metadata();assert.equal(reloaded.audio.currentTime,87.25);assert.equal(reloaded.get('elapsed').textContent,'1:27');
});
test('each station keeps its own song and position while switching during playback',async()=>{
  const radio=await boot();radio.select(9);radio.audio.metadata();radio.audio.position(78);
  radio.switch('crab');radio.audio.metadata();radio.select(4);radio.audio.metadata();radio.audio.position(36);
  radio.switch('verbus');await Promise.resolve();radio.audio.metadata();
  assert.equal(radio.audio.currentTime,78);assert.equal(radio.get('trackTitle').textContent,'Verbus 9');
  assert.equal(radio.bookmark('crab').trackId,'c4');assert.equal(radio.bookmark('crab').position,36);
  radio.switch('crab');radio.audio.metadata();assert.equal(radio.audio.currentTime,36);
});
test('closing again before metadata loads preserves the pending saved position',async()=>{
  const saved=new Map([['rock-v2-playback-verbus',JSON.stringify({trackId:'v9',position:105})]]);
  const radio=await boot(saved);radio.audio.dispatchEvent(new Event('timeupdate'));radio.window.dispatchEvent(new Event('pagehide'));
  assert.equal(radio.bookmark('verbus').position,105);
  const again=await boot(saved);again.audio.metadata();assert.equal(again.audio.currentTime,105);
});
test('pause, seek completion, and backgrounding save immediately; regular playback is throttled',async()=>{
  const radio=await boot();radio.audio.metadata();radio.get('play').click();await Promise.resolve();
  radio.audio.position(20);assert.equal(radio.bookmark('verbus').position,0);
  radio.advance(2100);radio.audio.position(25);assert.equal(radio.bookmark('verbus').position,25);
  const writes=radio.writes();radio.audio.position(26);assert.equal(radio.writes(),writes);
  radio.get('play').click();await Promise.resolve();assert.equal(radio.bookmark('verbus').position,26);
  radio.audio.currentTime=56;radio.audio.dispatchEvent(new Event('seeked'));assert.equal(radio.bookmark('verbus').position,56);
  radio.audio.position(57);radio.document.visibilityState='hidden';radio.document.dispatchEvent(new Event('visibilitychange'));assert.equal(radio.bookmark('verbus').position,57);
});
test('next song starts at zero and is remembered even if leaving before metadata arrives',async()=>{
  const radio=await boot();radio.audio.metadata();radio.audio.position(298);radio.get('next').click();
  await Promise.resolve();radio.window.dispatchEvent(new Event('pagehide'));
  assert.equal(radio.bookmark('verbus').trackId,'v1');assert.equal(radio.bookmark('verbus').position,0);
  const again=await boot(radio.saved);again.audio.metadata();assert.equal(again.get('trackTitle').textContent,'Verbus 1');assert.equal(again.audio.currentTime,0);
});
test('legacy IDs migrate and deleted songs or invalid positions have safe defaults',async()=>{
  let radio=await boot(new Map([['rock-v2-current-verbus',JSON.stringify('v9')]]));radio.audio.metadata();assert.equal(radio.get('trackTitle').textContent,'Verbus 9');assert.equal(radio.audio.currentTime,0);
  for(const position of [-30,'42',null,999]){radio=await boot(new Map([['rock-v2-playback-verbus',JSON.stringify({trackId:'v9',position})]]));radio.audio.metadata();assert.equal(radio.audio.currentTime,0);}
  radio=await boot(new Map([['rock-v2-playback-verbus',JSON.stringify({trackId:'missing',position:99})]]));radio.audio.metadata();assert.equal(radio.get('trackTitle').textContent,'Verbus 0');assert.equal(radio.audio.currentTime,0);
});
test('temporary local MP3 files do not overwrite the saved published collection',async()=>{
  const radio=await boot();radio.select(9);radio.audio.metadata();radio.audio.position(42);
  radio.get('fileInput').files=[{name:'Local song - Artist.mp3'}];radio.get('fileInput').dispatchEvent(new Event('change'));
  await Promise.resolve();radio.audio.metadata();radio.audio.position(12);radio.window.dispatchEvent(new Event('pagehide'));
  assert.equal(radio.bookmark('verbus').trackId,'v9');assert.equal(radio.bookmark('verbus').position,42);
});
test('denied browser storage does not prevent playback',async()=>{
  const radio=await boot(new Map(),{blockedStorage:true});radio.audio.metadata();radio.get('play').click();await Promise.resolve();assert.equal(radio.audio.paused,false);
});

test('both stations advance past five tracks while hidden without explicitly pausing or reloading audio',async()=>{
  for(const [station,prefix] of [['verbus','v'],['crab','c']]){
    const radio=await boot();
    radio.switch(station);
    radio.get('play').click();
    radio.document.visibilityState='hidden';
    const {pauseCalls,loadCalls}=radio.audio;
    for(let i=1;i<=7;i++){
      await Promise.resolve();
      radio.audio.metadata();
      radio.audio.end();
      assert.equal(radio.bookmark(station).trackId,prefix+i);
      assert.equal(radio.audio.paused,false);
    }
    assert.equal(radio.audio.pauseCalls,pauseCalls);
    assert.equal(radio.audio.loadCalls,loadCalls);
  }
});

test('auto-advance retries one network error and skips an unreadable track',async()=>{
  const radio=await boot();
  radio.get('play').click();
  await Promise.resolve();
  radio.audio.metadata();
  radio.audio.end();
  assert.equal(radio.bookmark('verbus').trackId,'v1');
  radio.audio.fail(2);
  assert.equal(radio.bookmark('verbus').trackId,'v1');
  radio.audio.fail(4);
  assert.equal(radio.bookmark('verbus').trackId,'v2');
  assert.equal(radio.audio.paused,false);
});

test('a hidden autoplay rejection gets one retry when the page becomes visible',async()=>{
  const radio=await boot();
  radio.get('play').click();
  await Promise.resolve();
  radio.audio.metadata();
  radio.document.visibilityState='hidden';
  radio.audio.rejectPlay=true;
  radio.audio.end();
  await Promise.resolve();
  assert.equal(radio.audio.paused,true);
  radio.document.visibilityState='visible';
  radio.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(radio.audio.paused,false);
  assert.equal(radio.bookmark('verbus').trackId,'v1');
});

test('repeat uses native looping and an expired sleep timer prevents advance',async()=>{
  const radio=await boot();
  radio.get('repeat').click();
  assert.equal(radio.audio.loop,true);
  radio.get('repeat').click();
  assert.equal(radio.audio.loop,false);
  radio.get('play').click();
  await Promise.resolve();
  radio.audio.metadata();
  radio.timerButton.click();
  radio.advance(60001);
  radio.audio.position(300);
  radio.audio.end();
  assert.equal(radio.audio.paused,true);
  assert.equal(radio.bookmark('verbus').trackId,'v0');
});
