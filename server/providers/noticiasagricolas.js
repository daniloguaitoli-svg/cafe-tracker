// server/providers/noticiasagricolas.js — fonte primária (gratuita).
//
// A página pública noticiasagricolas.com.br/cotacoes/cafe é HTML renderizado no
// servidor e traz, em tabelas, quase tudo que está na planilha Bloomberg do
// usuário: indicadores CEPEA (arábica e robusta), futuros ICE Nova York, futuros
// arábica B3, futuros robusta Londres, e o mercado físico regional por cooperativa.
//
// A leitura é por REGEX (sem dependências), associando cada <table> ao título
// (<h2>/<h3>) imediatamente anterior. É "melhor esforço": se o HTML mudar, ajustar
// aqui. Os números-chave têm fontes independentes (Yahoo, widget CEPEA) como reforço.

import { parseNumBR } from "../util.js";

const URL_CAFE = "https://www.noticiasagricolas.com.br/cotacoes/cafe";
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};
const TTL_MS = 10 * 60 * 1000;
let cache = null; // { ts, dados }

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Extrai [{ heading, header:[...], rows:[[...]] }] de todo o HTML.
function extrairTabelas(html) {
  const tabelas = [];
  const reTable = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = reTable.exec(html)) !== null) {
    const antes = html.slice(0, m.index);
    const hs = [...antes.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
    const heading = hs.length ? strip(hs[hs.length - 1][1]) : "";
    const corpo = m[1];
    const header = [...corpo.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((c) => strip(c[1]));
    const rows = [...corpo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1])))
      .filter((cells) => cells.length > 0);
    tabelas.push({ heading, header, rows });
  }
  return tabelas;
}

const acha = (tabelas, termo) =>
  tabelas.find((t) => t.heading.toLowerCase().includes(termo.toLowerCase()));

// pct diário a partir da variação em pontos (fech. atual e a variação absoluta).
function pctDePontos(valor, pontos) {
  if (valor == null || pontos == null) return null;
  const anterior = valor - pontos;
  return anterior ? (pontos / anterior) * 100 : null;
}

function parseCurvaFuturos(tabela, colValor, { pontos = false } = {}) {
  if (!tabela) return null;
  const curva = tabela.rows
    .map((cells) => {
      const valor = parseNumBR(cells[colValor]);
      if (valor == null) return null;
      const varTxt = cells[cells.length - 1];
      const varNum = parseNumBR(varTxt);
      return {
        contrato: cells[0],
        valor,
        variacaoPct: pontos ? pctDePontos(valor, varNum) : varNum,
        variacaoAbs: pontos ? varNum : null,
      };
    })
    .filter(Boolean);
  return curva.length ? curva : null;
}

function parseIndicadorCepea(tabela) {
  if (!tabela || !tabela.rows.length) return null;
  const [data, valorTxt, varTxt] = tabela.rows[0];
  const valor = parseNumBR(valorTxt);
  if (valor == null) return null;
  return { valor, variacaoPct: parseNumBR(varTxt), data };
}

function parseFisico(tabela, grupo) {
  if (!tabela) return [];
  return tabela.rows
    .map((cells) => {
      const local = cells[0] || "";
      const valor = parseNumBR(cells[1]);
      if (!local || valor == null) return null;
      // "Varginha/MG (Minasul)" -> municipio + cooperativa
      const mm = local.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      return {
        local,
        municipio: mm ? mm[1].trim() : local,
        cooperativa: mm ? mm[2].trim() : null,
        valorBRLsaca: valor,
        variacaoPct: parseNumBR(cells[2]),
        grupo,
      };
    })
    .filter(Boolean);
}

export async function lerNoticiasAgricolas() {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.dados;

  const r = await fetch(URL_CAFE, { headers: UA });
  if (!r.ok) throw new Error(`Notícias Agrícolas indisponível (HTTP ${r.status})`);
  const html = await r.text();
  const tabelas = extrairTabelas(html);

  // Futuros
  const ny = parseCurvaFuturos(acha(tabelas, "Nova Iorque") || acha(tabelas, "NYBOT"), 1, { pontos: true });
  const b3 = parseCurvaFuturos(acha(tabelas, "B3"), 1, { pontos: false });
  const londres = parseCurvaFuturos(acha(tabelas, "Londres"), 1, { pontos: true });

  // Indicadores CEPEA
  const cepeaArabica = parseIndicadorCepea(acha(tabelas, "Indicador Café Arábica"));
  const cepeaRobusta = parseIndicadorCepea(acha(tabelas, "Indicador Café Robusta"));

  // Físico regional (3 grupos de tabelas por município + conilon ES)
  const fisico = [
    ...parseFisico(acha(tabelas, "Físico (Tipo 6/7"), "Arábica tipo 6/7 bebida dura"),
    ...parseFisico(acha(tabelas, "Físico (Tipo 6 Bebida"), "Arábica tipo 6 bebida dura"),
    ...parseFisico(acha(tabelas, "Cereja Descascado"), "Cereja descascado"),
    ...parseFisico(acha(tabelas, "Conilon - Disponível"), "Conilon disponível (ES)"),
  ];

  const dados = {
    fetchedAt: new Date().toISOString(),
    futuros: { "ice-arabica-ny": ny, "b3-arabica": b3, "ice-robusta-londres": londres },
    cepea: { "cepea-arabica": cepeaArabica, "cepea-robusta": cepeaRobusta },
    fisico,
  };
  cache = { ts: Date.now(), dados };
  return dados;
}
