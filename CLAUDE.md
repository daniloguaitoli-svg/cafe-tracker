# CLAUDE.md — Café Tracker

Guidance for AI assistants working in this repository.

## What this is

A React + Vite PWA that tracks the Brazilian coffee market: CEPEA/ESALQ arabica
and robusta indicators, ICE New York / ICE London / B3 futures, export parity,
and the regional physical market by município.

It mirrors the architecture of the sibling Soja Tracker / Cana Tracker / ETF
Tracker projects. Deployed on Vercel; pushes to `main` auto-deploy.

**The whole app is in Portuguese (pt-BR)** — UI copy, code comments, identifiers,
commit messages. Keep writing in Portuguese here. (This file is in English only
because it's assistant-facing.)

**Design voice:** "painel de instrumentos", dark roast — layered roasted browns
with a caramel `--accent`, every number in tabular monospace.

## Stack and constraints

| | |
|---|---|
| Language | **Plain JavaScript (ESM)** + JSX. **No TypeScript** — do not add it. |
| UI | React 18, function components + hooks only. |
| Build | Vite 5 (`"type": "module"`) |
| Dependencies | **react + react-dom only.** No UI kit, no chart library, no HTML parser, no state manager. Charts are hand-rolled SVG (`Sparkline.jsx`, `AreaChart.jsx`, `DualChart.jsx`); scraping is done with plain regex. Keep it that way unless asked. |
| Styling | One global stylesheet, `src/styles.css`. No CSS modules, no Tailwind. |
| Tests / lint | **No test runner, no ESLint, no Prettier** — don't invent an `npm test`. What exists is `npm run verificar` (`scripts/verificar.mjs`, dependency-free) plus `npm run build`; CI runs both on every PR. |
| Node | 18+ |

`.npmrc` sets `legacy-peer-deps=true` so Vercel's strict install doesn't fail on
peer-dependency drift. Don't remove it.

## Commands

```bash
npm install
npm run dev        # Vite + the dev /api middleware; host exposed on the LAN
npm run build      # production build
npm run verificar  # loads server/ + asserts the invariants this file declares
npm run preview

node .github/scripts/coletar-cepea.mjs   # run the CEPEA collector by hand
```

**Run both `build` and `verificar` — neither covers the other.** `vite build`
only bundles `src/`, so it never even parses `server/`: a broken import, a
catalogue entry missing a required field, a cache slug orphaned by a rename, or
a constant that drifted out of sync between `server/util.js` and
`Conversor.jsx` all pass the build and fail at request time in production
instead. This is not hypothetical: removing the dead `secao` field from the
catalogue passed `npm run build` without the build ever opening the changed
file. `scripts/verificar.mjs` is what covers that half, and
`.github/workflows/ci.yml` runs both on every PR.

`vite.config.js` sets `watch: { ignored: ["**/data/**"] }` — the snapshot store
writes `data/snapshots.json` on every quote read, and without this the watcher
reloads the page mid-use and kicks the user back to the "Painel" tab. Don't
remove it.

## Architecture

```
index.html            entry, fonts, PWA tags (lang="pt-BR")
src/
  main.jsx            mounts React + service worker (PROD only, auto-reload on update)
  App.jsx             frame: topbar (brand + USD/BRL), 5 tabs, full-screen Detalhe
  api.js              the only data import for the UI — thin fetch wrappers over /api
  format.js           pt-BR formatting (num, preco, reais, pct, sinal, dataBR, …)
  components/         Painel, Cotacoes, Mercado, Conversor, Alertas, Detalhe + widgets
  styles.css          design tokens at the top, then components
server/
  catalogo.js         the FIXED indicators (futures + CEPEA)
  datalayer.js        facade — combines all sources, normalises units, builds payloads
  util.js             unit conversions (saca/lb/ton) + pt-BR parsing
  store.js            "history that grows": daily snapshots per slug
  cepea-cache.json    versioned CEPEA cache + accumulated history (written by CI)
  providers/
    noticiasagricolas.js  PRIMARY source (regex-scraped HTML)
    cepea.js              CEPEA widget + fallback to the versioned cache
    yahoo.js              free history for ICE arabica (KC=F)
    bcb.js                official PTAX FX (USD/BRL, EUR/BRL) with history
    openmeteo.js          rainfall vs. historical average in the coffee regions
api/                  Vercel serverless functions: cotacoes, detalhe, cambio, mercado, clima
.github/
  workflows/coletar-cepea.yml   scheduled CEPEA collection (12:00 & 21:00 UTC)
  scripts/coletar-cepea.mjs     the collector itself
.claude/launch.json   dev launch config (npm run dev, port 5173)
public/               PWA manifest + service worker
Café.xlsx             the user's original Bloomberg spreadsheet — the source of the
                      `bloomberg` tickers in the catalogue. Reference only; no code
                      reads it, and nothing in the app parses xlsx.
```

The five tabs in `App.jsx` are `Painel · Cotações · Mercado · Conversor ·
Alertas`, one component each, and `Detalhe` replaces the whole frame when a slug
is selected. `App.jsx` loads `getCotacoes()` **once** and passes `dados` down to
Painel / Cotações / Conversor / Alertas; `Mercado` and `Detalhe` fetch their own
endpoints. So a new field on the `getCotacoes` payload reaches four screens for
free, and the footer `aviso` comes from that same payload.

### The one data path

The UI never fetches a source directly. `src/api.js` exposes five calls:

```
getCotacoes()          -> { fetchedAt, cambio, cepeaCacheEm, fatorSaca,
                            categorias: [{ nome, itens: [...] }], aviso }
getDetalhe(slug, tf)   -> { slug, item, tf, pontos, estatisticas, notaHistorico, aviso }
getCambio()            -> PTAX USD/BRL + EUR/BRL
getMercado()           -> índices (1D/30D/12M), spread arábica × robusta, séries
getClima()             -> chuva 30d vs. média histórica por região cafeeira
```

Each maps to same-origin `/api/*`, served **twice from the same module**:

- **dev** — the `devApi()` middleware in `vite.config.js`
- **prod** — the Vercel functions in `api/*.js`

Both import `server/datalayer.js`. Change the payload shape there and both
environments follow. Adding a *new* endpoint means wiring **three** places: a
`datalayer.js` export, the `devApi()` middleware, and a new `api/<name>.js`.
Forgetting the last one means it works in dev and 404s in production.

### The catalogue covers only the fixed indicators

`server/catalogo.js` defines the **5 fixed** indicators, grouped by `CATEGORIAS`
(`FUTUROS`, `CEPEA`, `FISICO`, `EXPORTACAO`):

| Field | Meaning |
|---|---|
| `slug` | stable id used in `/api` routes, snapshots and the cache — **never rename casually**, it breaks accumulated history |
| `nome`, `descricao` | pt-BR label and explanatory note shown in the UI |
| `categoria` | groups it on the Cotações screen |
| `unidade` | native unit: `USC_LB`, `USD_SACA`, `USD_TON`, `BRL_SACA` |
| `moeda` | the unit's display label (`"US¢/lb"`, `"R$/saca"`, …) |
| `fonte` | attribution string shown in the UI |
| `cepeaId` | CEPEA widget id (arabica 23, robusta 24) |
| `yahoo` | Yahoo symbol when free history exists (only `KC=F`) |
| `bloomberg` | reference ticker from `Café.xlsx` — not fetched, but **displayed** as a pill in Detalhe |

Every field above is actually read by something. A `secao` field (the heading
title on the Notícias Agrícolas page) used to sit here on all five entries but
was never read by any code, so it was removed — the scraper matches headings
with its own anchored regexes in `providers/noticiasagricolas.js`, independently
of the catalogue. If you need to tie an indicator to a specific heading, that
matching lives in the provider, not here.

The only derived export is `porSlug`. Note what this catalogue does **not** have,
unlike the sibling Cana Tracker: no `periodicidade`, no `principal`, no
`viaWidget`, and no `LIMITE_DIAS_UTEIS` map. Staleness here is a single flat rule
(see below). Don't port those fields over without a reason.

**Most rows on screen are not in the catalogue.** They're built at request time
in `datalayer.js`:

- the **regional physical market** rows come from the per-município tables
  scraped in `providers/noticiasagricolas.js`, keyed by a generated slug
  (`slugFisico()`, accent-stripped)
- `paridade-ice-brl` and `diferencial-cepea-ice` are computed

Because physical slugs are generated from municipality + cooperative + group,
changing `slugFisico()` **orphans every snapshot already collected** under the
old slugs. Treat it as a data migration, not a refactor.

To add a fixed indicator: add its catalogue entry, then make sure some provider
can actually read it (a Notícias Agrícolas table match, a `cepeaId`, or a Yahoo
symbol), and add it to the explicit slug lists in `getCotacoes()` — that function
iterates hard-coded arrays (`["ice-arabica-ny", "b3-arabica", …]`), it does not
walk the whole catalogue.

### Units: everything becomes R$/saca

Coffee is quoted in US cents per pound, dollars per sack and dollars per tonne
at once, so `server/util.js` owns all conversions and normalises everything to
**R$/saca de 60 kg**.

```
LB_POR_SACA  = 60 / 0.45359237 ≈ 132.2774
TON_POR_SACA = 0.06
```

- `paraReaisPorSaca` — `USC_LB` (÷100 first — it's **cents**), `USD_SACA`,
  `USD_TON`, `BRL_SACA`
- `deReaisPorSaca` — the inverse, for the Conversor

`parseNumBR` handles pt-BR numbers (`"1.712,39"` → `1712.39`) and returns `null`
for "s/ cotação", `***`, `-`, etc. `isoDeBR` accepts **only** `dd/mm/aaaa` here.

#### Constants duplicated on purpose

`server/` and `src/` never import from each other — the client only ever sees
JSON from `/api`. So the converter re-implements the arithmetic client-side to
compute as the user types. `LB_POR_SACA` and `TON_POR_SACA`, plus the
conversion switch statements, exist in **both** `server/util.js` and
`src/components/Conversor.jsx`. Change one, change the other.

`LB_POR_TON = 2204.6226` lives in `datalayer.js` (not `util.js`) because its only
use is the arabica × robusta spread.

### Derived rows and the oldest-date rule

`getCotacoes()` synthesises two rows, and `getMercado()` a third:

| Row | Formula |
|---|---|
| `paridade-ice-brl` | ICE arabica (US¢/lb) → R$/saca via PTAX — gross export parity |
| `diferencial-cepea-ice` | `CEPEA arábica − paridade ICE`. Positive = domestic market above export parity |
| `spread` (Mercado) | arabica − robusta, both in US¢/lb (robusta converted from US$/ton via `LB_POR_TON`) |

**A derived row inherits the OLDEST date of its inputs**, never the newest — it
is only as fresh as its least-updated component. `getCotacoes()` does this
explicitly. Preserve that if you add another.

### Staleness is one flat rule

`anotarData()` tags every item with `data` (ISO), `diasSemAtualizar` and
`desatualizado`, using **business days** and a single `LIMITE_DIAS_UTEIS = 2`
defined at the top of `datalayer.js`. Holidays aren't modelled — the 2-day slack
absorbs isolated national holidays. An item with no parseable date is marked
stale rather than fresh.

### History: three different mechanisms

Only ICE arabica and FX have free historical series. Everything else has to be
accumulated:

1. **Yahoo** (`providers/yahoo.js`) — a real series for `KC=F` only, by timeframe
   (`1M · 3M · 6M · 1A · 5A`), via `historicoKC()`. Robusta (London) and the B3
   contract have **no** free history.
2. **Local snapshots** (`server/store.js`) — one point per slug per day, written
   on every `getCotacoes()`. Persists to `data/snapshots.json` locally, but on
   Vercel (`process.env.VERCEL`) it lands in `/tmp/cafe-snapshots.json` and
   **dies on every cold start**. The local path is anchored to the module's own
   location, not `process.cwd()`; writes are best-effort and swallow errors on a
   read-only filesystem.
3. **Versioned CEPEA cache** (`server/cepea-cache.json`) — written by the
   scheduled GitHub Actions job. This is the **only** history for the CEPEA
   indicators that survives, because it lives in the repo.

`serieCompleta(slug)` in `datalayer.js` merges (2) and (3). When a series is too
short the API returns `notaHistorico` explaining that the chart grows over time —
keep surfacing that honestly rather than faking a series.

Snapshots are recorded under the **real publication date** of the price
(`it.data`), falling back to today only when the source omits it — so a stale
source doesn't fabricate a new daily point.

### Why the CEPEA collector exists (important)

`cepea.org.br` sits behind a Cloudflare anti-bot challenge that returns **403 to
Vercel functions in every region**. GitHub Actions runners are normally served —
which is the whole reason collection runs there and not in a Vercel function.

**That access is not guaranteed: it lapsed once already.** From 02/09/2026 until
midday 04/09/2026 Cloudflare returned **403 to GitHub Actions runners too**. A
probe tried six routes from a runner — full browser header set (`Sec-Fetch-*`,
`Sec-Ch-Ua`, `Referer`), the USP host `cepea.esalq.usp.br`, with and without
`www`, the indicator page, and a home-then-widget flow carrying cookies. **All
six returned 403, including the site's own home page.** That is an IP-range
block, not a request-shape problem — so if it recurs, don't spend a round on
header tweaks: the probe already settled that question. The only routes left
would be solving the Cloudflare JS challenge, or collecting from an IP the site
serves (your own machine, or a small VPS pushing `cepea-cache.json` to the repo).

**Recovered 04/09/2026.** The runner has been served since that evening: real
values landed in `cepea-cache.json` with their dates moving to `04/09/2026`, and
every scheduled run since has collected. So treat a 403 as a condition that
comes and goes, not a standing verdict — and check before assuming either way.
`atualizadoEm` is the reliable signal, because the failure policy below moves it
*only* on a genuine collection: if it advanced, the runner got through.

**What a block does NOT break:** Notícias Agrícolas is the *primary* source here
and kept responding throughout; the CEPEA widget is reinforcement plus the
versioned history. The apps stayed up, serving the cache flagged `viaCache`.
 Here CEPEA is the *fallback* (Notícias Agrícolas is primary), so without
the collector production simply loses its safety net. So:

- `.github/workflows/coletar-cepea.yml` runs twice a day (12:00 and 21:00 UTC =
  9h/18h Brasília) and on `workflow_dispatch`.
- `.github/scripts/coletar-cepea.mjs` reads every catalogue entry with a
  `cepeaId` (with retries — the first 403 per run is expected), keeps the
  previous value on failure, appends to the history, and writes
  `server/cepea-cache.json`.

  **Failure policy (changed 03/09/2026).** A run that collects nothing no longer
  fails outright — that turned a known, ongoing block into two emails a day. Now:

  | Outcome | `atualizadoEm` | File | Exit |
  |---|---|---|---|
  | anything collected | set to now | written | 0 |
  | nothing, cache ≤ `LIMITE_DIAS_BLOQUEIO` (3d) | untouched | **not written** | 0, loud warning |
  | nothing, cache older than that | untouched | **not written** | 1 — a real defect, email it |

  Two properties are load-bearing. `atualizadoEm` now moves **only on a real
  collection** — it used to be rewritten on every run, stamping today's date on
  three-day-old data, and the app shows that stamp to the user. And a blocked run
  writes nothing at all, so there is no diff, no commit and no pointless deploy.
- The workflow commits the file with `github-actions[bot]`, and that commit
  triggers a fresh Vercel deploy — that's how new data reaches production.
- In dev the app reads CEPEA live; in production it falls back to the cache.

Consequences to remember: expect frequent bot commits touching
`server/cepea-cache.json`; and GitHub suspends scheduled workflows after 60 days
of repo inactivity (re-enable in the Actions tab).

`providers/cepea.js` loads the JSON via `createRequire` rather than `fs` **on
purpose** — a static require makes Vercel's file tracer bundle the JSON into the
function. Don't "modernise" it to `readFile`.

## Scraping is best-effort — treat it as such

`providers/noticiasagricolas.js` parses server-rendered HTML with regex,
associating each `<table>` with the nearest preceding heading. Headings can
contain each other, so matching is always via an **anchored regex on the
distinguishing fragment** — keep it that way. The real per-price date comes from
the `"Atualizado em: dd/mm/aaaa"` footer the page prints with each table, not
from the fetch time. If the source's HTML changes, this file is where the fix
goes; Yahoo and the CEPEA widget reinforce the headline numbers.

Provider caches are in-process with TTLs (10 min Notícias Agrícolas/Yahoo,
30 min CEPEA widget/BCB, 12 h climate). Be gentle with these free sources — the
collector even sleeps 800 ms between reads.

## Conventions

- **Portuguese everywhere** — identifiers (`carregar`, `pontos`, `desatualizado`,
  `arred`), UI copy, and comments. Don't mix in English names.
- **Comments explain *why*.** Every module opens with a header comment stating
  its job and the reasoning behind non-obvious choices (why the collector
  exists, why `/tmp` is ephemeral, why the watcher ignores `data/`). Match that
  density — it's the house style.
- **Numbers go through `src/format.js`** (`num`, `preco`, `reais`, `pct`,
  `sinal`, `dataBR`, `dataCurtaBR`, `horaBR`) and render with the mono class.
  `num(v, casas)` switches to up-to-4 decimals when `casas > 2` — used for FX.
  `Intl` locale is `pt-BR`; times use `America/Sao_Paulo`.
- **Design tokens only** — the custom properties at the top of `src/styles.css`.
  No hard-coded hexes or pixel gaps in components.
  - surfaces `--bg` `--surface` `--surface-2` `--line`
  - text `--text` `--muted`
  - semantics `--up` `--down` `--accent` `--accent-2`
  - type `--display` (Space Grotesk) `--ui` (Inter) `--mono` (IBM Plex Mono)
  - layout `--s1`…`--s7` (4→48px) `--radius` `--maxw`

  Caramel `--accent` is for the active tab and focus only.
- **Loading / error / empty states** come from `components/States.jsx`
  (`Loading`, `Skeletons`, `ErroBox`, `Vazio`). Extend those rather than
  hand-rolling.
- **Server does the maths; components display.** Conversions, parity, spread,
  staleness and statistics belong in `server/util.js` / `server/datalayer.js`.
  The one deliberate exception is the Conversor's live client-side arithmetic.
- **Missing data is `null`, rendered as `—`.** Providers return `null` rather
  than guessing; `Promise.allSettled` and `try/catch` keep one dead source from
  blanking the screen. `varDias()` returns `null` when the series doesn't reach
  the requested window, so a 3-day-old snapshot series never shows a fake "30D".
  Never substitute an invented number.
- Effects that set state use a local `vivo`/`active` flag to avoid updating an
  unmounted component.

## Honest-caveats rule

The README lists real limitations: history for CEPEA and the physical market
grows from daily collection; the "diferencial doméstico × ICE" is a **didactic
approximation**, not the official Santos export differential; the scrape can
break. Every screen carries the `aviso`/footer disclaimer: public sources,
possibly delayed, informational only — **not investment advice**. If you add a
feature with a similar caveat, state it in the UI and the README instead of
implying more precision than free data supports.

## Deployment notes

- `api/*.js` are Vercel functions: `export default async function handler(req, res)`,
  params off `req.query`, 400 on a missing param, 502 on upstream failure. Keep
  them thin. Cache windows follow how fast the data moves: `cotacoes`, `detalhe`,
  `cambio` and `mercado` use `s-maxage=600, stale-while-revalidate=3600`; `clima`
  uses `s-maxage=21600, stale-while-revalidate=86400` (6 h / 24 h), because
  rainfall updates daily at best. Copy the neighbour that resembles your endpoint.
- `getDetalhe(slug, tf)` defaults to `tf = "3M"` in both `src/api.js` and the
  datalayer. Only `ice-arabica-ny` has a real timeframe-capable series.
- The service worker (`public/sw.js`) is **network-first for navigation** (always
  fetch the fresh `index.html`, fall back to cache only offline), **cache-first
  for hashed `/assets/*`** (immutable, the filename changes each build), and
  never caches `/api/*`. Note the naming is the inverse of the sibling ETF
  Tracker: here `CACHE` is the version string to bump — currently
  `"cafe-tracker-v2"`, already bumped once — and `SHELL` is the list of
  precached paths.
- `src/main.jsx` registers that worker in production, checks for updates hourly,
  and reloads **once** when a new version installs over an existing controller —
  so users of the installed PWA pick up deploys automatically.
- Alerts are stored per device in `localStorage` under `cafe-tracker-alertas`,
  read/written directly in `components/Alertas.jsx` (no store module).
- A broken change fails the Vercel build and the previous deploy stays live;
  `npm run build` locally is still the right pre-push check.

## Git

- Develop on the branch you were given; commit with clear pt-BR messages; push
  with `git push -u origin <branch>`.
- Don't open a PR unless the user asks.
- Expect automated `github-actions[bot]` commits touching
  `server/cepea-cache.json` — rebase/pull before pushing rather than fighting
  them, and don't hand-edit that file.
- No API keys are needed: every source (Notícias Agrícolas, CEPEA, Yahoo, BCB,
  Open-Meteo) is free and key-less. `.env` is gitignored; don't add a secret
  without asking.
