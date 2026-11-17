// Compile ResearchAnchor.sol with solc 0.8.24 loaded fully in memory:
// fetch soljson.js (Emscripten, SINGLE_FILE) as text, _compile it like
// solc-js's loadRemoteVersion does, then call solidity_compile directly.
// Prints ONLY the artifact JSON (abi + creation bytecode) to stdout.
const fs = require('fs');
const Module = module.constructor;

const SRC_PATH = '/home/hatch/workspace/makefun/base-stocks-maxxing/contracts/ResearchAnchor.sol';

async function main() {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  console.error('fetching soljson.js (8.8MB) ...');
  const res = await fetch('https://cdn.jsdelivr.net/npm/solc@0.8.24/soljson.js');
  if (!res.ok) throw new Error('soljson fetch HTTP ' + res.status);
  const soljsonText = await res.text();
  console.error('soljson.js bytes:', soljsonText.length);

  const m = new Module();
  m._compile(soljsonText, 'soljson.js');
  const soljson = m.exports;
  if (!soljson || typeof soljson.cwrap !== 'function') {
    throw new Error('soljson module did not expose cwrap; keys: ' + Object.keys(soljson || {}).slice(0, 20));
  }
  const version = soljson.cwrap('solidity_version', 'string', [])();
  console.error('solc version:', version);

  const compile = soljson.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
  const reset = soljson.cwrap('solidity_reset', null, []);
  const alloc = soljson.cwrap('solidity_alloc', 'number', ['number']) || soljson._malloc;

  // Import callback (never invoked: single file, no imports). Still register a
  // real one that reports an error, mirroring solc-js's wrapCallbackWithKind.
  function copyToCString(str, ptr) {
    const len = soljson.lengthBytesUTF8(str);
    const buf = alloc(len + 1);
    soljson.stringToUTF8(str, buf, len + 1);
    soljson.setValue(ptr, buf, '*');
  }
  function cb(context, kind, data, contents, error) {
    const k = soljson.UTF8ToString(kind);
    const d = soljson.UTF8ToString(data);
    if (k === 'source') {
      copyToCString(JSON.stringify({ error: 'File import callback not supported: ' + d }), error);
    } else {
      copyToCString(JSON.stringify({ error: 'Callback kind not supported: ' + k }), error);
    }
  }
  const cbPtr = (soljson.addFunction || soljson.Runtime.addFunction)(cb, 'viiiii');

  const input = {
    language: 'Solidity',
    sources: { 'ResearchAnchor.sol': { content: src } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const outRaw = compile(JSON.stringify(input), cbPtr, 0);
  try { reset(); } catch { /* ignore */ }
  const out = JSON.parse(outRaw);
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) {
    console.error('COMPILE ERRORS:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }
  const contract = out.contracts['ResearchAnchor.sol'].ResearchAnchor;
  const crypto = require('crypto');
  const abiJson = JSON.stringify(contract.abi);
  console.error('sha256(bytecode):', crypto.createHash('sha256').update(contract.evm.bytecode.object, 'hex').digest('hex'));
  console.error('sha256(deployed):', crypto.createHash('sha256').update(contract.evm.deployedBytecode.object, 'hex').digest('hex'));
  console.error('sha256(abi json):', crypto.createHash('sha256').update(abiJson).digest('hex'));
  console.log(JSON.stringify({
    compiler: version,
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object,
    deployedBytecode: '0x' + contract.evm.deployedBytecode.object,
  }));
}
main().catch((e) => { console.error('ERR', e && e.stack || e); process.exit(1); });
