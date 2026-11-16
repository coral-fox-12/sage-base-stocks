import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLatestRoundData, isStale, STALE_AFTER_MS } from '../js/feeds.js';
import {
  pctChange, stdDev, dailyReturns, annualisedVolatility, momentumScore,
  scoreLabel, buildBrief, newPaperPortfolio, paperBuy, paperSell, paperValue,
  PAPER_STARTING_CASH,
} from '../js/analysis.js';

// Real Chainlink latestRoundData response captured live from Base mainnet
// (NVDA feed 0x04689a41629776563E6822F76f2e57D148d28513, 2026-11-16 23:11 UTC).
// Words (64 hex chars each): roundId=phase2|round0x547, answer=0x3a3acaa99
// ($156.30903961), startedAt=0x6afb7b51, updatedAt=0x6afb7b5d, answeredInRound=same as roundId.
const NVDA_RAW =
  '0x0000000000000000000000000000000000000000000000020000000000000547' +
  '00000000000000000000000000000000000000000000000000000003a3acaa99' +
  '000000000000000000000000000000000000000000000000000000006afb7b51' +
  '000000000000000000000000000000000000000000000000000000006afb7b5d' +
  '0000000000000000000000000000000000000000000000020000000000000547';

test('decodeLatestRoundData: real NVDA feed response', () => {
  const d = decodeLatestRoundData(NVDA_RAW);
  // Chainlink roundIds on L2s are composite: phaseId << 64 | aggregator round.
  // Here phase 2, aggregator round 0x547 = 1351.
  assert.equal(d.roundId, '36893488147419104583');
  assert.ok(Math.abs(d.price - 156.30903961) < 1e-6, `price ${d.price}`);
  assert.equal(d.updatedAtUnix, 0x6afb7b5d);
  assert.equal(d.updatedAt.toISOString(), '2026-11-16T21:53:33.000Z');
  assert.equal(d.answeredInRound, '36893488147419104583');
});

test('decodeLatestRoundData: rejects malformed input', () => {
  assert.throws(() => decodeLatestRoundData('0x1234'), /malformed/);
  assert.throws(() => decodeLatestRoundData(null), /malformed/);
});

test('isStale: 25h rule', () => {
  const now = Date.now();
  assert.equal(isStale(Math.floor(now / 1000) - 60 * 60, now), false); // 1h old
  assert.equal(isStale(Math.floor(now / 1000) - 26 * 60 * 60, now), true); // 26h old
  assert.equal(STALE_AFTER_MS, 25 * 60 * 60 * 1000);
});

test('pctChange', () => {
  assert.equal(pctChange(110, 100), 10);
  assert.equal(pctChange(90, 100), -10);
  assert.equal(pctChange(100, 0), null);
  assert.equal(pctChange(NaN, 100), null);
});

test('stdDev + dailyReturns + annualisedVolatility', () => {
  assert.ok(Math.abs(stdDev([1, 2, 3, 4, 5]) - Math.sqrt(2)) < 1e-9);
  assert.equal(stdDev([5]), null);
  assert.deepEqual(dailyReturns([100, 110, 99]), [10, -10]);
  assert.deepEqual(dailyReturns([100]), []);
  const vol = annualisedVolatility([1, -1, 1, -1, 1, -1]);
  assert.ok(vol > 0 && vol < 100, `vol ${vol}`);
  assert.equal(annualisedVolatility([]), null);
});

test('momentumScore: rules and boundaries', () => {
  // Max bullish: +10% 7d, +5% 24h, 10% vol -> 100
  assert.equal(momentumScore({ change24h: 5, change7d: 10, volatility: 10 }), 100);
  // Max bearish: -10% 7d, -5% 24h, 80% vol -> 0
  assert.equal(momentumScore({ change24h: -5, change7d: -10, volatility: 80 }), 0);
  // Flat everything -> 50
  assert.equal(momentumScore({ change24h: 0, change7d: 0, volatility: 45 }), 50);
  // Missing input -> null (score withheld, never guessed)
  assert.equal(momentumScore({ change24h: null, change7d: 1, volatility: 20 }), null);
  assert.equal(momentumScore({ change24h: 1, change7d: 1, volatility: null }), null);
});

test('scoreLabel', () => {
  assert.equal(scoreLabel(null), 'NO SCORE — data stale or incomplete');
  assert.equal(scoreLabel(80), 'Strong momentum');
  assert.equal(scoreLabel(50), 'Neutral');
  assert.equal(scoreLabel(10), 'Negative momentum');
});

test('buildBrief: normal case carries sourcing + disclaimer', () => {
  const b = buildBrief({
    symbol: 'NVDA', name: 'NVIDIA', price: 156.31,
    updatedAt: '2026-11-16T21:53:33.000Z', updatedAtUnix: 1794855213, stale: false,
    change24h: 1.2, change7d: 4.5,
    closes: [140, 142, 141, 145, 148, 150, 152, 156.31],
  });
  assert.equal(b.symbol, 'NVDA');
  assert.equal(b.price, 156.31);
  assert.ok(Number.isFinite(b.score) && b.score >= 0 && b.score <= 100);
  assert.ok(b.volatility > 0);
  assert.ok(b.disclaimer.includes('Not financial advice'));
  assert.ok(b.source.includes('Chainlink'));
  assert.deepEqual(b.warnings, []);
  assert.ok(b.sections.snapshot.includes('$156.31'));
});

test('buildBrief: stale feed withholds score and warns', () => {
  const b = buildBrief({
    symbol: 'NVDA', name: 'NVIDIA', price: 156.31,
    updatedAt: '2026-11-14T21:53:33.000Z', updatedAtUnix: 1794682413, stale: true,
    change24h: 1.2, change7d: 4.5, closes: [140, 142, 145],
  });
  assert.equal(b.score, null);
  assert.equal(b.label, 'NO SCORE — data stale or incomplete');
  assert.ok(b.warnings.some((w) => w.startsWith('STALE FEED')));
});

test('buildBrief: no live price -> no score, explicit warning', () => {
  const b = buildBrief({
    symbol: 'NVDA', name: 'NVIDIA', price: NaN,
    updatedAt: null, updatedAtUnix: 0, stale: true,
  });
  assert.equal(b.price, null);
  assert.equal(b.score, null);
  assert.ok(b.warnings.some((w) => w.includes('NO LIVE PRICE')));
});

test('paper portfolio: buy/sell/P&L math', () => {
  let p = newPaperPortfolio();
  assert.equal(p.cash, PAPER_STARTING_CASH);
  p = paperBuy(p, 'NVDA', 10, 150);
  assert.equal(p.cash, 10000 - 1500);
  assert.equal(p.positions.NVDA.shares, 10);
  assert.equal(p.positions.NVDA.avgCost, 150);
  p = paperBuy(p, 'NVDA', 10, 160);
  assert.equal(p.positions.NVDA.avgCost, 155);
  const v = paperValue(p, { NVDA: 160 });
  // cash 6900 (10000 - 1500 - 1600) + 20 shares x $160 = $10,100
  assert.equal(v.value, 6900 + 3200);
  assert.equal(v.pnl, 100);
  assert.equal(v.pnlPct, 1);
  p = paperSell(p, 'NVDA', 5, 160);
  assert.equal(p.positions.NVDA.shares, 15);
  assert.equal(p.cash, 6900 + 800);
  p = paperSell(p, 'NVDA', 15, 160);
  assert.deepEqual(p.positions, {});
});

test('paper portfolio: guards never go negative or invent money', () => {
  let p = newPaperPortfolio();
  const over = paperBuy(p, 'NVDA', 1000, 150);
  assert.ok(over.error.includes('insufficient paper cash'));
  assert.equal(over.cash, PAPER_STARTING_CASH);
  const noPos = paperSell(p, 'NVDA', 1, 150);
  assert.ok(noPos.error.includes('insufficient paper position'));
  const noPrice = paperBuy(p, 'NVDA', 1, NaN);
  assert.ok(noPrice.error.includes('no live price'));
  const badShares = paperBuy(p, 'NVDA', 0, 150);
  assert.ok(badShares.error);
  const v = paperValue(p, {});
  assert.equal(v.value, PAPER_STARTING_CASH);
});

// Live integration test — hits the real Base public RPC. Skips cleanly offline.
test('live: Base RPC returns a fresh NVDA price', async (t) => {
  let mod;
  try {
    mod = await import('../js/feeds.js');
  } catch (e) {
    t.skip('cannot load feeds module: ' + e.message);
    return;
  }
  let quote;
  try {
    quote = await Promise.race([
      mod.fetchPrice('NVDA'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('rpc timeout')), 20000)),
    ]);
  } catch (e) {
    t.skip('Base RPC unreachable in this environment: ' + e.message);
    return;
  }
  assert.ok(quote.ok !== false);
  assert.ok(Number.isFinite(quote.price) && quote.price > 0, `price ${quote.price}`);
  assert.ok(quote.updatedAtUnix > 0);
  assert.equal(isStale(quote.updatedAtUnix), false, 'feed should be fresh at test time');
});
