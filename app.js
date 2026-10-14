const STATIONS={verbus:{name:"Verbus Rock",mount:"kqf4jf5zvzivv",stream:"https://stream.zeno.fm/kqf4jf5zvzivv"},crab:{name:"Crab Rock Radio",mount:"i8nvkvetmkbuv",stream:"https://stream.zeno.fm/i8nvkvetmkbuv"}};
const $=id=>document.getElementById(id);
let selected="verbus",lastTrackKey="",installPrompt=null,lastArtworkKey="";
const HISTORY_LIMIT=500,HISTORY_PAGE_SIZE=20;
let historyVisibleCount=HISTORY_PAGE_SIZE;
const artworkCache=new Map();
function historyKey(id=selected){return `rock-radio-history-${id}`;}
function getHistory(id=selected){try{return JSON.parse(localStorage.getItem(historyKey(id))||"[]");}catch{return [];}}
function saveHistory(items,id=selected){localStorage.setItem(historyKey(id),JSON.stringify(items.slice(0,HISTORY_LIMIT)));}
function parseMetadata(payload){
 if(typeof payload==="string"){const lines=payload.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);for(const line of lines){const candidate=line.startsWith("data:")?line.slice(5).trim():line;try{const found=parseMetadata(JSON.parse(candidate));if(found)return found;}catch{}}return {title:payload.trim()};}
 if(!payload||typeof payload!=="object")return null;
 if(payload.data&&typeof payload.data==="object")return parseMetadata(payload.data);
 if(payload.metadata&&typeof payload.metadata==="object")return parseMetadata(payload.metadata);
 const title=payload.title||payload.song||payload.track||payload.current_song||payload.streamTitle||payload.stream_title||payload.now_playing;
 const artist=payload.artist||payload.performer||payload.artist_name||"";
 if(title||artist)return {title:String(title||"Faixa em reprodução"),artist:String(artist||"")};
 const combined=payload.songtitle||payload.song_title||payload.text;
 return combined?{title:String(combined),artist:""}:null;
}
function splitCombined(track){if(!track||track.artist||!track.title)return track;const parts=track.title.split(/\s+-\s+/);return parts.length>=2?{artist:parts.shift(),title:parts.join(" - ")}:track;}
function normalizeTrackPart(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();}
function addTrack(track){
 if(!track||!track.title)return;track=splitCombined(track);
 const title=String(track.title).trim(),artist=String(track.artist||"Artista não informado").trim();
 const key=`${selected}|${normalizeTrackPart(artist)}|${normalizeTrackPart(title)}`;
 if(key===lastTrackKey)return;
 const history=getHistory(),nt=normalizeTrackPart(title),na=normalizeTrackPart(artist),now=Date.now();
 const duplicate=history.some(item=>normalizeTrackPart(item.title)===nt&&normalizeTrackPart(item.artist)===na&&Number.isFinite(new Date(item.at).getTime())&&now-new Date(item.at).getTime()<6*60*60*1000);
 lastTrackKey=key;if(duplicate)return;
 history.unshift({title,artist,at:new Date().toISOString()});saveHistory(history);historyVisibleCount=HISTORY_PAGE_SIZE;renderHistory();
}
function renderHistory(){
 $("historyFor").textContent=`Histórico da ${STATIONS[selected].name}`;
 const list=$("historyList"),history=getHistory();list.replaceChildren();
 if(!history.length){const li=document.createElement("li");li.className="empty";li.textContent="As músicas detectadas aparecerão aqui.";list.append(li);$("loadMoreHistory").classList.add("hidden");return;}
 history.slice(0,historyVisibleCount).forEach(item=>{const li=document.createElement("li"),time=document.createElement("span"),info=document.createElement("div"),title=document.createElement("strong"),artist=document.createElement("small");time.className="time";const date=new Date(item.at);time.textContent=date.toLocaleDateString("pt-BR")+" "+date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});title.textContent=item.title;artist.textContent=item.artist||"";info.append(title,artist);li.append(time,info);list.append(li);});
 const more=$("loadMoreHistory");if(history.length>historyVisibleCount){more.classList.remove("hidden");more.textContent=`Carregar mais músicas (${history.length-historyVisibleCount} restantes)`;}else more.classList.add("hidden");
}
async function findArtwork(track){
 const title=String(track?.title||"").trim(),artist=String(track?.artist||"").trim();if(!title||title==="Faixa em reprodução")return null;
 const key=`${normalizeTrackPart(artist)}|${normalizeTrackPart(title)}`;if(artworkCache.has(key))return artworkCache.get(key);
 try{const response=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent([artist,title].filter(Boolean).join(" "))}&entity=song&limit=8`,{cache:"force-cache"});if(!response.ok)throw Error(`Artwork HTTP ${response.status}`);const data=await response.json(),results=Array.isArray(data.results)?data.results:[];
 const na=normalizeTrackPart(artist),nt=normalizeTrackPart(title);
 let match=results.find(x=>normalizeTrackPart(x.trackName)===nt&&(!na||normalizeTrackPart(x.artistName).includes(na)));
 if(!match)match=results.find(x=>normalizeTrackPart(x.trackName)===nt);
 const art=match?.artworkUrl100?match.artworkUrl100.replace("100x100bb","600x600bb"):null;artworkCache.set(key,art);return art;
 }catch(error){console.warn("Album artwork lookup:",error);artworkCache.set(key,null);return null;}
}
async function updateArtwork(track){
 const key=`${normalizeTrackPart(track?.artist)}|${normalizeTrackPart(track?.title)}`;lastArtworkKey=key;
 $("albumArt").classList.add("hidden");$("recordFallback").classList.remove("hidden");
 const art=await findArtwork(track);if(lastArtworkKey!==key||!art)return;
 $("albumArt").onerror=()=>{$("albumArt").classList.add("hidden");$("recordFallback").classList.remove("hidden");};
 $("albumArt").onload=()=>{$("albumArt").classList.remove("hidden");$("recordFallback").classList.add("hidden");};$("albumArt").src=art;
}
function setStation(id){
 selected=id;lastTrackKey="";historyVisibleCount=HISTORY_PAGE_SIZE;
 document.querySelectorAll(".station").forEach(btn=>btn.classList.toggle("active",btn.dataset.station===id));
 $("audio").pause();$("audio").removeAttribute("src");$("audio").load();if(typeof updatePlayerButton==="function")updatePlayerButton();$("trackTitle").textContent="Consultando a rádio…";$("trackArtist").textContent="Aguarde enquanto buscamos os metadados.";$("trackStatus").textContent="Atualizando dados";
 $("albumArt").classList.add("hidden");$("recordFallback").classList.remove("hidden");renderHistory();refreshMetadata();
}
async function refreshMetadata(){
 const id=selected;
 try{const response=await fetch(`/.netlify/functions/metadata?station=${encodeURIComponent(id)}`,{cache:"no-store"});if(!response.ok)throw Error(`HTTP ${response.status}`);
 const data=await response.json();if(id!==selected)return;const track=splitCombined(parseMetadata(data));if(!track||(!track.title&&!track.artist))throw Error(data.error||"Metadados ainda não disponíveis");
 $("trackTitle").textContent=track.title||"Faixa em reprodução";$("trackArtist").textContent=track.artist||"Artista não informado";$("trackStatus").textContent="Metadados atualizados";
 const key=`${normalizeTrackPart(track.artist)}|${normalizeTrackPart(track.title)}`;if(key!==lastArtworkKey)updateArtwork(track);addTrack(track);
 }catch(error){if(id!==selected)return;$("trackStatus").textContent="Não foi possível consultar os metadados";$("trackArtist").textContent="A transmissão pode continuar funcionando. Vamos tentar novamente.";console.warn("Metadata lookup:",error);}
}
let showingFavorites=false, timerInterval=null, timerEndsAt=0;
function favoritesKey(id=selected){return `rock-radio-favorites-${id}`;}
function getFavorites(id=selected){try{return JSON.parse(localStorage.getItem(favoritesKey(id))||"[]");}catch{return [];}}
function saveFavorites(items,id=selected){localStorage.setItem(favoritesKey(id),JSON.stringify(items));}
function trackId(item){return `${normalizeTrackPart(item.artist)}|${normalizeTrackPart(item.title)}`;}
function isFavorite(item){return getFavorites().some(f=>trackId(f)===trackId(item));}
function currentTrack(){return {title:$('trackTitle').textContent,artist:$('trackArtist').textContent,at:new Date().toISOString()};}
function toggleFavorite(item){if(!item||!item.title||item.title.includes('Consultando'))return;const favs=getFavorites(),id=trackId(item);const next=favs.some(f=>trackId(f)===id)?favs.filter(f=>trackId(f)!==id):[{title:item.title,artist:item.artist,at:new Date().toISOString()},...favs];saveFavorites(next);renderHistory();updateFavoriteButton();}
function updateFavoriteButton(){const item=currentTrack(),on=isFavorite(item),button=$('favoriteCurrent');button.classList.toggle('is-favorite',on);button.setAttribute('aria-pressed',String(on));button.textContent=on?'♥ Favoritada':'♡ Favoritar';}
const originalRenderHistory=renderHistory;
renderHistory=function(){
 if(!showingFavorites){originalRenderHistory();decorateHistory();return;}
 $('historyFor').textContent=`Favoritos salvos neste dispositivo`;
 const list=$('historyList'),items=getFavorites();list.replaceChildren();
 if(!items.length){const li=document.createElement('li');li.className='empty';li.textContent='Toque em “Favoritar” durante uma música para guardá-la aqui.';list.append(li);$('loadMoreHistory').classList.add('hidden');return;}
 items.forEach(item=>{const li=document.createElement('li');li.className='favorite-row';const info=document.createElement('div'),title=document.createElement('strong'),artist=document.createElement('small'),button=document.createElement('button');title.textContent=item.title;artist.textContent=item.artist||'';info.append(title,artist);button.className='remove-favorite';button.type='button';button.textContent='♥';button.setAttribute('aria-label',`Remover ${item.title} dos favoritos`);button.addEventListener('click',()=>{saveFavorites(getFavorites().filter(f=>trackId(f)!==trackId(item)));renderHistory();updateFavoriteButton();});li.append(info,button);list.append(li);});$('loadMoreHistory').classList.add('hidden');
};
function decorateHistory(){const list=$('historyList');list.querySelectorAll('li:not(.empty)').forEach(li=>{if(li.querySelector('.history-fav'))return;const title=li.querySelector('strong')?.textContent||'',artist=li.querySelector('small')?.textContent||'';const btn=document.createElement('button');btn.className='history-fav'+(isFavorite({title,artist})?' is-favorite':'');btn.type='button';btn.textContent=isFavorite({title,artist})?'♥':'♡';btn.title='Adicionar/remover dos favoritos';btn.setAttribute('aria-label',`Favoritar ${title}`);btn.addEventListener('click',()=>toggleFavorite({title,artist}));li.append(btn);});}
$('favoriteCurrent').addEventListener('click',()=>toggleFavorite(currentTrack()));
$('showFavorites').addEventListener('click',()=>{showingFavorites=!showingFavorites;$('showFavorites').classList.toggle('is-selected',showingFavorites);$('showFavorites').setAttribute('aria-pressed',String(showingFavorites));$('showFavorites').textContent=showingFavorites?'♫ Ver histórico':'♡ Favoritos';historyVisibleCount=HISTORY_PAGE_SIZE;renderHistory();});
const baseSetStation=setStation;
setStation=function(id){baseSetStation(id);showingFavorites=false;$('showFavorites').classList.remove('is-selected');$('showFavorites').setAttribute('aria-pressed','false');$('showFavorites').textContent='♡ Favoritos';updateFavoriteButton();};
const baseRefreshMetadata=refreshMetadata;
refreshMetadata=async function(){await baseRefreshMetadata();updateFavoriteButton();};
function stopTimer(message='Temporizador cancelado'){if(timerInterval)clearInterval(timerInterval);timerInterval=null;timerEndsAt=0;$('timerStatus').textContent=message;$('timerToggle').textContent='Iniciar';$('timerToggle').classList.remove('is-selected');}
$('timerToggle').addEventListener('click',()=>{if(timerInterval){stopTimer();return;}const mins=Number($('timerDuration').value)||30;timerEndsAt=Date.now()+mins*60000;$('timerStatus').textContent=`Desligamento em ${mins} minutos`;$('timerToggle').textContent='Cancelar';$('timerToggle').classList.add('is-selected');timerInterval=setInterval(()=>{const remaining=timerEndsAt-Date.now();if(remaining<=0){$('audio').pause();$('audio').removeAttribute('src');$('audio').load();updatePlayerButton();stopTimer('Rádio desligada pelo temporizador');return;}const m=Math.ceil(remaining/60000);$('timerStatus').textContent=`A rádio será desligada em ${m} min`;},1000);});
$('installBtn').addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').textContent='Instalar';return;}const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;if(standalone){$('installBtn').textContent='App instalado';return;}const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);alert(isIOS?'Para instalar: toque em Compartilhar no Safari e escolha “Adicionar à Tela de Início”.':'Para instalar: abra o menu do navegador (⋮) e escolha “Instalar app” ou “Adicionar à tela inicial”, se disponível.');});

// Player personalizado: iniciar/parar e controle de volume, sem linha do tempo.
const audioPlayer = $("audio");
const playToggle = $("playToggle");
const playToggleIcon = $("playToggleIcon");
const volumeControl = $("volumeControl");
const volumeValue = $("volumeValue");

audioPlayer.volume = Number(volumeControl.value) / 100;

function updatePlayerButton() {
  const playing = !audioPlayer.paused && !audioPlayer.ended;
  playToggle.classList.toggle("is-playing", playing);
  playToggle.setAttribute("aria-pressed", String(playing));
  playToggle.setAttribute("aria-label", playing ? "Parar rádio" : "Iniciar rádio");
  playToggleIcon.textContent = playing ? "■" : "▶";
}

async function toggleRadioPlayback() {
  if (!audioPlayer.paused) {
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
    $("trackStatus").textContent = "Transmissão parada";
    updatePlayerButton();
    return;
  }

  // Reatribui a estação atual para retomar a transmissão ao vivo.
  audioPlayer.src = STATIONS[selected].stream;
  $("trackStatus").textContent = "Conectando à transmissão ao vivo…";
  try {
    await audioPlayer.play();
    $("trackStatus").textContent = "Transmitindo ao vivo";
  } catch (error) {
    $("trackStatus").textContent = "Toque em iniciar para tentar novamente";
    console.warn("Playback:", error);
  }
  updatePlayerButton();
}

playToggle.addEventListener("click", toggleRadioPlayback);
audioPlayer.addEventListener("play", updatePlayerButton);
audioPlayer.addEventListener("pause", updatePlayerButton);
audioPlayer.addEventListener("ended", updatePlayerButton);

volumeControl.addEventListener("input", () => {
  const value = Number(volumeControl.value);
  audioPlayer.volume = value / 100;
  audioPlayer.muted = value === 0;
  volumeValue.textContent = `${value}%`;
  volumeControl.setAttribute("aria-valuetext", `${value}%`);
});


document.querySelectorAll(".station").forEach(btn=>btn.addEventListener("click",()=>setStation(btn.dataset.station)));
$("clearHistory").addEventListener("click",()=>{if(confirm(`Limpar o histórico da ${STATIONS[selected].name} neste dispositivo?`)){saveHistory([]);lastTrackKey="";historyVisibleCount=HISTORY_PAGE_SIZE;renderHistory();}});
$("loadMoreHistory").addEventListener("click",()=>{historyVisibleCount+=HISTORY_PAGE_SIZE;renderHistory();});
$("shareBtn").addEventListener("click",async()=>{
 const data={title:"Rock Rádio",text:`Ouça ${STATIONS[selected].name} no Rock Rádio!`,url:window.location.href.split("?")[0].split("#")[0]};
 try{if(navigator.share)await navigator.share(data);else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(data.url);$("shareBtn").textContent="Link copiado!";setTimeout(()=>$("shareBtn").textContent="Compartilhar",2200);}else window.prompt("Copie o link do Rock Rádio:",data.url);}
 catch(error){if(error?.name!=="AbortError")console.warn("Share:",error);}
});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("installBtn").classList.remove("hidden");});

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(console.warn));
setStation("verbus");setInterval(refreshMetadata,15000);
