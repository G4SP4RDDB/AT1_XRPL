// Real implementations behind tx.*: build, sign, submit, read back. Amounts at this boundary are XRP strings.
//
// Lenders and borrowers are independent XRPL accounts — their own wallet (Xaman/GemWallet/Crossmark)
// holds the master key, never this backend. Every transaction that only needs a plain single
// signature from one of them (VaultDeposit, a non-multisig VaultWithdraw, the two multisig-setup
// transactions) is split into prepare (autofill here) + sign (in the user's own wallet, frontend
// side, via xrpl-connect) + submit (here again, given back the already-signed blob).
//
// The one thing that stays backend-managed even for these accounts is the "operator" leg of their
// own 2-of-2 SignerList (used once multisig is active, for LoanPay/VaultWithdraw, and for LoanSet's
// CounterpartySignature) — see getOperatorFor() below for exactly why: no wallet adapter available
// in xrpl-connect (GemWallet/Crossmark/Xaman/WalletConnect) can produce a multisig-shaped
// signature or XLS-66's CounterpartySignature, both of which need direct access to a private key.
// The account owner still authorizes the *conversion* to multisig themselves (prepareAccountMultisigSetup
// returns two plain transactions for their own wallet to sign) — the backend just can't be cut out
// of the ongoing cosigning role that comes after, given today's tooling.
import { Wallet, xrpToDrops, dropsToXrp, multisign, signLoanSetByCounterparty, combineLoanSetCounterpartySigners, decode } from "xrpl";
import type { AutoOrigination, Ask, TxReceipt, WithdrawRequest, Blocked } from "../../shared/types.js";
import { getClient } from "./client.js";
import { loadAccounts } from "./accounts.js";
import { wipeCreatedAccounts, getCreatedAccounts } from "./createdAccounts.js";
import { getAccount, updateAccount, type DbAccount, type AccountRole } from "../db/index.js";
import { DEMO_LOAN, DEMO_BROKER, VAULT_CAP_MARGIN_DROPS, DEADLINE_ORIGINATION } from "./config.js";
import * as book from "./trancheBookStore.js";
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
import { positionOf, vaultStateOf, vaultData, brokerFor, listVaultsOf } from "./readLayer.js";

const toReceipt = (r: Receipt): TxReceipt => ({ hash: r.hash, result: r.result, explorerUrl: r.explorerUrl, ledgerIndex: r.ledgerIndex });

const broker = () => loadAccounts().broker;

/** Every broker-signed transaction is a plain single signature with the platform's own broker
 *  key (BROKER_SEED). The 2-of-2 multisig exists only on borrower/lender accounts, where the
 *  enforcer's co-signature is a real policy gate (call date, amounts) — on the broker it would just
 *  be a second key held by the same operator, so it's not used there. */
function brokerSubmit(client: Awaited<ReturnType<typeof getClient>>, tx: Record<string, unknown>) {
  return submit(client, tx, broker());
}

/** The mechanical "operator" cosigning key for a borrower/lender's own 2-of-2 SignerList. Backend-held
 *  by necessity (see file header) — never the account owner's own key. Must already exist (set up via
 *  prepareAccountMultisigSetup + submitAccountMultisigSetup) before this is called. */
function getOperatorFor(address: string): Wallet {
  const dbAcc = getAccount(address);
  if (!dbAcc?.operatorSeed) {
    throw new Error(`no multisig operator key on record for ${address} — run the multisig setup flow for this account first`);
  }
  return Wallet.fromSeed(dbAcc.operatorSeed);
}
const getBorrowerOpFor = getOperatorFor;

/** Loan terms derived from an ask (the borrower's posted tranche): PaymentTotal fixed,
 *  interval from the call date (min 60 s). */
export function termsFromAsk(ask: Ask, nowRipple: number) {
  const principalDrops = Number(xrpToDrops(ask.amount));
  const paymentTotal = DEMO_LOAN.paymentTotal;
  const secondsToCall = Math.max(60 * paymentTotal, isoToRipple(ask.callDate) - nowRipple);
  const paymentInterval = Math.max(60, Math.floor(secondsToCall / paymentTotal));
  const gracePeriod = Math.min(DEMO_LOAN.gracePeriodSec, paymentInterval);
  const interestRate = percentToTenthBp(ask.yieldRate);
  const interestDrops = Math.ceil(totalInterest(principalDrops, interestRate, paymentInterval, paymentTotal));
  return { principalDrops, paymentTotal, paymentInterval, gracePeriod, interestRate, interestDrops };
}

/** 2.1 + 2.2: VaultCreate (ask in Data) + LoanBrokerSet + LoanBrokerCoverDeposit. */
export async function createBond(ask: Ask): Promise<{ vaultId: string; loanBrokerId: string; receipts: TxReceipt[] }> {
  const client = await getClient();
  const now = await ledgerCloseTime(client);
  const t = termsFromAsk(ask, now);
  const data = Buffer.from(JSON.stringify({ id: ask.id, b: ask.borrowerAddress, a: ask.amount, y: ask.yieldRate, c: ask.callDate })).toString("hex");
  if (data.length / 2 > 256) throw new Error("ask too large for the 256-byte vault Data field");
  const cap = String(t.principalDrops + t.interestDrops + VAULT_CAP_MARGIN_DROPS);
  const receipts: TxReceipt[] = [];
  const vc = await brokerSubmit(client, { TransactionType: "VaultCreate", Account: broker().classicAddress, Asset: { currency: "XRP" }, Data: data, AssetsMaximum: cap });
  receipts.push(toReceipt(vc));
  const vaultId = createdId(vc.meta, "Vault");
  if (!vaultId) return { vaultId: "", loanBrokerId: "", receipts };
  const bs = await brokerSubmit(client, { TransactionType: "LoanBrokerSet", Account: broker().classicAddress, VaultID: vaultId, ManagementFeeRate: DEMO_BROKER.managementFeeRate, CoverRateMinimum: DEMO_BROKER.coverRateMinimum, CoverRateLiquidation: DEMO_BROKER.coverRateLiquidation, Data: data });
  receipts.push(toReceipt(bs));
  const loanBrokerId = createdId(bs.meta, "LoanBroker");
  if (!loanBrokerId) return { vaultId, loanBrokerId: "", receipts };
  const coverDrops = Math.max(Number(xrpToDrops(DEMO_BROKER.coverDepositXrp)), Math.ceil((t.principalDrops + t.interestDrops) * (DEMO_BROKER.coverRateMinimum / 100_000) * 1.2));
  const cd = await brokerSubmit(client, { TransactionType: "LoanBrokerCoverDeposit", Account: broker().classicAddress, LoanBrokerID: loanBrokerId, Amount: String(coverDrops) });
  receipts.push(toReceipt(cd));
  return { vaultId, loanBrokerId, receipts };
}

/** Transactions that wait for a human signature in a wallet (two QR approvals for the multisig
 *  setup) outlive autofill's ~20-ledger LastLedgerSequence (about a minute here) and come back
 *  tefMAX_LEDGER. Give them ~15 minutes instead. */
const WALLET_SIGNING_LEDGERS = 300;
async function extendExpiry<T extends Record<string, any>>(client: Awaited<ReturnType<typeof getClient>>, tx: T): Promise<T> {
  (tx as Record<string, any>).LastLedgerSequence = (await client.getLedgerIndex()) + WALLET_SIGNING_LEDGERS;
  return tx;
}

/** 2.3 VaultDeposit — prepare only. The lender's own wallet signs the result (see chainClient.ts),
 *  then hands the blob to submitSigned() below. */
export async function prepareDeposit(lenderAddress: string, vaultId: string, amountXrp: string): Promise<Record<string, any>> {
  const client = await getClient();
  return extendExpiry(client, await client.autofill({ TransactionType: "VaultDeposit", Account: lenderAddress, VaultID: vaultId, Amount: xrpToDrops(amountXrp) } as any));
}

/** Submit any transaction already signed by an external, independent wallet (a plain single
 *  signature — VaultDeposit, a non-multisig VaultWithdraw, or one leg of a multisig setup). */
export async function submitSigned(signedBlob: string): Promise<TxReceipt> {
  const client = await getClient();
  const receipt = toReceipt(await submitBlob(client, signedBlob));
  let decoded: any;
  try { decoded = decode(signedBlob); } catch { decoded = undefined; }
  if (decoded?.TransactionType === "VaultDeposit" && receipt.result === "tesSUCCESS" && decoded.VaultID) {
    receipt.autoOrigination = await autoOriginateIfFunded(String(decoded.VaultID));
  }
  return receipt;
}

/** Money in, loan out: the deposit that brings the vault's liquid assets up to the bid's principal
 *  triggers LoanSet to the vault's issuer at once, no manual step. One bond = one loan, so nothing
 *  happens once a loan exists. Needs the issuer's 2-of-2 governance (the counterparty signature
 *  comes from its operator key); until then the deposit stands and origination waits. */
const originating = new Set<string>();
export async function autoOriginateIfFunded(vaultId: string): Promise<AutoOrigination> {
  if (originating.has(vaultId)) return { skipped: "origination already in progress" };
  originating.add(vaultId);
  try {
    const client = await getClient();
    const state = await vaultStateOf(client, vaultId);
    if (state.loan) return { skipped: "loan already originated" };
    if (!state.borrowerAddress || !state.loanPrincipal || !state.callDate) return { skipped: "vault carries no bid" };
    const principalDrops = Number(xrpToDrops(state.loanPrincipal));
    const availableDrops = Number(xrpToDrops(state.assetsAvailable));
    if (availableDrops < principalDrops) return { skipped: `funded ${state.assetsAvailable} / ${state.loanPrincipal} XRP` };
    const lb = await brokerFor(client, vaultId);
    if (!lb) return { skipped: "no loan broker on this vault" };
    if (!getAccount(state.borrowerAddress)?.operatorSeed) return { skipped: "issuer has not activated 2-of-2 governance yet" };
    const ask: Ask = {
      id: state.bidId ?? vaultId, borrowerAddress: state.borrowerAddress, amount: state.loanPrincipal,
      yieldRate: state.loanInterestRate ?? 0, callDate: state.callDate, status: "matched", vaultId, loanBrokerId: lb.index,
    };
    const r = await originate(ask);
    return { originated: r };
  } catch (e) {
    return { skipped: `origination failed: ${(e as Error).message}` };
  } finally {
    originating.delete(vaultId);
  }
}

/** Deadline fallback for a bid that never reached full funding: once its off-chain expiresAt
 *  (order-book.json, no on-chain effect of its own — see friction-log #28) has passed, originate
 *  anyway for whatever was actually deposited, as long as it clears DEADLINE_ORIGINATION.minFundedRatio
 *  of the requested principal. Below that ratio the vault is left stalled; nothing here ever moves
 *  or refunds a depositor's funds, they remain free to VaultWithdraw themselves at any time. */
export async function originateStalledIfPastDeadline(vaultId: string): Promise<AutoOrigination> {
  if (originating.has(vaultId)) return { skipped: "origination already in progress" };
  originating.add(vaultId);
  try {
    const client = await getClient();
    const state = await vaultStateOf(client, vaultId);
    if (state.loan) return { skipped: "loan already originated" };
    if (!state.borrowerAddress || !state.loanPrincipal || !state.callDate || !state.bidId) return { skipped: "vault carries no bid" };

    const tranche = (await book.listAsks()).find((t) => t.id === state.bidId);
    if (!tranche?.expiresAt) return { skipped: "bid has no funding deadline" };
    if (new Date(tranche.expiresAt).getTime() > Date.now()) return { skipped: "funding deadline not reached yet" };

    const principalDrops = Number(xrpToDrops(state.loanPrincipal));
    const availableDrops = Number(xrpToDrops(state.assetsAvailable));
    if (availableDrops <= 0) return { skipped: "nothing was deposited before the deadline" };
    const fundedRatio = availableDrops / principalDrops;
    if (fundedRatio < DEADLINE_ORIGINATION.minFundedRatio) {
      return { skipped: `funded ${(fundedRatio * 100).toFixed(1)}% at deadline, below the ${DEADLINE_ORIGINATION.minFundedRatio * 100}% minimum — left for manual withdrawal` };
    }

    const lb = await brokerFor(client, vaultId);
    if (!lb) return { skipped: "no loan broker on this vault" };
    if (!getAccount(state.borrowerAddress)?.operatorSeed) return { skipped: "issuer has not activated 2-of-2 governance yet" };

    // Amount is the actual raised total, not the original ask: the loan is sized to what showed up.
    const ask: Ask = {
      id: state.bidId, borrowerAddress: state.borrowerAddress, amount: state.assetsAvailable,
      yieldRate: state.loanInterestRate ?? 0, callDate: state.callDate, status: "matched", vaultId, loanBrokerId: lb.index,
    };
    const r = await originate(ask);
    return { originated: r };
  } catch (e) {
    return { skipped: `deadline origination failed: ${(e as Error).message}` };
  } finally {
    originating.delete(vaultId);
  }
}

/** Called on an interval by server.ts: scan every vault the broker owns for one that is past its
 *  bid's funding deadline with no loan yet, and settle it one way or the other. */
export async function scanStalledOriginations(): Promise<Record<string, AutoOrigination>> {
  const client = await getClient();
  const vaults = await listVaultsOf(client);
  const out: Record<string, AutoOrigination> = {};
  for (const v of vaults) {
    if (v.loan) continue;
    out[v.vaultId] = await originateStalledIfPastDeadline(v.vaultId);
  }
  return out;
}

/** 2.5 LoanSet: broker signs, both borrower signers add counterparty signatures, submit. Principal moves here. */
export async function originate(ask: Ask): Promise<TxReceipt & { loanId?: string }> {
  if (!ask.loanBrokerId) throw new Error("ask has no loanBrokerId, call createBond first");
  const client = await getClient();
  // The vault is bound to one issuer: the ask stored in its Data field at creation. Nobody else can
  // be the counterparty of a loan on it (the enforcer checks the same thing before counter-signing).
  const lbEntry = await ledgerEntry(client, ask.loanBrokerId);
  const bound = lbEntry?.VaultID ? await vaultData(client, lbEntry.VaultID) : {};
  if (bound.b && bound.b !== ask.borrowerAddress) {
    throw new Error(`vault ${lbEntry.VaultID} is bound to issuer ${bound.b}; ${ask.borrowerAddress} cannot borrow from it`);
  }
  const now = await ledgerCloseTime(client);
  const t = termsFromAsk(ask, now);
  const tx: any = {
    TransactionType: "LoanSet", Account: broker().classicAddress, LoanBrokerID: ask.loanBrokerId, Counterparty: ask.borrowerAddress,
    PrincipalRequested: String(t.principalDrops), InterestRate: t.interestRate, CloseInterestRate: DEMO_LOAN.closeInterestRate,
    ClosePaymentFee: xrpToDrops(DEMO_LOAN.closePaymentFeeXrp), PaymentTotal: t.paymentTotal, PaymentInterval: t.paymentInterval, GracePeriod: t.gracePeriod,
  };
  const prepared = await client.autofill(tx);
  prepared.Fee = String(Number(prepared.Fee) * 5);
  // signLoanSetByCounterparty() needs a plain single signature on the Account side (it has no path
  // for a multisig Signers array there) — one more reason the broker stays a single key.
  const first = broker().sign(prepared);
  const op = getBorrowerOpFor(ask.borrowerAddress);
  const s1 = signLoanSetByCounterparty(op, first.tx_blob, { multisign: true });
  const enf = await enforcerCounterSign(first.tx_blob);
  const combined = combineLoanSetCounterpartySigners([s1.tx, enf]);
  const r = await submitBlob(client, combined.tx_blob);
  return { ...toReceipt(r), loanId: createdId(r.meta, "Loan") };
}

/** Account transaction: operator signs, enforcer decides and co-signs, multisign, submit. Both
 *  legs are backend-held (see getOperatorFor above) — no external signature needed here. */
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

/** 2.7 VaultWithdraw, multisig-active accounts only: routed through the Enforcer daemon for policy
 *  verification, same backend-held operator+enforcer pair as LoanPay above. For an account that
 *  hasn't activated multisig, use prepareWithdraw()+submitSigned() instead (plain external signature). */
export async function withdraw(req: WithdrawRequest): Promise<TxReceipt | Blocked> {
  const client = await getClient();
  const v = await vaultInfo(client, req.vaultId);

  let shares: string;
  if (req.mode === "full") {
    shares = await shareBalance(client, req.depositorAddress, v.shareMptId);
    if (Number(shares) <= 0) return { hash: "", result: "skipped: no shares held", explorerUrl: "" };
  } else {
    const p = await positionOf(client, req.depositorAddress, req.vaultId);
    shares = p.yieldShares;
    if (Number(shares) <= 0) return { hash: "", result: "skipped: no yield shares yet", explorerUrl: "" };
  }

  return accountMultisigSubmit({
    TransactionType: "VaultWithdraw",
    Account: req.depositorAddress,
    VaultID: req.vaultId,
    Amount: { mpt_issuance_id: v.shareMptId, value: shares },
  });
}

/** 2.7b VaultWithdraw, plain accounts (no multisig yet) — prepare only, external wallet signs. */
export async function prepareWithdraw(req: WithdrawRequest): Promise<{ prepared: Record<string, any> } | Blocked> {
  const client = await getClient();
  const v = await vaultInfo(client, req.vaultId);

  let shares: string;
  if (req.mode === "full") {
    shares = await shareBalance(client, req.depositorAddress, v.shareMptId);
    if (Number(shares) <= 0) return { blocked: "not-supported", reason: "no shares held" };
  } else {
    const p = await positionOf(client, req.depositorAddress, req.vaultId);
    shares = p.yieldShares;
    if (Number(shares) <= 0) return { blocked: "not-supported", reason: "no yield shares yet" };
  }

  const prepared = await extendExpiry(client, await client.autofill({
    TransactionType: "VaultWithdraw",
    Account: req.depositorAddress,
    VaultID: req.vaultId,
    Amount: { mpt_issuance_id: v.shareMptId, value: shares },
  } as any));
  return { prepared };
}

/** 2.10 write-down: only accepted once a payment is overdue on this devnet. */
export async function impair(loanId: string): Promise<TxReceipt> {
  const client = await getClient();
  return toReceipt(await brokerSubmit(client, { TransactionType: "LoanManage", Account: broker().classicAddress, LoanID: loanId, Flags: 0x00020000 }));
}
export async function unimpair(loanId: string): Promise<TxReceipt> {
  const client = await getClient();
  return toReceipt(await brokerSubmit(client, { TransactionType: "LoanManage", Account: broker().classicAddress, LoanID: loanId, Flags: 0x00040000 }));
}

/** 2.11 Configure 2-of-2 Multisig on an account with master key disabled — prepare only. Returns
 *  the two plain, single-signature transactions (SignerListSet, AccountSet asfDisableMaster) for
 *  the account owner's own wallet to sign; see submitAccountMultisigSetup() for the second half.
 *  The operator key plugged into the SignerList is generated/reused here and stays backend-held
 *  (see file header for why) — only the account owner's authorization to install it is external. */
export async function prepareAccountMultisigSetup(accountAddress: string): Promise<{ signerListSet: Record<string, any>; disableMaster: Record<string, any> }> {
  const client = await getClient();
  const acc = loadAccounts();
  const enforcerAddress = acc.brokerEnforcer?.classicAddress;
  if (!enforcerAddress) throw new Error("platform enforcer address not configured");

  const ai: any = await client.request({ command: "account_info", account: accountAddress, ledger_index: "validated" } as any);
  const masterDisabled = ((ai.result.account_data.Flags ?? 0) & 0x00100000) !== 0;
  if (masterDisabled) {
    updateAccount(accountAddress, { multisigActive: 1 });
    throw new Error("multisig is already configured for this account (master key already disabled)");
  }

  let dbAcc = getAccount(accountAddress);
  if (!dbAcc?.operatorAddress) {
    const opWallet = Wallet.generate();
    dbAcc = updateAccount(accountAddress, { operatorAddress: opWallet.classicAddress, operatorSeed: opWallet.seed });
  }
  const operatorAddress = dbAcc.operatorAddress!;

  const signerListSet = await client.autofill({
    TransactionType: "SignerListSet",
    Account: accountAddress,
    SignerQuorum: 2,
    SignerEntries: [
      { SignerEntry: { Account: operatorAddress, SignerWeight: 1 } },
      { SignerEntry: { Account: enforcerAddress, SignerWeight: 1 } },
    ],
  } as any);
  const disableMaster = await client.autofill({
    TransactionType: "AccountSet",
    Account: accountAddress,
    SetFlag: 4, // asfDisableMaster
  } as any);
  // Both come from the same not-yet-submitted account, autofilled independently — force the second
  // transaction's Sequence past the first so they don't collide when submitted back to back.
  disableMaster.Sequence = Number(signerListSet.Sequence) + 1;
  await extendExpiry(client, signerListSet);
  await extendExpiry(client, disableMaster);

  return { signerListSet, disableMaster };
}

/** Second half of prepareAccountMultisigSetup(): submit both transactions once the account owner's
 *  own wallet has signed them, in order (SignerListSet must land before AccountSet disables master). */
export async function submitAccountMultisigSetup(accountAddress: string, signerListSetBlob: string, disableMasterBlob: string): Promise<TxReceipt> {
  const client = await getClient();
  const r1 = await submitBlob(client, signerListSetBlob);
  if (r1.result !== "tesSUCCESS") return toReceipt(r1);
  const r2 = await submitBlob(client, disableMasterBlob);
  if (r2.result === "tesSUCCESS") {
    updateAccount(accountAddress, { multisigActive: 1 });
  }
  return toReceipt(r2);
}

/** 2.12 depositCover: Broker deposits First-Loss capital into LoanBroker. */
export async function depositCover(loanBrokerId: string, amountXrp: string): Promise<TxReceipt> {
  const client = await getClient();
  const drops = xrpToDrops(amountXrp);
  return toReceipt(await brokerSubmit(client, { TransactionType: "LoanBrokerCoverDeposit", Account: broker().classicAddress, LoanBrokerID: loanBrokerId, Amount: String(drops) }));
}

function sanitizeDbAccount(acc: DbAccount): DbAccount {
  return {
    ...acc,
    seed: "",
    operatorSeed: undefined,
  };
}

/** Persist or update an account's role and details in SQLite DB at signup/setup time. The address
 *  is always one the caller already controls via their own wallet — this never mints a wallet. */
export async function updateDbAccount(params: {
  address: string;
  role?: AccountRole;
  name?: string;
  company?: string;
  firstName?: string;
  userRole?: string;
  multisigActive?: number;
}): Promise<DbAccount> {
  const brokerAddress = broker().classicAddress;
  if (params.role === "broker" && params.address !== brokerAddress) {
    throw new Error("The broker role is reserved for the platform's own account; this address cannot self-assign it.");
  }
  if (params.address === brokerAddress && params.role !== undefined && params.role !== "broker") {
    throw new Error("The platform's broker account cannot be reassigned to another role.");
  }
  const updated = updateAccount(params.address, params);
  return sanitizeDbAccount(updated);
}

/** The only account ever allowed the 'broker' role is the platform's own fixed account
 * (the one whose public address the infra operator configured as BROKER_ADDRESS in .env,
 * (the one whose seed the infra operator configured as BROKER_SEED in .env, loadAccounts().broker) —
 * no user-created account can self-assign it (enforced above in create/updateDbAccount).
 * Call once at server startup so that account already reads as 'broker' in the DB without
 * needing anyone to manually set it via the UI. Idempotent. */
export function ensureBrokerAccountRegistered(): void {
  const brokerWallet = broker();
  const existing = getAccount(brokerWallet.classicAddress);
  // Always re-asserted, never skipped once role is already 'broker': the DB must never hold a
  // signable seed for this row (the broker seed lives in .env only), so any leftover seed from an
  // older custody model is wiped here too, not just left as-is.
  if (existing?.role === "broker" && !existing.seed) return;
  updateAccount(brokerWallet.classicAddress, {
    role: "broker",
    name: existing?.name ?? "AT1 Structuring Desk",
    company: existing?.company ?? "BSA Platform Structurer",
    userRole: existing?.userRole ?? "Structurateur & Risque",
    seed: "",
  });
}

export { dropsToXrp };
export { wipeCreatedAccounts, getCreatedAccounts } from "./createdAccounts.js";
