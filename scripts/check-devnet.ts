// F1: is the custom devnet reachable and are the lending amendments enabled?
import { getClient, closeClient } from "../src/chain/client.js";
import { REQUIRED_AMENDMENTS, NETWORK } from "../src/chain/config.js";

const client = await getClient();
const info = await client.request({ command: "server_info" });
const si = info.result.info;
console.log(`connected      ${NETWORK.wss}`);
console.log(`build_version  ${si.build_version}`);
console.log(`ledger         ${si.validated_ledger?.seq}  (complete_ledgers ${si.complete_ledgers})`);
console.log(`base_fee_xrp   ${si.validated_ledger?.base_fee_xrp}  reserve_base ${si.validated_ledger?.reserve_base_xrp} reserve_inc ${si.validated_ledger?.reserve_inc_xrp}`);

const feat = await client.request({ command: "feature" } as any);
const features = (feat as any).result.features as Record<string, { name: string; enabled: boolean; supported: boolean }>;
let ok = true;
for (const name of REQUIRED_AMENDMENTS) {
  const hit = Object.values(features).find((f) => f.name === name);
  const state = !hit ? "UNKNOWN" : hit.enabled ? "enabled" : hit.supported ? "supported, NOT enabled" : "not supported";
  if (!hit?.enabled) ok = false;
  console.log(`${name.padEnd(18)} ${state}`);
}
const extra = ["TokenEscrow", "PermissionedDomains", "Credentials", "MPTokensV1", "Batch"];
for (const name of extra) {
  const hit = Object.values(features).find((f) => f.name === name);
  console.log(`  ${name.padEnd(20)} ${hit ? (hit.enabled ? "enabled" : "not enabled") : "unknown"}`);
}
await closeClient();
console.log(ok ? "\nOK: required amendments enabled" : "\nSTOP: required amendments missing");
process.exit(ok ? 0 : 1);
