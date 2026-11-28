(function(){
  'use strict';
  const C=window.RadioCore, M=window.RadioMedia;
  const $=id=>document.getElementById(id), audio=$('audio');
  const storage={get(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value===null?fallback:value;}catch{return fallback;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
  const stations={verbus:{name:'Verbus Rock',folder:'verbus',eyebrow:'SELEÇÃO VERBUS',description:'Das faixas que marcaram sua vida às descobertas que merecem ficar.',headline:['O seu rock.','Sem atalhos.']},crab:{name:'Crab Rock Radio',folder:'crab',eyebrow:'SELEÇÃO CRAB',description:'Riffs que atravessam o tempo. Uma coleção para sentir cada acorde.',headline:['Mais peso.','Mais atitude.']}};
  const state={station:stations[storage.get('rock-v2-station','verbus')]?storage.get('rock-v2-station','verbus'):'verbus',tracks:[],current:null,order:[],favorites:new Set(),favoritesOnly:false,query:'',sort:'original',visible:20,shuffle:false,repeat:'all',token:0,toastTimer:null,timerEnds:0,localUrls:[],installPrompt:null,localMode:false};
  let config=window.ROCK_CONFIG||{storageBaseUrl:'',remoteCatalogs:false};
  const catalogs=window.ROCK_CATALOGS||{verbus:[],crab:[]};
  let playback=null;
  let retryOnVisible=null;
  let playRequest=0;
  function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+name);svg.append(use);svg.setAttribute('aria-hidden','true');return svg;}
  function toast(message){clearTimeout(state.toastTimer);$('toast').textContent=message;$('toast').hidden=false;state.toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
  function rememberedPlayback(station){
    const saved=storage.get('rock-v2-playback-'+station,null);
    if(saved&&typeof saved.trackId==='string')return {trackId:saved.trackId,position:Number.isFinite(saved.position)&&saved.position>=0?saved.position:0};
    return {trackId:storage.get('rock-v2-current-'+station,''),position:0};
  }
  function persistPosition(force=false){
    if(!playback||state.localMode||playback.station!==state.station||playback.trackId!==state.current?.id)return;
    const now=Date.now();
    if(!force&&now-playback.savedAt<2000)return;
    const position=playback.resumeAt===null?audio.currentTime:playback.resumeAt;
    storage.set('rock-v2-playback-'+playback.station,{trackId:playback.trackId,position:Number.isFinite(position)&&position>=0?position:0,updatedAt:now});
    storage.set('rock-v2-current-'+playback.station,playback.trackId);
    playback.savedAt=now;
  }
  function restorePosition(){
    if(!playback||playback.resumeAt===null||audio.readyState<1||!Number.isFinite(audio.duration)||audio.duration<=0)return;
    try{if(playback.resumeAt>0&&playback.resumeAt<audio.duration)audio.currentTime=playback.resumeAt;playback.resumeAt=null;}catch{}
  }
  function favoriteKey(){return 'rock-v2-favorites-'+state.station;}
  function source(track){return track.localUrl||C.mediaUrl(config.storageBaseUrl,stations[state.station].folder,track.file);}
  function setStatus(message){$('playbackStatus').textContent=message;}
  function artwork(element,cover,description){element.hidden=!cover;if(cover){element.src=cover;element.alt=description;}else element.removeAttribute('src');}
  function updateMetadata(){const track=state.current;if(!track)return;const art=track.cover||'';artwork($('heroCover'),art,'Capa de '+(track.album||track.title));artwork($('playerCover'),art,'Capa de '+(track.album||track.title));$('heroSleeve').classList.toggle('has-cover',!!art);$('trackTitle').textContent=track.title;$('trackArtist').textContent=track.artist;$('artCaption').textContent=art?(track.album||track.artist).toLocaleUpperCase('pt-BR'):'A SUA COLEÇÃO EM PRIMEIRO PLANO';const liked=state.favorites.has(track.id);$('favoriteCurrent').classList.toggle('is-favorite',liked);$('favoriteCurrent').setAttribute('aria-pressed',String(liked));$('favoriteCurrent').setAttribute('aria-label',liked?'Remover música atual das favoritas':'Favoritar música atual');
    if('mediaSession' in navigator&&typeof MediaMetadata!=='undefined'){try{navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist,album:track.album||stations[state.station].name,artwork:art?[{src:art,sizes:'640x640',type:art.startsWith('data:image/png')?'image/png':art.endsWith('.svg')?'image/svg+xml':'image/jpeg'}]:[{src:new URL('assets/icon-512.png',location.href).href,sizes:'512x512',type:'image/png'}]});}catch{}}
  }
  function syncPlayback(){const playing=!audio.paused&&!audio.ended;document.body.classList.toggle('is-playing',playing);$('play').replaceChildren(icon(playing?'pause':'play'));$('play').setAttribute('aria-label',playing?'Pausar':'Reproduzir');$('play').setAttribute('aria-pressed',String(playing));$('heroPlay').replaceChildren(icon(playing?'pause':'play'),Object.assign(document.createElement('span'),{textContent:playing?'Pausar seleção':'Ouvir seleção'}));if('mediaSession'in navigator){try{navigator.mediaSession.playbackState=playing?'playing':'paused';}catch{}}}
  function refreshRows(){for(const row of $('trackList').children){row.classList.toggle('current',row.dataset.track===state.current?.id);const index=state.tracks.findIndex(t=>t.id===row.dataset.track);const marker=row.querySelector('.row-number');if(marker){marker.replaceChildren();if(row.dataset.track===state.current?.id){const bars=document.createElement('span');bars.className='mini-bars';bars.setAttribute('aria-hidden','true');for(let j=0;j<3;j++)bars.append(document.createElement('i'));marker.append(bars);}else marker.textContent=String(index+1).padStart(2,'0');}}}
  async function loadMetadata(track,token){const src=track.fileObject||source(track);if(!src)return;const meta=await M.metadata(track,src);Object.assign(track,meta);if(token===state.token&&state.current?.id===track.id){updateMetadata();renderTracks();renderQueue();}}
  function syncLoop(){
    audio.loop=state.repeat==='one'||state.order.length===1;
  }
  function pauseAudio(){
    retryOnVisible=null;
    ++playRequest;
    if(playback){playback.wantsPlayback=false;playback.transition=null;}
    audio.pause();
  }
  function selectTrack(track,play=false,resumeAt=0,transition=null){
    if(!track)return;
    persistPosition(true);
    retryOnVisible=null;
    if(!play)pauseAudio();
    state.current=track;
    const token=++state.token, src=source(track);
    playback=null;
    syncLoop();
    if(src){
      playback={station:state.station,trackId:track.id,resumeAt:Number.isFinite(resumeAt)&&resumeAt>=0?resumeAt:0,savedAt:0,wantsPlayback:false,transition:null};
      // Assigning src starts resource selection. Keep the same element and request
      // playback before rendering so the media session has the shortest gap.
      audio.src=src;
      if(play)playAudio(transition);
      else setStatus('Pronta para tocar');
      persistPosition(true);
    }else{
      audio.pause();audio.removeAttribute('src');audio.load();
      setStatus('Selecione seus arquivos para ouvir');
      if(play)$('fileInput').click();
    }
    updateMetadata();refreshRows();renderQueue();
    $('elapsed').textContent='0:00';$('duration').textContent='0:00';$('seek').value='0';$('seek').style.setProperty('--progress','0%');$('seek').disabled=true;
    loadMetadata(track,token);syncPlayback();
  }
  function playAudio(transition=null){
    retryOnVisible=null;
    if(!state.current){if(state.tracks.length)selectTrack(state.tracks[0],true);return;}
    if(!audio.getAttribute('src')){
      const src=source(state.current);
      if(!src){$('fileInput').click();return;}
      audio.src=src;
    }
    if(playback){playback.wantsPlayback=true;playback.transition=transition;}
    if(!transition&&audio.error)audio.load();
    const attempt=++playRequest;
    const promise=audio.play();
    setStatus('Conectando à sua música…');
    if(promise)promise.catch(error=>{
      if(attempt!==playRequest||error.name==='AbortError'||(transition&&audio.error))return;
      if(transition&&playback?.transition===transition&&error.name==='NotAllowedError'&&document.visibilityState==='hidden'){
        retryOnVisible=transition;
      }else if(playback){playback.wantsPlayback=false;playback.transition=null;}
      setStatus('Toque em reproduzir para tentar novamente');
      if(!retryOnVisible)toast(error.name==='NotAllowedError'?'Toque em reproduzir para iniciar a música.':'Não foi possível tocar esta faixa. Tente novamente ou escolha outra música.');
      syncPlayback();
    });
  }
  function togglePlay(){if(!state.tracks.length){toast('Esta coleção ainda não tem músicas.');return;}if(audio.paused)playAudio();else pauseAudio();}
  function move(delta,autoplay=true,transition=null){if(!state.order.length)return;if(delta<0&&audio.currentTime>3){audio.currentTime=0;if(autoplay&&audio.paused)playAudio();return;}selectTrack(C.nextTrack(state.order,state.current?.id,delta),autoplay,0,transition);}
  function advanceOnEnd(){
    if(state.timerEnds&&Date.now()>=state.timerEnds){checkTimer();return;}
    move(1,true,{skipped:0,retried:false});
  }
  function handleAudioError(){
    if(!audio.getAttribute('src')||!audio.error)return;
    const transition=playback?.transition;
    if(transition&&playback.wantsPlayback){
      if(audio.error.code===2&&!transition.retried){
        selectTrack(state.current,true,0,{...transition,retried:true});
        return;
      }
      if([2,3,4].includes(audio.error.code)&&transition.skipped<Math.min(3,state.order.length-1)){
        move(1,true,{skipped:transition.skipped+1,retried:false});
        return;
      }
    }
    if(playback){playback.wantsPlayback=false;playback.transition=null;}
    retryOnVisible=null;
    setStatus('Não foi possível abrir esta faixa');syncPlayback();
    toast('Esta música não abriu. Confira sua conexão ou escolha outra faixa.');
  }
  function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);storage.set(favoriteKey(),[...state.favorites]);$('favoriteCount').textContent=String(state.favorites.size);renderTracks();updateMetadata();}
  function thumbnail(track){const thumb=document.createElement('span');thumb.className='track-thumb';thumb.style.setProperty('--hue',String(parseInt(track.id.slice(1),36)%90+35));thumb.append(icon('disc'));if(track.cover){const img=document.createElement('img');img.src=track.cover;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove(),{once:true});thumb.append(img);}return thumb;}
  function trackCopy(track){const box=document.createElement('span');box.className='track-copy';const title=document.createElement('strong');title.textContent=track.title;title.title=track.title;const artist=document.createElement('small');artist.textContent=track.artist;box.append(title,artist);return box;}
  function filteredTracks(){const tracks=C.filterTracks(state.tracks,state.query,state.favoritesOnly,state.favorites);if(state.sort!=='original')tracks.sort((a,b)=>String(a[state.sort]||'').localeCompare(String(b[state.sort]||''),'pt-BR'));return tracks;}
  function renderTracks(){const filtered=filteredTracks();$('trackList').replaceChildren();for(const track of filtered.slice(0,state.visible)){const row=document.createElement('div');row.className='track-row';row.dataset.track=track.id;const number=document.createElement('span');number.className='row-number';number.setAttribute('aria-hidden','true');const main=document.createElement('button');main.type='button';main.className='track-main';main.setAttribute('aria-label','Reproduzir '+track.title+', '+track.artist);main.append(thumbnail(track),trackCopy(track));main.addEventListener('click',()=>{if(state.current?.id===track.id){togglePlay();}else selectTrack(track,true);});const artist=document.createElement('span');artist.className='row-artist';artist.textContent=track.artist;artist.title=track.artist;const album=document.createElement('span');album.className='row-album';album.textContent=track.album||'—';album.title=track.album||'';const favorite=document.createElement('button');favorite.className='icon-button row-favorite'+(state.favorites.has(track.id)?' is-favorite':'');favorite.type='button';favorite.append(icon('heart'));favorite.setAttribute('aria-label',(state.favorites.has(track.id)?'Remover das favoritas: ':'Favoritar: ')+track.title);favorite.setAttribute('aria-pressed',String(state.favorites.has(track.id)));favorite.addEventListener('click',()=>toggleFavorite(track.id));row.append(number,main,artist,album,favorite);$('trackList').append(row);}
    $('emptyMessage').hidden=filtered.length>0;$('emptyMessage').textContent=state.query?'Nenhuma música encontrada. Tente outro nome.':state.favoritesOnly?'Suas favoritas vão aparecer aqui. Toque no coração de uma música.':'Esta coleção ainda não tem músicas.';$('loadMore').hidden=filtered.length<=state.visible;$('loadMore').textContent='Mostrar mais músicas';$('collectionSummary').textContent=filtered.length+' '+(filtered.length===1?'faixa':'faixas')+' · '+stations[state.station].name+(state.localMode?' · Arquivos deste aparelho':'');refreshRows();}
  function renderQueue(){const target=$('queueList');target.replaceChildren();const index=state.order.findIndex(t=>t.id===state.current?.id);for(let i=1;i<=Math.min(4,state.order.length-1);i++){const track=state.order[(Math.max(0,index)+i)%state.order.length];const button=document.createElement('button');button.className='queue-item';button.type='button';button.setAttribute('aria-label','Reproduzir '+track.title);button.append(thumbnail(track),trackCopy(track),Object.assign(document.createElement('span'),{textContent:String(i).padStart(2,'0')}));button.addEventListener('click',()=>selectTrack(track,true));target.append(button);}}
  function setFavoritesOnly(on){state.favoritesOnly=on;state.visible=20;$('navRadio').classList.toggle('selected',!on);$('navFavorites').classList.toggle('selected',on);$('allFilter').classList.toggle('active',!on);$('favoritesFilter').classList.toggle('active',on);$('allFilter').setAttribute('aria-pressed',String(!on));$('favoritesFilter').setAttribute('aria-pressed',String(on));$('collectionTitle').replaceChildren(document.createTextNode(on?'As suas favoritas':'Na sua rotação'),Object.assign(document.createElement('span'),{textContent:'.'}));renderTracks();}
  function setShuffle(on){state.shuffle=on;state.order=on?C.shuffle(state.tracks,state.current?.id):[...state.tracks];for(const id of ['shuffle','heroShuffle']){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));$(id).setAttribute('aria-label',on?'Desativar ordem aleatória':'Ativar ordem aleatória');}renderQueue();}
  function switchStation(id,playIfPlaying=true){if(!stations[id])return;const wasPlaying=!audio.paused;persistPosition(true);pauseAudio();playback=null;state.station=id;state.localMode=false;state.query='';$('search').value='';state.visible=20;state.favorites=new Set(storage.get(favoriteKey(),[]));$('favoriteCount').textContent=String(state.favorites.size);storage.set('rock-v2-station',id);document.body.dataset.station=id;document.querySelectorAll('[data-select-station]').forEach(button=>{const active=button.dataset.selectStation===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});const station=stations[id];$('heroEyebrow').textContent=station.eyebrow;$('heroDescription').textContent=station.description;$('heroTitle').replaceChildren(document.createTextNode(station.headline[0]),document.createElement('br'),Object.assign(document.createElement('span'),{textContent:station.headline[1]}));$('sleeveName').replaceChildren(document.createTextNode(id.toUpperCase()),Object.assign(document.createElement('span'),{textContent:'ROCK COLLECTION'}));state.tracks=(catalogs[id]||[]).map(t=>({...t}));state.order=state.shuffle?C.shuffle(state.tracks):[...state.tracks];$('heroCount').textContent=state.tracks.length+' faixas';setFavoritesOnly(false);const remembered=rememberedPlayback(id);const track=state.tracks.find(t=>t.id===remembered.trackId)||state.tracks[0];if(track)selectTrack(track,wasPlaying&&playIfPlaying,track.id===remembered.trackId?remembered.position:0);else{state.current=null;++state.token;audio.removeAttribute('src');audio.load();$('trackTitle').textContent='Sua próxima coleção';$('trackArtist').textContent=station.name;artwork($('heroCover'),'','');artwork($('playerCover'),'','');$('heroSleeve').classList.remove('has-cover');setStatus('Ainda sem músicas');renderQueue();syncPlayback();}}
  async function importFiles(files){const list=[...files].filter(file=>/\.mp3$/i.test(file.name));if(!list.length){toast('Selecione arquivos MP3 para ouvir.');return;}persistPosition(true);pauseAudio();playback=null;audio.removeAttribute('src');audio.load();for(const url of state.localUrls)URL.revokeObjectURL(url);state.localUrls=[];const seen=new Set();state.tracks=list.filter(f=>!seen.has(f.name)&&seen.add(f.name)).map(file=>{const localUrl=URL.createObjectURL(file);state.localUrls.push(localUrl);return {id:C.stableId(file.name),file:file.name,...C.fileInfo(file.name),localUrl,fileObject:file};});state.localMode=true;state.visible=20;state.order=state.shuffle?C.shuffle(state.tracks):[...state.tracks];$('heroCount').textContent=state.tracks.length+' faixas';state.query='';$('search').value='';renderTracks();selectTrack(state.tracks[0],true);toast(state.tracks.length+' músicas abertas neste aparelho.');$('fileInput').value='';}
  function syncTime(){restorePosition();const duration=audio.duration,current=audio.currentTime||0;const valid=Number.isFinite(duration)&&duration>0;$('elapsed').textContent=C.formatTime(current);$('duration').textContent=C.formatTime(valid?duration:0);$('seek').disabled=!valid;const ratio=valid?Math.min(1,current/duration):0;$('seek').value=String(Math.round(ratio*1000));$('seek').style.setProperty('--progress',(ratio*100)+'%');$('seek').setAttribute('aria-valuetext',C.formatTime(current)+' de '+C.formatTime(duration));if('mediaSession'in navigator&&navigator.mediaSession.setPositionState&&valid){try{navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:Math.min(current,duration)});}catch{}}persistPosition();checkTimer();}
  function checkTimer(){if(!state.timerEnds)return;const remaining=state.timerEnds-Date.now();if(remaining<=0){pauseAudio();state.timerEnds=0;setStatus('Pausada pelo temporizador');$('timerDescription').textContent='Temporizador desligado.';$('sleep').classList.remove('active');toast('O temporizador pausou a música.');}else $('timerDescription').textContent='A música será pausada em '+Math.ceil(remaining/60000)+' min.';}
  function openTimer(){$('sleepDialog').showModal();checkTimer();}
  function bindMediaSession(){if(!('mediaSession'in navigator))return;const actions={play:()=>playAudio(),pause:pauseAudio,previoustrack:()=>move(-1),nexttrack:()=>move(1),seekto:details=>{if(Number.isFinite(audio.duration)&&Number.isFinite(details.seekTime))audio.currentTime=Math.min(audio.duration,Math.max(0,details.seekTime));},seekbackward:details=>{audio.currentTime=Math.max(0,audio.currentTime-(details.seekOffset||10));},seekforward:details=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(details.seekOffset||10));},stop:()=>{pauseAudio();audio.currentTime=0;}};for(const [name,handler]of Object.entries(actions)){try{navigator.mediaSession.setActionHandler(name,handler);}catch{}}}
  $('play').addEventListener('click',togglePlay);$('heroPlay').addEventListener('click',togglePlay);$('previous').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));$('favoriteCurrent').addEventListener('click',()=>state.current&&toggleFavorite(state.current.id));$('shuffle').addEventListener('click',()=>setShuffle(!state.shuffle));$('heroShuffle').addEventListener('click',()=>setShuffle(!state.shuffle));$('repeat').addEventListener('click',()=>{state.repeat=state.repeat==='all'?'one':'all';syncLoop();$('repeat').querySelector('.repeat-one').hidden=state.repeat!=='one';$('repeat').setAttribute('aria-label',state.repeat==='one'?'Repetir música; clique para repetir a coleção':'Repetir coleção; clique para repetir a música');toast(state.repeat==='one'?'Repetindo a música atual.':'Repetindo a coleção inteira.');});
  $('heroCover').addEventListener('error',()=>{$('heroCover').hidden=true;$('heroSleeve').classList.remove('has-cover');});$('playerCover').addEventListener('error',()=>$('playerCover').hidden=true);
  document.querySelectorAll('[data-select-station]').forEach(button=>button.addEventListener('click',()=>switchStation(button.dataset.selectStation)));$('navFavorites').addEventListener('click',()=>setFavoritesOnly(true));$('navRadio').addEventListener('click',()=>setFavoritesOnly(false));$('favoritesFilter').addEventListener('click',()=>setFavoritesOnly(true));$('allFilter').addEventListener('click',()=>setFavoritesOnly(false));$('search').addEventListener('input',event=>{state.query=event.target.value;state.visible=20;renderTracks();});$('sort').addEventListener('change',event=>{state.sort=event.target.value;renderTracks();});$('loadMore').addEventListener('click',()=>{state.visible+=30;renderTracks();});$('localFiles').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',event=>importFiles(event.target.files));
  audio.volume=Math.min(1,Math.max(0,Number(storage.get('rock-v2-volume',.75))||0));$('volume').value=String(Math.round(audio.volume*100));$('volume').style.setProperty('--progress',(audio.volume*100)+'%');$('volume').addEventListener('input',event=>{audio.volume=Number(event.target.value)/100;audio.muted=false;storage.set('rock-v2-volume',audio.volume);$('volume').style.setProperty('--progress',event.target.value+'%');$('mute').replaceChildren(icon(audio.volume===0?'mute':'volume'));$('mute').setAttribute('aria-label',audio.volume===0?'Ativar som':'Silenciar');});$('mute').addEventListener('click',()=>{audio.muted=!audio.muted;$('mute').replaceChildren(icon(audio.muted?'mute':'volume'));$('mute').setAttribute('aria-label',audio.muted?'Ativar som':'Silenciar');});$('seek').addEventListener('input',event=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(event.target.value)/1000;syncTime();});
  audio.addEventListener('playing',()=>{
    retryOnVisible=null;
    if(playback)playback.transition=null;
    setStatus('Tocando · '+stations[state.station].name);syncPlayback();
  });
  audio.addEventListener('pause',()=>{
    if(!audio.paused||audio.ended)return;
    if(playback&&!playback.transition)playback.wantsPlayback=false;
    persistPosition(true);setStatus('Pausada');syncPlayback();
  });
  audio.addEventListener('waiting',()=>setStatus('Carregando sua música…'));
  audio.addEventListener('loadedmetadata',syncTime);
  audio.addEventListener('durationchange',syncTime);
  audio.addEventListener('timeupdate',syncTime);
  audio.addEventListener('seeked',()=>persistPosition(true));
  audio.addEventListener('ended',()=>{if(audio.ended&&!audio.loop&&playback?.wantsPlayback)advanceOnEnd();});
  audio.addEventListener('error',handleAudioError);
  window.addEventListener('pagehide',()=>persistPosition(true));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){persistPosition(true);return;}
    if(retryOnVisible){
      if(state.timerEnds&&Date.now()>=state.timerEnds)checkTimer();
      else playAudio(retryOnVisible);
    }
  });
  $('sleep').addEventListener('click',openTimer);$('sleepTextButton').addEventListener('click',openTimer);document.querySelectorAll('[data-minutes]').forEach(button=>button.addEventListener('click',()=>{const minutes=Number(button.dataset.minutes);state.timerEnds=Date.now()+minutes*60000;$('sleep').classList.add('active');checkTimer();$('sleepDialog').close();toast('A música será pausada em '+minutes+' minutos.');}));$('cancelTimer').addEventListener('click',()=>{state.timerEnds=0;$('timerDescription').textContent='Temporizador desligado.';$('sleep').classList.remove('active');$('sleepDialog').close();toast('Temporizador desligado.');});setInterval(checkTimer,1000);
  $('shareButton').addEventListener('click',async()=>{const data={title:'Rock Rádio',text:'Verbus & Crab. O rock na sua frequência.',url:location.href.split('?')[0].split('#')[0]};try{if(navigator.share)await navigator.share(data);else if(navigator.clipboard){await navigator.clipboard.writeText(data.url);toast('Link da rádio copiado.');}else prompt('Copie o endereço da rádio:',data.url);}catch(error){if(error.name!=='AbortError')toast('Não foi possível compartilhar agora.');}});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;});$('installButton').addEventListener('click',async()=>{if(state.installPrompt){await state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return;}if(matchMedia('(display-mode: standalone)').matches){toast('Você já está usando o aplicativo.');return;}toast(/iphone|ipad|ipod/i.test(navigator.userAgent)?'No Safari, toque em Compartilhar e em Adicionar à Tela de Início.':'No menu do navegador, escolha Instalar app ou Adicionar à tela inicial.');});
  document.addEventListener('keydown',event=>{const target=event.target;const editing=target.matches('input,textarea,select,[contenteditable=true]');if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('search').focus();}else if(!editing&&!target.closest('button,a')&&event.code==='Space'&&!$('sleepDialog').open){event.preventDefault();togglePlay();}});
  if(!window.ROCK_PREVIEW&&location.protocol!=='file:'&&'serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));const controlledAtStart=Boolean(navigator.serviceWorker.controller);let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!controlledAtStart||refreshing||!navigator.serviceWorker.controller)return;if(!audio.paused){toast('Nova versão disponível. Atualize a página quando quiser.');return;}refreshing=true;location.reload();});}
  async function refreshCatalogs(){if(!config.storageBaseUrl||config.remoteCatalogs===false||window.ROCK_PREVIEW)return;await Promise.all(Object.keys(stations).map(async id=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);try{const response=await fetch(C.mediaUrl(config.storageBaseUrl,stations[id].folder,id+'.json'),{cache:'no-store',signal:controller.signal});if(!response.ok)return;const data=await response.json();if(!Array.isArray(data.tracks))return;const seen=new Set();const tracks=data.tracks.filter(t=>t&&typeof t.file==='string'&&/\.mp3$/i.test(t.file)&&!t.file.split('/').some(p=>p==='..'||p==='.')&&!seen.has(t.file)&&seen.add(t.file)).map(t=>({id:C.stableId(t.file),file:t.file,...C.fileInfo(t.file),...(typeof t.title==='string'?{title:t.title}:{}),...(typeof t.artist==='string'?{artist:t.artist}:{}),album:typeof t.album==='string'?t.album:'',cover:typeof t.cover==='string'&&/^data:image\/(jpeg|png|webp);base64,/i.test(t.cover)?t.cover:''}));if(!tracks.length)return;catalogs[id]=tracks;if(state.station===id&&!state.localMode){const current=state.current;state.tracks=tracks;state.order=state.shuffle?C.shuffle(tracks,current?.id):[...tracks];const replacement=tracks.find(t=>t.id===current?.id);syncLoop();if(replacement){state.current=Object.assign(replacement,{cover:replacement.cover||current.cover,album:replacement.album||current.album});updateMetadata();}else selectTrack(tracks[0],!audio.paused);$('heroCount').textContent=tracks.length+' faixas';renderTracks();renderQueue();}}catch{}finally{clearTimeout(timeout);}}));}
  async function init(){if(!window.ROCK_PREVIEW&&location.protocol!=='file:'){try{const response=await fetch('radio-config.json',{cache:'no-store'});if(response.ok){const data=await response.json();if(typeof data.storageBaseUrl==='string')config={...config,...data};}}catch{}}bindMediaSession();switchStation(state.station,false);refreshCatalogs();}
  init();
})();
