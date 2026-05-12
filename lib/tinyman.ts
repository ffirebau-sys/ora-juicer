import algosdk, { type Transaction } from "algosdk";
import { algodClient } from "@/lib/algorand";
import { decodeTealState } from "@/lib/ora";

export const TINYMAN_V2_APP_ID = 1_002_541_853;
export const TINYMAN_ORA_ALGO_POOL_ADDRESS = "TRCEY5UZGTATGTF5K3U42IMDT467D4EHV7S5MYJBMLMYARYJOZFATORMUM";
export const TINYMAN_ORA_ALGO_POOL_TOKEN_ID = 1_294_765_516;
export const TINYMAN_ORA_ASA_ID = 1_284_444_444;
export const TINYMAN_ALGO_ASSET_ID = 0;
export const TINYMAN_UNWRAP_DEFAULT_SLIPPAGE_BPS = 100;
export const TINYMAN_UNWRAP_ESTIMATED_FEE_MICROALGO = 4_000;

const BASIS_POINTS = BigInt(10_000);
const TINYMAN_REMOVE_LIQUIDITY_SELECTOR = "remove_liquidity";
const TINYMAN_LP_TRANSFER_FEE_MICROALGO = 1_000;
const TINYMAN_REMOVE_LIQUIDITY_APP_FEE_MICROALGO = 3_000;

export type TinymanOraAlgoPoolState = {
  asset1Id: bigint;
  asset1Reserves: bigint;
  asset2Id: bigint;
  asset2Reserves: bigint;
  issuedPoolTokens: bigint;
  poolTokenAssetId: bigint;
};

export type TinymanOraAlgoUnwrapQuote = {
  estimatedFeeMicroAlgo: bigint;
  expectedAlgo: bigint;
  expectedOra: bigint;
  issuedPoolTokens: bigint;
  lpTokenAmount: bigint;
  minAlgoOut: bigint;
  minOraOut: bigint;
  poolReserves: {
    algo: bigint;
    ora: bigint;
  };
  slippageBps: number;
};

export type TinymanUnwrapPreflight = {
  algoBalance: bigint;
  hasEnoughAlgoForFee: boolean;
  hasOraOptIn: boolean;
  minBalance: bigint;
  requiredFeeMicroAlgo: bigint;
  spendableAlgo: bigint;
};

type BuildTinymanRemoveLiquidityTxnsParams = {
  lpTokenAmount: bigint;
  minAlgoOut: bigint;
  minOraOut: bigint;
  sender: string;
};

export async function fetchTinymanOraAlgoPoolState(): Promise<TinymanOraAlgoPoolState> {
  const response = await algodClient
    .accountApplicationInformation(TINYMAN_ORA_ALGO_POOL_ADDRESS, TINYMAN_V2_APP_ID)
    .do();
  const state = decodeTealState(response.appLocalState?.keyValue);

  const poolState = {
    asset1Id: requireStateUint(state.asset_1_id?.uint, "asset_1_id"),
    asset1Reserves: requireStateUint(state.asset_1_reserves?.uint, "asset_1_reserves"),
    asset2Id: requireStateUint(state.asset_2_id?.uint, "asset_2_id"),
    asset2Reserves: requireStateUint(state.asset_2_reserves?.uint, "asset_2_reserves"),
    issuedPoolTokens: requireStateUint(state.issued_pool_tokens?.uint, "issued_pool_tokens"),
    poolTokenAssetId: requireStateUint(state.pool_token_asset_id?.uint, "pool_token_asset_id")
  };

  validateOraAlgoPoolState(poolState);

  return poolState;
}

export async function fetchTinymanOraAlgoUnwrapQuote({
  lpTokenAmount,
  slippageBps = TINYMAN_UNWRAP_DEFAULT_SLIPPAGE_BPS
}: {
  lpTokenAmount: bigint;
  slippageBps?: number;
}): Promise<TinymanOraAlgoUnwrapQuote> {
  validateUnwrapQuoteInput({ lpTokenAmount, slippageBps });

  const poolState = await fetchTinymanOraAlgoPoolState();
  const expectedOra = (lpTokenAmount * poolState.asset1Reserves) / poolState.issuedPoolTokens;
  const expectedAlgo = (lpTokenAmount * poolState.asset2Reserves) / poolState.issuedPoolTokens;
  const slippageFactor = BASIS_POINTS - BigInt(slippageBps);

  return {
    estimatedFeeMicroAlgo: BigInt(TINYMAN_UNWRAP_ESTIMATED_FEE_MICROALGO),
    expectedAlgo,
    expectedOra,
    issuedPoolTokens: poolState.issuedPoolTokens,
    lpTokenAmount,
    minAlgoOut: (expectedAlgo * slippageFactor) / BASIS_POINTS,
    minOraOut: (expectedOra * slippageFactor) / BASIS_POINTS,
    poolReserves: {
      algo: poolState.asset2Reserves,
      ora: poolState.asset1Reserves
    },
    slippageBps
  };
}

export async function fetchTinymanUnwrapPreflight(sender: string): Promise<TinymanUnwrapPreflight> {
  validateSender(sender);

  const account = await algodClient.accountInformation(sender).do();
  const hasOraOptIn = Boolean(account.assets?.some((asset) => Number(asset.assetId) === TINYMAN_ORA_ASA_ID));
  const spendableAlgo = account.amount > account.minBalance
    ? account.amount - account.minBalance
    : BigInt(0);
  const requiredFeeMicroAlgo = BigInt(TINYMAN_UNWRAP_ESTIMATED_FEE_MICROALGO);

  return {
    algoBalance: account.amount,
    hasEnoughAlgoForFee: spendableAlgo >= requiredFeeMicroAlgo,
    hasOraOptIn,
    minBalance: account.minBalance,
    requiredFeeMicroAlgo,
    spendableAlgo
  };
}

export async function buildTinymanRemoveLiquidityTxns({
  lpTokenAmount,
  minAlgoOut,
  minOraOut,
  sender
}: BuildTinymanRemoveLiquidityTxnsParams): Promise<Transaction[]> {
  validateRemoveLiquidityInput({ lpTokenAmount, minAlgoOut, minOraOut, sender });

  const suggestedParams = await algodClient.getTransactionParams().do();
  const lpTransferParams = {
    ...suggestedParams,
    fee: BigInt(TINYMAN_LP_TRANSFER_FEE_MICROALGO),
    flatFee: true
  };
  const appCallParams = {
    ...suggestedParams,
    fee: BigInt(TINYMAN_REMOVE_LIQUIDITY_APP_FEE_MICROALGO),
    flatFee: true
  };

  const lpTransferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    amount: lpTokenAmount,
    assetIndex: TINYMAN_ORA_ALGO_POOL_TOKEN_ID,
    receiver: TINYMAN_ORA_ALGO_POOL_ADDRESS,
    sender,
    suggestedParams: lpTransferParams
  });

  const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
    accounts: [TINYMAN_ORA_ALGO_POOL_ADDRESS],
    appArgs: [
      new TextEncoder().encode(TINYMAN_REMOVE_LIQUIDITY_SELECTOR),
      algosdk.encodeUint64(minOraOut),
      algosdk.encodeUint64(minAlgoOut)
    ],
    appIndex: TINYMAN_V2_APP_ID,
    convertToAccess: false,
    foreignApps: [],
    foreignAssets: [TINYMAN_ORA_ASA_ID, TINYMAN_ALGO_ASSET_ID],
    sender,
    suggestedParams: appCallParams
  });
  lpTransferTxn.fee = BigInt(TINYMAN_LP_TRANSFER_FEE_MICROALGO);
  appCallTxn.fee = BigInt(TINYMAN_REMOVE_LIQUIDITY_APP_FEE_MICROALGO);

  const groupedTransactions = algosdk.assignGroupID([lpTransferTxn, appCallTxn]);

  validateTinymanRemoveLiquidityTxnStructure(groupedTransactions, {
    lpTokenAmount,
    minAlgoOut,
    minOraOut,
    sender
  });

  return groupedTransactions;
}

function requireStateUint(value: bigint | undefined, key: string) {
  if (value === undefined) {
    throw new Error(`Tinyman ORA-ALGO pool state is missing ${key}.`);
  }

  return value;
}

function validateOraAlgoPoolState(poolState: TinymanOraAlgoPoolState) {
  if (poolState.asset1Id !== BigInt(TINYMAN_ORA_ASA_ID)) {
    throw new Error("Tinyman ORA-ALGO pool asset_1_id does not match ORA ASA.");
  }

  if (poolState.asset2Id !== BigInt(TINYMAN_ALGO_ASSET_ID)) {
    throw new Error("Tinyman ORA-ALGO pool asset_2_id does not match ALGO.");
  }

  if (poolState.poolTokenAssetId !== BigInt(TINYMAN_ORA_ALGO_POOL_TOKEN_ID)) {
    throw new Error("Tinyman ORA-ALGO pool token asset id does not match TMPOOL2.");
  }

  if (poolState.issuedPoolTokens <= BigInt(0)) {
    throw new Error("Tinyman ORA-ALGO pool has no issued pool tokens.");
  }
}

function validateUnwrapQuoteInput({
  lpTokenAmount,
  slippageBps
}: {
  lpTokenAmount: bigint;
  slippageBps: number;
}) {
  if (lpTokenAmount <= BigInt(0)) {
    throw new Error("LP token amount must be greater than zero.");
  }

  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error("Slippage must be between 0% and 99.99%.");
  }
}

function validateRemoveLiquidityInput({
  lpTokenAmount,
  minAlgoOut,
  minOraOut,
  sender
}: BuildTinymanRemoveLiquidityTxnsParams) {
  validateSender(sender);

  if (lpTokenAmount <= BigInt(0)) {
    throw new Error("LP token amount must be greater than zero.");
  }

  if (minOraOut < BigInt(0) || minAlgoOut < BigInt(0)) {
    throw new Error("Minimum output amounts cannot be negative.");
  }
}

function validateSender(sender: string) {
  if (!algosdk.isValidAddress(sender)) {
    throw new Error("Invalid Algorand sender address.");
  }
}

function validateTinymanRemoveLiquidityTxnStructure(
  transactions: Transaction[],
  {
    lpTokenAmount,
    minAlgoOut,
    minOraOut,
    sender
  }: BuildTinymanRemoveLiquidityTxnsParams
) {
  const [lpTransferTxn, appCallTxn] = transactions;
  const lpTransfer = lpTransferTxn.assetTransfer;
  const appCall = appCallTxn.applicationCall;
  const encodedAppCall = appCallTxn.toEncodingData();
  const encodedAppArgs = getEncodedBytesArray(encodedAppCall, "apaa").map(bytesToBase64);
  const encodedForeignAssets = getEncodedBigIntArray(encodedAppCall, "apas").map(Number);
  const expectedArgs = [
    bytesToBase64(new TextEncoder().encode(TINYMAN_REMOVE_LIQUIDITY_SELECTOR)),
    bytesToBase64(algosdk.encodeUint64(minOraOut)),
    bytesToBase64(algosdk.encodeUint64(minAlgoOut))
  ];

  if (transactions.length !== 2) {
    throw new Error("Tinyman remove-liquidity group must contain exactly two transactions.");
  }

  if (lpTransferTxn.type !== "axfer" || !lpTransfer) {
    throw new Error("Tinyman remove-liquidity first transaction must be an LP token transfer.");
  }

  if (lpTransferTxn.sender.toString() !== sender) {
    throw new Error("Tinyman LP transfer sender must match connected wallet.");
  }

  if (lpTransfer.receiver.toString() !== TINYMAN_ORA_ALGO_POOL_ADDRESS) {
    throw new Error("Tinyman LP transfer receiver must be the ORA-ALGO pool address.");
  }

  if (lpTransfer.assetIndex !== BigInt(TINYMAN_ORA_ALGO_POOL_TOKEN_ID)) {
    throw new Error("Tinyman LP transfer must target the ORA-ALGO pool token.");
  }

  if (lpTransfer.amount !== lpTokenAmount) {
    throw new Error("Tinyman LP transfer amount must match the selected LP amount.");
  }

  if (lpTransferTxn.fee !== BigInt(TINYMAN_LP_TRANSFER_FEE_MICROALGO)) {
    throw new Error("Tinyman LP transfer fee must be 1000 microAlgos.");
  }

  if (appCallTxn.type !== "appl" || Number(appCall?.appIndex) !== TINYMAN_V2_APP_ID) {
    throw new Error("Tinyman remove-liquidity second transaction must call the Tinyman V2 app.");
  }

  if (appCallTxn.sender.toString() !== sender) {
    throw new Error("Tinyman remove-liquidity app call sender must match connected wallet.");
  }

  if (encodedAppArgs.length !== expectedArgs.length || encodedAppArgs.some((arg, index) => arg !== expectedArgs[index])) {
    throw new Error("Tinyman remove-liquidity app args do not match the quoted minimum outputs.");
  }

  if (
    encodedForeignAssets.length !== 2 ||
    encodedForeignAssets[0] !== TINYMAN_ORA_ASA_ID ||
    encodedForeignAssets[1] !== TINYMAN_ALGO_ASSET_ID
  ) {
    throw new Error("Tinyman remove-liquidity foreign assets must exactly match [ORA ASA, ALGO].");
  }

  if (
    appCall?.accounts.length !== 1 ||
    appCall.accounts[0].toString() !== TINYMAN_ORA_ALGO_POOL_ADDRESS
  ) {
    throw new Error("Tinyman remove-liquidity accounts must include only the ORA-ALGO pool address.");
  }

  if (appCallTxn.fee !== BigInt(TINYMAN_REMOVE_LIQUIDITY_APP_FEE_MICROALGO)) {
    throw new Error("Tinyman remove-liquidity app call fee must be 3000 microAlgos.");
  }
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

  return value
    .map((item) => {
      if (typeof item === "bigint") return item;
      if (typeof item === "number" && Number.isSafeInteger(item)) return BigInt(item);
      return undefined;
    })
    .filter((item): item is bigint => item !== undefined);
}

function bytesToBase64(bytes: Uint8Array) {
  let binaryValue = "";

  bytes.forEach((byte) => {
    binaryValue += String.fromCharCode(byte);
  });

  return globalThis.btoa(binaryValue);
}
