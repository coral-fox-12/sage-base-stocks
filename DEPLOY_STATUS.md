# Base Stocks Maxxing — onchain status (2026-11-17 ~08:30 +07)

## Done
- **Contract compiled + verified**: `ResearchAnchor.sol` with solc 0.8.24
  (optimizer on, 200 runs). Artifact `deploy-tools/artifact.json` — bytecode
  sha256 `70fd8489…`, ABI sha256 `12a11ac1…` (hashes verified against a fresh
  recompile). 1,584 bytes creation code. ABI: `anchorBrief(string,bytes32)`,
  `briefCount()`, `briefs(uint256)`, `anchored(bytes32)`, event `BriefAnchored`.
- **Deploy script ready**: `deploy-tools/deploy.mjs` (ethers 6.17 from
  `/tmp/evm2/node_modules` — reinstall if a VM replacement wipes /tmp).
  Dry-run verified 08:2x: wallet matches the ledger, deploy gas 393,786,
  worst-case total (deploy + one anchor tx) ≈ **0.0000036 ETH**. Any faucet
  drip (0.05–0.1 ETH) covers it ~15,000× over. The script deploys, verifies
  `briefCount()==0`, then anchors one REAL NVDA brief built from live
  Chainlink data (same rules as the app) and verifies `briefCount()==1` +
  the stored hash. It prints a JSON record to stdout and writes no files.
  Key is read from the ledger at runtime and never printed.
- **Anchor button wired + live**: `js/config.js` (`ANCHOR_CONTRACT`, null
  until deployed), `js/anchor.js` (hand-rolled `anchorBrief` calldata encoder
  — byte-identical to ethers' encoder on NVDA/TSLA/40-char symbols; wallet
  flow via lazily-loaded ethers UMD + MetaMask on Base Sepolia), `js/app.js`
  (button enables only when a contract is set AND a brief exists; honest
  status text otherwise). Tests **15/15 pass** (13 original + 2 new).
- **Site re-deployed**: https://sage-base-stocks.surge.sh — all files HTTP 200,
  anchor button present and disabled with the honest "awaiting testnet
  deployment" text. Surge auth already present (`~/.netrc`); `surge login`
  via piped stdin does NOT work (needs a TTY) — use the saved session.

## BLOCKED — no Base Sepolia ETH (wallet 0x592D…4cA0 has 0 ETH)
Faucets tried from the shell (2026-11-17 ~08:15–08:30 +07):

| Faucet | Result | What it needs |
|---|---|---|
| QuickNode faucet.quicknode.com | BLOCKED | **a small mainnet balance on the claiming wallet** ("to prevent abuse") — wallet has 0 on every mainnet. No account needed otherwise. |
| Chainlink faucets.chain.link | BLOCKED | **Cloudflare Turnstile** in the page JS (sitekey `faucets-turnstile`). Needs a browser that can pass it. |
| pk910 PoW sepolia-faucet.pk910.de | BLOCKED | **custom captcha required to start a session** (`INVALID_CAPTCHA: captcha token missing`); faucet itself is funded (~6.3 ETH). Mining is PoW (difficulty 11, min claim 0.05 ETH) but the captcha gate comes first. |
| Alchemy alchemy.com/faucets/base-sepolia | NOT TRIED (browser) | **Alchemy account** (email signup, no card). Likely 0.1 ETH/day. |
| Coinbase coinbase.com/faucets/base-sepolia-faucet | NOT TRIED (browser) | **Coinbase account** (heavier; may want phone/ID). |
| Triangle / LearnWeb3 | 503 via this VM's proxy | unknown; likely captcha/account too. |
| Thirdweb faucet | 404 (moved/removed) | — |

## Exact next step (parent / browser task)
1. In a browser, claim Base Sepolia ETH for `0x592D5dA3025B3d36ECa64bFBeFdeF96A3d4B4cA0`
   — easiest first try: **Alchemy faucet** (create a free Alchemy account with
   coral-fox-12@proton.me, no card), fallback: **Chainlink faucet** (Turnstile
   may pass on the device browser; it fails on the cloud browser).
   Any 0.05+ ETH is far more than enough.
2. Run: `cd ~/workspace/makefun/base-stocks-maxxing/deploy-tools && node deploy.mjs`
   (prints the deployment JSON: contract address, deploy tx, anchor tx).
3. Set `ANCHOR_CONTRACT` in `js/config.js` to the deployed address.
4. Re-deploy: `cd ~/workspace/makefun/base-stocks-maxxing && surge . sage-base-stocks.surge.sh`
5. Smoke-test: open the site, generate a brief, click Anchor with a wallet on
   Base Sepolia (needs a few cents of Sepolia ETH in that wallet — the same
   faucet drip can fund it).

## Still left for the entry (parent-owned)
- Demo video (1–2 min) + public X post tagging @buildonbase
  (X account @coral_fox_12 now exists).
- Google Form submission before **11:59 VN 06/12/2026** (track: Agentic
  Stock Finance; wallet for USDC prize: 0x592D5dA3025B3d36ECa64bFBeFdeF96A3d4B4cA0).
- Build-in-public posts on X during the season (traction is ~50% of score).
