// The enforcer as its own process. Owns the enforcer key (.enforcer.env) and nothing else.
//   POST /cosign        { prepared }  -> { ok: true, blob } | { ok: false, blocked, reason }
//   POST /counter-sign  { blob }      -> { ok: true, tx }      (LoanSet counterparty signature for origination)
//   GET  /health                      -> { ok: true, signer, broker }
// Start with: npm run enforcer   (port ENFORCER_PORT, default 8788). The chain layer uses it when ENFORCER_URL is set.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { signLoanSetByCounterparty } from "xrpl";
import { getClient } from "../client.js";
import { cosign, enforcerWallet } from "./index.js";

const PORT = Number(process.env.ENFORCER_PORT ?? 8788);
const envFile = fs.readFileSync(path.resolve(process.cwd(), ".enforcer.env"), "utf8");
const BROKER = envFile.match(/^BROKER_ADDRESS=(\S+)/m)?.[1];
if (!BROKER) throw new Error("enforcer: BROKER_ADDRESS missing from .enforcer.env");
const signer = enforcerWallet().classicAddress;

async function body(req: http.IncomingMessage): Promise<any> {
  let s = "";
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}

http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    if (req.method === "GET" && req.url === "/health") return res.end(JSON.stringify({ ok: true, signer, broker: BROKER }));
    if (req.method === "POST" && req.url === "/cosign") {
      const { prepared } = await body(req);
      const d = await cosign(await getClient(), prepared, BROKER);
      console.log(`[enforcer] ${prepared?.TransactionType} ${prepared?.LoanID?.slice(0, 8) ?? ""} amount=${prepared?.Amount} flags=${prepared?.Flags ?? 0} -> ${d.ok ? "co-signed" : `refused: ${d.blocked} (${d.reason})`}`);
      return res.end(JSON.stringify(d));
    }
    if (req.method === "POST" && req.url === "/counter-sign") {
      const { blob } = await body(req);
      const { tx } = signLoanSetByCounterparty(enforcerWallet(), blob, { multisign: true });
      console.log(`[enforcer] LoanSet counter-signed for ${tx.Counterparty}`);
      return res.end(JSON.stringify({ ok: true, tx }));
    }
    res.writeHead(404).end(JSON.stringify({ error: `unknown route ${req.method} ${req.url}` }));
  } catch (e) {
    res.writeHead(500).end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(PORT, () => console.log(`enforcer listening on http://localhost:${PORT}  signer ${signer}  broker ${BROKER}`));
