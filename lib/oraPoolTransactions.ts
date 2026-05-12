import algosdk, { type Transaction } from "algosdk";
import { algodClient } from "@/lib/algorand";

export const ORA_POOL_APP_ID = 1_439_234_347;
export const ORA_POOL_APP_ADDRESS = "G6B5L2B3GSLJQTC5THSGSJMTJ4EN3SBF3IW5PI7XEEKYH6WXN6UGY4XAXQ";
export const ORA_POOL_DEFAULT_DEPOSIT_MICROALGO = 1_000_000;
export const ORA_POOL_DEPOSIT_WARNING_MICROALGO = 10_000_000;
export const ORA_POOL_DEPOSIT_MAX_MICROALGO = 100_000_000;
export const ORA_POOL_TOKEN_ID = 1_294_765_516;
export const ORA_TINYMAN_POOL_APP_ID = 1_002_541_853;

const ORA_ASA_ID = Number(process.env.NEXT_PUBLIC_ORA_ASA_ID ?? "1284444444");
const ORA_POOL_DEPOSIT_SELECTOR = "kuA7HA==";
const ORA_POOL_WITHDRAW_SELECTOR = "466yXA==";
const ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO = 1_000;
const ORA_POOL_TOKEN_OPT_IN_TXN_FEE_MICROALGO = 1_000;
const ORA_POOL_WITHDRAW_TXN_FEE_MICROALGO = 3_000;
const SELF_APP_BOX_INDEX = 0;

type BuildOraPoolDepositTxnsParams = {
  amountMicroAlgo: number;
  sender: string;
};

type BuildOraPoolWithdrawTxnParams = {
  arg1?: number;
  arg2?: number;
  sender: string;
};

type BuildOraPoolTokenOptInTxnParams = {
  sender: string;
};

export async function buildOraPoolDepositTxns({
  amountMicroAlgo,
  sender
}: BuildOraPoolDepositTxnsParams): Promise<Transaction[]> {
  validateOraPoolDepositInput({ amountMicroAlgo, sender });

  const senderPublicKey = algosdk.decodeAddress(sender).publicKey;
  const suggestedParams = await algodClient.getTransactionParams().do();
  const paymentParams = { ...suggestedParams, fee: BigInt(ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO), flatFee: true };
  const appCallParams = { ...suggestedParams, fee: BigInt(ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO), flatFee: true };

  const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    amount: amountMicroAlgo,
    receiver: ORA_POOL_APP_ADDRESS,
    sender,
    suggestedParams: paymentParams
  });

  const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
    accounts: [],
    appArgs: [algosdk.base64ToBytes(ORA_POOL_DEPOSIT_SELECTOR)],
    appIndex: ORA_POOL_APP_ID,
    boxes: [
      {
        appIndex: SELF_APP_BOX_INDEX,
        name: senderPublicKey
      }
    ],
    convertToAccess: false,
    foreignApps: [],
    foreignAssets: [ORA_ASA_ID, ORA_POOL_TOKEN_ID],
    sender,
    suggestedParams: appCallParams
  });
  paymentTxn.fee = BigInt(ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO);
  appCallTxn.fee = BigInt(ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO);

  const groupedTransactions = algosdk.assignGroupID([paymentTxn, appCallTxn]);

  validateOraPoolDepositTxnStructure(groupedTransactions, { amountMicroAlgo, sender, senderPublicKey });

  return groupedTransactions;
}

export async function buildOraPoolWithdrawTxn({
  arg1 = 10_000,
  arg2 = 10_000,
  sender
}: BuildOraPoolWithdrawTxnParams): Promise<Transaction> {
  validateOraPoolWithdrawInput({ arg1, arg2, sender });

  const senderPublicKey = algosdk.decodeAddress(sender).publicKey;
  const suggestedParams = await algodClient.getTransactionParams().do();
  const withdrawParams = {
    ...suggestedParams,
    fee: BigInt(ORA_POOL_WITHDRAW_TXN_FEE_MICROALGO),
    flatFee: true
  };

  const transaction = algosdk.makeApplicationNoOpTxnFromObject({
    accounts: [],
    appArgs: [
      algosdk.base64ToBytes(ORA_POOL_WITHDRAW_SELECTOR),
      algosdk.encodeUint64(arg1),
      algosdk.encodeUint64(arg2)
    ],
    appIndex: ORA_POOL_APP_ID,
    boxes: [
      {
        appIndex: SELF_APP_BOX_INDEX,
        name: senderPublicKey
      }
    ],
    convertToAccess: false,
    foreignApps: [],
    foreignAssets: [ORA_POOL_TOKEN_ID],
    sender,
    suggestedParams: withdrawParams
  });
  transaction.fee = BigInt(ORA_POOL_WITHDRAW_TXN_FEE_MICROALGO);

  validateOraPoolWithdrawTxnStructure(transaction, { arg1, arg2, senderPublicKey });

  return transaction;
}

export async function checkOraPoolTokenOptedIn(sender: string): Promise<boolean> {
  if (!algosdk.isValidAddress(sender)) {
    throw new Error("Invalid Algorand sender address.");
  }

  const account = await algodClient.accountInformation(sender).do();

  return Boolean(account.assets?.some((asset) => Number(asset.assetId) === ORA_POOL_TOKEN_ID));
}

export async function buildOraPoolTokenOptInTxn({
  sender
}: BuildOraPoolTokenOptInTxnParams): Promise<Transaction> {
  validateOraPoolTokenOptInInput({ sender });

  const suggestedParams = await algodClient.getTransactionParams().do();
  const optInParams = {
    ...suggestedParams,
    fee: BigInt(ORA_POOL_TOKEN_OPT_IN_TXN_FEE_MICROALGO),
    flatFee: true
  };

  const transaction = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    amount: 0,
    assetIndex: ORA_POOL_TOKEN_ID,
    receiver: sender,
    sender,
    suggestedParams: optInParams
  });
  transaction.fee = BigInt(ORA_POOL_TOKEN_OPT_IN_TXN_FEE_MICROALGO);

  validateOraPoolTokenOptInTxnStructure(transaction, { sender });

  return transaction;
}

function validateOraPoolDepositInput({ amountMicroAlgo, sender }: BuildOraPoolDepositTxnsParams) {
  if (!algosdk.isValidAddress(sender)) {
    throw new Error("Invalid Algorand sender address.");
  }

  if (!Number.isSafeInteger(amountMicroAlgo)) {
    throw new Error("amountMicroAlgo must be an integer microAlgo amount.");
  }

  if (amountMicroAlgo <= 0) {
    throw new Error("Deposit amount must be greater than 0 ALGO.");
  }

  if (amountMicroAlgo > ORA_POOL_DEPOSIT_MAX_MICROALGO) {
    throw new Error("Deposits above 100 ALGO are blocked for now.");
  }

  if (!Number.isSafeInteger(ORA_ASA_ID) || ORA_ASA_ID <= 0) {
    throw new Error("NEXT_PUBLIC_ORA_ASA_ID must be set to a valid positive integer.");
  }
}

function validateOraPoolWithdrawInput({ arg1, arg2, sender }: Required<BuildOraPoolWithdrawTxnParams>) {
  if (!algosdk.isValidAddress(sender)) {
    throw new Error("Invalid Algorand sender address.");
  }

  if (!Number.isSafeInteger(arg1) || arg1 < 0) {
    throw new Error("arg1 must be a non-negative safe integer uint64 value.");
  }

  if (!Number.isSafeInteger(arg2) || arg2 < 0) {
    throw new Error("arg2 must be a non-negative safe integer uint64 value.");
  }
}

function validateOraPoolTokenOptInInput({ sender }: BuildOraPoolTokenOptInTxnParams) {
  if (!algosdk.isValidAddress(sender)) {
    throw new Error("Invalid Algorand sender address.");
  }
}

function validateOraPoolDepositTxnStructure(
  transactions: Transaction[],
  {
    amountMicroAlgo,
    sender,
    senderPublicKey
  }: { amountMicroAlgo: number; sender: string; senderPublicKey: Uint8Array }
) {
  const [paymentTxn, appCallTxn] = transactions;
  const appCall = appCallTxn.applicationCall;
  const encodedAppCall = appCallTxn.toEncodingData();
  const encodedBoxes = getEncodedBoxes(encodedAppCall);
  const encodedAppArgs = getEncodedBytesArray(encodedAppCall, "apaa").map(bytesToBase64);
  const encodedForeignAssets = getEncodedBigIntArray(encodedAppCall, "apas").map(Number);
  const encodedForeignApps = getEncodedBigIntArray(encodedAppCall, "apfa").map(Number);
  const encodedAccounts = encodedAppCall.get("apat");

  if (paymentTxn.type !== "pay") {
    throw new Error("OrangeMiner deposit group must start with a payment transaction.");
  }

  if (paymentTxn.sender.toString() !== sender) {
    throw new Error("OrangeMiner deposit payment sender must match connected wallet.");
  }

  if (paymentTxn.payment?.receiver.toString() !== ORA_POOL_APP_ADDRESS) {
    throw new Error("OrangeMiner deposit payment receiver does not match the official app address.");
  }

  if (paymentTxn.payment?.amount !== BigInt(amountMicroAlgo)) {
    throw new Error("OrangeMiner deposit payment amount does not match selected amount.");
  }

  if (paymentTxn.fee !== BigInt(ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO)) {
    throw new Error("OrangeMiner deposit payment fee must match the real successful deposit fee.");
  }

  if (appCallTxn.type !== "appl" || Number(appCall?.appIndex) !== ORA_POOL_APP_ID) {
    throw new Error("OrangeMiner deposit second transaction must be an app call to the pool app.");
  }

  if (appCallTxn.fee !== BigInt(ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO)) {
    throw new Error("OrangeMiner deposit app call fee must match the real successful deposit fee.");
  }

  if (encodedAppArgs.length !== 1 || encodedAppArgs[0] !== ORA_POOL_DEPOSIT_SELECTOR) {
    throw new Error("OrangeMiner deposit app args must exactly match the real deposit selector.");
  }

  if (Array.isArray(encodedAccounts) && encodedAccounts.length > 0) {
    throw new Error("OrangeMiner deposit app call must not include application accounts.");
  }

  if (encodedForeignApps.length > 0) {
    throw new Error("OrangeMiner deposit app call must not include foreign applications.");
  }

  if (
    encodedForeignAssets.length !== 2 ||
    encodedForeignAssets[0] !== ORA_ASA_ID ||
    encodedForeignAssets[1] !== ORA_POOL_TOKEN_ID
  ) {
    throw new Error("OrangeMiner deposit foreign assets must exactly match [ORA ASA, pool token].");
  }

  if (
    encodedBoxes.length !== 1 ||
    encodedBoxes[0].appIndex !== SELF_APP_BOX_INDEX ||
    encodedBoxes[0].nameBase64 !== bytesToBase64(senderPublicKey)
  ) {
    throw new Error("OrangeMiner deposit box reference must be the self-app sender public key box.");
  }
}

function validateOraPoolWithdrawTxnStructure(
  transaction: Transaction,
  {
    arg1,
    arg2,
    senderPublicKey
  }: { arg1: number; arg2: number; senderPublicKey: Uint8Array }
) {
  const appCall = transaction.applicationCall;
  const encodedTransaction = transaction.toEncodingData();
  const encodedBoxes = getEncodedBoxes(encodedTransaction);
  const encodedAppArgs = getEncodedBytesArray(encodedTransaction, "apaa").map(bytesToBase64);
  const encodedForeignAssets = getEncodedBigIntArray(encodedTransaction, "apas").map(Number);
  const encodedForeignApps = getEncodedBigIntArray(encodedTransaction, "apfa").map(Number);
  const encodedAccounts = encodedTransaction.get("apat");
  const expectedArgs = [
    ORA_POOL_WITHDRAW_SELECTOR,
    bytesToBase64(algosdk.encodeUint64(arg1)),
    bytesToBase64(algosdk.encodeUint64(arg2))
  ];

  if (transaction.type !== "appl" || Number(appCall?.appIndex) !== ORA_POOL_APP_ID) {
    throw new Error("OrangeMiner withdraw transaction must be an app call to the pool app.");
  }

  if (transaction.fee !== BigInt(ORA_POOL_WITHDRAW_TXN_FEE_MICROALGO)) {
    throw new Error("OrangeMiner withdraw fee must be 3000 microAlgos.");
  }

  if (encodedAppArgs.length !== expectedArgs.length || encodedAppArgs.some((arg, index) => arg !== expectedArgs[index])) {
    throw new Error("OrangeMiner withdraw app args do not match the observed withdraw structure.");
  }

  if (Array.isArray(encodedAccounts) && encodedAccounts.length > 0) {
    throw new Error("OrangeMiner withdraw app call must not include application accounts.");
  }

  if (encodedForeignApps.length > 0) {
    throw new Error("OrangeMiner withdraw app call must not include foreign applications.");
  }

  if (encodedForeignAssets.length !== 1 || encodedForeignAssets[0] !== ORA_POOL_TOKEN_ID) {
    throw new Error("OrangeMiner withdraw foreign assets must exactly match [pool token].");
  }

  if (
    encodedBoxes.length !== 1 ||
    encodedBoxes[0].appIndex !== SELF_APP_BOX_INDEX ||
    encodedBoxes[0].nameBase64 !== bytesToBase64(senderPublicKey)
  ) {
    throw new Error("OrangeMiner withdraw box reference must be the self-app sender public key box.");
  }
}

function validateOraPoolTokenOptInTxnStructure(transaction: Transaction, { sender }: { sender: string }) {
  const assetTransfer = transaction.assetTransfer;

  if (transaction.type !== "axfer") {
    throw new Error("OrangeMiner pool token opt-in must be an asset transfer transaction.");
  }

  if (transaction.sender.toString() !== sender) {
    throw new Error("OrangeMiner pool token opt-in sender must match connected wallet.");
  }

  if (assetTransfer?.receiver.toString() !== sender) {
    throw new Error("OrangeMiner pool token opt-in receiver must be the connected wallet.");
  }

  if (assetTransfer?.assetIndex !== BigInt(ORA_POOL_TOKEN_ID)) {
    throw new Error("OrangeMiner pool token opt-in must target ASA 1294765516.");
  }

  if (assetTransfer?.amount !== BigInt(0)) {
    throw new Error("OrangeMiner pool token opt-in amount must be 0.");
  }

  if (transaction.fee !== BigInt(ORA_POOL_TOKEN_OPT_IN_TXN_FEE_MICROALGO)) {
    throw new Error("OrangeMiner pool token opt-in fee must be 1000 microAlgos.");
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binaryValue = "";

  bytes.forEach((byte) => {
    binaryValue += String.fromCharCode(byte);
  });

  return globalThis.btoa(binaryValue);
}

function getEncodedBoxes(encodedTransaction: Map<string, unknown>) {
  const encodedBoxes = encodedTransaction.get("apbx");

  if (!Array.isArray(encodedBoxes)) {
    return [];
  }

  return encodedBoxes.map((box) => {
    if (!(box instanceof Map)) {
      return { appIndex: -1, nameBase64: "" };
    }

    const appIndex = Number(box.get("i"));
    const name = box.get("n");

    return {
      appIndex,
      nameBase64: name instanceof Uint8Array ? bytesToBase64(name) : ""
    };
  });
}

function getEncodedBytesArray(encodedTransaction: Map<string, unknown>, key: string) {
  const value = encodedTransaction.get(key);

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Uint8Array => item instanceof Uint8Array);
}

function getEncodedBigIntArray(encodedTransaction: Map<string, unknown>, key: string) {
  const value = encodedTransaction.get(key);

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is bigint => typeof item === "bigint");
}
