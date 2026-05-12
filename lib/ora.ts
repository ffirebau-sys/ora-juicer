import algosdk from "algosdk";
import { algodClient, indexerClient, ORA_APP_ID, ORA_ASA_ID } from "@/lib/algorand";
import { formatInteger, formatUnits, shortenAddress } from "@/lib/format";

type TealValueLike = {
  bytes?: unknown;
  type?: unknown;
  uint?: unknown;
};

type TealKeyValueLike = {
  key?: unknown;
  value?: TealValueLike;
};

export type DecodedTealValue = {
  bytes?: string;
  type: number;
  uint?: bigint;
};

export type DecodedTealState = Record<string, DecodedTealValue>;

export type OraAssetInfo = {
  decimals: number;
  name?: string;
  total: bigint;
  unitName?: string;
};

export type OraGlobalState = {
  currentMinerAddress?: string;
  currentMinerEffort?: bigint;
  minedSupply?: bigint;
  state: DecodedTealState;
  totalEffort?: bigint;
  totalTransactions?: bigint;
};

export type OraRawGlobalState = {
  current_miner_effort: string | null;
  total_effort: string | null;
  total_transactions: string | null;
};

export type OraWalletData = {
  algoBalance: bigint;
  hasMiningState: boolean;
  hasOraOptIn: boolean;
  localEffort?: bigint;
  minBalance: bigint;
  oraBalance: bigint;
};

export type OraRecentJuicingTransaction = {
  fee: string;
  round: string;
  sender: string;
  time: string;
  txId?: string;
};

export type OraLeaderboardData = {
  currentLeader: {
    address: string;
    effort: string;
    streak: string;
  } | null;
  topJuicers: Array<{
    rank: number;
    address: string;
    effort: string;
  }>;
};

export type OraPoolMiningStatus = {
  frequencyPerMinute: number;
  isActive: boolean;
  lastMineTime: string;
  lastMineTimestamp?: number;
  mineTransactionCount: number;
};

export type OraPoolGlobalState = {
  state: DecodedTealState;
  totalDeposited?: bigint;
  totalSpent?: bigint;
  totalWithdrawn?: bigint;
};

export type OraPoolBoxUint64Field = {
  hex: string;
  index: number;
  offset: number;
  uint: string;
};

export type OraPoolWalletBox = {
  rawBase64: string;
  rawHex: string;
  uint64Fields: OraPoolBoxUint64Field[];
  valueByteLength: number;
};

export type OraPoolWalletData = {
  box: OraPoolWalletBox | null;
  boxFound: boolean;
  boxNameBase64: string;
  boxNameHex: string;
  hasPoolLocalState: boolean;
  hasPoolTokenOptIn: boolean;
  poolLocalState: DecodedTealState;
  poolTokenBalance: bigint;
};

export type OraPoolTransactionSummary = {
  appArgs: string[];
  boxes: Array<{
    app: string;
    nameBase64: string;
    nameHex: string;
  }>;
  explorerUrl: string;
  fee: string;
  foreignApps: string[];
  foreignAssets: string[];
  groupId?: string;
  groupTransactions: OraPoolRelatedTransaction[];
  innerTransactions: OraPoolRelatedTransaction[];
  label: string;
  round: string;
  sender: string;
  time: string;
  txId: string;
};

export type OraPoolRelatedTransaction = {
  amount?: string;
  assetId?: string;
  receiver?: string;
  sender?: string;
  txId?: string;
  type: string;
};

export type OraPoolWithdrawalResearch = {
  accounts: string[];
  appArgs: string[];
  decodedUint64Args: string[];
  expectedResult: string;
  fee: string;
  foreignApps: string[];
  foreignAssets: string[];
  requiredBoxes: Array<{
    app: string;
    nameBase64: string;
    nameHex: string;
    source: string;
  }>;
  selector: string;
};

const textDecoder = new TextDecoder();
const ORA_POOL_APP_ID = 1_439_234_347;
const ORA_POOL_APP_ADDRESS = "G6B5L2B3GSLJQTC5THSGSJMTJ4EN3SBF3IW5PI7XEEKYH6WXN6UGY4XAXQ";
const ORA_POOL_TOKEN_ID = 1_294_765_516;
const ORA_POOL_DEPOSIT_SELECTOR = "kuA7HA==";
const ORA_POOL_MINE_SELECTOR = "eEq3eg==";
const ORA_POOL_WITHDRAW_SELECTOR = "466yXA==";
const ORA_POOL_ACTIVE_WINDOW_SECONDS = 10 * 60;
const ORA_POOL_LOOKBACK_ROUNDS = 200_000;
const ORA_POOL_EXPLORER_TX_BASE_URL = "https://explorer.perawallet.app/tx";

export async function fetchOraAssetInfo(): Promise<OraAssetInfo> {
  const asset = await algodClient.getAssetByID(ORA_ASA_ID).do();

  return {
    decimals: Number(asset.params.decimals ?? 0),
    name: asset.params.name,
    total: BigInt(asset.params.total),
    unitName: asset.params.unitName
  };
}

export async function fetchOraGlobalState(): Promise<OraGlobalState> {
  const application = await algodClient.getApplicationByID(ORA_APP_ID).do();
  const state = decodeTealState(application.params.globalState);

  return {
    currentMinerAddress: decodeGlobalStateAddress(application.params.globalState, "current_miner"),
    currentMinerEffort: state.current_miner_effort?.uint,
    minedSupply: state.mined_supply?.uint,
    state,
    totalEffort: state.total_effort?.uint,
    totalTransactions: state.total_transactions?.uint
  };
}

export async function fetchOraIndexerGlobalStateRaw(): Promise<OraRawGlobalState> {
  const application = await indexerClient.lookupApplications(ORA_APP_ID).do();
  const state = decodeTealState(application.application?.params.globalState);

  return {
    current_miner_effort: state.current_miner_effort?.uint?.toString() ?? null,
    total_effort: state.total_effort?.uint?.toString() ?? null,
    total_transactions: state.total_transactions?.uint?.toString() ?? null
  };
}

export async function fetchOraWalletData(address: string): Promise<OraWalletData> {
  const account = await algodClient.accountInformation(address).do();
  const oraHolding = account.assets?.find((asset) => Number(asset.assetId) === ORA_ASA_ID);
  const appStateResponse = await algodClient
    .accountApplicationInformation(address, ORA_APP_ID)
    .do()
    .catch(() => null);
  const localState = decodeTealState(appStateResponse?.appLocalState?.keyValue);

  return {
    algoBalance: account.amount,
    hasMiningState: Boolean(appStateResponse?.appLocalState),
    hasOraOptIn: Boolean(oraHolding),
    localEffort: localState.effort?.uint,
    minBalance: account.minBalance,
    oraBalance: oraHolding?.amount ?? BigInt(0)
  };
}

export async function fetchOraPoolGlobalState(): Promise<OraPoolGlobalState> {
  const application = await algodClient.getApplicationByID(ORA_POOL_APP_ID).do();
  const state = decodeTealState(application.params.globalState);

  return {
    state,
    totalDeposited: state.totalDeposited?.uint,
    totalSpent: state.totalSpent?.uint,
    totalWithdrawn: state.totalWithdrawn?.uint
  };
}

export async function fetchOraPoolWalletData(address: string): Promise<OraPoolWalletData> {
  if (!algosdk.isValidAddress(address)) {
    throw new Error("Invalid connected Algorand wallet address.");
  }

  const senderPublicKey = algosdk.decodeAddress(address).publicKey;
  const [account, appStateResponse, boxResponse] = await Promise.all([
    algodClient.accountInformation(address).do(),
    algodClient
      .accountApplicationInformation(address, ORA_POOL_APP_ID)
      .do()
      .catch(() => null),
    algodClient
      .getApplicationBoxByName(ORA_POOL_APP_ID, senderPublicKey)
      .do()
      .catch(() => null)
  ]);
  const poolTokenHolding = account.assets?.find((asset) => Number(asset.assetId) === ORA_POOL_TOKEN_ID);
  const poolLocalState = decodeTealState(appStateResponse?.appLocalState?.keyValue);
  const boxValue = toBytes(boxResponse?.value);

  return {
    box: boxValue ? decodeOraPoolWalletBox(boxValue) : null,
    boxFound: Boolean(boxValue),
    boxNameBase64: bytesToBase64(senderPublicKey),
    boxNameHex: bytesToHex(senderPublicKey),
    hasPoolLocalState: Boolean(appStateResponse?.appLocalState),
    hasPoolTokenOptIn: Boolean(poolTokenHolding),
    poolLocalState,
    poolTokenBalance: poolTokenHolding?.amount ?? BigInt(0)
  };
}

export async function fetchOraPoolWalletTransactions(
  address: string,
  limit = 12
): Promise<OraPoolTransactionSummary[]> {
  if (!algosdk.isValidAddress(address)) {
    throw new Error("Invalid connected Algorand wallet address.");
  }

  const response = await indexerClient
    .searchForTransactions()
    .address(address)
    .applicationID(ORA_POOL_APP_ID)
    .limit(Math.min(Math.max(limit, 1), 25))
    .do();

  const poolTransactions = (response.transactions ?? []).filter((transaction) => {
    const appTransaction = getApplicationTransaction(transaction);
    return Number(getValue(appTransaction, "applicationId", "application-id")) === ORA_POOL_APP_ID;
  });

  return Promise.all(poolTransactions.map((transaction) => summarizeOraPoolTransaction(transaction, address)));
}

export function getOraPoolWithdrawalResearch(address: string | null | undefined): OraPoolWithdrawalResearch {
  const senderPublicKey = address && algosdk.isValidAddress(address)
    ? algosdk.decodeAddress(address).publicKey
    : null;

  return {
    accounts: [],
    appArgs: [ORA_POOL_WITHDRAW_SELECTOR, "AAAAAAAAJxA=", "AAAAAAAAJxA="],
    decodedUint64Args: ["10000", "10000"],
    expectedResult:
      "Observed successful calls return pool token ASA 1294765516 and, when available, an ALGO payment from the OrangeMiner app address. This is research only; withdrawal is not implemented.",
    fee: "3000 microAlgos observed",
    foreignApps: [],
    foreignAssets: [ORA_POOL_TOKEN_ID.toString()],
    requiredBoxes: [
      {
        app: "0",
        nameBase64: senderPublicKey ? bytesToBase64(senderPublicKey) : "--",
        nameHex: senderPublicKey ? bytesToHex(senderPublicKey) : "--",
        source: "connected wallet public key"
      }
    ],
    selector: ORA_POOL_WITHDRAW_SELECTOR
  };
}

export async function fetchRecentOraJuicingTransactions(limit = 5): Promise<OraRecentJuicingTransaction[]> {
  const response = await indexerClient
    .searchForTransactions()
    .txType("appl")
    .applicationID(ORA_APP_ID)
    .limit(limit)
    .do();

  return (response.transactions ?? []).map((transaction) => ({
    fee: formatAlgoEffort(transaction.fee),
    round: transaction.confirmedRound ? `#${transaction.confirmedRound.toString()}` : "--",
    sender: shortenAddress(transaction.sender),
    time: formatTransactionTime(transaction.roundTime),
    txId: transaction.id
  }));
}

export async function fetchOraLeaderboard(limit = 1000): Promise<OraLeaderboardData> {
  const response = await indexerClient
    .searchForTransactions()
    .txType("appl")
    .applicationID(ORA_APP_ID)
    .limit(Math.min(Math.max(limit, 1), 1000))
    .do();

  const totalsBySender = new Map<string, { address: string; totalFees: bigint; transactionCount: number }>();

  for (const transaction of response.transactions ?? []) {
    if (!transaction.sender) {
      continue;
    }

    const existing = totalsBySender.get(transaction.sender) ?? {
      address: transaction.sender,
      totalFees: BigInt(0),
      transactionCount: 0
    };

    existing.totalFees += BigInt(transaction.fee);
    existing.transactionCount += 1;
    totalsBySender.set(transaction.sender, existing);
  }

  const rankedEntries = Array.from(totalsBySender.values()).sort((first, second) => {
    if (first.totalFees === second.totalFees) {
      return second.transactionCount - first.transactionCount;
    }

    return first.totalFees > second.totalFees ? -1 : 1;
  });

  const topJuicers = rankedEntries.slice(0, 5).map((entry, index) => ({
    address: shortenAddress(entry.address),
    effort: formatAlgoEffort(entry.totalFees),
    rank: index + 1
  }));

  const leader = rankedEntries[0];

  return {
    currentLeader: leader
      ? {
          address: shortenAddress(leader.address),
          effort: formatAlgoEffort(leader.totalFees),
          streak: "Rank #1"
        }
      : null,
    topJuicers
  };
}

export async function fetchOraPoolMiningStatus(limit = 1000): Promise<OraPoolMiningStatus> {
  const status = await algodClient.status().do() as unknown as Record<string, unknown>;
  const lastRound = toNumber(status.lastRound ?? status["last-round"]);
  const minRound = Math.max(0, (lastRound ?? 0) - ORA_POOL_LOOKBACK_ROUNDS);
  const response = await indexerClient
    .searchForTransactions()
    .txType("appl")
    .applicationID(ORA_POOL_APP_ID)
    .minRound(minRound)
    .limit(Math.min(Math.max(limit, 1), 1000))
    .do();

  const mineTransactions = (response.transactions ?? []).filter((transaction) => {
    const firstArgument = transaction.applicationTransaction?.applicationArgs?.[0];
    return toBase64(firstArgument) === ORA_POOL_MINE_SELECTOR;
  });

  const timestamps = mineTransactions
    .map((transaction) => transaction.roundTime)
    .filter((roundTime): roundTime is number => typeof roundTime === "number" && roundTime > 0)
    .sort((first, second) => second - first);

  const lastMineTimestamp = timestamps[0];
  const frequencyPerMinute = calculateFrequencyPerMinute(timestamps);
  const isActive =
    lastMineTimestamp !== undefined &&
    Math.floor(Date.now() / 1000) - lastMineTimestamp <= ORA_POOL_ACTIVE_WINDOW_SECONDS;

  return {
    frequencyPerMinute,
    isActive,
    lastMineTime: formatTransactionTime(lastMineTimestamp),
    lastMineTimestamp,
    mineTransactionCount: mineTransactions.length
  };
}

export function decodeTealState(keyValues: unknown): DecodedTealState {
  if (!Array.isArray(keyValues)) {
    return {};
  }

  return keyValues.reduce<DecodedTealState>((decodedState, keyValue) => {
    const entry = keyValue as TealKeyValueLike;
    const key = decodeBytesToString(entry.key);

    if (!key || !entry.value) {
      return decodedState;
    }

    decodedState[key] = decodeTealValue(entry.value);
    return decodedState;
  }, {});
}

function decodeGlobalStateAddress(keyValues: unknown, targetKey: string) {
  if (!Array.isArray(keyValues)) {
    return undefined;
  }

  for (const keyValue of keyValues) {
    const entry = keyValue as TealKeyValueLike;
    const key = decodeBytesToString(entry.key);
    const bytes = toBytes(entry.value?.bytes);

    if (key !== targetKey || !bytes || bytes.length !== 32) {
      continue;
    }

    const address = algosdk.encodeAddress(bytes);
    return algosdk.isValidAddress(address) ? address : undefined;
  }

  return undefined;
}

function decodeTealValue(value: TealValueLike): DecodedTealValue {
  const type = toNumber(value.type) ?? 0;
  const uint = toBigInt(value.uint);
  const bytes = decodeBytesToString(value.bytes);

  return {
    bytes,
    type,
    uint: type === 2 ? uint : undefined
  };
}

function decodeBytesToString(value: unknown) {
  const bytes = toBytes(value);

  if (!bytes) {
    return undefined;
  }

  return textDecoder.decode(bytes).replace(/\0+$/, "");
}

function toBytes(value: unknown) {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return Uint8Array.from(value);
  }

  if (typeof value === "string" && value.length > 0) {
    try {
      const binary = globalThis.atob(value);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
      return new TextEncoder().encode(value);
    }
  }

  return null;
}

function toBigInt(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }

  return undefined;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  return undefined;
}

function formatTransactionTime(roundTime?: number) {
  if (!roundTime) {
    return "--";
  }

  const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000 - roundTime));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function formatAlgoEffort(microAlgos: bigint | number | string) {
  return `${formatUnits(microAlgos, 6, { maximumFractionDigits: 3 })} ALGO`;
}

function calculateFrequencyPerMinute(timestamps: number[]) {
  if (timestamps.length < 2) {
    return 0;
  }

  const newest = timestamps[0];
  const oldest = timestamps[timestamps.length - 1];
  const elapsedMinutes = Math.max((newest - oldest) / 60, 1 / 60);

  return timestamps.length / elapsedMinutes;
}

function decodeOraPoolWalletBox(value: Uint8Array): OraPoolWalletBox {
  return {
    rawBase64: bytesToBase64(value),
    rawHex: bytesToHex(value),
    uint64Fields: decodeUint64Fields(value),
    valueByteLength: value.length
  };
}

async function summarizeOraPoolTransaction(transaction: unknown, connectedAddress: string): Promise<OraPoolTransactionSummary> {
  const groupId = toBase64(getValue(transaction, "group"));
  const groupTransactions = groupId ? await fetchOraPoolGroupTransactions(groupId).catch(() => []) : [];
  const appTransaction = getApplicationTransaction(transaction);
  const appArgs = getAppArgs(appTransaction);
  const firstArgument = appArgs[0];
  const txId = String(getValue(transaction, "id") ?? "");
  const depositPayment = groupTransactions.find(
    (groupTransaction) =>
      groupTransaction.type === "pay" &&
      groupTransaction.sender === connectedAddress &&
      groupTransaction.receiver === ORA_POOL_APP_ADDRESS
  );
  const innerTransactions = getArray(getValue(transaction, "innerTxns", "inner-txns"))
    .map(summarizeRelatedTransaction)
    .filter((item): item is OraPoolRelatedTransaction => Boolean(item));

  return {
    appArgs,
    boxes: getBoxReferences(appTransaction),
    explorerUrl: `${ORA_POOL_EXPLORER_TX_BASE_URL}/${txId}`,
    fee: formatAlgoEffort(BigInt(String(getValue(transaction, "fee") ?? 0))),
    foreignApps: getBigIntArray(appTransaction, "foreignApps", "foreign-apps").map((appId) => appId.toString()),
    foreignAssets: getBigIntArray(appTransaction, "foreignAssets", "foreign-assets").map((assetId) => assetId.toString()),
    groupId: groupId ?? undefined,
    groupTransactions,
    innerTransactions,
    label: getPoolTransactionLabel(firstArgument, depositPayment, innerTransactions),
    round: getValue(transaction, "confirmedRound", "confirmed-round")
      ? `#${String(getValue(transaction, "confirmedRound", "confirmed-round"))}`
      : "--",
    sender: String(getValue(transaction, "sender") ?? "--"),
    time: formatTransactionTime(toNumber(getValue(transaction, "roundTime", "round-time"))),
    txId
  };
}

async function fetchOraPoolGroupTransactions(groupId: string): Promise<OraPoolRelatedTransaction[]> {
  const response = await indexerClient.searchForTransactions().groupid(groupId).limit(16).do();

  return (response.transactions ?? [])
    .sort((first, second) => (toNumber(getValue(first, "intraRoundOffset", "intra-round-offset")) ?? 0) -
      (toNumber(getValue(second, "intraRoundOffset", "intra-round-offset")) ?? 0))
    .map(summarizeRelatedTransaction)
    .filter((item): item is OraPoolRelatedTransaction => Boolean(item));
}

function summarizeRelatedTransaction(transaction: unknown): OraPoolRelatedTransaction | null {
  const txType = String(getValue(transaction, "txType", "tx-type") ?? "--");
  const payment = getRecord(getValue(transaction, "paymentTransaction", "payment-transaction"));
  const assetTransfer = getRecord(getValue(transaction, "assetTransferTransaction", "asset-transfer-transaction"));
  const appTransaction = getApplicationTransaction(transaction);

  if (txType === "pay" && payment) {
    return {
      amount: formatAlgoEffort(BigInt(String(getValue(payment, "amount") ?? 0))),
      receiver: formatAddressValue(getValue(payment, "receiver")),
      sender: formatAddressValue(getValue(transaction, "sender")),
      txId: toOptionalString(getValue(transaction, "id")),
      type: "pay"
    };
  }

  if (txType === "axfer" && assetTransfer) {
    return {
      amount: formatInteger(String(getValue(assetTransfer, "amount") ?? "0")),
      assetId: String(getValue(assetTransfer, "assetId", "asset-id") ?? "--"),
      receiver: formatAddressValue(getValue(assetTransfer, "receiver")),
      sender: formatAddressValue(getValue(transaction, "sender")),
      txId: toOptionalString(getValue(transaction, "id")),
      type: "axfer"
    };
  }

  if (txType === "appl" && appTransaction) {
    return {
      amount: getAppArgs(appTransaction).join(", ") || undefined,
      sender: formatAddressValue(getValue(transaction, "sender")),
      txId: toOptionalString(getValue(transaction, "id")),
      type: "appl"
    };
  }

  return {
    sender: formatAddressValue(getValue(transaction, "sender")),
    txId: toOptionalString(getValue(transaction, "id")),
    type: txType
  };
}

function getPoolTransactionLabel(
  firstArgument: string | undefined,
  depositPayment: OraPoolRelatedTransaction | undefined,
  innerTransactions: OraPoolRelatedTransaction[]
) {
  if (firstArgument === ORA_POOL_DEPOSIT_SELECTOR) {
    return depositPayment?.amount ? `Deposit ${depositPayment.amount}` : "Deposit";
  }

  if (firstArgument === ORA_POOL_WITHDRAW_SELECTOR) {
    const payment = innerTransactions.find((transaction) => transaction.type === "pay" && transaction.amount);
    return payment?.amount ? `Withdrawal / claim ${payment.amount}` : "Withdrawal / claim";
  }

  if (firstArgument === ORA_POOL_MINE_SELECTOR) {
    return "Pool mine call";
  }

  return "Pool app call";
}

function getApplicationTransaction(transaction: unknown) {
  return getRecord(getValue(transaction, "applicationTransaction", "application-transaction"));
}

function getAppArgs(appTransaction: Record<string, unknown> | null) {
  return getArray(getValue(appTransaction, "applicationArgs", "application-args"))
    .map(toBase64)
    .filter((value): value is string => Boolean(value));
}

function getBoxReferences(appTransaction: Record<string, unknown> | null) {
  return getArray(getValue(appTransaction, "boxReferences", "box-references")).map((box) => {
    const boxRecord = getRecord(box);
    const nameBytes = toBytes(getValue(boxRecord, "name"));

    return {
      app: String(getValue(boxRecord, "app", "appIndex", "app-index") ?? "--"),
      nameBase64: nameBytes ? bytesToBase64(nameBytes) : "--",
      nameHex: nameBytes ? bytesToHex(nameBytes) : "--"
    };
  });
}

function getBigIntArray(source: Record<string, unknown> | null, ...keys: string[]) {
  return getArray(getValue(source, ...keys))
    .map(toBigInt)
    .filter((value): value is bigint => value !== undefined);
}

function decodeUint64Fields(value: Uint8Array): OraPoolBoxUint64Field[] {
  const fieldCount = Math.floor(value.length / 8);

  return Array.from({ length: fieldCount }, (_, index) => {
    const offset = index * 8;
    const fieldBytes = value.slice(offset, offset + 8);

    return {
      hex: bytesToHex(fieldBytes),
      index,
      offset,
      uint: readBigUIntBE(fieldBytes, 0, 8)?.toString() ?? "--"
    };
  });
}

function readBigUIntBE(bytes: Uint8Array, start: number, length: number) {
  if (bytes.length < start + length) {
    return undefined;
  }

  let value = BigInt(0);

  for (let index = start; index < start + length; index += 1) {
    value = (value << BigInt(8)) + BigInt(bytes[index]);
  }

  return value;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getValue(source: unknown, ...keys: string[]) {
  const record = getRecord(source);

  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function formatAddressValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toString" in value) {
    return String(value);
  }

  return undefined;
}

function toOptionalString(value: unknown) {
  return value === undefined || value === null ? undefined : String(value);
}

function toBase64(value: unknown) {
  if (value instanceof Uint8Array) {
    return bytesToBase64(value);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return bytesToBase64(Uint8Array.from(value));
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binaryValue = "";

  bytes.forEach((byte) => {
    binaryValue += String.fromCharCode(byte);
  });

  return globalThis.btoa(binaryValue);
}
