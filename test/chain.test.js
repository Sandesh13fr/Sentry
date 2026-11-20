import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createChain } from '../src/chain.js';

const FP = 'ab'.repeat(32);
const KEY = '0x' + '11'.repeat(32);

describe('TC-04: testnet RPC unavailable, anchor status shows unavailable', () => {
  test('missing config', async () => {
    const c = createChain({});
    assert.equal(c.configured, false);
    const r = await c.anchor(FP);
    assert.equal(r.status, 'unavailable');
    assert.match(r.reason, /not configured/);
  });

  test('unreachable RPC with real ethers fails gracefully within the timeout', async () => {
    const logs = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.join(' '));
    const t0 = Date.now();
    try {
      const c = createChain({ rpcUrl: 'http://127.0.0.1:9', privateKey: KEY, contractAddress: '0x' + '22'.repeat(20), timeoutMs: 1500 });
      assert.equal(c.configured, true);
      const r = await c.anchor(FP);
      assert.equal(r.status, 'unavailable');
      assert.match(r.reason, /RPC|ethers/);
    } finally { Object.assign(console, orig); }
    assert.ok(Date.now() - t0 < 4000);
    assert.ok(!logs.join('\n').includes('11'.repeat(32)), 'private key must never be logged');
  });

  test('ethers missing', async () => {
    const c = createChain({ rpcUrl: 'x', privateKey: KEY, contractAddress: 'y', loadEthers: async () => { throw new Error('no module'); } });
    assert.match((await c.anchor(FP)).reason, /ethers is not installed/);
  });
});

function fakeEthers({ already = false, calls = [] } = {}) {
  class JsonRpcProvider { destroy() { calls.push('destroy'); } }
  class Wallet { constructor(k) { calls.push(['wallet', k === KEY]); } }
  class Contract {
    async isAnchored(b) { calls.push(['isAnchored', b]); return already; }
    async anchor(b) { calls.push(['anchor', b]); return { hash: '0xfeed', wait: async () => ({}) }; }
  }
  return async () => ({ JsonRpcProvider, Wallet, Contract });
}

test('anchors only the bytes32 fingerprint and returns tx hash and explorer link', async () => {
  const calls = [];
  const c = createChain({ rpcUrl: 'r', privateKey: KEY, contractAddress: 'c', explorerTxUrl: 'https://x/tx/', loadEthers: fakeEthers({ calls }) });
  const r = await c.anchor(FP);
  assert.deepEqual([r.status, r.txHash, r.explorerUrl], ['anchored', '0xfeed', 'https://x/tx/0xfeed']);
  assert.deepEqual(calls.find((x) => x[0] === 'anchor'), ['anchor', '0x' + FP]);
  assert.ok(calls.includes('destroy'));
});

test('already anchored on chain is reported as anchored without a new tx', async () => {
  const calls = [];
  const r = await createChain({ rpcUrl: 'r', privateKey: KEY, contractAddress: 'c', loadEthers: fakeEthers({ already: true, calls }) }).anchor(FP);
  assert.equal(r.status, 'anchored');
  assert.ok(!calls.some((x) => x[0] === 'anchor'));
});

test('rejects a malformed fingerprint before touching the chain', async () => {
  const r = await createChain({ rpcUrl: 'r', privateKey: KEY, contractAddress: 'c', loadEthers: fakeEthers() }).anchor('not-hex');
  assert.equal(r.status, 'unavailable');
});

test('contract artifact has no payable function and is fingerprint-only', async () => {
  const { readFile } = await import('node:fs/promises');
  const art = JSON.parse(await readFile(new URL('../contracts/SentryAnchor.json', import.meta.url), 'utf8'));
  assert.ok(!art.abi.some((x) => x.stateMutability === 'payable'));
  assert.ok(!art.abi.some((x) => x.type === 'receive' || x.type === 'fallback'));
  const anchor = art.abi.find((x) => x.name === 'anchor');
  assert.deepEqual(anchor.inputs.map((i) => i.type), ['bytes32']);
  const src = await readFile(new URL('../contracts/SentryAnchor.sol', import.meta.url), 'utf8');
  assert.ok(!/\bpayable\b/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
});
