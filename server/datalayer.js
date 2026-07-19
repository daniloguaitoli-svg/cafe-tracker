// server/datalayer.js — fachada da camada de dados.
//
// A UI conversa só com este módulo (via /api). Ele combina as fontes gratuitas:
//   - Notícias Agrícolas (primária): indicadores CEPEA, futuros ICE/B3/Londres,
//     e mercado físico regional (snapshot atual);
//   - Banco Central (câmbio USD/EUR, com histórico);
//   - Yahoo (histórico do ICE Arábica);
//   - widget CEPEA (fallback dos indicadores).
// Todos os valores são normalizados para R$/saca de 60 kg para comparação.

import { CATALOGO, CATEGORIAS, porSlug } from "./catalogo.js";
import { lerNoticiasAgricolas } from "./providers/noticiasagricolas.js";
import { usdbrl as getUsdbrl, getCambio as getCambioBCB } from "./providers/bcb.js";
import { historicoKC } from "./providers/yahoo.js";
import { widgetCepea } from "./providers/cepea.js";
import { serieUSD } from "./providers/bcb.js";
import { getClima as getClimaOM } from "./providers/openmeteo.js";
import { registrar, serieSnapshots } from "./store.js";
import { paraReaisPorSaca, deReaisPorSaca, arred, hojeISO, isoDeBR, diasUteisEntre, LB_POR_SACA } from "./util.js";

// Um preço é considerado "desatualizado" quando a fonte não publica valor novo
// há mais de 2 dias ÚTEIS (fins de semana não contam; a folga absorve feriados).
const LIMITE_DIAS_UTEIS = 2;

// Anota o item com data ISO + estado de atualização.
function anotarData(item, dataBR) {
  const dataISO = isoDeBR(dataBR) || (typeof dataBR === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dataBR) ? dataBR : null);
  const dias = dataISO ? diasUteisEntre(dataISO, hojeISO()) : null;
  item.data = dataISO;
  item.diasSemAtualizar = dias;
  item.desatualizado = dias == null ? true : dias > LIMITE_DIAS_UTEIS;
  return item;
}

const LB_POR_TON = 2204.6226; // libras-peso por tonelada métrica (p/ spread)

const AVISO =
  "Dados de fontes públicas (CEPEA/ESALQ, ICE/NYBOT, B3, Banco Central via Notícias Agrícolas), " +
  "possivelmente com atraso. Uso informativo — não é recomendação de investimento.";

function slugFisico(item) {
  const base = `${item.municipio}-${item.cooperativa || ""}-${item.grupo}`;
  const ascii = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `fisico-${ascii}`;
}

function itemFuturo(slug, dado, usd) {
  const cat = porSlug[slug];
  if (!dado || !dado.curva?.length) return null;
  const front = dado.curva[0];
  return anotarData(
    {
      slug,
      nome: cat.nome,
      categoria: cat.categoria,
      moeda: cat.moeda,
      unidade: cat.unidade,
      valor: arred(front.valor, cat.unidade === "USC_LB" ? 2 : 2),
      valorBRLsaca: arred(paraReaisPorSaca({ valor: front.valor, unidade: cat.unidade, usdbrl: usd })),
      variacaoPct: arred(front.variacaoPct),
      contrato: front.contrato,
      fonte: cat.fonte,
      bloomberg: cat.bloomberg,
      descricao: cat.descricao,
    },
    dado.data
  );
}

function itemCepea(slug, dado) {
  const cat = porSlug[slug];
  if (!dado) return null;
  return anotarData(
    {
      slug,
      nome: cat.nome,
      categoria: cat.categoria,
      moeda: cat.moeda,
      unidade: cat.unidade,
      valor: arred(dado.valor),
      valorBRLsaca: arred(dado.valor),
      variacaoPct: arred(dado.variacaoPct),
      fonte: cat.fonte,
      bloomberg: cat.bloomberg,
      descricao: cat.descricao,
    },
    dado.data
  );
}

export async function getCotacoes() {
  // Série do BCB (cacheada) dá o valor E a data real da última PTAX publicada.
  const usdSerie = await serieUSD();
  const usdUltimo = usdSerie[usdSerie.length - 1] || null;
  const usd = usdUltimo?.close ?? (await getUsdbrl());
  let na = null;
  try {
    na = await lerNoticiasAgricolas();
  } catch {
    na = null;
  }

  // ---- Futuros ----
  const futuros = [];
  if (na) {
    for (const slug of ["ice-arabica-ny", "b3-arabica", "ice-robusta-londres"]) {
      const it = itemFuturo(slug, na.futuros[slug], usd);
      if (it) futuros.push(it);
    }
  }

  // ---- Indicadores CEPEA (com fallback ao widget) ----
  const cepea = [];
  for (const slug of ["cepea-arabica", "cepea-robusta"]) {
    let dado = na?.cepea?.[slug] || null;
    if (!dado) {
      try {
        dado = await widgetCepea(porSlug[slug].cepeaId);
      } catch {
        dado = null;
      }
    }
    const it = itemCepea(slug, dado);
    if (it) {
      cepea.push(it);
      // Grava sob a data REAL do preço (ISO); se a fonte não informar, usa hoje.
      await registrar(slug, it.data || hojeISO(), it.valorBRLsaca);
    }
  }

  // ---- Exportação e paridade (derivados) ----
  const exportacao = [];
  const iceItem = futuros.find((f) => f.slug === "ice-arabica-ny");
  const cepeaArabica = cepea.find((c) => c.slug === "cepea-arabica");
  if (iceItem && iceItem.valorBRLsaca != null) {
    // Derivado herda a data do componente (o ICE); anotarData espera BR ou ISO.
    exportacao.push(
      anotarData(
        {
          slug: "paridade-ice-brl",
          nome: "Paridade de exportação (ICE em R$/saca)",
          categoria: CATEGORIAS.EXPORTACAO,
          moeda: "R$/saca",
          unidade: "BRL_SACA",
          valor: iceItem.valorBRLsaca,
          valorBRLsaca: iceItem.valorBRLsaca,
          variacaoPct: iceItem.variacaoPct,
          fonte: "Derivado: ICE Arábica × PTAX",
          descricao:
            "Preço do arábica de Nova York convertido para R$ por saca de 60 kg — a paridade bruta de exportação.",
        },
        iceItem.data
      )
    );
  }
  if (iceItem && cepeaArabica && cepeaArabica.valorBRLsaca != null && iceItem.valorBRLsaca != null) {
    const dif = cepeaArabica.valorBRLsaca - iceItem.valorBRLsaca;
    // Herda a data mais ANTIGA dos dois componentes: o derivado só é tão fresco
    // quanto o insumo menos atualizado.
    const dataMaisAntiga =
      iceItem.data && cepeaArabica.data
        ? (iceItem.data < cepeaArabica.data ? iceItem.data : cepeaArabica.data)
        : iceItem.data || cepeaArabica.data;
    exportacao.push(
      anotarData(
        {
          slug: "diferencial-cepea-ice",
          nome: "Diferencial doméstico × ICE (aprox.)",
          categoria: CATEGORIAS.EXPORTACAO,
          moeda: "R$/saca",
          unidade: "BRL_SACA",
          valor: arred(dif),
          valorBRLsaca: arred(dif),
          variacaoPct: null,
          fonte: "Derivado: CEPEA − paridade ICE",
          descricao:
            "Diferença entre o indicador CEPEA arábica e a paridade ICE. Positivo = mercado interno acima da paridade de exportação. Aproximação (não é o diferencial oficial de Santos).",
        },
        dataMaisAntiga
      )
    );
  }

  // ---- Mercado físico regional ----
  const fisico = [];
  if (na?.fisico?.length) {
    for (const item of na.fisico) {
      const slug = slugFisico(item);
      const it = anotarData(
        {
          slug,
          nome: item.local,
          subgrupo: item.grupo,
          categoria: CATEGORIAS.FISICO,
          moeda: "R$/saca",
          unidade: "BRL_SACA",
          valor: arred(item.valorBRLsaca),
          valorBRLsaca: arred(item.valorBRLsaca),
          variacaoPct: arred(item.variacaoPct),
          municipio: item.municipio,
          cooperativa: item.cooperativa,
          fonte: "Mercado físico (via Notícias Agrícolas)",
        },
        item.data
      );
      fisico.push(it);
      await registrar(slug, it.data || hojeISO(), item.valorBRLsaca);
    }
  }

  const categorias = [
    { nome: CATEGORIAS.FUTUROS, itens: futuros },
    { nome: CATEGORIAS.CEPEA, itens: cepea },
    { nome: CATEGORIAS.EXPORTACAO, itens: exportacao },
    { nome: CATEGORIAS.FISICO, itens: fisico },
  ].filter((c) => c.itens.length);

  const cambio = anotarData({ usdbrl: arred(usd, 4) }, usdUltimo?.date || null);

  return {
    fetchedAt: na?.fetchedAt || new Date().toISOString(),
    cambio,
    fatorSaca: arred(LB_POR_SACA, 4),
    categorias,
    aviso: AVISO,
  };
}

// Estatísticas simples de uma série [{date, close}].
function estatisticas(pontos) {
  if (!pontos || pontos.length < 2) return null;
  const closes = pontos.map((p) => p.close);
  const ult = closes[closes.length - 1];
  const prim = closes[0];
  return {
    min: arred(Math.min(...closes)),
    max: arred(Math.max(...closes)),
    variacaoPeriodoPct: prim ? arred(((ult - prim) / prim) * 100) : null,
  };
}

export async function getDetalhe(slug, tf = "3M") {
  // Precisa das cotações atuais (snapshot) para o cabeçalho de qualquer slug.
  const cot = await getCotacoes();
  const item =
    cot.categorias.flatMap((c) => c.itens).find((i) => i.slug === slug) || null;

  let pontos = [];
  let unidadeSerie = item?.moeda || "";
  let notaHistorico = null;

  if (slug === "ice-arabica-ny") {
    try {
      pontos = await historicoKC(tf); // US¢/lb
      unidadeSerie = "US¢/lb";
    } catch {
      pontos = await serieSnapshots(slug);
      unidadeSerie = "R$/saca";
      notaHistorico = "Histórico do Yahoo indisponível; usando snapshots locais.";
    }
  } else {
    pontos = await serieSnapshots(slug);
    unidadeSerie = "R$/saca";
    if (pontos.length < 2) {
      notaHistorico =
        "Sem série histórica gratuita para este indicador — o gráfico é construído a partir dos snapshots diários e cresce com o uso do app.";
    }
  }

  return {
    slug,
    item,
    tf,
    unidadeSerie,
    pontos,
    estatisticas: estatisticas(pontos),
    notaHistorico,
    aviso: cot.aviso,
  };
}

export async function getCambio() {
  return getCambioBCB();
}

// Variação % entre o último ponto e o ponto mais próximo de ~diasAtras dias antes.
// Retorna null se a série não alcança essa janela (evita "30D" falso quando só há
// poucos dias de histórico, como nos snapshots recém-iniciados do CEPEA).
function varDias(pontos, diasAtras) {
  if (!pontos || pontos.length < 2) return null;
  const ult = pontos[pontos.length - 1];
  const alvoMs = new Date(ult.date).getTime() - diasAtras * 864e5;
  const tol = Math.max(7, diasAtras * 0.2) * 864e5; // tolerância proporcional
  let ref = null;
  let melhor = Infinity;
  for (const p of pontos) {
    const gap = Math.abs(new Date(p.date).getTime() - alvoMs);
    if (gap < melhor) { melhor = gap; ref = p; }
  }
  if (!ref || !ref.close || melhor > tol) return null;
  return arred(((ult.close - ref.close) / ref.close) * 100);
}

// Aba "Mercado": tabela de índices (1D/30D/12M), spread arábica×robusta e séries
// para os gráficos comparativos.
export async function getMercado() {
  const [cot, nyHist, usdHist] = await Promise.all([
    getCotacoes(),
    historicoKC("1A").catch(() => []),
    serieUSD().catch(() => []),
  ]);
  const itens = cot.categorias.flatMap((c) => c.itens);
  const get = (slug) => itens.find((i) => i.slug === slug);
  const cepeaHist = await serieSnapshots("cepea-arabica").catch(() => []);

  const ny = get("ice-arabica-ny");
  const robusta = get("ice-robusta-londres");
  const cepeaA = get("cepea-arabica");
  const usd = cot.cambio.usdbrl;

  const indices = [
    ny && { nome: "ICE Arábica (NY)", unidade: "US¢/lb", valor: ny.valor, var1d: ny.variacaoPct, var30d: varDias(nyHist, 30), var12m: varDias(nyHist, 365), data: ny.data, desatualizado: ny.desatualizado },
    robusta && { nome: "Robusta (Londres)", unidade: "US$/ton", valor: robusta.valor, var1d: robusta.variacaoPct, var30d: null, var12m: null, data: robusta.data, desatualizado: robusta.desatualizado },
    cepeaA && { nome: "CEPEA Arábica", unidade: "R$/saca", valor: cepeaA.valor, var1d: cepeaA.variacaoPct, var30d: varDias(cepeaHist, 30), var12m: varDias(cepeaHist, 365), data: cepeaA.data, desatualizado: cepeaA.desatualizado },
    usd != null && { nome: "Dólar comercial", unidade: "R$/US$", valor: usd, var1d: null, var30d: varDias(usdHist, 30), var12m: varDias(usdHist, 365), data: cot.cambio.data, desatualizado: cot.cambio.desatualizado },
  ].filter(Boolean);

  // Spread arábica × robusta, ambos em US¢/lb.
  let spread = null;
  if (ny && robusta) {
    const robustaCents = (robusta.valor / LB_POR_TON) * 100; // US$/ton -> US¢/lb
    spread = {
      valor: arred(ny.valor - robustaCents),
      nyCents: arred(ny.valor),
      robustaCents: arred(robustaCents),
    };
  }

  return {
    fetchedAt: cot.fetchedAt,
    cambio: cot.cambio,
    indices,
    spread,
    charts: {
      ny: nyHist.map((p) => ({ date: p.date, close: p.close })),
      usd: usdHist.map((p) => ({ date: p.date, close: p.close })),
      cepea: cepeaHist,
    },
    aviso: cot.aviso,
  };
}

export async function getClima() {
  return getClimaOM();
}

// Exposto para o conversor no cliente, se necessário no futuro.
export { paraReaisPorSaca, deReaisPorSaca };
