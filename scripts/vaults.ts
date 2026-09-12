// Print every vault the platform broker owns, through the real read layer.
import { read } from "../src/chain/index.js";
import { closeClient } from "../src/chain/client.js";
const vs = await read.listVaults();
for (const v of vs) console.log(`${v.vaultId.slice(0, 12)}  total=${v.assetsTotal.padStart(12)}  avail=${v.assetsAvailable.padStart(12)}  pps=${v.pps.toFixed(7)}  loan=${(v.loan?.status ?? "-").padEnd(8)} remaining=${v.loan?.paymentRemaining ?? "-"}  call=${v.callDate}`);
await closeClient();
