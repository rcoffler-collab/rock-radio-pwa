const STATIONS = {
  verbus: {
    name: "Verbus Rock",
    mount: "kqf4jf5zvzivv",
    stream: "https://stream.zeno.fm/kqf4jf5zvzivv"
  },
  crab: {
    name: "Crab Rock Radio",
    mount: "i8nvkvetmkbuv",
    stream: "https://stream.zeno.fm/i8nvkvetmkbuv"
  }
};
const $ = (id) => document.getElementById(id);
let selected = "verbus";
let lastTrackKey = "";
let installPrompt = null;
const HISTORY_LIMIT = 100;

function historyKey(id = selected) {
  return `rock-radio-history-${id}`;
}

function getHistory(id = selected) {
  try {
    return JSON.parse(localStorage.getItem(historyKey(id)) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(items, id = selected) {
  localStorage.setItem(historyKey(id), JSON.stringify(items.slice(0, HISTORY_LIMIT)));
}

function parseMetadata(payload) {
  if (typeof payload === "string") {
    const lines = payload.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      const candidate = line.startsWith("data:") ? line.slice(5).trim() : line;
      try {
        const parsed = JSON.parse(candidate);
        const found = parseMetadata(parsed);
        if (found) return found;
      } catch {}
    }
    return { title: payload.trim() };
  }

  if (!payload || typeof payload !== "object") return null;
  if (payload.data && typeof payload.data === "object") return parseMetadata(payload.data);
  if (payload.metadata && typeof payload.metadata === "object") return parseMetadata(payload.metadata);

  const title = payload.title || payload.song || payload.track || payload.current_song ||
    payload.streamTitle || payload.stream_title || payload.now_playing;
  const artist = payload.artist || payload.performer || payload.artist_name || "";

  if (title || artist) {
    return {
      title: String(title || "Faixa em reprodução"),
      artist: String(artist || "")
    };
  }

  const combined = payload.songtitle || payload.song_title || payload.text;
  if (combined) return { title: String(combined), artist: "" };

  return null;
}

function splitCombined(track) {
  if (!track || track.artist || !track.title) return track;
  const parts = track.title.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts.shift(), title: parts.join(" - ") };
  }
  return track;
}

function normalizeTrackPart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function addTrack(track) {
  if (!track || !track.title) return;

  track = splitCombined(track);

  const title = String(track.title).trim();
  const artist = String(track.artist || "Artista não informado").trim();
  const key = `${selected}|${normalizeTrackPart(artist)}|${normalizeTrackPart(title)}`;

  // Evita registrar repetidamente a faixa em consultas consecutivas.
  if (key === lastTrackKey) return;

  const history = getHistory();
  const normalizedTitle = normalizeTrackPart(title);
  const normalizedArtist = normalizeTrackPart(artist);
  const now = Date.now();

  // Não repete a mesma faixa na mesma estação se ela já foi registrada
  // nas últimas 6 horas. Isso cobre troca de estação, recarga da página
  // e respostas repetidas da API enquanto a música continua tocando.
  const duplicateRecently = history.some(item => {
    const sameTitle = normalizeTrackPart(item.title) === normalizedTitle;
    const sameArtist = normalizeTrackPart(item.artist) === normalizedArtist;
    const timestamp = new Date(item.at).getTime();
    const recent = Number.isFinite(timestamp) && now >= timestamp && (now - timestamp) < 6 * 60 * 60 * 1000;
    return sameTitle && sameArtist && recent;
  });

  lastTrackKey = key;

  if (duplicateRecently) return;

  history.unshift({
    title,
    artist,
    at: new Date().toISOString()
  });

  saveHistory(history);
  renderHistory();
}
function renderHistory() {
  $("historyFor").textContent = `Histórico da ${STATIONS[selected].name}`;
  const list = $("historyList");
  const history = getHistory();
  list.replaceChildren();

  if (!history.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "As músicas detectadas aparecerão aqui.";
    list.append(li);
    return;
  }

  history.forEach(item => {
    const li = document.createElement("li");
    const time = document.createElement("span");
    time.className = "time";
    const date = new Date(item.at);
    time.textContent = date.toLocaleDateString("pt-BR") + " " +
      date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const artist = document.createElement("small");
    artist.textContent = item.artist || "";
    info.append(title, artist);
    li.append(time, info);
    list.append(li);
  });
}

function setStation(id) {
  selected = id;
  lastTrackKey = "";
  document.querySelectorAll(".station").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.station === id)
  );
  $("audio").src = STATIONS[id].stream;
  $("trackTitle").textContent = "Consultando a rádio…";
  $("trackArtist").textContent = "Aguarde enquanto buscamos os metadados.";
  $("trackStatus").textContent = "Atualizando dados";
  renderHistory();
  refreshMetadata();
}

async function refreshMetadata() {
  const station = STATIONS[selected];
  const id = selected;

  try {
    const response = await fetch(
      `/.netlify/functions/metadata?station=${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (id !== selected) return;

    const track = splitCombined(parseMetadata(data));
    if (!track || (!track.title && !track.artist)) {
      throw new Error(data.error || "Metadados ainda não disponíveis");
    }

    $("trackTitle").textContent = track.title || "Faixa em reprodução";
    $("trackArtist").textContent = track.artist || "Artista não informado";
    $("trackStatus").textContent = "Metadados atualizados";
    addTrack(track);
  } catch (error) {
    if (id !== selected) return;
    $("trackStatus").textContent = "Não foi possível consultar os metadados";
    $("trackArtist").textContent = "A transmissão pode continuar funcionando. Vamos tentar novamente.";
    console.warn("Metadata lookup:", error);
  }
}

document.querySelectorAll(".station").forEach(btn =>
  btn.addEventListener("click", () => setStation(btn.dataset.station))
);

$("clearHistory").addEventListener("click", () => {
  if (confirm(`Limpar o histórico da ${STATIONS[selected].name} neste dispositivo?`)) {
    saveHistory([]);
    lastTrackKey = "";
    renderHistory();
  }
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  $("installBtn").classList.remove("hidden");
});

$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("installBtn").classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(console.warn)
  );
}

setStation("verbus");
setInterval(refreshMetadata, 15000);
