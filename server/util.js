// server/util.js — utilidades compartilhadas (conversões e parsing pt-BR).

// 1 saca de café = 60 kg. 1 lb = 0,45359237 kg  ->  60 kg = 132,27736 lb.
export const LB_POR_SACA = 60 / 0.45359237; // ≈ 132,2774
export const TON_POR_SACA = 0.06; // 60 kg = 0,06 tonelada métrica

// Converte um número no formato brasileiro ("1.712,39", "+32,70", "-1,46",
// "s/ cotação", "***", "-") para Number — ou null quando não há cotação.
export function parseNumBR(txt) {
  if (txt == null) return null;
  const s = String(txt).trim();
  if (!s || /s\/\s*cota|^\*+$|^-+$|^n\/?d$|indispon/i.test(s)) return null;
  // remove tudo que não for dígito, vírgula, ponto ou sinal
  const limpo = s.replace(/[^\d.,+-]/g, "");
  if (!limpo || /^[+-]?$/.test(limpo)) return null;
  // formato pt-BR: ponto = milhar, vírgula = decimal
  const num = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

// Converte preços entre unidades, sempre normalizando para R$/saca de 60 kg.
export function paraReaisPorSaca({ valor, unidade, usdbrl }) {
  if (valor == null) return null;
  switch (unidade) {
    case "BRL_SACA":
      return valor;
    case "USD_SACA":
      return usdbrl ? valor * usdbrl : null;
    case "USD_TON":
      return usdbrl ? valor * TON_POR_SACA * usdbrl : null;
    case "USC_LB": // centavos de dólar por libra-peso
      return usdbrl ? (valor / 100) * LB_POR_SACA * usdbrl : null;
    default:
      return null;
  }
}

// Converte de R$/saca para uma unidade destino (para o conversor).
export function deReaisPorSaca({ reaisSaca, unidadeDestino, usdbrl }) {
  if (reaisSaca == null || !usdbrl) return null;
  const usdSaca = reaisSaca / usdbrl;
  switch (unidadeDestino) {
    case "BRL_SACA":
      return reaisSaca;
    case "USD_SACA":
      return usdSaca;
    case "USD_TON":
      return usdSaca / TON_POR_SACA;
    case "USC_LB":
      return (usdSaca / LB_POR_SACA) * 100;
    default:
      return null;
  }
}

export function arred(n, casas = 2) {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// Data de hoje em ISO (America/Sao_Paulo aproximado por UTC-3).
export function hojeISO() {
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  return agora.toISOString().slice(0, 10);
}

// "17/07/2026" -> "2026-07-17" (null se não parecer data BR).
export function isoDeBR(dataBR) {
  const m = String(dataBR || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Dias ÚTEIS (seg–sex) decorridos de `deISO` (exclusive) até `ateISO` (inclusive).
// Feriados não são considerados — a folga de 2 dias úteis na regra de
// "desatualizado" absorve os feriados nacionais isolados.
export function diasUteisEntre(deISO, ateISO) {
  if (!deISO || !ateISO || deISO >= ateISO) return 0;
  let n = 0;
  const d = new Date(deISO + "T12:00:00Z");
  const fim = new Date(ateISO + "T12:00:00Z");
  while (d < fim) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}
