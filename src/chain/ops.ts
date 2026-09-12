// Real implementations behind tx.*: build, sign, submit, read back. Amounts at this boundary are XRP strings.
import { Wallet, xrpToDrops, dropsToXrp, multisign, signLoanSetByCounterparty, combineLoanSetCounterpartySigners } from "xrpl";
import type { Bid, TxReceipt, WithdrawRequest, Blocked } from "../../shared/types.js";
import { getClient } from "./client.js";
import { loadAccounts, fundNewAccount } from "./accounts.js";
import { getAccount, listAccounts, saveAccount, updateAccount, type DbAccount, type AccountRole } from "../db/index.js";
import { DEMO_LOAN, DEMO_BROKER, VAULT_CAP_MARGIN_DROPS } from "./config.js";
import { submit, submitBlob, createdId, type Receipt } from "./tx.js";
import { vaultInfo, ledgerEntry, shareBalance, ledgerCloseTime } from "./read.js";
import { totalInterest, percentToTenthBp, isoToRipple } from "./loanMath.js";
import { cosign, enforcerWallet, type CosignResult } from "./enforcer/index.js";

// The enforcer runs as its own process when ENFORCER_URL is set (npm run enforcer); otherwise in-process (dev only).
const ENFORCER_URL = process.env.ENFORCER_URL;
async function enforcerCosign(client: Awaited<ReturnType<typeof getClient>>, prepared: Record<string, any>): Promise<CosignResult> {
  if (!ENFORCER_URL) return cosign(client, prepared, broker().classicAddress);
  const r = await fetch(`${ENFORCER_URL}/cosign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepared }) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(`enforcer: ${d.error ?? r.statusText}`);
  return d as CosignResult;
}
async function enforcerCounterSign(blob: string): Promise<any> {
  if (!ENFORCER_URL) return signLoanSetByCounterparty(enforcerWallet(), blob, { multisign: true }).tx;
  const r = await fetch(`${ENFORCER_URL}/counter-sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blob }) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(`enforcer: ${d.error ?? r.statusText}`);
  return d.tx;
}
import { positionOf } from "./readLayer.js";

const toReceipt = (r: Receipt): TxReceipt => ({ hash: r.hash, result: r.result, explorerUrl: r.explorerUrl, ledgerIndex: r.ledgerIndex });

const dynamicWallets = new Map<string, Wallet>();

export function registerWallet(seed: string): { address: string } {
  const w = Wallet.fromSeed(seed.trim());
  dynamicWallets.set(w.classicAddress, w);
  return { address: w.classicAddress };
}

function walletFor(address: string): Wallet {
  const dynamic = dynamicWallets.get(address);
  if (dynamic) return dynamic;
  const dbAcc = getAccount(address);
  if (dbAcc?.seed) return Wallet.fromSeed(dbAcc.seed);
  const hit = Object.values(loadAccounts()).find((w) => w?.classicAddress === address);
  if (!hit) throw new Error(`no seed for ${address} in database or registered session`);
  return hit;
}

export function getOperatorFor(address?: string): Wallet {
  if (address) {
    const dbAcc = getAccount(address);
    if (dbAcc?.operatorSeed) return Wallet.fromSeed(dbAcc.operatorSeed);
  }
  const acc = loadAccounts();
  if (acc.borrowerOp) return acc.borrowerOp;
  throw new Error(`no operator key found for account ${address || "default"}`);
}
export const getBorrowerOpFor = getOperatorFor;

const broker = () => loadAccounts().broker;

/** Loan terms derived from a bid: PaymentTotal fixed, interval from the call date (min 60 s). */
export function termsFromBid(bid: Bid, nowRipple: number) {
  const principalDrops = Number(xrpToDrops(bid.amount));
  const paymentTotal = DEMO_LOAN.paymentTotal;
  const secondsToCall = Math.max(60 * paymentTotal, isoToRipple(bid.callDate) - nowRipple);
  const paymentInterval = Math.max(60, Math.floor(secondsToCall / paymentTotal));
  const gracePeriod = Math.min(DEMO_LOAN.gracePeriodSec, paymentInterval);
  const interestRate = percentToTenthBp(bid.yieldRate);
  const interestDrops = Math.ceil(totalInterest(principalDrops, interestRate, paymentInterval, paymentTotal));
  return { principalDrops, paymentTotal, paymentInterval, gracePeriod, interestRate, interestDrops };
}

/** 2.1 + 2.2: VaultCreate (capped, bid in Data) + LoanBrokerSet + LoanBrokerCoverDeposit. */
export async function createBond(bid: Bid): Promise<{ vaultId: string; loanBrokerId: string; receipts: TxReceipt[] }> {
  const client = await getClient();
  const now = await ledgerCloseTime(client);
  const t = termsFromBid(bid, now);
  const data = Buffer.from(JSON.stringify({ id: bid.id, b: bid.borrowerAddress, a: bid.amount, y: bid.yieldRate, c: bid.callDate })).toString("hex");
  if (data.length / 2 > 256) throw new Error("bid too large for the 256-byte vault Data field");
  const cap = String(t.principalDrops + t.interestDrops + VAULT_CAP_MARGIN_DROPS);
  const receipts: TxReceipt[] = [];
  const vc = await submit(client, { TransactionType: "VaultCreate", Account: broker().classicAddress, Asset: { currency: "XRP" }, Data: data, AssetsMaximum: cap }, broker());
  receipts.push(toReceipt(vc));
  const vaultId = createdId(vc.meta, "Vault");
  if (!vaultId) return { vaultId: "", loanBrokerId: "", receipts };
  const bs = await submit(client, { TransactionType: "LoanBrokerSet", Account: broker().classicAddress, VaultID: vaultId, ManagementFeeRate: DEMO_BROKER.managementFeeRate, CoverRateMinimum: DEMO_BROKER.coverRateMinimum, CoverRateLiquidation: DEMO_BROKER.coverRateLiquidation, Data: data }, broker());
  receipts.push(toReceipt(bs));
  const loanBrokerId = createdId(bs.meta, "LoanBroker");
  if (!loanBrokerId) return { vaultId, loanBrokerId: "", receipts };
  const coverDrops = Math.max(Number(xrpToDrops(DEMO_BROKER.coverDepositXrp)), Math.ceil((t.principalDrops + t.interestDrops) * (DEMO_BROKER.coverRateMinimum / 100_000) * 1.2));
  const cd = await submit(client, { TransactionType: "LoanBrokerCoverDeposit", Account: broker().classicAddress, LoanBrokerID: loanBrokerId, Amount: String(coverDrops) }, broker());
  receipts.push(toReceipt(cd));
  return { vaultId, loanBrokerId, receipts };
}

/** 2.3 VaultDeposit. */
export async function deposit(lenderAddress: string, vaultId: string, amountXrp: string): Promise<TxReceipt> {
  const client = await getClient();
  const w = walletFor(lenderAddress);
  return toReceipt(await submit(client, { TransactionType: "VaultDeposit", Account: w.classicAddress, VaultID: vaultId, Amount: xrpToDrops(amountXrp) }, w));
}

/** 2.5 LoanSet: broker signs, both borrower signers add counterparty signatures, submit. Principal moves here. */
export async function originate(bid: Bid): Promise<TxReceipt & { loanId?: string }> {
  if (!bid.loanBrokerId) throw new Error("bid has no loanBrokerId, call createBond first");
  const client = await getClient();
  const now = await ledgerCloseTime(client);
  const t = termsFromBid(bid, now);
  const tx: any = {
    TransactionType: "LoanSet", Account: broker().classicAddress, LoanBrokerID: bid.loanBrokerId, Counterparty: bid.borrowerAddress,
    PrincipalRequested: String(t.principalDrops), InterestRate: t.interestRate, CloseInterestRate: DEMO_LOAN.closeInterestRate,
    ClosePaymentFee: xrpToDrops(DEMO_LOAN.closePaymentFeeXrp), PaymentTotal: t.paymentTotal, PaymentInterval: t.paymentInterval, GracePeriod: t.gracePeriod,
  };
  const prepared = await client.autofill(tx);
  prepared.Fee = String(Number(prepared.Fee) * 5);
  const first = broker().sign(prepared);
  const op = getBorrowerOpFor(bid.borrowerAddress);
  const s1 = signLoanSetByCounterparty(op, first.tx_blob, { multisign: true });
  const enf = await enforcerCounterSign(first.tx_blob);
  const combined = combineLoanSetCounterpartySigners([s1.tx, enf]);
  const r = await submitBlob(client, combined.tx_blob);
  return { ...toReceipt(r), loanId: createdId(r.meta, "Loan") };
}

/** Account transaction: operator signs, enforcer decides and co-signs, multisign, submit. */
async function accountMultisigSubmit(tx: Record<string, any>): Promise<TxReceipt | Blocked> {
  const client = await getClient();
  const prepared = await client.autofill(tx as any, 2);
  const decision = await enforcerCosign(client, prepared);
  if (!decision.ok) return { blocked: decision.blocked, reason: decision.reason };
  const op = getOperatorFor(tx.Account);
  const opBlob = op.sign(prepared as any, true).tx_blob;
  return toReceipt(await submitBlob(client, multisign([opBlob, decision.blob])));
}
const borrowerSubmit = accountMultisigSubmit;

/** 2.6 coupon: amount read from the loan, never chosen by the caller. Overdue coupons carry tfLoanLatePayment
 *  and a generous Amount (the ledger takes only what is due, late fee and late interest included). */
export async function payCoupon(loanId: string, borrowerAddress: string): Promise<TxReceipt | Blocked> {
  if (!loanId) return { blocked: "not-loan-pay", reason: "no loanId, originate first" };
  const client = await getClient();
  const loan = await ledgerEntry(client, loanId);
  if (Number(loan.PaymentRemaining) === 0) return { blocked: "not-loan-pay", reason: "loan already closed" };
  const now = await ledgerCloseTime(client);
  const base = Math.ceil(Number(loan.PeriodicPayment) + Number(loan.LoanServiceFee ?? 0));
  if (now > Number(loan.NextPaymentDueDate)) {
    const offered = String(Math.ceil(base * 1.05 + Number(loan.LatePaymentFee ?? 0)));
    return borrowerSubmit({ TransactionType: "LoanPay", Account: borrowerAddress, LoanID: loanId, Amount: offered, Flags: 0x00040000 });
  }
  return borrowerSubmit({ TransactionType: "LoanPay", Account: borrowerAddress, LoanID: loanId, Amount: String(base) });
}

/** 2.9 repayment at the call date. The call date is the last scheduled due date, so settling the bond means paying
 *  every remaining scheduled payment (late ones flagged late); the last one clears the loan. Before the call date the
 *  only way to close is tfLoanFullPayment (an early close), which the enforcer refuses. */
export async function finalRepayment(loanId: string, borrowerAddress: string): Promise<TxReceipt | Blocked> {
  if (!loanId) return { blocked: "not-loan-pay", reason: "no loanId, originate first" };
  const client = await getClient();
  let loan = await ledgerEntry(client, loanId);
  if (Number(loan.PaymentRemaining) === 0) return { blocked: "not-loan-pay", reason: "loan already closed" };
  const now = await ledgerCloseTime(client);
  const { callDateRipple } = await import("./enforcer/index.js");
  if (now < callDateRipple(loan) && Number(loan.PaymentRemaining) > 1) {
    // early close attempt: the enforcer decides (and refuses before the call date)
    const principal = Number(loan.PrincipalOutstanding);
    const offered = String(Math.ceil(principal * (1 + DEMO_LOAN.closeInterestRate / 100_000 + 0.02) + Number(xrpToDrops(DEMO_LOAN.closePaymentFeeXrp))));
    return borrowerSubmit({ TransactionType: "LoanPay", Account: borrowerAddress, LoanID: loanId, Amount: offered, Flags: 0x00020000 });
  }
  // at or after the call date: settle the remaining schedule
  let last: TxReceipt | Blocked = { blocked: "not-loan-pay", reason: "nothing to pay" };
  for (let i = 0; i < 12 && Number(loan.PaymentRemaining) > 0; i++) {
    last = await payCoupon(loanId, borrowerAddress);
    if ("blocked" in last || last.result !== "tesSUCCESS") return last;
    loan = await ledgerEntry(client, loanId);
  }
  return last;
}

/** 2.7 VaultWithdraw: yield-only redeems position.yieldShares, full redeems every share.
 *  If multisig is active on the account, routed through the Enforcer daemon for policy verification.
 */
export async function withdraw(req: WithdrawRequest): Promise<TxReceipt | Blocked> {
  const client = await getClient();
  const v = await vaultInfo(client, req.vaultId);
  const dbAcc = getAccount(req.depositorAddress);
  let isMultisig = dbAcc?.multisigActive === 1;
  if (!isMultisig) {
    try {
      const ai: any = await client.request({ command: "account_info", account: req.depositorAddress, ledger_index: "validated" } as any);
      if (((ai.result.account_data.Flags ?? 0) & 0x00100000) !== 0) {
        isMultisig = true;
      }
    } catch {
      // ignore
    }
  }

  let shares: string;
  if (req.mode === "full") {
    shares = await shareBalance(client, req.depositorAddress, v.shareMptId);
    if (Number(shares) <= 0) return { hash: "", result: "skipped: no shares held", explorerUrl: "" };
  } else {
    const p = await positionOf(client, req.depositorAddress, req.vaultId);
    shares = p.yieldShares;
    if (Number(shares) <= 0) return { hash: "", result: "skipped: no yield shares yet", explorerUrl: "" };
  }

  const txJson = {
    TransactionType: "VaultWithdraw",
    Account: req.depositorAddress,
    VaultID: req.vaultId,
    Amount: { mpt_issuance_id: v.shareMptId, value: shares },
  };

  if (isMultisig) {
    return accountMultisigSubmit(txJson);
  }

  const w = walletFor(req.depositorAddress);
  return toReceipt(await submit(client, txJson, w));
}

/** 2.10 write-down: only accepted once a payment is overdue on this devnet. */
export async function impair(loanId: string): Promise<TxReceipt> {
  const client = await getClient();
  return toReceipt(await submit(client, { TransactionType: "LoanManage", Account: broker().classicAddress, LoanID: loanId, Flags: 0x00020000 }, broker()));
}
export async function unimpair(loanId: string): Promise<TxReceipt> {
  const client = await getClient();
  return toReceipt(await submit(client, { TransactionType: "LoanManage", Account: broker().classicAddress, LoanID: loanId, Flags: 0x00040000 }, broker()));
}
/** 2.11 Configure 2-of-2 Multisig on an account with master key disabled. */
export async function setupAccountMultisig(accountAddress: string): Promise<TxReceipt> {
  const client = await getClient();
  const acc = loadAccounts();
  const targetWallet = walletFor(accountAddress);
  let dbAcc = getAccount(accountAddress);

  if (!dbAcc?.operatorAddress) {
    const opWallet = Wallet.generate();
    dbAcc = updateAccount(accountAddress, {
      operatorAddress: opWallet.classicAddress,
      operatorSeed: opWallet.seed,
    });
  }

  const opAddress = dbAcc?.operatorAddress ?? (accountAddress === acc.borrower?.classicAddress ? acc.borrowerOp?.classicAddress : undefined);
  const enforcerAddress = acc.brokerEnforcer?.classicAddress;

  if (!opAddress || !enforcerAddress) {
    throw new Error("Cannot configure multisig: missing operator or platform enforcer address");
  }

  // Check if master key is already disabled
  const ai: any = await client.request({ command: "account_info", account: targetWallet.classicAddress, ledger_index: "validated" } as any);
  const masterDisabled = ((ai.result.account_data.Flags ?? 0) & 0x00100000) !== 0;
  if (masterDisabled) {
    updateAccount(accountAddress, { multisigActive: 1 });
    return { hash: "", result: "tesSUCCESS", explorerUrl: "", ledgerIndex: ai.result.ledger_index ?? 0 };
  }

  // 1. SignerListSet: 2-of-2 multisig between Operator and Platform Enforcer
  await submit(client, {
    TransactionType: "SignerListSet",
    Account: targetWallet.classicAddress,
    SignerQuorum: 2,
    SignerEntries: [
      { SignerEntry: { Account: opAddress, SignerWeight: 1 } },
      { SignerEntry: { Account: enforcerAddress, SignerWeight: 1 } },
    ],
  }, targetWallet);

  // 2. AccountSet asfDisableMaster
  const dm = await submit(client, {
    TransactionType: "AccountSet",
    Account: targetWallet.classicAddress,
    SetFlag: 4, // asfDisableMaster
  }, targetWallet);

  updateAccount(accountAddress, { multisigActive: 1 });

  return toReceipt(dm);
}

export async function setupBorrowerMultisig(borrowerAddress?: string): Promise<TxReceipt> {
  const addr = borrowerAddress ?? loadAccounts().borrower.classicAddress;
  return setupAccountMultisig(addr);
}

export async function setupLenderMultisig(lenderAddress: string): Promise<TxReceipt> {
  return setupAccountMultisig(lenderAddress);
}

/** 2.12 depositCover: Broker deposits First-Loss capital into LoanBroker. */
export async function depositCover(loanBrokerId: string, amountXrp: string): Promise<TxReceipt> {
  const client = await getClient();
  const drops = xrpToDrops(amountXrp);
  return toReceipt(await submit(client, { TransactionType: "LoanBrokerCoverDeposit", Account: broker().classicAddress, LoanBrokerID: loanBrokerId, Amount: String(drops) }, broker()));
}

/** Dynamic account creation funded on Devnet and stored in SQLite DB. */
export async function createDbAccount(params: {
  role?: AccountRole;
  name?: string;
  company?: string;
  firstName?: string;
  userRole?: string;
}): Promise<DbAccount> {
  const { wallet } = await fundNewAccount();
  const role = params.role ?? "unassigned";
  let operatorAddress: string | undefined;
  let operatorSeed: string | undefined;

  if (role === "borrower" || role === "lender") {
    const opWallet = Wallet.generate();
    operatorAddress = opWallet.classicAddress;
    operatorSeed = opWallet.seed;
  }

  const count = listAccounts().length + 1;
  const defaultName = role === "borrower"
    ? "Emprunteur"
    : role === "lender"
    ? "Prêteur"
    : role === "broker"
    ? "Courtier Plateforme"
    : `Compte Aléatoire #${count}`;

  const newAcc: DbAccount = {
    address: wallet.classicAddress,
    role,
    name: params.name || defaultName,
    seed: wallet.seed!,
    company: params.company || (role === "broker" ? "BSA Platform Structurer" : undefined),
    firstName: params.firstName,
    userRole: params.userRole || (role === "broker" ? "Structurateur & Risque" : undefined),
    operatorAddress,
    operatorSeed,
    multisigActive: 0,
    createdAt: new Date().toISOString(),
  };

  saveAccount(newAcc);
  return sanitizeDbAccount(newAcc);
}

function sanitizeDbAccount(acc: DbAccount): DbAccount {
  return {
    ...acc,
    seed: "",
    operatorSeed: undefined,
  };
}

/** Instant 1-click creation of a random funded account (1,000 XRP) on Devnet. */
export async function createRandomAccount(name?: string): Promise<DbAccount> {
  const { wallet } = await fundNewAccount();
  const count = listAccounts().length + 1;
  const newAcc: DbAccount = {
    address: wallet.classicAddress,
    role: "unassigned",
    name: name || `Compte Aléatoire #${count}`,
    seed: wallet.seed!,
    multisigActive: 0,
    createdAt: new Date().toISOString(),
  };
  saveAccount(newAcc);
  return sanitizeDbAccount(newAcc);
}

/** Update an account's role and details in SQLite DB. */
export async function updateDbAccount(params: {
  address: string;
  role?: AccountRole;
  name?: string;
  company?: string;
  firstName?: string;
  userRole?: string;
  multisigActive?: number;
}): Promise<DbAccount> {
  const updated = updateAccount(params.address, params);
  return sanitizeDbAccount(updated);
}

export { dropsToXrp };

