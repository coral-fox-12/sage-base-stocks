# Sage — research agent for tokenized stocks on Base

Built for the **Base Stocks Maxxing Season** (Nov 5 – Dec 5, 2026),
**Agentic Stock Finance** track. See [PLAN.md](PLAN.md) for the full verified
picture: prize, deadline, eligibility, and submission checklist.

## What it is

An agent that researches Coinbase tokenized stocks on Base:

- **Live prices, no key:** reads Chainlink price feeds on Base mainnet through the
  public RPC (`https://mainnet.base.org`). Verified live 2026-11-17 (NVDA $156.31).
- **Deterministic briefs:** 24h/7d change from Chainlink round history, volatility,
  momentum score 0–100 — fixed, auditable rules in `js/analysis.js`. If a feed is
  stale (>25h), the score is withheld.
- **Paper portfolio:** virtual $10,000, simulated trades at the live feed price,
  stored only in the browser. No real money, no custody, no execution.
- **Optional AI rewrite:** paste your own Gemini key (browser localStorage only)
  to rewrite a brief in natural language. Works fully without any key.
- **Onchain anchor:** `contracts/ResearchAnchor.sol` stores `keccak256(brief)` so
  a brief's existence and content are verifiable. Source only — not yet deployed
  (needs Base Sepolia test ETH from a faucet).

**Not financial advice. No real trading. Not available to US users for trading —
this app does not trade at all.**

## Run locally

```bash
# tests (13 tests, incl. one live-RPC check that skips cleanly offline)
npm test

# serve the static site (any static server; e.g.)
npx serve .
# or
python3 -m http.server 8080
```

Open http://localhost:8080 — the app fetches live prices from Base in your browser.

## Deploy (Surge)

```bash
cd ~/workspace/makefun/base-stocks-maxxing
surge . sage-stocks-base.surge.sh
```

## Honesty rules

- Prices come ONLY from Chainlink feeds on Base. RPC failure → "data unavailable",
  never an invented price.
- A "Demo data" toggle exists for offline screenshots; OFF by default, every demo
  value labelled DEMO.
- The brief's score is withheld when the feed is stale or inputs are missing.
