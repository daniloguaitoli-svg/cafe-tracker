// server/catalogo.js — catálogo dos indicadores fixos (futuros e indicadores
// CEPEA). O mercado físico regional é dinâmico (vem das tabelas por município da
// Notícias Agrícolas), então não é enumerado aqui — ver providers/noticiasagricolas.js.
//
// Cada item define como o indicador é lido e exibido:
//   slug      — identificador estável usado nas rotas /api
//   nome      — rótulo em português
//   categoria — agrupa na tela de Cotações
//   secao     — título da seção na página da Notícias Agrícolas (fonte primária)
//   unidade   — unidade nativa: USC_LB | USD_SACA | USD_TON | BRL_SACA
//   moeda     — rótulo da moeda nativa
//   fonte     — crédito exibido
//   bloomberg — ticker equivalente na planilha do usuário (referência)
//   descricao — nota explicativa

export const CATEGORIAS = {
  FUTUROS: "Futuros (bolsas)",
  CEPEA: "Indicadores CEPEA/ESALQ",
  FISICO: "Mercado físico regional",
  EXPORTACAO: "Exportação e paridade",
};

export const CATALOGO = [
  {
    slug: "ice-arabica-ny",
    nome: "ICE Arábica — Nova York (NYBOT)",
    categoria: CATEGORIAS.FUTUROS,
    secao: "Bolsa de Nova Iorque",
    unidade: "USC_LB",
    moeda: "US¢/lb",
    fonte: "ICE / NYBOT (via Notícias Agrícolas)",
    bloomberg: "KC1 Comdty",
    yahoo: "KC=F",
    descricao:
      "Referência global do café arábica, negociada em Nova York. É o principal balizador de preço para o exportador brasileiro.",
  },
  {
    slug: "b3-arabica",
    nome: "Arábica 4/5 — B3 (Brasil)",
    categoria: CATEGORIAS.FUTUROS,
    secao: "B3 (Pregão Regular)",
    unidade: "USD_SACA",
    moeda: "US$/saca",
    fonte: "B3 (via Notícias Agrícolas)",
    bloomberg: "AX1 Comdty",
    descricao:
      "Contrato futuro de arábica negociado localmente na B3, em dólares por saca de 60 kg — a unidade padrão brasileira.",
  },
  {
    slug: "ice-robusta-londres",
    nome: "ICE Robusta — Londres",
    categoria: CATEGORIAS.FUTUROS,
    secao: "Bolsa de Londres",
    unidade: "USD_TON",
    moeda: "US$/ton",
    fonte: "ICE Futures Europe (via Notícias Agrícolas)",
    bloomberg: "DF1 Comdty",
    descricao:
      "Referência mundial do robusta (conilon), negociada em Londres. Relevante para o conilon brasileiro (ES, BA, RO).",
  },
  {
    slug: "cepea-arabica",
    nome: "CEPEA/ESALQ — Café Arábica",
    categoria: CATEGORIAS.CEPEA,
    secao: "Indicador Café Arábica",
    unidade: "BRL_SACA",
    moeda: "R$/saca",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    bloomberg: "BAINCOFE Index",
    cepeaId: 23,
    descricao:
      "Principal indicador doméstico do arábica no Brasil (tipo 6, bebida dura, à vista), base para negócios físicos.",
  },
  {
    slug: "cepea-robusta",
    nome: "CEPEA/ESALQ — Café Robusta/Conilon",
    categoria: CATEGORIAS.CEPEA,
    secao: "Indicador Café Robusta",
    unidade: "BRL_SACA",
    moeda: "R$/saca",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    bloomberg: "BACOCOIV Index",
    cepeaId: 24,
    descricao:
      "Principal indicador doméstico do robusta/conilon no Brasil (Espírito Santo).",
  },
];

export const porSlug = Object.fromEntries(CATALOGO.map((c) => [c.slug, c]));
