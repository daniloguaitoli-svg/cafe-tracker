# ☕ Café Tracker — Preços do Café no Brasil

App web (PWA) para acompanhar os preços do café no mercado brasileiro — mercado
**físico** e de **exportação** — todo em português. Inspirado no ETF Tracker.

Reúne, a partir de **fontes públicas e gratuitas**, o essencial que antes exigia
um terminal Bloomberg:

- **Indicadores CEPEA/ESALQ** — Café Arábica e Robusta/Conilon (R$/saca de 60 kg)
- **Futuros das bolsas** — ICE Arábica (Nova York), Arábica B3 (Brasil) e Robusta (Londres)
- **Mercado físico regional** — preços por cooperativa/município (Sul de Minas, Cerrado, etc.)
- **Câmbio oficial** — USD/BRL e EUR/BRL (PTAX, Banco Central)
- **Conversor** de unidades (¢/lb ↔ US$/saca ↔ US$/ton ↔ R$/saca) e **paridade de exportação**
- **Alertas** de preço (salvos no próprio aparelho)

## Fontes de dados (todas gratuitas)

| Dado | Fonte |
|------|-------|
| CEPEA, futuros ICE/B3/Londres, físico regional | [Notícias Agrícolas](https://www.noticiasagricolas.com.br/cotacoes/cafe) (que republica CEPEA/ESALQ, ICE, B3) |
| Histórico do ICE Arábica (gráfico) | Yahoo Finance (`KC=F`) |
| Câmbio USD/BRL e EUR/BRL | [Banco Central do Brasil (PTAX/SGS)](https://dadosabertos.bcb.gov.br) |
| Reforço dos indicadores CEPEA | Widget público do [CEPEA](https://www.cepea.org.br) |

> **Equivalência com a planilha Bloomberg:** os valores batem com os tickers
> originais (ex.: Indicador CEPEA Arábica = `BAINCOFE`; ICE `KC1`; Robusta `DF1`;
> B3 `AX1`). O ticker Bloomberg de referência aparece na tela de detalhe de cada indicador.

## Como rodar

Requisitos: **Node.js 18+**.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173` (a porta aparece no terminal). O servidor já sobe
com `host` ativo, então você também pode abrir no **celular pela mesma rede
Wi‑Fi**, no endereço `http://SEU_IP_LOCAL:5173` que o Vite mostra em "Network".

Para instalar como app no celular: abra no Chrome/Safari e use
**"Adicionar à tela de início"** (é um PWA).

## Como compartilhar com um amigo (deploy na Vercel)

O app usa pequenas funções de servidor (pasta `api/`) porque as fontes não
permitem acesso direto do navegador. A [Vercel](https://vercel.com) roda tudo de
graça:

1. Crie uma conta na Vercel e instale a CLI: `npm i -g vercel`
2. Nesta pasta, rode: `vercel` (aceite os padrões — o framework Vite é detectado)
3. Para publicar a versão final: `vercel --prod`
4. Compartilhe o link `https://...vercel.app` com seu amigo. 🎉

Alternativa pelo site: suba a pasta para um repositório no GitHub e clique em
**"Import Project"** na Vercel. As rotas `/api/*` viram funções automaticamente.

## Estrutura

```
api/            funções serverless (cotacoes, detalhe, cambio)
server/         camada de dados
  catalogo.js       indicadores fixos (futuros + CEPEA)
  datalayer.js      fachada que combina as fontes e normaliza p/ R$/saca
  providers/        noticiasagricolas, yahoo, bcb, cepea
  store.js          histórico "que cresce" (snapshots diários)
  util.js           conversões de unidade e parsing pt-BR
src/            app React (componentes em português)
public/         manifest e service worker (PWA)
```

## Limitações honestas

- **Histórico real** existe para o ICE Arábica (Yahoo) e o câmbio (BCB). Para
  CEPEA e mercado físico **não há API gratuita de série histórica**, então o app
  guarda um **snapshot por dia** e o gráfico desses indicadores **cresce com o
  tempo** (começa curto). Na Vercel esses snapshots ficam em `/tmp` (efêmero).
- A leitura da Notícias Agrícolas é **melhor esforço**: se eles mudarem o HTML,
  o arquivo `server/providers/noticiasagricolas.js` precisa de um ajuste.
- O "diferencial doméstico × ICE" é uma **aproximação didática**, não o
  diferencial oficial de exportação de Santos.

## Aviso

Dados de fontes públicas, possivelmente com atraso. **Uso informativo — não é
recomendação de investimento.**
