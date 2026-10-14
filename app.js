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
 $("audio").src=STATIONS[id].stream;$("trackTitle").textContent="Consultando a rádio…";$("trackArtist").textContent="Aguarde enquanto buscamos os metadados.";$("trackStatus").textContent="Atualizando dados";
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
document.querySelectorAll(".station").forEach(btn=>btn.addEventListener("click",()=>setStation(btn.dataset.station)));
$("clearHistory").addEventListener("click",()=>{if(confirm(`Limpar o histórico da ${STATIONS[selected].name} neste dispositivo?`)){saveHistory([]);lastTrackKey="";historyVisibleCount=HISTORY_PAGE_SIZE;renderHistory();}});
$("loadMoreHistory").addEventListener("click",()=>{historyVisibleCount+=HISTORY_PAGE_SIZE;renderHistory();});
$("shareBtn").addEventListener("click",async()=>{
 const data={title:"Rock Rádio",text:`Ouça ${STATIONS[selected].name} no Rock Rádio!`,url:window.location.href.split("?")[0].split("#")[0]};
 try{if(navigator.share)await navigator.share(data);else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(data.url);$("shareBtn").textContent="Link copiado!";setTimeout(()=>$("shareBtn").textContent="Compartilhar",2200);}else window.prompt("Copie o link do Rock Rádio:",data.url);}
 catch(error){if(error?.name!=="AbortError")console.warn("Share:",error);}
});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("installBtn").classList.remove("hidden");});
$("installBtn").addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("installBtn").classList.add("hidden");});
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(console.warn));
setStation("verbus");setInterval(refreshMetadata,15000);
