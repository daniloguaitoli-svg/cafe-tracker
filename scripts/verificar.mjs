// scripts/verificar.mjs — a verificação que o `npm run build` não faz.
//
// O `vite build` empacota só o src/, então a metade server/ (datalayer,
// catálogo, util, providers) nem chega a ser lida por ele: um erro de sintaxe
// ou de import ali passa verde e só quebra em produção, na hora do request.
// Isto não é hipotético — a remoção do campo morto `secao` do catálogo passou
// pelo build sem que ele sequer abrisse o arquivo alterado.
// Este script carrega esses módulos de verdade e confere os invariantes que o
// CLAUDE.md declara — inclusive as constantes duplicadas de propósito entre
// server/ e src/, que nada mais consegue vigiar.
//
// Sem dependências de propósito: o repositório não tem test runner e a regra é
// manter só react + react-dom.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => readFile(join(RAIZ, rel), "utf-8");

let falhas = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const falhar = (msg) => {
  console.error(`  FALHA ${msg}`);
  falhas++;
};
const conferir = (cond, msg) => (cond ? ok(msg) : falhar(msg));

// Lê `const NOME = <expressão numérica>;` de um arquivo do cliente. O Conversor
// é JSX (não dá para importar aqui), e alguns valores são escritos como conta
// (60 / 0.45359237), por isso avalia a expressão em vez de comparar texto.
function constanteDoCliente(fonte, nome) {
  const m = fonte.match(new RegExp(`${nome}\\s*=\\s*([^;\\n]+)`));
  if (!m) return null;
  const expr = m[1].trim();
  if (!/^[\d.\s/*+()-]+$/.test(expr)) return null;
  return Number(Function(`"use strict"; return (${expr});`)());
}

console.log("\nmódulos do servidor carregam");
const datalayer = await import("../server/datalayer.js");
const util = await import("../server/util.js");
const cat = await import("../server/catalogo.js");
for (const nome of ["getCotacoes", "getDetalhe", "getCambio", "getMercado", "getClima"]) {
  conferir(typeof datalayer[nome] === "function", `datalayer exporta ${nome}()`);
}
for (const rel of ["noticiasagricolas", "cepea", "yahoo", "bcb", "openmeteo"]) {
  await import(`../server/providers/${rel}.js`);
  ok(`provider ${rel} carrega`);
}

console.log("\nintegridade do catálogo");
const { CATALOGO, porSlug } = cat;
conferir(CATALOGO.length > 0, `${CATALOGO.length} indicadores fixos`);
conferir(Object.keys(porSlug).length === CATALOGO.length, "porSlug cobre todo o catálogo (slugs únicos)");

const UNIDADES = ["USC_LB", "USD_SACA", "USD_TON", "BRL_SACA"];
for (const c of CATALOGO) {
  for (const campo of ["slug", "nome", "categoria", "unidade", "moeda", "fonte", "descricao"]) {
    if (!c[campo]) falhar(`${c.slug || "(sem slug)"}: falta ${campo}`);
  }
  if (!UNIDADES.includes(c.unidade)) falhar(`${c.slug}: unidade desconhecida ${c.unidade}`);
}
ok("campos obrigatórios e unidades válidos");

// Campos que ninguém lê viram peso morto (foi o caso do antigo `secao`). Esta
// conferência não deixa reaparecer um campo novo sem uso declarado.
const CONHECIDOS = new Set([
  "slug", "nome", "categoria", "unidade", "moeda", "fonte",
  "bloomberg", "cepeaId", "yahoo", "descricao",
]);
for (const c of CATALOGO) {
  for (const campo of Object.keys(c)) {
    if (!CONHECIDOS.has(campo)) falhar(`${c.slug}: campo "${campo}" não está na lista de campos lidos — é morto?`);
  }
}
ok("nenhum campo desconhecido no catálogo");

console.log("\ncache do CEPEA");
const cache = JSON.parse(await ler("server/cepea-cache.json"));
conferir(!!cache.indicadores, "server/cepea-cache.json é JSON válido e tem `indicadores`");
for (const slug of Object.keys(cache.indicadores)) {
  if (!porSlug[slug]) falhar(`cache tem o slug "${slug}", que não existe mais no catálogo`);
}
ok("todo slug do cache ainda existe no catálogo (histórico não órfão)");

// CLAUDE.md, "Constantes duplicadas de propósito": server/ e src/ nunca se
// importam, então estes valores são copiados à mão e só um confronto de
// arquivos percebe quando um lado muda sozinho.
console.log("\nconstantes duplicadas entre server/ e src/");
const conversor = await ler("src/components/Conversor.jsx");
for (const [nome, valorServidor] of Object.entries({
  LB_POR_SACA: util.LB_POR_SACA,
  TON_POR_SACA: util.TON_POR_SACA,
})) {
  const valorCliente = constanteDoCliente(conversor, nome);
  if (valorCliente == null) falhar(`${nome} não encontrado (ou não numérico) em Conversor.jsx`);
  else {
    conferir(
      Math.abs(valorCliente - valorServidor) < 1e-9,
      `${nome}: util.js ${valorServidor} = Conversor.jsx ${valorCliente}`
    );
  }
}

console.log(falhas === 0 ? "\ntudo certo\n" : `\n${falhas} verificação(ões) falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
