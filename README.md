# FX RouteDesk

FX RouteDesk is a TypeScript/Next.js take-home project for finding the best multi-leg FX route across fiat brokers and stablecoin venues. A user enters a source currency, target currency, amount, and rail filter; the app returns the top three routes ranked by final recipient amount.

## Links

- Deployed app: _to be added after Vercel deployment_
- GitHub repo: https://github.com/manav-vc/fx-routing-tool

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Useful checks:

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

The app does not require API keys. Live fiat quotes come from the free Frankfurter, ExchangeRate-API open endpoint, and fawazahmed0 currency API sources listed in `data/providers.json`.

## How the routing problem is modeled

Each provider/currency pair is represented as a directed edge in a graph. For every leg, the source-currency fee is deducted first using `amount * fee_percent + fee_flat`, then the remaining amount is converted by that leg's rate. The router searches simple paths up to three legs, prevents repeated currencies, and ranks candidate routes by final delivered amount. The direct one-leg route is computed separately when available so each top route can show the difference versus the direct benchmark.

## AI tools used

I used Codex/ChatGPT as a planning and implementation partner: extracting the PDF requirements, turning the assignment into a concrete product plan, designing the routing model, writing the initial TDD tests, checking API response shapes, and iterating on the dashboard UI. I also used it to keep the README aligned with the assignment prompt instead of only documenting how to run the app.

One thing the AI got wrong: it initially scaffolded Next.js with `--src-dir`, which triggered a Windows/OneDrive rename permission failure. I caught it from the scaffold error output, removed only the incomplete generated folder, and re-scaffolded without `--src-dir`. Another tooling issue caught during verification was Vitest 4 pulling a missing Rolldown native binding, so I pinned Vitest to `2.1.9` after the red test run exposed the problem.

## What I would do differently with more time

I would add historical quote caching and a small audit log so ops users can compare current routing against recently observed provider behavior, rather than only seeing a point-in-time quote.
