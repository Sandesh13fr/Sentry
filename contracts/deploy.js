// Deploys SentryAnchor to Monad testnet using the precompiled artifact (contracts/SentryAnchor.json).
// Usage: set MONAD_RPC_URL and ANCHOR_PRIVATE_KEY in .env (throwaway testnet wallet), then `npm run deploy:contract`.
// Rebuild the artifact after editing the .sol: compile with solc 0.8.24, evmVersion paris, optimizer 200 runs.
import { readFile } from 'node:fs/promises';

const { MONAD_RPC_URL, ANCHOR_PRIVATE_KEY, EXPLORER_TX_URL = '' } = process.env;
if (!MONAD_RPC_URL || !ANCHOR_PRIVATE_KEY) {
  console.error('Set MONAD_RPC_URL and ANCHOR_PRIVATE_KEY in .env first. Use a testnet-only wallet.');
  process.exit(1);
}

let ethers;
try { ({ ethers } = await import('ethers')); }
catch { console.error('ethers is not installed. Run npm install.'); process.exit(1); }

const artifact = JSON.parse(await readFile(new URL('./SentryAnchor.json', import.meta.url), 'utf8'));
const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
const wallet = new ethers.Wallet(ANCHOR_PRIVATE_KEY, provider);
const net = await provider.getNetwork();
console.log(`Deploying SentryAnchor from ${wallet.address} on chain ${net.chainId}…`);

const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy();
const tx = contract.deploymentTransaction();
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log(`Deployed at ${address}`);
if (EXPLORER_TX_URL && tx) console.log(`Tx: ${EXPLORER_TX_URL}${tx.hash}`);
console.log(`\nAdd to .env:\nANCHOR_CONTRACT_ADDRESS=${address}`);
provider.destroy();
