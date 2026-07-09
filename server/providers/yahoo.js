// server/providers/yahoo.js — histórico do futuro ICE Arábica (KC=F).
//
// O Yahoo Finance é a única fonte gratuita com histórico diário confiável do
// benchmark de Nova York (em US¢/lb, "USX"/"USd"). Sem CORS — por isso roda no
// servidor. Usado apenas para os gráficos do indicador `ice-arabica-ny`.

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // `${symbol}|${range}|${interval}` -> { ts, pontos }

// Timeframe -> range/intervalo do Yahoo.
export const TF = {
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1A": { range: "1y", interval: "1d" },
  "5A": { range: "5y", interval: "1wk" },
};

export async function historicoKC(tf = "3M") {
  const { range, interval } = TF[tf] || TF["3M"];
  const symbol = "KC=F";
  const key = `${symbol}|${range}|${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.pontos;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${range}&interval=${interval}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`Yahoo indisponível (HTTP ${r.status})`);
  const result = (await r.json())?.chart?.result?.[0];
  const stamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!stamps || !closes) throw new Error("Sem dados do Yahoo para KC=F");

  const pontos = [];
  for (let i = 0; i < stamps.length; i++) {
    if (closes[i] == null) continue;
    pontos.push({
      date: new Date(stamps[i] * 1000).toISOString().slice(0, 10),
      close: Number(closes[i].toFixed(2)), // US¢/lb
    });
  }
  if (!pontos.length) throw new Error("Série vazia do Yahoo para KC=F");
  cache.set(key, { ts: Date.now(), pontos });
  return pontos;
}
