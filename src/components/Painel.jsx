// components/Painel.jsx — visão geral: os números-cabeça do mercado de café.
import { num, pct, reais, sinal, dataBR } from "../format.js";

function Card({ label, valor, unidade, delta, brl, data, desatualizado }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="big">
        {valor} <span className="unit">{unidade}</span>
      </div>
      {delta != null && <div className={`delta ${sinal(delta)}`}>{pct(delta)} no dia</div>}
      {brl != null && <div className="delta muted">≈ {reais(brl)}/saca</div>}
      {desatualizado ? (
        <div style={{ marginTop: 6 }}>
          <span className="stale">⚠ sem atualização desde {data ? dataBR(data) : "data desconhecida"}</span>
        </div>
      ) : (
        data && <div className="pricedate" style={{ marginTop: 6 }}>Preço de {dataBR(data)}</div>
      )}
    </div>
  );
}

function AvisoDesatualizados({ itens }) {
  const parados = itens.filter((i) => i.desatualizado);
  if (!parados.length) return null;
  const nomes = parados.slice(0, 3).map((i) => i.nome.split("—")[0].trim());
  return (
    <div className="stale-banner" role="alert">
      <span aria-hidden="true">⚠️</span>
      <span>
        <b>{parados.length === 1 ? "1 cotação está" : `${parados.length} cotações estão`} sem atualização</b>{" "}
        há mais de 2 dias úteis: {nomes.join(", ")}{parados.length > 3 ? "…" : "."}{" "}
        Veja as datas em “Cotações” — cada preço mostra quando foi publicado.
      </span>
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
      <AvisoDesatualizados itens={itens} />
      <div className="grid grid-2">
        {cepeaA && (
          <Card label="CEPEA/ESALQ Arábica" valor={num(cepeaA.valor)} unidade="R$/saca" delta={cepeaA.variacaoPct} data={cepeaA.data} desatualizado={cepeaA.desatualizado} />
        )}
        {ice && (
          <Card label="ICE Arábica — Nova York" valor={num(ice.valor)} unidade="US¢/lb" delta={ice.variacaoPct} brl={ice.valorBRLsaca} data={ice.data} desatualizado={ice.desatualizado} />
        )}
        {cepeaR && (
          <Card label="CEPEA/ESALQ Robusta/Conilon" valor={num(cepeaR.valor)} unidade="R$/saca" delta={cepeaR.variacaoPct} data={cepeaR.data} desatualizado={cepeaR.desatualizado} />
        )}
        {londres && (
          <Card label="ICE Robusta — Londres" valor={num(londres.valor)} unidade="US$/ton" delta={londres.variacaoPct} brl={londres.valorBRLsaca} data={londres.data} desatualizado={londres.desatualizado} />
        )}
      </div>

      <div className="card" style={{ marginTop: "var(--s4)" }}>
        <div className="label">Dólar comercial (PTAX)</div>
        <div className="big">
          {usd != null ? `R$ ${num(usd, 4)}` : "—"} <span className="unit">por US$ 1</span>
        </div>
        <div className="delta muted">Base para converter todos os preços em dólar para R$/saca.</div>
        {dados.cambio.desatualizado ? (
          <div style={{ marginTop: 6 }}>
            <span className="stale">⚠ sem atualização desde {dados.cambio.data ? dataBR(dados.cambio.data) : "data desconhecida"}</span>
          </div>
        ) : (
          dados.cambio.data && <div className="pricedate" style={{ marginTop: 6 }}>PTAX de {dataBR(dados.cambio.data)}</div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: "var(--s4)" }}>
        Atualizado em {dataBR(dados.fetchedAt)}. Toque em “Cotações” para ver os {itens.length} indicadores, ou use o “Conversor”.
      </p>
    </div>
  );
}
