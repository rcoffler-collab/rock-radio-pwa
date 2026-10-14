const STATIONS = {
  verbus: "kqf4jf5zvzivv",
  crab: "i8nvkvetmkbuv"
};

export default async (request) => {
  const url = new URL(request.url);
  const station = url.searchParams.get("station") || "verbus";
  const mount = STATIONS[station];
  if (!mount) return Response.json({ error: "Estação inválida." }, { status: 400 });

  // Zeno documents this as a metadata subscribe endpoint. It may return a
  // streaming/SSE response, so read only a short initial window.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const upstream = await fetch(`https://api.zeno.fm/mounts/metadata/subscribe/${mount}`, {
      headers: { "Accept": "text/event-stream, application/json, text/plain, */*" },
      signal: controller.signal
    });
    if (!upstream.ok) {
      return Response.json({ error: `Zeno retornou HTTP ${upstream.status}.` }, { status: 502 });
    }
    const reader = upstream.body?.getReader();
    if (!reader) return Response.json({ error: "Resposta sem conteúdo." }, { status: 502 });
    const decoder = new TextDecoder();
    let text = "";
    try {
      while (text.length < 12000) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const candidates = text.split(/\r?\n/).filter(line => line.trim().startsWith("data:"));
        for (const line of candidates.reverse()) {
          const raw = line.trim().slice(5).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.title || parsed.artist || parsed.song || parsed.data || parsed.metadata || parsed.songtitle)) {
              return Response.json(parsed, { headers: { "Cache-Control": "no-store" } });
            }
            if (parsed && typeof parsed === "object") return Response.json(parsed, { headers: { "Cache-Control": "no-store" } });
          } catch {
            if (raw.length > 1) return Response.json({ title: raw }, { headers: { "Cache-Control": "no-store" } });
          }
        }
        if (text.trim().startsWith("{")) {
          try { return Response.json(JSON.parse(text), { headers: { "Cache-Control": "no-store" } }); } catch {}
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
    }
    return Response.json({ error: "A Zeno não enviou metadados dentro do tempo de consulta.", preview: text.slice(0, 300) }, { status: 504 });
  } catch (error) {
    return Response.json({ error: error.name === "AbortError" ? "Tempo limite ao consultar a Zeno." : "Falha ao consultar os metadados da Zeno." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
};

export const config = { path: "/.netlify/functions/metadata" };
