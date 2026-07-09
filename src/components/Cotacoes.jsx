// components/Cotacoes.jsx — lista de todos os indicadores, agrupados por categoria,
// com busca e filtro. Toque numa linha abre o Detalhe.
import { useMemo, useState } from "react";
import { num, pct, sinal, reais } from "../format.js";

function Linha({ item, onOpen }) {
  const mostraBRL = item.unidade !== "BRL_SACA" && item.valorBRLsaca != null;
  return (
    <button className="row" onClick={() => onOpen(item.slug)}>
      <div className="rowmain">
        <div className="rowname">{item.nome}</div>
        <div className="rowsub">
          {item.contrato ? `Contrato ${item.contrato} · ` : ""}
          {item.subgrupo || item.cooperativa || item.fonte}
        </div>
      </div>
      <div className="rowprice">
        <div className="p">
          {num(item.valor)} <span className="muted" style={{ fontSize: 11 }}>{item.moeda}</span>
        </div>
        {item.variacaoPct != null && <div className={`d ${sinal(item.variacaoPct)}`}>{pct(item.variacaoPct)}</div>}
        {mostraBRL && <div className="brl">≈ {reais(item.valorBRLsaca)}/sc</div>}
      </div>
    </button>
  );
}

export function Cotacoes({ dados, onOpen }) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("Todas");

  const categorias = dados.categorias;
  const nomesCat = ["Todas", ...categorias.map((c) => c.nome)];

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return categorias
      .filter((c) => cat === "Todas" || c.nome === cat)
      .map((c) => ({
        ...c,
        itens: c.itens.filter(
          (i) =>
            !q ||
            i.nome.toLowerCase().includes(q) ||
            (i.municipio || "").toLowerCase().includes(q) ||
            (i.cooperativa || "").toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.itens.length);
  }, [categorias, busca, cat]);

  return (
    <div>
      <div className="controls">
        <input
          className="input"
          placeholder="Buscar por região, cooperativa…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <div className="chips" style={{ marginBottom: "var(--s3)" }}>
        {nomesCat.map((n) => (
          <button key={n} className="chip" aria-pressed={cat === n} onClick={() => setCat(n)}>
            {n}
          </button>
        ))}
      </div>

      {filtradas.length === 0 && <p className="muted state">Nenhum indicador encontrado.</p>}

      {filtradas.map((c) => (
        <section key={c.nome}>
          <div className="section-title">{c.nome} · {c.itens.length}</div>
          {c.itens.map((i) => (
            <Linha key={i.slug} item={i} onOpen={onOpen} />
          ))}
        </section>
      ))}
    </div>
  );
}
