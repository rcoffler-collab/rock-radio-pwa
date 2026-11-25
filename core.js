(function(root){
  'use strict';
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function fileInfo(file){const name=String(file).split('/').pop().replace(/\.(mp3|m4a|ogg|flac|wav)$/i,'');const parts=name.split(' - ');return {title:parts.length>1?parts.slice(0,-1).join(' - '):name,artist:parts.length>1?parts[parts.length-1]:'Artista não informado'};}
  function stableId(file){let hash=2166136261;for(const char of String(file)){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}return 't'+(hash>>>0).toString(36);}
  function mediaUrl(base,folder,file){if(!base)return '';const url=new URL(base);if(!['https:','http:'].includes(url.protocol))return '';return url.href.replace(/\/$/,'')+'/'+[folder,...String(file).split('/')].filter(Boolean).map(encodeURIComponent).join('/');}
  function shuffle(items,currentId,random=Math.random){const rest=items.filter(t=>t.id!==currentId);for(let i=rest.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}const current=items.find(t=>t.id===currentId);return current?[current,...rest]:rest;}
  function nextTrack(order,id,delta=1){if(!order.length)return null;const i=order.findIndex(t=>t.id===id);if(i<0)return delta<0?order[order.length-1]:order[0];return order[(i+delta+order.length)%order.length];}
  function filterTracks(items,query,favoritesOnly,favorites){const q=normalize(query).trim();return items.filter(t=>(!favoritesOnly||favorites.has(t.id))&&(!q||normalize([t.title,t.artist,t.album].join(' ')).includes(q)));}
  function formatTime(seconds){if(!Number.isFinite(seconds)||seconds<0)return '0:00';return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');}
  const api={normalize,fileInfo,stableId,mediaUrl,shuffle,nextTrack,filterTracks,formatTime};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RadioCore=api;
})(typeof window!=='undefined'?window:globalThis);
