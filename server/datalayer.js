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
import { registrar, serieSnapshots } from "./store.js";
import { paraReaisPorSaca, deReaisPorSaca, arred, hojeISO, LB_POR_SACA } from "./util.js";

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

function itemFuturo(slug, curva, usd) {
  const cat = porSlug[slug];
  if (!curva || !curva.length) return null;
  const front = curva[0];
  return {
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
  };
}

function itemCepea(slug, dado) {
  const cat = porSlug[slug];
  if (!dado) return null;
  return {
    slug,
    nome: cat.nome,
    categoria: cat.categoria,
    moeda: cat.moeda,
    unidade: cat.unidade,
    valor: arred(dado.valor),
    valorBRLsaca: arred(dado.valor),
    variacaoPct: arred(dado.variacaoPct),
    data: dado.data,
    fonte: cat.fonte,
    bloomberg: cat.bloomberg,
    descricao: cat.descricao,
  };
}

export async function getCotacoes() {
  const usd = await getUsdbrl();
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
      // Grava sempre em data ISO (hoje) para manter a série ordenável/uniforme.
      await registrar(slug, hojeISO(), it.valorBRLsaca);
    }
  }

  // ---- Exportação e paridade (derivados) ----
  const exportacao = [];
  const iceItem = futuros.find((f) => f.slug === "ice-arabica-ny");
  const cepeaArabica = cepea.find((c) => c.slug === "cepea-arabica");
  if (iceItem && iceItem.valorBRLsaca != null) {
    exportacao.push({
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
    });
  }
  if (iceItem && cepeaArabica && cepeaArabica.valorBRLsaca != null && iceItem.valorBRLsaca != null) {
    const dif = cepeaArabica.valorBRLsaca - iceItem.valorBRLsaca;
    exportacao.push({
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
    });
  }

  // ---- Mercado físico regional ----
  const fisico = [];
  if (na?.fisico?.length) {
    for (const item of na.fisico) {
      const slug = slugFisico(item);
      fisico.push({
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
      });
      await registrar(slug, hojeISO(), item.valorBRLsaca);
    }
  }

  const categorias = [
    { nome: CATEGORIAS.FUTUROS, itens: futuros },
    { nome: CATEGORIAS.CEPEA, itens: cepea },
    { nome: CATEGORIAS.EXPORTACAO, itens: exportacao },
    { nome: CATEGORIAS.FISICO, itens: fisico },
  ].filter((c) => c.itens.length);

  return {
    fetchedAt: na?.fetchedAt || new Date().toISOString(),
    cambio: {
      usdbrl: arred(usd, 4),
    },
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

// Exposto para o conversor no cliente, se necessário no futuro.
export { paraReaisPorSaca, deReaisPorSaca };
