// Deploy ResearchAnchor to Base Sepolia + anchor one real brief.
// Usage:
//   node deploy.mjs            deploy + anchor a live NVDA brief, print record JSON
//   node deploy.mjs --dry-run  balance + gas estimate only, sends nothing
//   node deploy.mjs --deploy-only   deploy, skip the anchor tx
//
// The private key is read at runtime from ~/workspace/makefun/accounts-created.json
// (accounts.evm_base_coralfox) and is NEVER printed or written anywhere.
// Ethers is loaded from /tmp/evm2/node_modules (Elgora workdir) with a local
// node_modules fallback; if /tmp was wiped by a VM replacement, reinstall ethers
// (npm install ethers@6) into deploy-tools/node_modules first.
// Prints ONLY a JSON record to stdout — no files are written by this script.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fetchPrice, fetchRound } from '../js/feeds.js';
import { buildBrief, pctChange } from '../js/analysis.js';

const require = createRequire(import.meta.url);
let ethers;
try {
  ethers = require('ethers');
} catch {
  ethers = require('/tmp/evm2/node_modules/ethers');
}

const SEPOLIA_RPC = 'https://sepolia.base.org';
const SEPOLIA_CHAIN_ID = 84532;
const EXPLORER = 'https://sepolia.basescan.org';
const LEDGER = '/home/hatch/workspace/makefun/accounts-created.json';
const ARTIFACT = new URL('./artifact.json', import.meta.url);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const DEPLOY_ONLY = args.has('--deploy-only');

function fail(msg) {
  console.error('DEPLOY FAIL: ' + msg);
  process.exit(1);
}

async function main() {
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const acct = ledger.accounts?.evm_base_coralfox;
  if (!acct?.private_key) fail('evm_base_coralfox private key not found in ledger');
  const wallet = new ethers.Wallet(acct.private_key);
  if (wallet.address.toLowerCase() !== (acct.address || '').toLowerCase()) {
    fail('ledger address does not match private key (refusing to proceed)');
  }
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC, SEPOLIA_CHAIN_ID);
  const signer = wallet.connect(provider);
  const balance = await provider.getBalance(wallet.address);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 0n;
  console.error(`wallet ${wallet.address}`);
  console.error(`balance ${ethers.formatEther(balance)} ETH (Sepolia)`);
  console.error(`gas price ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

  // Estimate deploy gas with an unsigned tx from the wallet (no signing needed).
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const deployTx = await factory.getDeployTransaction();
  const deployGas = await provider.estimateGas({ ...deployTx, from: wallet.address });
  const anchorGasEst = 200000n; // anchorBrief is a storage write; 200k is a safe ceiling
  const totalGas = deployGas + (DEPLOY_ONLY ? 0n : anchorGasEst);
  const totalCost = totalGas * (gasPrice || 1000000n);
  console.error(`deploy gas estimate ${deployGas} (~${ethers.formatEther(deployGas * gasPrice)} ETH)`);
  if (!DEPLOY_ONLY) console.error(`anchor gas budget ${anchorGasEst} (ceiling)`);
  console.error(`total worst-case cost ~${ethers.formatEther(totalCost)} ETH`);
  if (balance < totalCost) {
    fail(`insufficient balance: need ~${ethers.formatEther(totalCost)} ETH, have ${ethers.formatEther(balance)} ETH. Get Base Sepolia ETH from a faucet first (see PLAN.md).`);
  }
  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, balance: ethers.formatEther(balance), deployGas: deployGas.toString(), totalCost: ethers.formatEther(totalCost) }));
    return;
  }

  // 1. Deploy.
  console.error('deploying ResearchAnchor...');
  const contract = await factory.deploy();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  console.error(`deployed at ${address} in tx ${receipt.hash} (block ${receipt.blockNumber}, gas used ${receipt.gasUsed})`);
  console.error(`explorer: ${EXPLORER}/address/${address}`);

  // 2. Verify: briefCount() must be 0 on a fresh contract.
  const count0 = await contract.briefCount();
  if (count0 !== 0n) fail(`fresh contract briefCount is ${count0}, expected 0`);
  console.error('verified: briefCount() == 0');

  let anchor = null;
  if (!DEPLOY_ONLY) {
    // 3. Anchor one REAL brief: live NVDA price + round history, same rules as the app.
    console.error('building a real NVDA brief from live Chainlink data...');
    const latest = await fetchPrice('NVDA');
    let change24h = null, change7d = null, closes = [];
    try {
      const roundNum = BigInt(latest.roundId) & ((1n << 64n) - 1n);
      const phase = BigInt(latest.roundId) >> 64n;
      const ids = [];
      for (let i = 1; i <= 30; i++) {
        const r = roundNum - BigInt(i);
        if (r <= 0n) break;
        ids.push(((phase << 64n) | r).toString());
      }
      const rounds = (await Promise.allSettled(ids.map((id) => fetchRound('NVDA', id))))
        .filter((x) => x.status === 'fulfilled').map((x) => x.value);
      rounds.sort((a, b) => a.updatedAtUnix - b.updatedAtUnix);
      closes = [...rounds.map((r) => r.price), latest.price];
      const now = Date.now() / 1000;
      const pick = (targetH, loH, hiH) => {
        let best = null, bestDiff = Infinity;
        for (const r of rounds) {
          const ageH = (now - r.updatedAtUnix) / 3600;
          if (ageH < loH || ageH > hiH) continue;
          const diff = Math.abs(ageH - targetH);
          if (diff < bestDiff) { bestDiff = diff; best = r; }
        }
        return best ? pctChange(latest.price, best.price) : null;
      };
      change24h = pick(24, 20, 28);
      change7d = pick(168, 144, 192);
    } catch (e) {
      console.error('round history unavailable, anchoring with null changes: ' + (e.message || e));
    }
    const brief = buildBrief({
      symbol: 'NVDA', name: 'NVIDIA',
      price: latest.price, updatedAt: latest.updatedAt.toISOString(),
      updatedAtUnix: latest.updatedAtUnix, stale: false,
      change24h, change7d, closes,
      source: 'Chainlink feed on Base mainnet',
    });
    const briefJson = JSON.stringify(brief);
    const briefHash = ethers.keccak256(ethers.toUtf8Bytes(briefJson));
    console.error(`brief: NVDA $${latest.price} score ${brief.score} hash ${briefHash}`);
    const tx = await contract.anchorBrief('NVDA', briefHash);
    const areceipt = await tx.wait();
    const count1 = await contract.briefCount();
    if (count1 !== 1n) fail(`briefCount after anchor is ${count1}, expected 1`);
    const stored = await contract.briefs(0);
    if (stored[2].toLowerCase() !== briefHash.toLowerCase()) fail('stored briefHash does not match');
    console.error(`anchored brief #0 in tx ${tx.hash} (gas used ${areceipt.gasUsed})`);
    anchor = {
      symbol: 'NVDA', briefHash, txHash: tx.hash,
      explorerTx: `${EXPLORER}/tx/${tx.hash}`,
      brief: { price: brief.price, score: brief.score, change24h: brief.change24h, change7d: brief.change7d },
    };
  }

  console.log(JSON.stringify({
    network: 'base-sepolia', chainId: SEPOLIA_CHAIN_ID,
    contract: address,
    deployTx: receipt.hash,
    deployExplorerTx: `${EXPLORER}/tx/${receipt.hash}`,
    explorerAddress: `${EXPLORER}/address/${address}`,
    deployBlock: receipt.blockNumber,
    deployGasUsed: receipt.gasUsed.toString(),
    deployer: wallet.address,
    verifiedBriefCount: 0,
    anchor,
  }, null, 2));
}

main().catch((e) => fail(e?.message || String(e)));
