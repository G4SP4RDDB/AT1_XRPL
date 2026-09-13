// Minimal JSON-over-HTTP shim so the browser never imports Node-only signing code.
// POST /read/<fn> and POST /tx/<fn> with a JSON body { args: [...] }. CORS open for the dev UI.
import http from "node:http";
import { read, tx } from "./index.js";
import { loadAccounts } from "./accounts.js";
import { ensureBrokerAccountRegistered } from "./ops.js";
import * as profile from "./profileStore.js";
import * as book from "./trancheBookStore.js";
import { DEADLINE_ORIGINATION } from "./config.js";

const PORT = Number(process.env.CHAIN_PORT ?? 8787);
const groups: Record<string, Record<string, (...a: any[]) => Promise<unknown>>> = { read, tx, profile, book };

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const [, group, fn] = (req.url ?? "").split("/");
  const handler = groups[group]?.[fn];
  if (!handler) return res.writeHead(404).end(JSON.stringify({ error: `unknown route ${req.url}` }));
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const args = body ? (JSON.parse(body).args ?? []) : [];
    const out = await handler(...args);
    res.writeHead(200).end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(500).end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(PORT, () => {
  const brokerAddr = loadAccounts().broker.classicAddress;
  ensureBrokerAccountRegistered();
  console.log(`\n======================================================`);
  console.log(`🛡️  PLATFORM BROKER ADDRESS: ${brokerAddr}`);
  console.log(`======================================================`);
  console.log(`chain shim listening on http://localhost:${PORT}  (POST /read/<fn> | /tx/<fn>)\n`);
});

// First background process in this codebase: every DEADLINE_ORIGINATION.scanIntervalSec, settle any
// vault whose bid's off-chain funding deadline (Bid.expiresAt) has passed with no loan yet — either
// originate it for whatever was actually raised, or leave it stalled below the minimum funded ratio.
// See ops.ts:scanStalledOriginations / originateStalledIfPastDeadline.
setInterval(async () => {
  try {
    const results = await tx.scanStalledOriginations();
    for (const [vaultId, outcome] of Object.entries(results)) {
      if ("originated" in outcome) console.log(`[deadline-scan] ${vaultId.slice(0, 12)} originated at deadline (partial funding accepted)`);
      else if (!/deadline not reached|no bid|no funding deadline/.test(outcome.skipped ?? "")) console.log(`[deadline-scan] ${vaultId.slice(0, 12)} ${outcome.skipped}`);
    }
  } catch (e) {
    console.warn("[deadline-scan] failed:", (e as Error).message);
  }
}, DEADLINE_ORIGINATION.scanIntervalSec * 1000);
