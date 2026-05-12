import algosdk, { type Transaction } from "algosdk";
import { algodClient, ORA_APP_ID } from "@/lib/algorand";

export const ORA_JUICE_MIN_FEE_MICROALGO = 2_000;
export const ORA_JUICE_MAX_FEE_MICROALGO = 20_000;
const ORA_JUICE_APP_ID = Number(process.env.NEXT_PUBLIC_ORA_APP_ID ?? "1284326447");
const ORA_JUICE_ASA_ID = Number(process.env.NEXT_PUBLIC_ORA_ASA_ID ?? "1284444444");

type BuildOraAppOptInTxnParams = {
  sender: string;
};

type BuildOraJuiceTxnParams = {
  feeMicroAlgo: number;
  sender: string;
};

type TealValueLike = {
  bytes?: unknown;
  type?: unknown;
  uint?: unknown;
};

type TealKeyValueLike = {
  key?: unknown;
  value?: TealValueLike;
};

type DecodedGlobalStateAddress = {
  address: string;
  key: string;
};

type OraMinerAccounts = {
  currentMinerAddress: string;
  decodedGlobalStateAddresses: DecodedGlobalStateAddress[];
  lastMinerAddress: string;
  skunkAddressCandidates: DecodedGlobalStateAddress[];
};

const textDecoder = new TextDecoder();

export async function checkOraAppOptedIn(sender: string): Promise<boolean> {
  validateAlgorandSender(sender);

  return algodClient
    .accountApplicationInformation(sender, ORA_APP_ID)
    .do()
    .then((response) => Boolean(response.appLocalState))
    .catch(() => false);
}

export async function buildOraAppOptInTxn({ sender }: BuildOraAppOptInTxnParams): Promise<Transaction> {
  validateAlgorandSender(sender);

  const suggestedParams = await algodClient.getTransactionParams().do();

  return algosdk.makeApplicationOptInTxnFromObject({
    appIndex: ORA_APP_ID,
    sender,
    suggestedParams
  });
}

export async function buildOraJuiceTxn({ sender, feeMicroAlgo }: BuildOraJuiceTxnParams): Promise<Transaction> {
  validateOraJuiceTxnInput({ feeMicroAlgo, sender });
  validateOraAppId();
  validateOraAsaId();

  const [suggestedParams, minerAccounts] = await Promise.all([
    algodClient.getTransactionParams().do(),
    fetchOraMinerAccounts()
  ]);
  suggestedParams.fee = BigInt(feeMicroAlgo);
  suggestedParams.flatFee = true;

  const accounts = getUniqueAccounts([sender, minerAccounts.currentMinerAddress, minerAccounts.lastMinerAddress]);

  const transaction = algosdk.makeApplicationNoOpTxnFromObject({
    accounts,
    appArgs: [algosdk.base64ToBytes("qyNwzA=="), algosdk.decodeAddress(sender).publicKey],
    appIndex: ORA_JUICE_APP_ID,
    convertToAccess: false,
    foreignAssets: [ORA_JUICE_ASA_ID],
    note: algosdk.base64ToBytes("Aw=="),
    sender,
    suggestedParams
  });
  transaction.fee = BigInt(feeMicroAlgo);

  validateOraJuiceTxnStructure(transaction, { feeMicroAlgo, flatFee: true, minerAccounts, sender });

  return transaction;
}

async function fetchOraMinerAccounts(): Promise<OraMinerAccounts> {
  const application = await algodClient.getApplicationByID(ORA_JUICE_APP_ID).do();
  const globalState = application.params.globalState;
  const decodedGlobalStateAddresses = getDecodedGlobalStateAddresses(globalState);
  const currentMinerAddress = getRequiredGlobalStateAddress(decodedGlobalStateAddresses, "current_miner");
  const lastMinerAddress = getRequiredGlobalStateAddress(decodedGlobalStateAddresses, "last_miner");

  return {
    currentMinerAddress,
    decodedGlobalStateAddresses,
    lastMinerAddress,
    skunkAddressCandidates: decodedGlobalStateAddresses.filter((entry) => entry.address.startsWith("SKUNK"))
  };
}

function getRequiredGlobalStateAddress(addresses: DecodedGlobalStateAddress[], targetKey: string) {
  const addressEntry = addresses.find((entry) => entry.key === targetKey);

  if (!addressEntry) {
    throw new Error(`ORA app global state is missing ${targetKey} byte address.`);
  }

  return addressEntry.address;
}

function getDecodedGlobalStateAddresses(globalState: unknown) {
  if (!Array.isArray(globalState)) {
    return [];
  }

  return globalState.reduce<DecodedGlobalStateAddress[]>((addresses, item) => {
    const entry = item as TealKeyValueLike;
    const key = decodeTealKey(entry.key);
    const bytes = toBytes(entry.value?.bytes);

    if (!key || !bytes || bytes.length !== 32) {
      return addresses;
    }

    const address = algosdk.encodeAddress(bytes);

    if (algosdk.isValidAddress(address)) {
      addresses.push({ address, key });
    }

    return addresses;
  }, []);
}

function validateOraJuiceTxnInput({ sender, feeMicroAlgo }: BuildOraJuiceTxnParams) {
  validateAlgorandSender(sender);

  if (!Number.isInteger(feeMicroAlgo)) {
    throw new Error("feeMicroAlgo must be an integer microAlgo amount.");
  }

  if (feeMicroAlgo < ORA_JUICE_MIN_FEE_MICROALGO) {
    throw new Error("Fee too small for ORA contract (inner transactions require more fee)");
  }

  if (feeMicroAlgo > ORA_JUICE_MAX_FEE_MICROALGO) {
    throw new Error(`feeMicroAlgo must not exceed ${ORA_JUICE_MAX_FEE_MICROALGO}.`);
  }
}

function validateAlgorandSender(sender: string) {
  if (!algosdk.isValidAddress(sender)) {
    throw new Error("Invalid Algorand sender address.");
  }
}

function validateOraAsaId() {
  if (!Number.isSafeInteger(ORA_JUICE_ASA_ID) || ORA_JUICE_ASA_ID <= 0) {
    throw new Error("NEXT_PUBLIC_ORA_ASA_ID must be set to a valid positive integer.");
  }
}

function validateOraAppId() {
  if (!Number.isSafeInteger(ORA_JUICE_APP_ID) || ORA_JUICE_APP_ID <= 0) {
    throw new Error("NEXT_PUBLIC_ORA_APP_ID must be set to a valid positive integer.");
  }
}

function validateOraJuiceTxnStructure(
  transaction: Transaction,
  {
    feeMicroAlgo,
    flatFee,
    minerAccounts,
    sender
  }: { feeMicroAlgo: number; flatFee: boolean; minerAccounts: OraMinerAccounts; sender: string }
) {
  const accounts = transaction.applicationCall?.accounts.map(addressToString) ?? [];
  const foreignAssets = transaction.applicationCall?.foreignAssets.map((assetId) => Number(assetId)) ?? [];
  const encodedTransaction = transaction.toEncodingData();
  const encodedAccounts = getEncodedAccounts(encodedTransaction);
  const encodedForeignAssets = getEncodedForeignAssets(encodedTransaction);
  const requiredAccounts = getUniqueAccounts([
    sender,
    minerAccounts.currentMinerAddress,
    minerAccounts.lastMinerAddress
  ]);

  if (transaction.type !== "appl") {
    throw new Error("ORA juice transaction must be an application call.");
  }

  if (Number(transaction.applicationCall?.appIndex) !== ORA_JUICE_APP_ID) {
    throw new Error("ORA juice transaction has the wrong app ID.");
  }

  if (!flatFee) {
    throw new Error("ORA juice transaction must use flatFee = true.");
  }

  if (transaction.fee !== BigInt(feeMicroAlgo)) {
    throw new Error("ORA juice transaction fee does not match selected feeMicroAlgo.");
  }

  if (!foreignAssets.includes(ORA_JUICE_ASA_ID)) {
    throw new Error("ORA juice transaction is missing ORA ASA in foreign assets.");
  }

  for (const account of requiredAccounts) {
    if (!accounts.includes(account)) {
      throw new Error(`ORA juice transaction is missing required account ${account} in application accounts.`);
    }

    if (!encodedAccounts.includes(account)) {
      throw new Error(`ORA juice transaction encoded object is missing required account ${account} in apat resources.`);
    }
  }

  if (!encodedForeignAssets.includes(ORA_JUICE_ASA_ID)) {
    throw new Error("ORA juice transaction encoded object is missing apas ORA ASA resource.");
  }
}

function getUniqueAccounts(accounts: string[]) {
  return accounts.filter((account, index) => accounts.indexOf(account) === index);
}

function getEncodedAccounts(encodedTransaction: Map<string, unknown>) {
  const encodedAccounts = encodedTransaction.get("apat");

  if (!Array.isArray(encodedAccounts)) {
    return [];
  }

  return encodedAccounts.map(addressToString);
}

function getEncodedForeignAssets(encodedTransaction: Map<string, unknown>) {
  const encodedAssets = encodedTransaction.get("apas");

  if (!Array.isArray(encodedAssets)) {
    return [];
  }

  return encodedAssets.map((assetId) => Number(assetId));
}

function decodeTealKey(value: unknown) {
  const bytes = toBytes(value);

  if (!bytes) {
    return null;
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

function addressToString(address: unknown) {
  if (typeof address === "string") {
    return address;
  }

  if (address && typeof address === "object" && "toString" in address) {
    return String(address);
  }

  return "--";
}
