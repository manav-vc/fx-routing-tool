# FX RouteDesk

FX RouteDesk is a TypeScript/Next.js take-home project for finding the best multi-leg FX route across fiat brokers and stablecoin venues. A user enters a source currency, target currency, amount, and rail filter; the app returns the top three routes ranked by final recipient amount.

## Links

- Deployed app: https://fx-routing-tool.vercel.app
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

## Real-world provider handling

Live provider calls use a short timeout, retry transient failures once, and classify HTTP 429 responses as rate limits. Each provider has a warm in-memory stale-quote cache and a small circuit breaker: after repeated full-provider failures, the app temporarily skips fresh calls to that provider and either uses cached quotes with a degraded status or marks the provider unavailable. Missing pairs and malformed responses are ignored instead of crashing the route search, so the app can still return useful routes from other providers.

## AI tools used

- Codex/ChatGPT served as a planning and implementation partner throughout the project.
- It helped break down the case-study requirements into concrete product features, while I made the final decisions on scope, data modeling, and tradeoffs for the 48-hour assessment.
- During routing design, I explored multiple approaches and chose to model providers and currency pairs as directed graph edges because that made multi-leg routing, fees, and route comparison easier to reason about.
- For implementation, it helped refine the TypeScript routing logic, API route, provider adapters, UI components, and tests.
- For verification, it supported unit tests, linting, type checks, production builds, deployment checks, and UI review.
- I pushed back on AI suggestions when they did not match the behavior I wanted, especially around fee handling, route display, and mobile responsiveness.
- The final product decisions were manually reviewed against the main goal: showing the best delivered amount clearly and making route tradeoffs easy to understand.


## One thing the AI got wrong

The AI initially made a mistake in the fee logic for multi-leg routes. When the same provider appeared more than once in a route, it treated the provider fee as if it only needed to be deducted once. That was incorrect because each leg is a separate conversion and should deduct its own fee, even if the provider name is repeated. I caught this by reviewing a multi-leg route where the same provider was used on multiple legs, then corrected the routing logic so fees are applied per leg using that leg's input amount before the conversion rate is applied.

## Longer-term improvements

If this project were extended beyond the take-home scope, I would add more real providers across both fiat and stablecoin rails, historical quote caching, and a small audit log so users could compare current routing decisions against recently observed provider behavior. I would also add stronger production-level features such as authentication, monitoring, provider health dashboards, deeper route decision traces, and more robust error reporting so the tool could move from an assessment prototype toward something reliable enough for broader real-world use.
