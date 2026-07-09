// components/Painel.jsx — visão geral: os números-cabeça do mercado de café.
import { num, pct, reais, sinal, dataBR } from "../format.js";

function Card({ label, valor, unidade, delta, brl }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="big">
        {valor} <span className="unit">{unidade}</span>
      </div>
      {delta != null && <div className={`delta ${sinal(delta)}`}>{pct(delta)} no dia</div>}
      {brl != null && <div className="delta muted">≈ {reais(brl)}/saca</div>}
    </div>
  );
}

export function Painel({ dados }) {
  const itens = dados.categorias.flatMap((c) => c.itens);
  const get = (slug) => itens.find((i) => i.slug === slug);

  const ice = get("ice-arabica-ny");
  const cepeaA = get("cepea-arabica");
  const cepeaR = get("cepea-robusta");
  const londres = get("ice-robusta-londres");
  const usd = dados.cambio.usdbrl;

  return (
    <div>
      <div className="grid grid-2">
        {cepeaA && (
          <Card label="CEPEA/ESALQ Arábica" valor={num(cepeaA.valor)} unidade="R$/saca" delta={cepeaA.variacaoPct} />
        )}
        {ice && (
          <Card label="ICE Arábica — Nova York" valor={num(ice.valor)} unidade="US¢/lb" delta={ice.variacaoPct} brl={ice.valorBRLsaca} />
        )}
        {cepeaR && (
          <Card label="CEPEA/ESALQ Robusta/Conilon" valor={num(cepeaR.valor)} unidade="R$/saca" delta={cepeaR.variacaoPct} />
        )}
        {londres && (
          <Card label="ICE Robusta — Londres" valor={num(londres.valor)} unidade="US$/ton" delta={londres.variacaoPct} brl={londres.valorBRLsaca} />
        )}
      </div>

      <div className="card" style={{ marginTop: "var(--s4)" }}>
        <div className="label">Dólar comercial (PTAX)</div>
        <div className="big">
          {usd != null ? `R$ ${num(usd, 4)}` : "—"} <span className="unit">por US$ 1</span>
        </div>
        <div className="delta muted">Base para converter todos os preços em dólar para R$/saca.</div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: "var(--s4)" }}>
        Atualizado em {dataBR(dados.fetchedAt)}. Toque em “Cotações” para ver os {itens.length} indicadores, ou use o “Conversor”.
      </p>
    </div>
  );
}
