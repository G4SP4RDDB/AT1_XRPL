// Submission helpers. Non-tes engine results are returned, never thrown, so guardrail rejections
// are data. tem/tef/ter results (never applied) are parsed out of the SDK error message.
import { Wallet, multisign, type Client, type TransactionMetadata } from "xrpl";
import { explorerTx } from "./client.js";

export interface Receipt {
  result: string;
  hash: string;
  explorerUrl: string;
  meta?: TransactionMetadata;
  ledgerIndex?: number;
}

const CODE = /(te[cfmrs][A-Z_0-9]+)/;

export function fromError(e: unknown, hash = ""): Receipt {
  const msg = (e as Error)?.message ?? String(e);
  const m = msg.match(CODE);
  return { result: m ? m[1] : `error: ${msg.slice(0, 120)}`, hash, explorerUrl: hash ? explorerTx(hash) : "" };
}

/** Single-signature submit. */
export async function submit(client: Client, tx: Record<string, unknown>, wallet: Wallet): Promise<Receipt> {
  try {
    const r = await client.submitAndWait(tx as any, { autofill: true, wallet });
    const meta = r.result.meta as TransactionMetadata;
    return { result: meta.TransactionResult, hash: r.result.hash, explorerUrl: explorerTx(r.result.hash), meta, ledgerIndex: r.result.ledger_index };
  } catch (e) {
    return fromError(e);
  }
}

/** Multisig submit: `signers` each sign for `tx.Account`; fee is autofilled for the signer count. */
export async function submitMultisigned(client: Client, tx: Record<string, unknown>, signers: Wallet[]): Promise<Receipt> {
  try {
    const prepared = await client.autofill(tx as any, signers.length);
    const blobs = signers.map((w) => w.sign(prepared as any, true).tx_blob);
    const combined = multisign(blobs);
    const r = await client.submitAndWait(combined);
    const meta = r.result.meta as TransactionMetadata;
    return { result: meta.TransactionResult, hash: r.result.hash, explorerUrl: explorerTx(r.result.hash), meta, ledgerIndex: r.result.ledger_index };
  } catch (e) {
    return fromError(e);
  }
}

/** Submit an already-encoded blob (used for LoanSet with counterparty signatures). */
export async function submitBlob(client: Client, blob: string): Promise<Receipt> {
  try {
    const r = await client.submitAndWait(blob);
    const meta = r.result.meta as TransactionMetadata;
    return { result: meta.TransactionResult, hash: r.result.hash, explorerUrl: explorerTx(r.result.hash), meta, ledgerIndex: r.result.ledger_index };
  } catch (e) {
    return fromError(e);
  }
}

/** LedgerIndex of the first node of `entryType` created by a transaction. */
export function createdId(meta: TransactionMetadata | undefined, entryType: string): string | undefined {
  for (const n of meta?.AffectedNodes ?? []) {
    const c = (n as any).CreatedNode;
    if (c?.LedgerEntryType === entryType) return c.LedgerIndex as string;
  }
  return undefined;
}
