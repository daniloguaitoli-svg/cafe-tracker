// components/Conversor.jsx — converte preços de café entre unidades usando o
// câmbio ao vivo, e mostra a paridade de exportação (interno × ICE).
import { useMemo, useState } from "react";
import { num, reais, sinal, pct } from "../format.js";

const LB_POR_SACA = 60 / 0.45359237; // ≈ 132,2774
const TON_POR_SACA = 0.06;

const UNIDADES = [
  { id: "USC_LB", nome: "US¢/libra (ICE Nova York)" },
  { id: "USD_SACA", nome: "US$/saca 60 kg (B3)" },
  { id: "USD_TON", nome: "US$/tonelada (Londres)" },
  { id: "BRL_SACA", nome: "R$/saca 60 kg (CEPEA/físico)" },
];

function paraReaisPorSaca(valor, unidade, usd) {
  if (valor == null || !Number.isFinite(valor)) return null;
  switch (unidade) {
    case "BRL_SACA": return valor;
    case "USD_SACA": return usd ? valor * usd : null;
    case "USD_TON": return usd ? valor * TON_POR_SACA * usd : null;
    case "USC_LB": return usd ? (valor / 100) * LB_POR_SACA * usd : null;
    default: return null;
  }
}
function deReaisPorSaca(reaisSaca, destino, usd) {
  if (reaisSaca == null || !usd) return null;
  const usdSaca = reaisSaca / usd;
  switch (destino) {
    case "BRL_SACA": return reaisSaca;
    case "USD_SACA": return usdSaca;
    case "USD_TON": return usdSaca / TON_POR_SACA;
    case "USC_LB": return (usdSaca / LB_POR_SACA) * 100;
    default: return null;
  }
}
const rotulo = { USC_LB: "US¢/lb", USD_SACA: "US$/saca", USD_TON: "US$/ton", BRL_SACA: "R$/saca" };

export function Conversor({ dados }) {
  const usd = dados.cambio.usdbrl;
  const itens = dados.categorias.flatMap((c) => c.itens);
  const ice = itens.find((i) => i.slug === "ice-arabica-ny");
  const cepeaA = itens.find((i) => i.slug === "cepea-arabica");

  const [valor, setValor] = useState(ice ? String(num(ice.valor)).replace(/\./g, "").replace(",", ".") : "350");
  const [unidade, setUnidade] = useState("USC_LB");

  const v = parseFloat(String(valor).replace(",", "."));
  const base = useMemo(() => paraReaisPorSaca(Number.isFinite(v) ? v : null, unidade, usd), [v, unidade, usd]);

  const paridadeICE = ice ? ice.valorBRLsaca : null;
  const dif = cepeaA && paridadeICE != null ? cepeaA.valorBRLsaca - paridadeICE : null;

  return (
    <div>
      <div className="card">
        <div className="label">Converter um preço</div>
        <div className="controls" style={{ marginTop: "var(--s3)" }}>
          <input
            className="input mono"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-label="Valor"
          />
          <select className="select" value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade de origem">
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: "var(--s4)" }}>
          {UNIDADES.filter((u) => u.id !== unidade).map((u) => {
            const out = deReaisPorSaca(base, u.id, usd);
            return (
              <div className="conv-row" key={u.id}>
                <span className="muted">{u.nome}</span>
                <span className="conv-out">
                  {out == null ? "—" : num(out, u.id === "USC_LB" ? 2 : 2)}{" "}
                  <span className="muted" style={{ fontSize: 12 }}>{rotulo[u.id]}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: "var(--s3)" }}>
          Câmbio usado: US$ 1 = R$ {usd != null ? num(usd, 4) : "—"} · 1 saca = 60 kg = {num(LB_POR_SACA)} lb
        </div>
      </div>

      <div className="section-title">Paridade de exportação</div>
      <div className="card">
        <div className="conv-row">
          <span className="muted">ICE Arábica (NY) em R$/saca</span>
          <span className="conv-out">{paridadeICE != null ? reais(paridadeICE) : "—"}</span>
        </div>
        <div className="conv-row">
          <span className="muted">CEPEA Arábica (interno)</span>
          <span className="conv-out">{cepeaA ? reais(cepeaA.valorBRLsaca) : "—"}</span>
        </div>
        <div className="conv-row" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s2)" }}>
          <span className="muted">Diferença (interno − ICE)</span>
          <span className={`conv-out ${sinal(dif)}`}>
            {dif == null ? "—" : reais(dif)}
            {dif != null && paridadeICE ? <span className="muted" style={{ fontSize: 12 }}> ({pct((dif / paridadeICE) * 100)})</span> : null}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: "var(--s2)" }}>
          Positivo = mercado interno acima da paridade de exportação (arábica tende a ficar no Brasil).
          Negativo = exportar fica mais atrativo. Aproximação didática — não é o diferencial oficial de Santos.
        </p>
      </div>
    </div>
  );
}
