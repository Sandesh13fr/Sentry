// Chain adapter. Sends only a bytes32 fingerprint to SentryAnchor on Monad testnet. Moves no funds, stores no prompts.
// Never throws and never logs the private key.
const ABI = [
  'function anchor(bytes32 fingerprint)',
  'function isAnchored(bytes32 fingerprint) view returns (bool)',
];
const HEX64 = /^[0-9a-f]{64}$/;

export function createChain({ rpcUrl, privateKey, contractAddress, explorerTxUrl = '', timeoutMs = 10000, loadEthers = () => import('ethers') } = {}) {
  const configured = Boolean(rpcUrl && privateKey && contractAddress);
  const now = () => new Date().toISOString();
  const unavailable = (reason) => ({ status: 'unavailable', reason, at: now() });

  async function anchor(fp) {
    if (!configured) return unavailable('Testnet anchoring is not configured on this server.');
    if (!HEX64.test(String(fp))) return unavailable('Fingerprint must be 64 hex characters.');
    let ethers;
    try { ethers = await loadEthers(); ethers = ethers.ethers ?? ethers; }
    catch { return unavailable('ethers is not installed. Run npm install to enable anchoring.'); }

    let provider, timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs); });
    try {
      const work = (async () => {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(contractAddress, ABI, wallet);
        const bytes32 = '0x' + fp;
        if (await contract.isAnchored(bytes32)) return { status: 'anchored', txHash: null, explorerUrl: null, reason: 'Already anchored on chain.', at: now() };
        const tx = await contract.anchor(bytes32);
        await tx.wait(1);
        return { status: 'anchored', txHash: tx.hash, explorerUrl: explorerTxUrl ? explorerTxUrl + tx.hash : null, at: now() };
      })();
      work.catch(() => {}); // the losing side of the race must not become an unhandled rejection
      return await Promise.race([work, timeout]);
    } catch (err) {
      const reason = err?.code === 'TIMEOUT' ? 'Testnet RPC timed out.'
        : err?.code === 'INSUFFICIENT_FUNDS' ? 'Anchor wallet has no testnet gas. Use the Monad faucet.'
        : 'Testnet RPC unavailable.';
      return unavailable(reason);
    } finally {
      clearTimeout(timer);
      try { provider?.destroy(); } catch {}
    }
  }

  return { configured, anchor };
}
