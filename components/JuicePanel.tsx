"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import algosdk from "algosdk";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Flame, Loader2, RefreshCw, XCircle, Zap } from "lucide-react";
import { Card } from "@/components/Card";
import { algodClient, indexerClient, ORA_ASA_ID } from "@/lib/algorand";
import { formatInteger, formatMicroAlgos, formatUnits, shortenAddress } from "@/lib/format";
import {
  OraPoolMiningStatus,
  OraPoolTransactionSummary,
  OraPoolWalletData,
  OraPoolWithdrawalResearch,
  OraPoolRelatedTransaction
} from "@/lib/ora";
import {
  buildTinymanRemoveLiquidityTxns,
  fetchTinymanOraAlgoUnwrapQuote,
  fetchTinymanUnwrapPreflight,
  TINYMAN_ORA_ASA_ID,
  TINYMAN_UNWRAP_ESTIMATED_FEE_MICROALGO,
  type TinymanOraAlgoUnwrapQuote
} from "@/lib/tinyman";
import {
  ORA_JUICE_MAX_FEE_MICROALGO,
  ORA_JUICE_MIN_FEE_MICROALGO,
  buildOraAppOptInTxn,
  buildOraJuiceTxn,
  checkOraAppOptedIn
} from "@/lib/oraTransactions";
import {
  ORA_POOL_DEFAULT_DEPOSIT_MICROALGO,
  ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO,
  ORA_POOL_DEPOSIT_MAX_MICROALGO,
  ORA_POOL_DEPOSIT_WARNING_MICROALGO,
  ORA_POOL_TOKEN_ID,
  ORA_POOL_TOKEN_OPT_IN_MIN_BALANCE_MICROALGO,
  ORA_POOL_TOKEN_OPT_IN_TXN_FEE_MICROALGO,
  ORA_POOL_WITHDRAW_TXN_FEE_MICROALGO,
  buildOraPoolDepositTxns,
  buildOraPoolTokenOptInTxn,
  buildOraPoolWithdrawTxn,
  checkOraPoolTokenOptedIn
} from "@/lib/oraPoolTransactions";
import { cn } from "@/lib/utils";

type JuiceEstimate = {
  feeOptions: string[];
  defaultFee: string;
  effort: string;
  time: string;
  multiplier: string;
};

type JuicePanelProps = {
  connectedAddress?: string | null;
  currentMinerEffort?: bigint;
  estimate: JuiceEstimate;
  isOraAppOptedIn?: boolean;
  onClaimSuccess?: (oraReceived: bigint) => void;
  onJuicerLoaded?: () => void;
  onJuiceConfirmed?: () => Promise<void> | void;
  onPoolDataRefresh?: () => Promise<void> | void;
  poolDataLastCheckedAt?: Date | null;
  poolMiningStatus?: {
    error: string | null;
    isLoading: boolean;
    status: OraPoolMiningStatus | null;
  };
  poolWalletData?: {
    data: OraPoolWalletData | null;
    error: string | null;
    isLoading: boolean;
  };
  poolTransactionHistory?: {
    error: string | null;
    isLoading: boolean;
    transactions: OraPoolTransactionSummary[];
  };
  tinymanUnwrapPreview?: {
    data: TinymanOraAlgoUnwrapQuote | null;
    error: string | null;
    isLoading: boolean;
  };
  poolWithdrawalResearch?: OraPoolWithdrawalResearch;
  onActivityChange?: (isActive: boolean) => void;
};

type JuiceMode = "manual" | "pool" | "claim";

type TransactionStatus =
  | "idle"
  | "optInRequired"
  | "optInConfirmed"
  | "preview"
  | "preparing"
  | "signing"
  | "pending"
  | "confirmed"
  | "error";

type PoolWithdrawStatus = "idle" | "preparing" | "signing" | "pending" | "confirmed" | "error";
type TinymanUnwrapStatus = "idle" | "preparing" | "signing" | "pending" | "confirmed" | "error";
type AutoConvertStatus =
  | "idle"
  | "checking"
  | "claimSigning"
  | "claimPending"
  | "detectingLp"
  | "unwrapSigning"
  | "unwrapPending"
  | "confirmed"
  | "error";

type AutoConvertResult = {
  algoReceived: bigint;
  claimTxId: string;
  isTransferVerified: boolean;
  lpReceived: bigint;
  lpUnwrapped: bigint;
  oraReceived: bigint;
  unwrapTxId: string | null;
};

type ReceivedAmounts = {
  algo: bigint;
  lp: bigint;
  lpSent: bigint;
  ora: bigint;
};

type ConfirmedTransferAmounts = {
  amounts: ReceivedAmounts;
  isVerifiedFromIndexer: boolean;
};

type ConfirmedTransactionGroupResult = {
  indexerTransactions: unknown[];
  txId: string;
  txIds: string[];
};

type JuiceParticle = {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
};

const MICROALGOS_PER_ALGO = BigInt(1_000_000);
const MIN_FEE_MICROALGO = BigInt(ORA_JUICE_MIN_FEE_MICROALGO);
const HIGH_FEE_WARNING_MICROALGO = MICROALGOS_PER_ALGO;
const HARD_MAX_FEE_MICROALGO = BigInt(ORA_JUICE_MAX_FEE_MICROALGO);
const HARD_MAX_FEE_LABEL = "0.02 ALGO";
const BEAT_MINER_INCREMENT_MICROALGO = BigInt(1_000);
const ORA_ASA_OPT_IN_MIN_BALANCE_MICROALGO = BigInt(100_000);
const ORA_ASA_OPT_IN_TXN_FEE_MICROALGO = BigInt(1_000);
const POOL_DEPOSIT_WARNING_MICROALGO = BigInt(ORA_POOL_DEPOSIT_WARNING_MICROALGO);
const POOL_DEPOSIT_MAX_MICROALGO = BigInt(ORA_POOL_DEPOSIT_MAX_MICROALGO);
const ORA_RECEIVED_DECIMALS = 8;

const activeJuicingStatuses: TransactionStatus[] = ["preparing", "signing", "pending"];
const activePoolWithdrawStatuses: PoolWithdrawStatus[] = ["preparing", "signing", "pending"];
const activeTinymanUnwrapStatuses: TinymanUnwrapStatus[] = ["preparing", "signing", "pending"];
const activeAutoConvertStatuses: AutoConvertStatus[] = [
  "checking",
  "claimSigning",
  "claimPending",
  "detectingLp",
  "unwrapSigning",
  "unwrapPending"
];

const statusCopy: Record<TransactionStatus, { label: string; detail: string }> = {
  idle: {
    label: "Ready to juice",
    detail: "Choose a fee and start a signed transaction."
  },
  optInRequired: {
    label: "Opt-in required",
    detail: "You need to opt in to the ORA mining app before juicing."
  },
  optInConfirmed: {
    label: "Opt-in complete",
    detail: "Opt-in complete. You can now juice ORA."
  },
  preview: {
    label: "Preview ready",
    detail: "Review the fee and effort impact before wallet signing."
  },
  preparing: {
    label: "Preparing transaction",
    detail: "Building the ORA juicing transaction for your selected fee."
  },
  signing: {
    label: "Wallet signature requested",
    detail: "Approve the transaction in your wallet to keep juicing."
  },
  pending: {
    label: "Waiting for confirmation",
    detail: "Transaction submitted. Keeping the network effort animation alive."
  },
  confirmed: {
    label: "Juice confirmed",
    detail:
      "Juice confirmed. Your mining effort was added. ORA rewards are paid according to the ORA contract rules and may arrive after a later juicing period if your effort wins."
  },
  error: {
    label: "Transaction stopped",
    detail: "The wallet request was rejected or the transaction failed."
  }
};

const poolWithdrawCopy: Record<PoolWithdrawStatus, { label: string; detail: string }> = {
  idle: {
    label: "Rewards ready",
    detail: "Review the OrangeMiner LP reward claim preview before signing."
  },
  preparing: {
    label: "Preparing claim",
    detail: "Building the OrangeMiner LP reward claim transaction."
  },
  signing: {
    label: "Wallet signature requested",
    detail: "Approve the LP reward claim transaction in Pera Wallet."
  },
  pending: {
    label: "Waiting for confirmation",
    detail: "Transaction submitted. Waiting for Algorand confirmation."
  },
  confirmed: {
    label: "Claim confirmed",
    detail: "OrangeMiner LP reward claim confirmed."
  },
  error: {
    label: "Claim stopped",
    detail: "The wallet request was rejected or the transaction failed."
  }
};

const tinymanUnwrapCopy: Record<TinymanUnwrapStatus, { label: string; detail: string }> = {
  idle: {
    label: "Ready to unwrap",
    detail: "Review the Tinyman ORA + ALGO output preview before signing."
  },
  preparing: {
    label: "Preparing unwrap",
    detail: "Building the Tinyman remove-liquidity transaction group."
  },
  signing: {
    label: "Wallet signature requested",
    detail: "Approve both Tinyman remove-liquidity transactions in Pera Wallet."
  },
  pending: {
    label: "Waiting for confirmation",
    detail: "Tinyman unwrap submitted. Waiting for Algorand confirmation."
  },
  confirmed: {
    label: "Unwrap confirmed",
    detail: "LP tokens were unwrapped through Tinyman."
  },
  error: {
    label: "Unwrap stopped",
    detail: "The wallet request was rejected or the Tinyman transaction failed."
  }
};

const autoConvertCopy: Record<AutoConvertStatus, { label: string; detail: string }> = {
  idle: {
    label: "Ready to auto-convert",
    detail: "Claim OrangeMiner rewards, then convert them to ORA + ALGO with a second approval when needed."
  },
  checking: {
    label: "Checking wallet",
    detail: "Checking opt-ins and spendable ALGO before starting."
  },
  claimSigning: {
    label: "Claim signature requested",
    detail: "Approve the OrangeMiner claim in Pera Wallet."
  },
  claimPending: {
    label: "Claim confirming",
    detail: "Waiting for the OrangeMiner claim to confirm."
  },
  detectingLp: {
    label: "Checking rewards",
    detail: "Claim confirmed. Checking returned rewards and preparing conversion when needed."
  },
  unwrapSigning: {
    label: "Conversion signature requested",
    detail: "Approve the reward conversion transaction group in Pera Wallet."
  },
  unwrapPending: {
    label: "Conversion confirming",
    detail: "Waiting for reward conversion confirmation."
  },
  confirmed: {
    label: "Auto-convert complete",
    detail: "Claim complete. Rewards were converted when needed."
  },
  error: {
    label: "Claim flow stopped",
    detail: "The guided claim or conversion failed before completion."
  }
};

const statusStyles: Record<TransactionStatus, string> = {
  idle: "border-white/10 bg-white/[0.035] text-slate-300",
  optInRequired: "border-ora-300/25 bg-ora-400/[0.075] text-ora-100",
  optInConfirmed: "border-emerald-300/30 bg-emerald-400/[0.1] text-emerald-100",
  preview: "border-ora-300/25 bg-ora-400/[0.075] text-ora-100",
  preparing: "border-ora-300/30 bg-ora-400/[0.08] text-ora-200",
  signing: "border-cyan-300/30 bg-cyan-400/[0.08] text-cyan-100",
  pending: "border-ora-300/30 bg-ora-400/[0.1] text-ora-100",
  confirmed: "border-emerald-300/30 bg-emerald-400/[0.1] text-emerald-100",
  error: "border-red-300/30 bg-red-400/[0.1] text-red-100"
};

async function getPeraWallet() {
  const { peraWallet } = await import("@/lib/peraWallet");
  return peraWallet;
}

export function JuicePanel({
  connectedAddress,
  currentMinerEffort,
  estimate,
  isOraAppOptedIn,
  onClaimSuccess,
  onJuicerLoaded,
  onJuiceConfirmed,
  onActivityChange,
  poolTransactionHistory,
  tinymanUnwrapPreview,
  poolWithdrawalResearch,
  poolWalletData
}: JuicePanelProps) {
  const [fee, setFee] = useState(estimate.defaultFee);
  const [poolDepositAmount, setPoolDepositAmount] = useState(() =>
    formatMicroAlgosForInput(BigInt(ORA_POOL_DEFAULT_DEPOSIT_MICROALGO))
  );
  const [isPoolDepositConfirmed, setIsPoolDepositConfirmed] = useState(false);
  const [hasCompletedOptIn, setHasCompletedOptIn] = useState(false);
  const [isHighFeeConfirmed, setIsHighFeeConfirmed] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>("idle");
  const [transactionMessage, setTransactionMessage] = useState<string | null>(null);
  const [confirmedTxId, setConfirmedTxId] = useState<string | null>(null);
  const [poolWithdrawStatus, setPoolWithdrawStatus] = useState<PoolWithdrawStatus>("idle");
  const [poolWithdrawMessage, setPoolWithdrawMessage] = useState<string | null>(null);
  const [poolWithdrawTxId, setPoolWithdrawTxId] = useState<string | null>(null);
  const [tinymanUnwrapStatus, setTinymanUnwrapStatus] = useState<TinymanUnwrapStatus>("idle");
  const [tinymanUnwrapMessage, setTinymanUnwrapMessage] = useState<string | null>(null);
  const [tinymanUnwrapTxId, setTinymanUnwrapTxId] = useState<string | null>(null);
  const [hasLoadedJuicer, setHasLoadedJuicer] = useState(false);
  const [autoConvertStatus, setAutoConvertStatus] = useState<AutoConvertStatus>("idle");
  const [autoConvertMessage, setAutoConvertMessage] = useState<string | null>(null);
  const [autoConvertResult, setAutoConvertResult] = useState<AutoConvertResult | null>(null);
  const [juiceKey, setJuiceKey] = useState(0);
  const [particles, setParticles] = useState<JuiceParticle[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const numericFee = Number(fee) || Number(estimate.defaultFee);
  const feeMicroAlgo = useMemo(() => parseAlgoToMicroAlgos(fee), [fee]);
  const poolDepositMicroAlgo = useMemo(() => parseAlgoToMicroAlgos(poolDepositAmount), [poolDepositAmount]);
  const beatCurrentMinerPlan = useMemo(() => getBeatCurrentMinerPlan(currentMinerEffort), [currentMinerEffort]);
  const requiresHighFeeConfirmation =
    feeMicroAlgo !== null &&
    feeMicroAlgo > HIGH_FEE_WARNING_MICROALGO &&
    feeMicroAlgo <= HARD_MAX_FEE_MICROALGO;
  const isFeeBelowMinimum = feeMicroAlgo !== null && feeMicroAlgo < MIN_FEE_MICROALGO;
  const isHardBlockedFee = feeMicroAlgo !== null && feeMicroAlgo > HARD_MAX_FEE_MICROALGO;
  const isFeeInvalid = feeMicroAlgo === null || isFeeBelowMinimum;
  const needsOraAppOptIn = Boolean(connectedAddress) && !hasCompletedOptIn && isOraAppOptedIn === false;
  const isTransactionBusy =
    transactionStatus === "preparing" || transactionStatus === "signing" || transactionStatus === "pending";
  const isPoolWithdrawBusy = activePoolWithdrawStatuses.includes(poolWithdrawStatus);
  const isTinymanUnwrapBusy = activeTinymanUnwrapStatuses.includes(tinymanUnwrapStatus);
  const isAutoConvertBusy = activeAutoConvertStatuses.includes(autoConvertStatus);
  const isJuicing = activeJuicingStatuses.includes(transactionStatus);
  const isBusy = isTransactionBusy || isPoolWithdrawBusy || isTinymanUnwrapBusy || isAutoConvertBusy;
  const isPoolDepositInvalid =
    poolDepositMicroAlgo === null ||
    poolDepositMicroAlgo <= BigInt(0) ||
    poolDepositMicroAlgo > POOL_DEPOSIT_MAX_MICROALGO;
  const needsPoolDepositConfirmation =
    poolDepositMicroAlgo !== null &&
    poolDepositMicroAlgo > POOL_DEPOSIT_WARNING_MICROALGO &&
    poolDepositMicroAlgo <= POOL_DEPOSIT_MAX_MICROALGO &&
    !isPoolDepositConfirmed;

  const projectedEffort = useMemo(() => {
    const effort = Math.max(1, numericFee * 820);
    return `${effort.toFixed(1)}m`;
  }, [numericFee]);

  useEffect(() => {
    onActivityChange?.(isBusy);
  }, [isBusy, onActivityChange]);

  const clearTrackedTimers = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = [];
  }, []);

  const scheduleStatus = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      callback();
      timers.current = timers.current.filter((trackedTimer) => trackedTimer !== timer);
    }, delay);

    timers.current.push(timer);
  }, []);

  const startAutoPoolMiningFlow = useCallback(async () => {
    if (isBusy) {
      return;
    }

    clearTrackedTimers();
    setConfirmedTxId(null);
    setTransactionMessage(null);
    setParticles([]);

    if (!connectedAddress) {
      setTransactionMessage("Connect your wallet first.");
      setTransactionStatus("error");
      return;
    }

    if (poolDepositMicroAlgo === null || poolDepositMicroAlgo <= BigInt(0)) {
      setTransactionMessage("Enter a valid pool deposit amount greater than 0 ALGO.");
      setTransactionStatus("error");
      return;
    }

    if (poolDepositMicroAlgo > POOL_DEPOSIT_MAX_MICROALGO) {
      setTransactionMessage("Deposits above 100 ALGO are blocked for now.");
      setTransactionStatus("error");
      return;
    }

    if (poolDepositMicroAlgo > POOL_DEPOSIT_WARNING_MICROALGO && !isPoolDepositConfirmed) {
      setTransactionMessage("Review and confirm the high deposit warning before starting Auto Pool Mining.");
      setTransactionStatus("preview");
      return;
    }

    try {
      setJuiceKey((current) => current + 1);
      setTransactionStatus("preparing");
      setTransactionMessage("Checking wallet setup and ALGO balance.");

      const wallet = await getPeraWallet();
      const preflight = await fetchPoolDepositPreflight({
        depositMicroAlgo: poolDepositMicroAlgo,
        sender: connectedAddress
      });

      if (!preflight.hasEnoughAlgo) {
        throw new Error("Add more ALGO to cover deposit, opt-in minimum balance, and fees.");
      }

      if (!preflight.hasPoolTokenOptIn) {
        setTransactionMessage("One-time setup: opting into ORA pool token");

        const unsignedOptInTxn = await buildOraPoolTokenOptInTxn({
          sender: connectedAddress
        });
        const optInTxnsToSign = [
          [{ txn: unsignedOptInTxn, signers: [connectedAddress] }]
        ];
        let signedOptInTxns: Uint8Array[];

        setTransactionStatus("signing");

        try {
          signedOptInTxns = await wallet.signTransaction(optInTxnsToSign);
        } catch {
          throw new Error("Pool token opt-in is required before juicing.");
        }

        if (!signedOptInTxns.length) {
          throw new Error("Pool token opt-in is required before juicing.");
        }

        setTransactionStatus("pending");
        setTransactionMessage("Pool token opt-in submitted. Waiting for confirmation.");

        let optInSubmitResponse: { txId?: string; txid?: string };

        try {
          optInSubmitResponse = await algodClient.sendRawTransaction(signedOptInTxns).do() as { txId?: string; txid?: string };
        } catch (submitError) {
          throw new Error(getAlgodSubmitErrorMessage(submitError));
        }

        const optInTransactionId = optInSubmitResponse.txId ?? optInSubmitResponse.txid ?? unsignedOptInTxn.txID();
        await algosdk.waitForConfirmation(algodClient, optInTransactionId, 6);
        await onJuiceConfirmed?.();
      }

      setTransactionStatus("preparing");
      setTransactionMessage("Preparing official ORA OrangeMiner pool deposit.");

      const unsignedTxns = await buildOraPoolDepositTxns({
        amountMicroAlgo: Number(poolDepositMicroAlgo),
        sender: connectedAddress
      });
      setTransactionStatus("signing");
      setTransactionMessage("Approve the grouped ORA pool deposit in Pera Wallet.");

      const txnsToSign = [
        unsignedTxns.map((txn) => ({ txn, signers: [connectedAddress] }))
      ];
      let signedTxns: Uint8Array[];

      try {
        signedTxns = await wallet.signTransaction(txnsToSign);
      } catch (signError) {
        throw new Error(getPeraSigningErrorMessage(signError));
      }

      if (signedTxns.length !== unsignedTxns.length) {
        throw new Error("Wallet did not return the full signed pool deposit group.");
      }

      setTransactionStatus("pending");
      setTransactionMessage("Pool deposit submitted. Waiting for Algorand confirmation.");

      let submitResponse: { txId?: string; txid?: string };

      try {
        submitResponse = await algodClient.sendRawTransaction(signedTxns).do() as { txId?: string; txid?: string };
      } catch (submitError) {
        throw new Error(getAlgodSubmitErrorMessage(submitError));
      }

      const transactionId = submitResponse.txId ?? submitResponse.txid ?? unsignedTxns[0].txID();
      await algosdk.waitForConfirmation(algodClient, transactionId, 6);

      setConfirmedTxId(transactionId);
      setHasLoadedJuicer(true);
      setTransactionMessage("Juicer loaded");
      setTransactionStatus("confirmed");
      setParticles([]);

      onJuicerLoaded?.();
      await onJuiceConfirmed?.();

      scheduleStatus(() => {
        setTransactionStatus("idle");
      }, 7000);
    } catch (error) {
      setParticles([]);
      setTransactionMessage(getPoolDepositErrorMessage(error));
      setTransactionStatus("error");
    }
  }, [
    clearTrackedTimers,
    connectedAddress,
    isBusy,
    isPoolDepositConfirmed,
    onJuicerLoaded,
    onJuiceConfirmed,
    poolDepositMicroAlgo,
    scheduleStatus
  ]);

  const startPoolWithdrawFlow = useCallback(async () => {
    if (isBusy) {
      return;
    }

    clearTrackedTimers();
    setPoolWithdrawTxId(null);
    setPoolWithdrawMessage(null);

    if (!connectedAddress) {
      setPoolWithdrawMessage("Connect your wallet first.");
      setPoolWithdrawStatus("error");
      return;
    }

    try {
      setPoolWithdrawStatus("preparing");
      setPoolWithdrawMessage("Checking OrangeMiner pool token opt-in.");

      const hasPoolTokenOptIn = await checkOraPoolTokenOptedIn(connectedAddress);
      if (!hasPoolTokenOptIn) {
        setPoolWithdrawMessage("Opt in to OrangeMiner pool token first.");

        const unsignedOptInTxn = await buildOraPoolTokenOptInTxn({
          sender: connectedAddress
        });    setPoolWithdrawStatus("signing");
        setPoolWithdrawMessage("Opt in to OrangeMiner pool token first. Approve the asset opt-in in Pera Wallet.");

        const wallet = await getPeraWallet();
        const optInTxnsToSign = [
          [{ txn: unsignedOptInTxn, signers: [connectedAddress] }]
        ];
        let signedOptInTxns: Uint8Array[];

        try {
          signedOptInTxns = await wallet.signTransaction(optInTxnsToSign);
        } catch (signError) {          throw new Error(getPeraSigningErrorMessage(signError));
        }

        if (!signedOptInTxns.length) {
          throw new Error("Wallet did not return a signed pool token opt-in transaction.");
        }        setPoolWithdrawStatus("pending");
        setPoolWithdrawMessage("Pool token opt-in submitted. Waiting for Algorand confirmation.");

        let optInSubmitResponse: { txId?: string; txid?: string };

        try {
          optInSubmitResponse = await algodClient.sendRawTransaction(signedOptInTxns).do() as { txId?: string; txid?: string };
        } catch (submitError) {          throw new Error(getAlgodSubmitErrorMessage(submitError));
        }

        const optInTransactionId = optInSubmitResponse.txId ?? optInSubmitResponse.txid ?? unsignedOptInTxn.txID();        await algosdk.waitForConfirmation(algodClient, optInTransactionId, 6);

        setPoolWithdrawTxId(optInTransactionId);
        setPoolWithdrawStatus("confirmed");
        setPoolWithdrawMessage("OrangeMiner pool token opt-in complete. You can now claim rewards.");

        await onJuiceConfirmed?.();
        return;
      }

      setPoolWithdrawMessage("Preparing OrangeMiner LP reward claim transaction.");

      const unsignedTxn = await buildOraPoolWithdrawTxn({
        sender: connectedAddress
      });

      setPoolWithdrawStatus("signing");
      setPoolWithdrawMessage("Approve the OrangeMiner LP reward claim transaction in Pera Wallet.");

      const wallet = await getPeraWallet();
      const txnsToSign = [
        [{ txn: unsignedTxn, signers: [connectedAddress] }]
      ];
      let signedTxns: Uint8Array[];

      try {
        signedTxns = await wallet.signTransaction(txnsToSign);
      } catch (signError) {        throw new Error(getPeraSigningErrorMessage(signError));
      }

      if (!signedTxns.length) {
        throw new Error("Wallet did not return a signed LP reward claim transaction.");
      }      setPoolWithdrawStatus("pending");
      setPoolWithdrawMessage("Withdraw/claim submitted. Waiting for Algorand confirmation.");

      let submitResponse: { txId?: string; txid?: string };

      try {
        submitResponse = await algodClient.sendRawTransaction(signedTxns).do() as { txId?: string; txid?: string };
      } catch (submitError) {        throw new Error(getAlgodSubmitErrorMessage(submitError));
      }

      const transactionId = submitResponse.txId ?? submitResponse.txid ?? unsignedTxn.txID();      await algosdk.waitForConfirmation(algodClient, transactionId, 6);

      setPoolWithdrawTxId(transactionId);
      setPoolWithdrawStatus("confirmed");
      setPoolWithdrawMessage("OrangeMiner LP reward claim confirmed. Pool position and wallet data refreshed.");

      await onJuiceConfirmed?.();
    } catch (error) {      setPoolWithdrawMessage(getPoolWithdrawErrorMessage(error));
      setPoolWithdrawStatus("error");
    }
  }, [clearTrackedTimers, connectedAddress, isBusy, onJuiceConfirmed]);

  const startClaimAutoConvertFlow = useCallback(async () => {
    if (isBusy) {
      return;
    }

    clearTrackedTimers();
    setAutoConvertMessage(null);
    setAutoConvertResult(null);
    setPoolWithdrawTxId(null);
    setTinymanUnwrapTxId(null);

    if (!connectedAddress) {
      setAutoConvertMessage("Connect your wallet first.");
      setAutoConvertStatus("error");
      return;
    }

    try {
      setAutoConvertStatus("checking");
      setAutoConvertMessage("Checking wallet setup and balances.");

      const startingSnapshot = await fetchWalletAutoConvertSnapshot(connectedAddress);

      if (!startingSnapshot.hasPoolTokenOptIn) {
        setAutoConvertMessage("One-time wallet setup is required before claiming. Start Juicing handles setup automatically.");
        setAutoConvertStatus("error");
        return;
      }

      if (!startingSnapshot.hasOraOptIn) {
        const requiredSetupAlgo =
          ORA_ASA_OPT_IN_MIN_BALANCE_MICROALGO +
          ORA_ASA_OPT_IN_TXN_FEE_MICROALGO +
          BigInt(ORA_POOL_WITHDRAW_TXN_FEE_MICROALGO) +
          BigInt(TINYMAN_UNWRAP_ESTIMATED_FEE_MICROALGO);

        if (startingSnapshot.spendableAlgo < requiredSetupAlgo) {
          throw new Error("Add more ALGO to cover ORA opt-in minimum balance, claim, and reward conversion fees.");
        }

        setAutoConvertMessage("One-time setup: opting into ORA");

        const oraOptInTxn = await buildOraAsaOptInTxn(connectedAddress);
        const wallet = await getPeraWallet();
        const oraOptInTxnsToSign = [
          [{ txn: oraOptInTxn, signers: [connectedAddress] }]
        ];
        let signedOraOptInTxns: Uint8Array[];

        setAutoConvertStatus("claimSigning");

        try {
          signedOraOptInTxns = await wallet.signTransaction(oraOptInTxnsToSign);
        } catch {
          throw new Error("ORA opt-in is required before claiming rewards.");
        }

        if (!signedOraOptInTxns.length) {
          throw new Error("ORA opt-in is required before claiming rewards.");
        }

        setAutoConvertStatus("claimPending");
        setAutoConvertMessage("ORA opt-in submitted. Waiting for confirmation.");

        let oraOptInSubmitResponse: { txId?: string; txid?: string };

        try {
          oraOptInSubmitResponse = await algodClient.sendRawTransaction(signedOraOptInTxns).do() as { txId?: string; txid?: string };
        } catch (submitError) {
          throw new Error(getAlgodSubmitErrorMessage(submitError));
        }

        const oraOptInTransactionId = oraOptInSubmitResponse.txId ?? oraOptInSubmitResponse.txid ?? oraOptInTxn.txID();
        await algosdk.waitForConfirmation(algodClient, oraOptInTransactionId, 6);
        await onJuiceConfirmed?.();
      } else if (startingSnapshot.spendableAlgo < BigInt(ORA_POOL_WITHDRAW_TXN_FEE_MICROALGO)) {
        throw new Error("Add more ALGO to cover claim fees.");
      }

      const preClaimSnapshot = await fetchWalletAutoConvertSnapshot(connectedAddress);
      const preClaimLpTokenBalance = preClaimSnapshot.lpTokenBalance;

      setPoolWithdrawStatus("signing");
      setPoolWithdrawMessage("Approve the OrangeMiner claim in Pera Wallet.");
      setAutoConvertStatus("claimSigning");
      setAutoConvertMessage("Step 1 of 2: approve the OrangeMiner claim in Pera Wallet.");

      const claimTxn = await buildOraPoolWithdrawTxn({
        sender: connectedAddress
      });
      const claimResult = await signSubmitAndConfirmTransactions({
        connectedAddress,
        logPrefix: "[Claim ORA Auto-Convert] OrangeMiner claim",
        onSigned: () => {
          setPoolWithdrawStatus("pending");
          setPoolWithdrawMessage("OrangeMiner claim submitted. Waiting for confirmation.");
          setAutoConvertStatus("claimPending");
          setAutoConvertMessage("OrangeMiner claim submitted. Waiting for confirmation.");
        },
        transactions: [claimTxn]
      });
      const claimTxId = claimResult.txId;

      setPoolWithdrawTxId(claimTxId);
      setPoolWithdrawStatus("confirmed");
      setPoolWithdrawMessage("OrangeMiner claim confirmed. Detecting returned rewards.");
      setAutoConvertStatus("detectingLp");
      setAutoConvertMessage("Claim confirmed. Checking returned rewards.");

      const claimTransferResult = getConfirmedTransferAmounts({
        connectedAddress,
        indexerTransactions: claimResult.indexerTransactions
      });
      const claimTransfers = claimTransferResult.amounts;
      const algoDeltaAfterClaim = claimTransfers.algo;
      const postClaimSnapshot = await fetchWalletAutoConvertSnapshot(connectedAddress);
      const lpTokenAmountToConvert = postClaimSnapshot.lpTokenBalance > preClaimLpTokenBalance
        ? postClaimSnapshot.lpTokenBalance - preClaimLpTokenBalance
        : BigInt(0);

      if (lpTokenAmountToConvert <= BigInt(0)) {
        const nextResult = {
          algoReceived: algoDeltaAfterClaim,
          claimTxId,
          isTransferVerified: claimTransferResult.isVerifiedFromIndexer,
          lpReceived: BigInt(0),
          lpUnwrapped: BigInt(0),
          oraReceived: BigInt(0),
          unwrapTxId: null
        };

        setTinymanUnwrapStatus("idle");
        setTinymanUnwrapMessage(null);
        setAutoConvertStatus("confirmed");
        setAutoConvertResult(nextResult);
        setAutoConvertMessage(
          nextResult.isTransferVerified
            ? "Claim complete."
            : "Claim confirmed - open Explorer for exact amount."
        );

        if (nextResult.isTransferVerified && nextResult.oraReceived > BigInt(0)) {
          onClaimSuccess?.(nextResult.oraReceived);
        }

        await onJuiceConfirmed?.();
        return;
      }

      setAutoConvertMessage("Preparing reward conversion.");

      const preflight = await fetchTinymanUnwrapPreflight(connectedAddress);

      if (!preflight.hasOraOptIn) {
        throw new Error("Opt into ORA ASA 1284444444 before receiving converted rewards.");
      }

      if (!preflight.hasEnoughAlgoForFee) {
        throw new Error("Not enough spendable ALGO for the 0.004 ALGO reward conversion fee.");
      }

      const quote = await fetchTinymanOraAlgoUnwrapQuote({ lpTokenAmount: lpTokenAmountToConvert });
      setTinymanUnwrapStatus("signing");
      setTinymanUnwrapMessage("Approve the reward conversion group in Pera Wallet.");
      setAutoConvertStatus("unwrapSigning");
      setAutoConvertMessage("Step 2 of 2: approve reward conversion in Pera Wallet.");

      const unwrapTxns = await buildTinymanRemoveLiquidityTxns({
        lpTokenAmount: quote.lpTokenAmount,
        minAlgoOut: quote.minAlgoOut,
        minOraOut: quote.minOraOut,
        sender: connectedAddress
      });
      const unwrapResult = await signSubmitAndConfirmTransactions({
        connectedAddress,
        logPrefix: "[Claim ORA Auto-Convert] Tinyman unwrap",
        onSigned: () => {
          setTinymanUnwrapStatus("pending");
          setTinymanUnwrapMessage("Reward conversion submitted. Waiting for confirmation.");
          setAutoConvertStatus("unwrapPending");
          setAutoConvertMessage("Reward conversion submitted. Waiting for confirmation.");
        },
        transactions: unwrapTxns
      });
      const unwrapTxId = unwrapResult.txId;

      setTinymanUnwrapTxId(unwrapTxId);
      setTinymanUnwrapStatus("confirmed");
      setTinymanUnwrapMessage("Reward conversion confirmed.");
      setAutoConvertStatus("confirmed");

      const unwrapTransferResult = getConfirmedTransferAmounts({
        connectedAddress,
        indexerTransactions: unwrapResult.indexerTransactions
      });
      const unwrapTransfers = unwrapTransferResult.amounts;
      const oraDeltaAfterUnwrap = unwrapTransfers.ora;
      const algoDeltaAfterUnwrap = unwrapTransfers.algo;
      const lpDeltaAfterUnwrap = unwrapTransfers.lpSent;
      const oraReceived = oraDeltaAfterUnwrap;
      const algoReceived = algoDeltaAfterClaim + algoDeltaAfterUnwrap;
      const nextResult = {
        algoReceived,
        claimTxId,
        isTransferVerified: claimTransferResult.isVerifiedFromIndexer && unwrapTransferResult.isVerifiedFromIndexer,
        lpReceived: lpTokenAmountToConvert,
        lpUnwrapped: lpDeltaAfterUnwrap,
        oraReceived,
        unwrapTxId
      };
      setAutoConvertResult(nextResult);
      setAutoConvertMessage(
        nextResult.isTransferVerified
          ? "Claim complete."
          : "Claim confirmed - open Explorer for exact amount."
      );

      if (nextResult.isTransferVerified && nextResult.oraReceived > BigInt(0)) {
        onClaimSuccess?.(nextResult.oraReceived);
      }

      await onJuiceConfirmed?.();
    } catch (error) {      setAutoConvertMessage(getAutoConvertErrorMessage(error));
      setAutoConvertStatus("error");
    }
  }, [clearTrackedTimers, connectedAddress, isBusy, onClaimSuccess, onJuiceConfirmed]);

  const startTinymanUnwrapFlow = useCallback(async () => {
    if (isBusy) {
      return;
    }

    const quote = tinymanUnwrapPreview?.data ?? null;
    const lpTokenBalance = poolWalletData?.data?.poolTokenBalance ?? BigInt(0);

    setTinymanUnwrapTxId(null);
    setTinymanUnwrapMessage(null);

    if (!connectedAddress) {
      setTinymanUnwrapMessage("Connect your wallet first.");
      setTinymanUnwrapStatus("error");
      return;
    }

    if (lpTokenBalance <= BigInt(0)) {
      setTinymanUnwrapMessage("No ORA-ALGO LP token balance was found to unwrap.");
      setTinymanUnwrapStatus("error");
      return;
    }

    if (!quote) {
      setTinymanUnwrapMessage("Tinyman unwrap quote is not ready yet.");
      setTinymanUnwrapStatus("error");
      return;
    }

    try {
      setTinymanUnwrapStatus("preparing");
      setTinymanUnwrapMessage("Checking ORA opt-in and ALGO fee balance.");

      const preflight = await fetchTinymanUnwrapPreflight(connectedAddress);
      if (!preflight.hasOraOptIn) {
        throw new Error("Opt into ORA ASA 1284444444 before receiving converted rewards.");
      }

      if (!preflight.hasEnoughAlgoForFee) {
        throw new Error("Not enough spendable ALGO for the 0.004 ALGO reward conversion fee.");
      }

      setTinymanUnwrapMessage("Preparing Tinyman remove-liquidity transaction group.");

      const unsignedTxns = await buildTinymanRemoveLiquidityTxns({
        lpTokenAmount: quote.lpTokenAmount,
        minAlgoOut: quote.minAlgoOut,
        minOraOut: quote.minOraOut,
        sender: connectedAddress
      });   setTinymanUnwrapStatus("signing");
      setTinymanUnwrapMessage("Approve the Tinyman remove-liquidity group in Pera Wallet.");

      const wallet = await getPeraWallet();
      const txnsToSign = [
        unsignedTxns.map((txn) => ({ txn, signers: [connectedAddress] }))
      ];
      let signedTxns: Uint8Array[];

      try {
        signedTxns = await wallet.signTransaction(txnsToSign);
      } catch (signError) {        throw new Error(getPeraSigningErrorMessage(signError));
      }

      if (signedTxns.length !== unsignedTxns.length) {
        throw new Error("Wallet did not return the full signed Tinyman unwrap group.");
      }      setTinymanUnwrapStatus("pending");
      setTinymanUnwrapMessage("Tinyman unwrap submitted. Waiting for Algorand confirmation.");

      let submitResponse: { txId?: string; txid?: string };

      try {
        submitResponse = await algodClient.sendRawTransaction(signedTxns).do() as { txId?: string; txid?: string };
      } catch (submitError) {        throw new Error(getAlgodSubmitErrorMessage(submitError));
      }

      const transactionId = submitResponse.txId ?? submitResponse.txid ?? unsignedTxns[0].txID();      await algosdk.waitForConfirmation(algodClient, transactionId, 6);

      setTinymanUnwrapTxId(transactionId);
      setTinymanUnwrapStatus("confirmed");
      setTinymanUnwrapMessage("Tinyman unwrap confirmed. ORA, ALGO, LP balance, and pool data refreshed.");

      await onJuiceConfirmed?.();
    } catch (error) {      setTinymanUnwrapMessage(getTinymanUnwrapErrorMessage(error));
      setTinymanUnwrapStatus("error");
    }
  }, [connectedAddress, isBusy, onJuiceConfirmed, poolWalletData?.data?.poolTokenBalance, tinymanUnwrapPreview?.data]);

  const startJuicingFlow = useCallback(async () => {
    if (isBusy) {
      return;
    }

    clearTrackedTimers();
    setConfirmedTxId(null);
    setTransactionMessage(null);
    setParticles([]);

    if (!connectedAddress) {
      setTransactionMessage("Connect your wallet first.");
      setTransactionStatus("error");
      return;
    }

    const isOptedIn = hasCompletedOptIn || isOraAppOptedIn === true || await checkOraAppOptedIn(connectedAddress);

    if (!isOptedIn) {
      await runOraAppOptInFlow({
        connectedAddress,
        onConfirmed: async (transactionId) => {
          setHasCompletedOptIn(true);
          setConfirmedTxId(transactionId);
          setTransactionMessage("Opt-in complete. You can now juice ORA.");
          setTransactionStatus("optInConfirmed");
          setParticles([]);
          await onJuiceConfirmed?.();
        },
        setConfirmedTxId,
        setJuiceKey,
        setParticles,
        setTransactionMessage,
        setTransactionStatus
      });
      return;
    }

    if (feeMicroAlgo === null || isFeeInvalid || isHardBlockedFee) {
      setTransactionMessage(
        isHardBlockedFee
          ? "Fees above 0.02 ALGO are blocked by the ORA contract."
          : "Enter a valid ALGO fee from 0.002 to 0.02."
      );
      setTransactionStatus("error");
      return;
    }

    if (requiresHighFeeConfirmation && !isHighFeeConfirmed) {
      setTransactionStatus("preview");
      return;
    }

    try {
      setJuiceKey((current) => current + 1);
      setTransactionStatus("preparing");
      setTransactionMessage("Preparing ORA juicing transaction.");      const unsignedTxn = await buildOraJuiceTxn({
        feeMicroAlgo: Number(feeMicroAlgo),
        sender: connectedAddress
      });
      setTransactionStatus("signing");
      setTransactionMessage("Approve the ORA juicing transaction in Pera Wallet.");

      const wallet = await getPeraWallet();
      const txnsToSign = [
        [{ txn: unsignedTxn, signers: [connectedAddress] }]
      ];
      let signedTxns: Uint8Array[];

      try {
        signedTxns = await wallet.signTransaction(txnsToSign);
      } catch (signError) {        throw new Error(getPeraSigningErrorMessage(signError));
      }

      if (!signedTxns.length) {
        throw new Error("Wallet did not return a signed transaction.");
      }      setTransactionStatus("pending");
      setTransactionMessage("Transaction submitted. Waiting for Algorand confirmation.");

      let submitResponse: { txId?: string; txid?: string };

      try {
        submitResponse = await algodClient.sendRawTransaction(signedTxns).do() as { txId?: string; txid?: string };
      } catch (submitError) {        throw new Error(getAlgodSubmitErrorMessage(submitError));
      }

      const { txId } = submitResponse;
      const transactionId = txId ?? submitResponse.txid ?? unsignedTxn.txID();      await algosdk.waitForConfirmation(algodClient, transactionId, 6);

      setConfirmedTxId(transactionId);
      setTransactionMessage(statusCopy.confirmed.detail);
      setTransactionStatus("confirmed");
      setParticles([]);

      await onJuiceConfirmed?.();

      scheduleStatus(() => {
        setTransactionStatus("idle");
      }, 7000);
    } catch (error) {      setParticles([]);
      setTransactionMessage(getJuiceErrorMessage(error));
      setTransactionStatus("error");
    }
  }, [
    clearTrackedTimers,
    connectedAddress,
    feeMicroAlgo,
    hasCompletedOptIn,
    isBusy,
    isFeeInvalid,
    isHardBlockedFee,
    isHighFeeConfirmed,
    isOraAppOptedIn,
    onJuiceConfirmed,
    requiresHighFeeConfirmation,
    scheduleStatus
  ]);

  useEffect(() => {
    return () => {
      clearTrackedTimers();
    };
  }, [clearTrackedTimers]);

  useEffect(() => {
    setIsHighFeeConfirmed(false);
  }, [fee]);

  useEffect(() => {
    setIsPoolDepositConfirmed(false);
  }, [poolDepositAmount]);

  useEffect(() => {
    clearTrackedTimers();
    setTransactionStatus("idle");
    setTransactionMessage(null);
    setConfirmedTxId(null);
    setAutoConvertStatus("idle");
    setAutoConvertMessage(null);
    setAutoConvertResult(null);
    setHasCompletedOptIn(false);
    setParticles([]);
    setPoolWithdrawStatus("idle");
    setPoolWithdrawMessage(null);
    setPoolWithdrawTxId(null);
    setTinymanUnwrapStatus("idle");
    setTinymanUnwrapMessage(null);
    setTinymanUnwrapTxId(null);
    setHasLoadedJuicer(false);
  }, [clearTrackedTimers, connectedAddress]);

  const hasDepositEvidence = hasPoolDepositEvidence(poolWalletData?.data ?? null, poolTransactionHistory?.transactions ?? []);
  const hasJuicerLoaded = hasLoadedJuicer || hasDepositEvidence;
  const isClaimBusy = activeAutoConvertStatuses.includes(autoConvertStatus);
  const claimDisabled = isBusy || !connectedAddress;
  const shouldPulseClaimButton = Boolean(connectedAddress && hasJuicerLoaded && !isBusy);
  const depositStatus = getDepositStatusText({
    hasJuicerLoaded,
    status: transactionStatus
  });

  return (
    <Card id="juice" className="border-white/[0.08] bg-white/[0.045] p-3 shadow-[0_22px_70px_rgba(0,0,0,0.35)] sm:p-4" glow>
      <label className="block">
        <span className="sr-only">Deposit amount</span>
        <div className="flex items-center rounded-2xl border border-white/10 bg-black/30 px-4 py-3 transition focus-within:border-ora-300/55 focus-within:shadow-[0_0_28px_rgba(255,129,0,0.16)]">
          <input
            value={poolDepositAmount}
            onChange={(event) => setPoolDepositAmount(event.target.value)}
            inputMode="decimal"
            className="min-w-0 flex-1 bg-transparent text-3xl font-black text-white outline-none placeholder:text-slate-700"
            placeholder="1"
          />
          <span className="rounded-full bg-white/[0.07] px-3 py-1.5 text-sm font-black text-slate-300">ALGO</span>
        </div>
      </label>

      <PoolDepositSafetyNotice
        depositSafety={getPoolDepositSafety(poolDepositMicroAlgo, isPoolDepositConfirmed)}
        onConfirmHighDeposit={() => setIsPoolDepositConfirmed(true)}
      />

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <motion.button
          type="button"
          onClick={startAutoPoolMiningFlow}
          disabled={isBusy || isPoolDepositInvalid || needsPoolDepositConfirmation}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ffd166,#ff8100_48%,#ff4f00)] px-5 py-3 text-sm font-black text-ink-950 shadow-glow transition hover:shadow-glow-strong disabled:cursor-not-allowed disabled:opacity-60"
          whileHover={{ y: -1, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
        >
          {isTransactionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4 fill-current" />}
          Start Juicing
        </motion.button>

        <motion.button
          type="button"
          onClick={startClaimAutoConvertFlow}
          disabled={claimDisabled}
          className={cn(
            "group relative flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-ora-300/25 bg-ora-400/[0.08] px-5 py-3 text-sm font-black text-ora-100 transition hover:border-ora-200/60 hover:bg-ora-400/[0.14] disabled:cursor-not-allowed disabled:opacity-55",
            shouldPulseClaimButton && "shadow-[0_0_28px_rgba(255,129,0,0.18)]"
          )}
          animate={
            shouldPulseClaimButton
              ? { boxShadow: ["0 0 18px rgba(255,129,0,0.12)", "0 0 34px rgba(255,129,0,0.32)", "0 0 18px rgba(255,129,0,0.12)"] }
              : undefined
          }
          transition={shouldPulseClaimButton ? { duration: 2.4, ease: "easeInOut", repeat: Infinity } : undefined}
          whileHover={claimDisabled ? undefined : { y: -1, scale: 1.01 }}
          whileTap={claimDisabled ? undefined : { scale: 0.98 }}
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(255,209,102,0.16),rgba(255,129,0,0.26),transparent)] transition duration-700 group-hover:translate-x-full" />
          <span className="pointer-events-none absolute h-16 w-16 rounded-full bg-ora-300/20 opacity-0 blur-xl transition duration-300 group-hover:opacity-100 group-active:scale-125" />
          {isClaimBusy ? <Loader2 className="relative h-4 w-4 animate-spin" /> : <Zap className="relative h-4 w-4 fill-current" />}
          <span className="relative">{isClaimBusy ? "Claiming ORA" : "Claim ORA"}</span>
        </motion.button>
      </div>

      <JuicerSummary
        depositStatus={depositStatus}
        result={autoConvertResult}
        status={autoConvertStatus}
      />

      <TransactionStatusCard confirmedTxId={confirmedTxId} message={transactionMessage} status={transactionStatus} title={getPoolDepositStatusTitle(transactionStatus)} />
      <AutoConvertStatusCard message={autoConvertMessage} result={autoConvertResult} status={autoConvertStatus} />

    </Card>
  );
}

function getButtonLabel(
  status: TransactionStatus,
  safety: {
    isFeeInvalid: boolean;
    isHardBlockedFee: boolean;
    needsOraAppOptIn: boolean;
    requiresHighFeeConfirmation: boolean;
    isHighFeeConfirmed: boolean;
  }
) {
  if (safety.needsOraAppOptIn) return "Opt In to ORA Mining";
  if (safety.isFeeInvalid) return "Enter a Valid Fee";
  if (safety.isHardBlockedFee) return "Fee Above 0.02 ALGO Blocked";
  if (safety.requiresHighFeeConfirmation && !safety.isHighFeeConfirmed) return "Confirm High Fee First";
  if (status === "optInConfirmed") return "Juice ORA Now";
  if (status === "preview") return "Preview Ready";
  if (status === "preparing") return "Preparing Transaction";
  if (status === "signing") return "Waiting for Wallet";
  if (status === "pending") return "Confirming on Algorand";
  if (status === "confirmed") return "Juice Confirmed";
  if (status === "error") return "Retry Juice ORA";
  return "Juice ORA Now";
}

function getJuiceModeTitle(mode: JuiceMode) {
  if (mode === "manual") return "Manual Juice";
  if (mode === "pool") return "Auto Pool";
  return "Claim Rewards";
}

function getJuiceModeDescription(mode: JuiceMode) {
  if (mode === "manual") return "Choose a fee and add ORA mining effort.";
  if (mode === "pool") return "Deposit once into OrangeMiner pooled juicing.";
  return "Check and claim rewards, then auto-convert LP when returned.";
}

function getJuiceModeTabLabel(mode: JuiceMode) {
  if (mode === "manual") return "Manual Juice";
  if (mode === "pool") return "Auto Pool";
  return "Claim";
}

function getDepositStatusText({
  hasJuicerLoaded,
  status
}: {
  hasJuicerLoaded: boolean;
  status: TransactionStatus;
}) {
  if (status === "confirmed" || hasJuicerLoaded) {
    return "Juicer loaded";
  }

  if (status === "preparing" || status === "signing" || status === "pending") {
    return "Loading juicer";
  }

  if (status === "preview") {
    return "Confirm deposit";
  }

  return "Not loaded";
}

function JuicerSummary({
  depositStatus,
  result,
  status
}: {
  depositStatus: string;
  result: AutoConvertResult | null;
  status: AutoConvertStatus;
}) {
  const isClaiming = activeAutoConvertStatuses.includes(status);
  const oraClaimed = getOraClaimedText(result, isClaiming);

  return (
    <section className="mt-4 grid gap-2 sm:grid-cols-2">
      <StatusMetric label="ORA Claimed" value={oraClaimed} tone={result?.isTransferVerified && result.oraReceived > BigInt(0) ? "good" : undefined} />
      <StatusMetric label="Deposit Status" value={depositStatus} tone={depositStatus === "Juicer loaded" ? "good" : undefined} />
      {result && !result.isTransferVerified && (
        <p className="rounded-lg border border-amber-300/20 bg-amber-400/[0.08] p-3 text-xs font-semibold leading-5 text-amber-100 sm:col-span-2">
          Exact reward amounts were not displayed because this app could not verify them from confirmed transfer records.
        </p>
      )}
    </section>
  );
}

function StatusMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone?: "good" | "warn";
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
      <span className="text-[11px] font-black uppercase text-slate-600">{label}</span>
      <p
        className={cn(
          "mt-1 min-h-5 break-words text-sm font-black text-white",
          tone === "good" && "text-emerald-200",
          tone === "warn" && "text-amber-200"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function getOraClaimedText(result: AutoConvertResult | null, isClaiming: boolean) {
  if (isClaiming) {
    return "Confirming...";
  }

  if (!result) {
    return "0 ORA claimed";
  }

  if (!result.isTransferVerified) {
    return "Open explorer";
  }

  if (result.oraReceived <= BigInt(0)) {
    return "Nothing ready yet";
  }

  return `+${formatOraReceived(result.oraReceived)} ORA claimed`;
}

function TransactionStatusCard({
  confirmedTxId,
  message,
  status,
  title
}: {
  confirmedTxId: string | null;
  message: string | null;
  status: TransactionStatus;
  title?: string;
}) {
  if (status === "idle") {
    return null;
  }

  const isLoading = status === "preparing" || status === "signing" || status === "pending";
  const Icon =
    status === "confirmed" || status === "preview" || status === "optInConfirmed"
      ? CheckCircle2
      : status === "error"
        ? XCircle
        : status === "optInRequired"
          ? Zap
          : Loader2;
  const detail = message ?? statusCopy[status].detail;

  return (
    <motion.div
      className={cn("mt-3 rounded-lg border p-3", statusStyles[status])}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/20">
          <Icon className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black">{title ?? statusCopy[status].label}</p>
          <p className="mt-1 break-words text-xs leading-5 opacity-75">{detail}</p>
          {status === "confirmed" && confirmedTxId && (
            <p className="mt-2 break-all text-[11px] font-bold text-emerald-100/80">TxID: {confirmedTxId}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AutoPoolMiningControls({
  depositAmount,
  depositMicroAlgo,
  isHighDepositConfirmed,
  onConfirmHighDeposit,
  onDepositAmountChange,
  poolMiningStatus
}: {
  depositAmount: string;
  depositMicroAlgo: bigint | null;
  isHighDepositConfirmed: boolean;
  onConfirmHighDeposit: () => void;
  onDepositAmountChange: (value: string) => void;
  poolMiningStatus?: {
    error: string | null;
    isLoading: boolean;
    status: OraPoolMiningStatus | null;
  };
}) {
  const depositSafety = getPoolDepositSafety(depositMicroAlgo, isHighDepositConfirmed);

  return (
    <div className="mt-5 rounded-lg border border-cyan-300/20 bg-cyan-400/[0.045] p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase text-cyan-200">Auto Pool Mining</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
            Deposit ALGO into the official ORA OrangeMiner pool. The pool handles juicing without requiring you to
            approve every transaction.
          </p>
        </div>
        <span className="w-fit rounded-md border border-emerald-300/25 bg-emerald-400/[0.12] px-2.5 py-1 text-xs font-black text-emerald-100">
          Deposits enabled
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-xs font-black uppercase text-cyan-200">Deposit Amount</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          Default deposit is 1 ALGO. Deposits above 10 ALGO require an extra confirmation.
        </p>
        <label className="mt-3 block">
          <span className="text-xs font-bold text-slate-500">Amount (ALGO)</span>
          <div className="mt-2 flex items-center rounded-lg border border-white/10 bg-black/30 p-2 transition focus-within:border-cyan-300/60">
            <input
              value={depositAmount}
              onChange={(event) => onDepositAmountChange(event.target.value)}
              inputMode="decimal"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xl font-black text-white outline-none placeholder:text-slate-600"
              placeholder="1"
            />
            <span className="rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-bold text-slate-300">ALGO</span>
          </div>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PreviewMetric
            label="Deposit preview"
            value={
              depositMicroAlgo === null
                ? depositAmount || "--"
                : `${formatUnits(depositMicroAlgo, 6, { maximumFractionDigits: 6 })} ALGO`
            }
          />
          <PreviewMetric
            label="Deposit microAlgos"
            value={depositMicroAlgo === null ? "--" : formatInteger(depositMicroAlgo)}
          />
        </div>
        <PoolDepositSafetyNotice depositSafety={depositSafety} onConfirmHighDeposit={onConfirmHighDeposit} />
      </div>

      <PoolMiningStatusPanel poolMiningStatus={poolMiningStatus} />
    </div>
  );
}

function ClaimRewardsControls({
  autoConvertMessage,
  autoConvertResult,
  autoConvertStatus,
  connectedAddress,
  lastCheckedAt,
  onClaimAutoConvert,
  onRefresh,
  poolMiningStatus,
  poolTransactionHistory,
  poolWalletData,
  tinymanUnwrapPreview
}: {
  autoConvertMessage: string | null;
  autoConvertResult: AutoConvertResult | null;
  autoConvertStatus: AutoConvertStatus;
  connectedAddress?: string | null;
  lastCheckedAt?: Date | null;
  onClaimAutoConvert: () => void;
  onRefresh?: () => Promise<void> | void;
  poolMiningStatus?: {
    error: string | null;
    isLoading: boolean;
    status: OraPoolMiningStatus | null;
  };
  poolTransactionHistory?: {
    error: string | null;
    isLoading: boolean;
    transactions: OraPoolTransactionSummary[];
  };
  poolWalletData?: {
    data: OraPoolWalletData | null;
    error: string | null;
    isLoading: boolean;
  };
  tinymanUnwrapPreview?: {
    data: TinymanOraAlgoUnwrapQuote | null;
    error: string | null;
    isLoading: boolean;
  };
}) {
  return (
    <div className="mt-5 space-y-4">
      <PoolWalletSummaryPanel poolTransactionHistory={poolTransactionHistory} poolWalletData={poolWalletData} />
      <ClaimableRewardsPanel
        autoConvertMessage={autoConvertMessage}
        autoConvertResult={autoConvertResult}
        autoConvertStatus={autoConvertStatus}
        connectedAddress={connectedAddress}
        lastCheckedAt={lastCheckedAt}
        onClaimAutoConvert={onClaimAutoConvert}
        onRefresh={onRefresh}
        poolTransactionHistory={poolTransactionHistory}
        poolWalletData={poolWalletData}
        tinymanUnwrapPreview={tinymanUnwrapPreview}
      />
      <PoolMiningStatusPanel poolMiningStatus={poolMiningStatus} />
    </div>
  );
}

function PoolMiningStatusPanel({
  poolMiningStatus
}: {
  poolMiningStatus?: {
    error: string | null;
    isLoading: boolean;
    status: OraPoolMiningStatus | null;
  };
}) {
  const status = poolMiningStatus?.status ?? null;
  const isActive = Boolean(status?.isActive);
  const isLoading = poolMiningStatus?.isLoading ?? false;
  const error = poolMiningStatus?.error ?? null;

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase text-cyan-200">OrangeMiner Activity</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Read-only check of recent mine() calls from the official pool app.
          </p>
        </div>
        <span
          className={cn(
            "w-fit rounded-md border px-2.5 py-1 text-xs font-black",
            isLoading
              ? "border-slate-400/20 bg-slate-400/10 text-slate-300"
              : isActive
                ? "border-emerald-300/25 bg-emerald-400/[0.12] text-emerald-100"
                : "border-amber-300/25 bg-amber-400/[0.12] text-amber-100"
          )}
        >
          Pool Status: {isLoading ? "Loading" : isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PreviewMetric label="Last mine" value={isLoading ? "Loading..." : status?.lastMineTime ?? "--"} />
        <PreviewMetric label="Recent mine calls" value={isLoading ? "Loading..." : formatInteger(status?.mineTransactionCount ?? 0)} />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-300/25 bg-red-400/[0.1] p-3 text-xs font-semibold leading-5 text-red-100">
          {error}
        </p>
      )}

      {!isLoading && !error && !isActive && (
        <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-400/[0.1] p-3 text-xs font-semibold leading-5 text-amber-100">
          Your deposit is not currently being used for mining.
        </p>
      )}
    </div>
  );
}

function PoolWalletSummaryPanel({
  poolTransactionHistory,
  poolWalletData
}: {
  poolTransactionHistory?: {
    error: string | null;
    isLoading: boolean;
    transactions: OraPoolTransactionSummary[];
  };
  poolWalletData?: {
    data: OraPoolWalletData | null;
    error: string | null;
    isLoading: boolean;
  };
}) {
  const data = poolWalletData?.data ?? null;
  const isLoading = poolWalletData?.isLoading ?? false;
  const error = poolWalletData?.error ?? null;
  const transactions = poolTransactionHistory?.transactions ?? [];
  const transactionSummary = getPoolPositionSummary(transactions);

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase text-cyan-200">My Pool Position</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Connected-wallet OrangeMiner deposit summary.
          </p>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-black text-slate-300">
          {isLoading ? "Loading" : data?.boxFound ? "Box found" : "No box"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <PreviewMetric label="Deposited" value={isLoading ? "Loading..." : transactionSummary.deposited} />
        <PreviewMetric label="Total spent" value="Juicer loaded" />
        <PreviewMetric
          label="Pool token balance"
          value={isLoading ? "Loading..." : `${formatPoolTokenBalance(data?.poolTokenBalance)} token`}
        />
        <PreviewMetric label="Deposit box" value={isLoading ? "Loading..." : data?.boxFound ? "Found" : "None"} />
      </div>

      {transactionSummary.note && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs font-semibold leading-5 text-slate-400">
          {transactionSummary.note}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-300/25 bg-red-400/[0.1] p-3 text-xs font-semibold leading-5 text-red-100">
          {error}
        </p>
      )}
    </div>
  );
}

function ClaimableRewardsPanel({
  autoConvertMessage,
  autoConvertResult,
  autoConvertStatus,
  connectedAddress,
  lastCheckedAt,
  onClaimAutoConvert,
  onRefresh,
  poolTransactionHistory,
  poolWalletData,
  tinymanUnwrapPreview
}: {
  autoConvertMessage: string | null;
  autoConvertResult: AutoConvertResult | null;
  autoConvertStatus: AutoConvertStatus;
  connectedAddress?: string | null;
  lastCheckedAt?: Date | null;
  onClaimAutoConvert: () => void;
  onRefresh?: () => Promise<void> | void;
  poolTransactionHistory?: {
    error: string | null;
    isLoading: boolean;
    transactions: OraPoolTransactionSummary[];
  };
  poolWalletData?: {
    data: OraPoolWalletData | null;
    error: string | null;
    isLoading: boolean;
  };
  tinymanUnwrapPreview?: {
    data: TinymanOraAlgoUnwrapQuote | null;
    error: string | null;
    isLoading: boolean;
  };
}) {
  const data = poolWalletData?.data ?? null;
  const transactions = poolTransactionHistory?.transactions ?? [];
  const isLoading = Boolean(poolWalletData?.isLoading || poolTransactionHistory?.isLoading);
  const isAutoConvertBusy = activeAutoConvertStatuses.includes(autoConvertStatus);
  const hasDepositEvidence = hasPoolDepositEvidence(data, transactions);
  const isDisabled = isLoading || isAutoConvertBusy || !connectedAddress || !hasDepositEvidence;
  const hasPoolTokenOptIn = !connectedAddress || isLoading ? null : data?.hasPoolTokenOptIn ?? false;
  const quote = tinymanUnwrapPreview?.data ?? null;
  const isQuoteLoading = tinymanUnwrapPreview?.isLoading ?? false;
  const claimabilityNote = hasDepositEvidence
    ? "Claimable amount is determined when the claim transaction runs."
    : "No OrangeMiner deposit box or deposit history was found for this wallet yet.";
  const expectedUnwrapOutput = isQuoteLoading
    ? "Loading quote..."
    : quote
      ? `~${formatUnits(quote.expectedOra, 6, { maximumFractionDigits: 6 })} ORA / ~${formatMicroAlgos(quote.expectedAlgo)} ALGO`
      : "Calculated after LP claim";
  const lastResult = autoConvertResult
    ? `+${formatUnits(autoConvertResult.oraReceived, 6, { maximumFractionDigits: 6 })} ORA / +${formatMicroAlgos(autoConvertResult.algoReceived)} ALGO`
    : "0 ORA claimed";

  return (
    <div className="mt-4 rounded-lg border border-ora-300/20 bg-ora-400/[0.055] p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase text-ora-200">Claimable Rewards</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
            Rewards can return as LP tokens, direct ALGO, or no transferable assets depending on OrangeMiner state.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh?.()}
          disabled={isLoading || isAutoConvertBusy || !onRefresh}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs font-black text-slate-300 transition hover:border-cyan-300/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        <PreviewMetric label="Claimable ORA" value={isLoading ? "Loading..." : "Calculated at claim"} />
        <PreviewMetric label="Claimable ALGO" value={isLoading ? "Loading..." : "Calculated at claim"} />
        <PreviewMetric label="Claimable LP tokens" value={isLoading ? "Loading..." : "Calculated at claim"} />
        <PreviewMetric label="Expected output after unwrap" value={expectedUnwrapOutput} />
        <PreviewMetric label="Last result" value={lastResult} />
        <PreviewMetric label="Last checked" value={formatLastCheckedAt(lastCheckedAt, isLoading)} />
      </div>

      <p
        className={cn(
          "mt-3 rounded-lg border p-3 text-xs font-semibold leading-5",
          hasDepositEvidence
            ? "border-ora-300/20 bg-ora-400/[0.08] text-ora-100"
            : "border-slate-300/15 bg-white/[0.035] text-slate-400"
        )}
      >
        {claimabilityNote}
      </p>

      {!connectedAddress && (
        <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-400/[0.1] p-3 text-xs font-semibold leading-5 text-amber-100">
          Connect your wallet first.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PreviewMetric label="Pool token opt-in" value={getPoolTokenOptInPreview(connectedAddress, hasPoolTokenOptIn)} />
        <PreviewMetric label="Claim flow" value="Claim, then auto-convert LP when returned" />
      </div>

      <motion.button
        type="button"
        onClick={onClaimAutoConvert}
        disabled={isDisabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-ora-300/35 bg-ora-400/[0.16] px-4 py-3 text-sm font-black text-ora-100 shadow-[0_0_24px_rgba(255,129,0,0.16)] transition hover:border-ora-200/60 hover:bg-ora-400/[0.22] disabled:cursor-not-allowed disabled:opacity-60"
        whileHover={isDisabled ? undefined : { y: -1, scale: 1.005 }}
        whileTap={isDisabled ? undefined : { scale: 0.97 }}
      >
        {isAutoConvertBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4 fill-current" />}
        {getClaimableRewardsButtonLabel({
          connectedAddress,
          hasDepositEvidence,
          isLoading,
          status: autoConvertStatus
        })}
      </motion.button>

      <AutoConvertStatusCard message={autoConvertMessage} result={autoConvertResult} status={autoConvertStatus} />
    </div>
  );
}

function PoolWithdrawStatusCard({
  message,
  status,
  txId
}: {
  message: string | null;
  status: PoolWithdrawStatus;
  txId: string | null;
}) {
  if (status === "idle" && !message) {
    return null;
  }

  const isLoading = activePoolWithdrawStatuses.includes(status);
  const Icon = status === "confirmed" ? CheckCircle2 : status === "error" ? XCircle : Loader2;
  const detail = message ?? poolWithdrawCopy[status].detail;

  return (
    <motion.div
      className={cn("mt-3 rounded-lg border p-3", getPoolWithdrawStatusClass(status))}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/20">
          <Icon className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black">{poolWithdrawCopy[status].label}</p>
          <p className="mt-1 break-words text-xs leading-5 opacity-75">{detail}</p>
          {status === "confirmed" && txId && (
            <div className="mt-2 space-y-1">
              <p className="break-all text-[11px] font-bold text-emerald-100/80">TxID: {txId}</p>
              <a
                className="inline-flex text-[11px] font-black text-emerald-100 underline decoration-emerald-200/40 underline-offset-4 hover:text-white"
                href={`https://explorer.perawallet.app/tx/${txId}`}
                rel="noreferrer"
                target="_blank"
              >
                View on Pera Explorer
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AutoConvertStatusCard({
  message,
  result,
  status
}: {
  message: string | null;
  result: AutoConvertResult | null;
  status: AutoConvertStatus;
}) {
  if (status === "idle" && !message && !result) {
    return null;
  }

  const isLoading = activeAutoConvertStatuses.includes(status);
  const Icon = status === "confirmed" ? CheckCircle2 : status === "error" ? XCircle : Loader2;
  const detail =
    status === "confirmed" && result?.isTransferVerified && result.oraReceived > BigInt(0)
      ? "Rewards parsed from confirmed on-chain transfers."
      : status === "confirmed" && result?.isTransferVerified
        ? "Nothing ready yet."
      : message ?? autoConvertCopy[status].detail;
  const title = status === "confirmed" ? "Claim complete" : autoConvertCopy[status].label;

  return (
    <motion.div
      className={cn("mt-3 rounded-lg border p-3", getAutoConvertStatusClass(status))}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/20">
          <Icon className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 break-words text-xs leading-5 opacity-75">{detail}</p>

          {result && (
            <div className="mt-3 space-y-3 rounded-lg border border-emerald-300/20 bg-emerald-400/[0.08] p-3">
              {result.isTransferVerified && result.oraReceived > BigInt(0) && (
                <p className="text-sm font-black text-emerald-50">
                  +{formatOraReceived(result.oraReceived)} ORA claimed
                </p>
              )}
              {result.isTransferVerified && result.oraReceived <= BigInt(0) && (
                <p className="text-sm font-black text-emerald-50">
                  Nothing ready yet
                </p>
              )}
              <ConfirmedExplorerLink label="Claim transaction confirmed" txId={result.claimTxId} />
              {result.unwrapTxId && <ConfirmedExplorerLink label="Reward conversion confirmed" txId={result.unwrapTxId} />}
              {!result.isTransferVerified && (
                <p className="text-xs font-semibold leading-5 text-emerald-100/80">
                  Claim confirmed - open Explorer for exact amount.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ConfirmedExplorerLink({ label, txId }: { label: string; txId: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-black text-emerald-50">{label}</p>
      <p className="break-all text-[11px] font-bold text-emerald-100/75">TxID: {txId}</p>
      <a
        className="inline-flex text-[11px] font-black text-emerald-100 underline decoration-emerald-200/40 underline-offset-4 hover:text-white"
        href={`https://explorer.perawallet.app/tx/${txId}`}
        rel="noreferrer"
        target="_blank"
      >
        View on Pera Explorer
      </a>
    </div>
  );
}

function TinymanUnwrapPreviewPanel({
  connectedAddress,
  message,
  onUnwrap,
  poolWalletData,
  status,
  tinymanUnwrapPreview,
  txId
}: {
  connectedAddress?: string | null;
  message: string | null;
  onUnwrap: () => void;
  poolWalletData?: {
    data: OraPoolWalletData | null;
    error: string | null;
    isLoading: boolean;
  };
  status: TinymanUnwrapStatus;
  tinymanUnwrapPreview?: {
    data: TinymanOraAlgoUnwrapQuote | null;
    error: string | null;
    isLoading: boolean;
  };
  txId: string | null;
}) {
  const lpTokenBalance = poolWalletData?.data?.poolTokenBalance ?? BigInt(0);

  if (lpTokenBalance <= BigInt(0)) {
    return null;
  }

  const quote = tinymanUnwrapPreview?.data ?? null;
  const isLoading = tinymanUnwrapPreview?.isLoading ?? false;
  const error = tinymanUnwrapPreview?.error ?? null;
  const slippageBps = quote?.slippageBps ?? 100;
  const estimatedFee = quote?.estimatedFeeMicroAlgo ?? BigInt(4_000);
  const isBusy = activeTinymanUnwrapStatuses.includes(status);
  const isDisabled = isBusy || !connectedAddress || isLoading || Boolean(error) || !quote;

  return (
    <div className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-400/[0.045] p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase text-emerald-200">Unwrap LP to ORA + ALGO</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
            Tinyman remove-liquidity preview for your claimed TMPOOL2 ORA-ALGO LP tokens.
          </p>
        </div>
        <span className={cn("w-fit rounded-md border px-2.5 py-1 text-xs font-black", getTinymanUnwrapBadgeClass(status))}>
          {tinymanUnwrapCopy[status].label}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
        <PreviewMetric label="LP token balance" value={`${formatPoolTokenBalance(lpTokenBalance)} TMPOOL2`} />
        <PreviewMetric
          label="Expected ORA"
          value={isLoading ? "Loading..." : quote ? `${formatUnits(quote.expectedOra, 6, { maximumFractionDigits: 6 })} ORA` : "--"}
        />
        <PreviewMetric
          label="Expected ALGO"
          value={isLoading ? "Loading..." : quote ? `${formatMicroAlgos(quote.expectedAlgo)} ALGO` : "--"}
        />
        <PreviewMetric label="Slippage" value={formatSlippageBps(slippageBps)} />
        <PreviewMetric label="Estimated fee" value={`${formatMicroAlgos(estimatedFee)} ALGO`} />
      </div>

      {quote && (
        <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs font-semibold leading-5 text-slate-400">
          Minimum preview with slippage: {formatUnits(quote.minOraOut, 6, { maximumFractionDigits: 6 })} ORA and{" "}
          {formatMicroAlgos(quote.minAlgoOut)} ALGO.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-300/25 bg-red-400/[0.1] p-3 text-xs font-semibold leading-5 text-red-100">
          {error}
        </p>
      )}

      <motion.button
        type="button"
        onClick={onUnwrap}
        disabled={isDisabled}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/35 bg-emerald-400/[0.14] px-4 py-3 text-sm font-black text-emerald-100 shadow-[0_0_24px_rgba(52,211,153,0.14)] transition hover:border-emerald-200/60 hover:bg-emerald-400/[0.2] disabled:cursor-not-allowed disabled:opacity-60"
        whileHover={isDisabled ? undefined : { y: -1, scale: 1.005 }}
        whileTap={isDisabled ? undefined : { scale: 0.97 }}
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4 fill-current" />}
        {getTinymanUnwrapButtonLabel(status, connectedAddress, isLoading, quote)}
      </motion.button>

      <TinymanUnwrapStatusCard message={message} status={status} txId={txId} />
    </div>
  );
}

function TinymanUnwrapStatusCard({
  message,
  status,
  txId
}: {
  message: string | null;
  status: TinymanUnwrapStatus;
  txId: string | null;
}) {
  if (status === "idle" && !message) {
    return null;
  }

  const isLoading = activeTinymanUnwrapStatuses.includes(status);
  const Icon = status === "confirmed" ? CheckCircle2 : status === "error" ? XCircle : Loader2;
  const detail = message ?? tinymanUnwrapCopy[status].detail;

  return (
    <motion.div
      className={cn("mt-3 rounded-lg border p-3", getTinymanUnwrapStatusClass(status))}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/20">
          <Icon className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black">{tinymanUnwrapCopy[status].label}</p>
          <p className="mt-1 break-words text-xs leading-5 opacity-75">{detail}</p>
          {status === "confirmed" && txId && (
            <div className="mt-2 space-y-1">
              <p className="break-all text-[11px] font-bold text-emerald-100/80">TxID: {txId}</p>
              <a
                className="inline-flex text-[11px] font-black text-emerald-100 underline decoration-emerald-200/40 underline-offset-4 hover:text-white"
                href={`https://explorer.perawallet.app/tx/${txId}`}
                rel="noreferrer"
                target="_blank"
              >
                View on Pera Explorer
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PoolTransactionHistoryPanel({
  connectedAddress,
  poolTransactionHistory
}: {
  connectedAddress?: string | null;
  poolTransactionHistory?: {
    error: string | null;
    isLoading: boolean;
    transactions: OraPoolTransactionSummary[];
  };
}) {
  const isLoading = poolTransactionHistory?.isLoading ?? false;
  const error = poolTransactionHistory?.error ?? null;
  const transactions = poolTransactionHistory?.transactions ?? [];

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase text-cyan-200">Pool Transaction History</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Recent OrangeMiner app calls involving the connected wallet, with group and inner transaction details.
          </p>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-black text-slate-300">
          {connectedAddress ? shortenAddress(connectedAddress) : "Wallet needed"}
        </span>
      </div>

      {!connectedAddress && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs font-semibold leading-5 text-slate-400">
          Connect your wallet to inspect your OrangeMiner deposit and withdrawal history.
        </p>
      )}

      {connectedAddress && isLoading && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs font-semibold leading-5 text-slate-400">
          Loading pool transaction history...
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-300/25 bg-red-400/[0.1] p-3 text-xs font-semibold leading-5 text-red-100">
          {error}
        </p>
      )}

      {connectedAddress && !isLoading && !error && transactions.length === 0 && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs font-semibold leading-5 text-slate-400">
          No recent OrangeMiner app transactions were found for this wallet.
        </p>
      )}

      {transactions.length > 0 && (
        <div className="mt-3 space-y-3">
          {transactions.map((transaction) => (
            <div key={transaction.txId} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-black text-white">{transaction.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {transaction.round} · {transaction.time} · fee {transaction.fee}
                  </p>
                </div>
                <a
                  href={transaction.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit rounded-md border border-ora-300/25 bg-ora-400/[0.1] px-2.5 py-1 text-xs font-black text-ora-100 transition hover:border-ora-200/50"
                >
                  Pera Explorer
                </a>
              </div>

              <div className="mt-3 grid gap-2 text-[11px] font-semibold text-slate-500 sm:grid-cols-2">
                <p className="break-all">TxID: {transaction.txId}</p>
                <p className="break-all">Group: {transaction.groupId ?? "--"}</p>
                <p className="break-all">Args: {transaction.appArgs.join(", ") || "--"}</p>
                <p className="break-all">Assets: {transaction.foreignAssets.join(", ") || "--"}</p>
                <p className="break-all">Apps: {transaction.foreignApps.join(", ") || "--"}</p>
                <p className="break-all">
                  Boxes: {transaction.boxes.map((box) => `app ${box.app}:${box.nameBase64}`).join(", ") || "--"}
                </p>
              </div>

              <RelatedTransactions title="Group transactions" transactions={transaction.groupTransactions} />
              <RelatedTransactions title="Inner transactions" transactions={transaction.innerTransactions} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PoolBoxDebugPanel({
  connectedAddress,
  poolWalletData
}: {
  connectedAddress?: string | null;
  poolWalletData?: {
    data: OraPoolWalletData | null;
    error: string | null;
    isLoading: boolean;
  };
}) {
  const data = poolWalletData?.data ?? null;
  const isLoading = poolWalletData?.isLoading ?? false;
  const error = poolWalletData?.error ?? null;
  const box = data?.box ?? null;
  const localStateKeyCount = data ? Object.keys(data.poolLocalState).length : 0;

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase text-cyan-200">Raw Box Debug</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Raw connected-wallet OrangeMiner box data. Values are not treated as product-ready accounting.
          </p>
        </div>
        <span className="w-fit rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-black text-slate-300">
          {connectedAddress ? shortenAddress(connectedAddress) : "Wallet needed"}
        </span>
      </div>

      {!connectedAddress && (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs font-semibold leading-5 text-slate-400">
          Connect your wallet to inspect the OrangeMiner box.
        </p>
      )}

      {connectedAddress && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <PreviewMetric
              label="Pool local state"
              value={isLoading ? "Loading..." : data?.hasPoolLocalState ? `Found (${localStateKeyCount})` : "None"}
            />
            <PreviewMetric
              label="Box bytes"
              value={isLoading ? "Loading..." : box ? formatInteger(box.valueByteLength) : "--"}
            />
            <PreviewMetric
              label="Decoded u64 fields"
              value={isLoading ? "Loading..." : box ? formatInteger(box.uint64Fields.length) : "--"}
            />
          </div>

          {data?.boxFound && (
            <div className="mt-3 space-y-3">
              <div className="break-all rounded-lg border border-white/10 bg-white/[0.035] p-3 text-[11px] font-semibold leading-5 text-slate-500">
                <p>Box key hex: {data.boxNameHex}</p>
                <p className="mt-1">Box key base64: {data.boxNameBase64}</p>
              </div>
              {box && (
                <>
                  <div className="break-all rounded-lg border border-white/10 bg-black/25 p-3 text-[11px] font-semibold leading-5 text-slate-500">
                    <p className="text-slate-300">Raw box bytes</p>
                    <p className="mt-2">hex: {box.rawHex}</p>
                    <p className="mt-2">base64: {box.rawBase64}</p>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-white/10">
                    <div className="grid grid-cols-[0.7fr_0.9fr_1.4fr_1.4fr] bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase text-slate-500">
                      <span>Index</span>
                      <span>Offset</span>
                      <span>Hex</span>
                      <span>Uint64</span>
                    </div>
                    <div className="max-h-48 overflow-auto">
                      {box.uint64Fields.map((field) => (
                        <div
                          key={`${field.index}-${field.offset}`}
                          className="grid grid-cols-[0.7fr_0.9fr_1.4fr_1.4fr] border-t border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-400"
                        >
                          <span>{field.index}</span>
                          <span>{field.offset}</span>
                          <span className="break-all">{field.hex}</span>
                          <span className="break-all">{field.uint}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-red-300/25 bg-red-400/[0.1] p-3 text-xs font-semibold leading-5 text-red-100">
              {error}
            </p>
          )}

          {!isLoading && !error && data && !data.boxFound && (
            <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-400/[0.1] p-3 text-xs font-semibold leading-5 text-amber-100">
              No OrangeMiner deposit box was found for this connected wallet yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PoolWithdrawalResearchPanel({
  poolWithdrawalResearch
}: {
  poolWithdrawalResearch?: OraPoolWithdrawalResearch;
}) {
  if (!poolWithdrawalResearch) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-black uppercase text-cyan-200">Withdrawal Research</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Observed on-chain structure for selector 466yXA==. Withdrawal is not implemented yet.
          </p>
        </div>
        <span className="w-fit rounded-md border border-amber-300/25 bg-amber-400/[0.12] px-2.5 py-1 text-xs font-black text-amber-100">
          Read-only
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PreviewMetric label="Selector" value={poolWithdrawalResearch.selector} />
        <PreviewMetric label="Observed fee" value={poolWithdrawalResearch.fee} />
        <PreviewMetric label="App args" value={poolWithdrawalResearch.appArgs.join(", ")} />
        <PreviewMetric label="Decoded uint64 args" value={poolWithdrawalResearch.decodedUint64Args.join(", ")} />
        <PreviewMetric label="Foreign assets" value={poolWithdrawalResearch.foreignAssets.join(", ") || "--"} />
        <PreviewMetric label="Foreign apps" value={poolWithdrawalResearch.foreignApps.join(", ") || "--"} />
        <PreviewMetric label="Accounts" value={poolWithdrawalResearch.accounts.join(", ") || "--"} />
        <PreviewMetric
          label="Required box"
          value={poolWithdrawalResearch.requiredBoxes
            .map((box) => `app ${box.app}:${box.nameBase64}`)
            .join(", ")}
        />
      </div>

      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs font-semibold leading-5 text-slate-400">
        {poolWithdrawalResearch.expectedResult}
      </p>
    </div>
  );
}

function RelatedTransactions({
  title,
  transactions
}: {
  title: string;
  transactions: OraPoolRelatedTransaction[];
}) {
  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/20">
      <p className="border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase text-slate-500">{title}</p>
      <div className="divide-y divide-white/10">
        {transactions.map((transaction, index) => (
          <div
            key={`${title}-${transaction.txId ?? index}-${transaction.type}`}
            className="grid gap-1 px-3 py-2 text-[11px] font-semibold text-slate-500 sm:grid-cols-[0.7fr_1fr_1fr_1fr]"
          >
            <span className="font-black text-slate-300">{transaction.type}</span>
            <span className="break-all">{transaction.amount ?? "--"}</span>
            <span className="break-all">{transaction.assetId ? `ASA ${transaction.assetId}` : transaction.receiver ?? "--"}</span>
            <span className="break-all">{transaction.txId ?? "--"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvancedPoolResearchAccordion({
  connectedAddress,
  onTinymanUnwrap,
  onWithdrawClaim,
  poolTransactionHistory,
  poolWalletData,
  poolWithdrawalResearch,
  poolWithdrawMessage,
  poolWithdrawStatus,
  poolWithdrawTxId,
  tinymanUnwrapMessage,
  tinymanUnwrapPreview,
  tinymanUnwrapStatus,
  tinymanUnwrapTxId
}: {
  connectedAddress?: string | null;
  onTinymanUnwrap: () => void;
  onWithdrawClaim: () => void;
  poolTransactionHistory?: {
    error: string | null;
    isLoading: boolean;
    transactions: OraPoolTransactionSummary[];
  };
  poolWalletData?: {
    data: OraPoolWalletData | null;
    error: string | null;
    isLoading: boolean;
  };
  poolWithdrawalResearch?: OraPoolWithdrawalResearch;
  poolWithdrawMessage: string | null;
  poolWithdrawStatus: PoolWithdrawStatus;
  poolWithdrawTxId: string | null;
  tinymanUnwrapMessage: string | null;
  tinymanUnwrapPreview?: {
    data: TinymanOraAlgoUnwrapQuote | null;
    error: string | null;
    isLoading: boolean;
  };
  tinymanUnwrapStatus: TinymanUnwrapStatus;
  tinymanUnwrapTxId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isPoolWithdrawBusy = activePoolWithdrawStatuses.includes(poolWithdrawStatus);

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-white/[0.035]"
      >
        <div>
          <p className="text-xs font-black uppercase text-slate-500">Advanced</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Advanced LP-only claim controls, raw box bytes, transaction history, and withdrawal method research.
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeInOut" }}
          >
            <div className="space-y-4 border-t border-white/10 p-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-400">Advanced: Claim LP only</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                      Fallback path. Claims TMPOOL2 LP without auto-converting through Tinyman.
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    onClick={onWithdrawClaim}
                    disabled={isPoolWithdrawBusy || !connectedAddress}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-black text-slate-300 transition hover:border-ora-300/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    whileHover={isPoolWithdrawBusy || !connectedAddress ? undefined : { y: -1, scale: 1.005 }}
                    whileTap={isPoolWithdrawBusy || !connectedAddress ? undefined : { scale: 0.97 }}
                  >
                    {isPoolWithdrawBusy ? "Claiming..." : "Advanced: Claim LP only"}
                  </motion.button>
                </div>
                <PoolWithdrawStatusCard message={poolWithdrawMessage} status={poolWithdrawStatus} txId={poolWithdrawTxId} />
              </div>

              <TinymanUnwrapPreviewPanel
                connectedAddress={connectedAddress}
                message={tinymanUnwrapMessage}
                onUnwrap={onTinymanUnwrap}
                poolWalletData={poolWalletData}
                status={tinymanUnwrapStatus}
                tinymanUnwrapPreview={tinymanUnwrapPreview}
                txId={tinymanUnwrapTxId}
              />
              <PoolBoxDebugPanel connectedAddress={connectedAddress} poolWalletData={poolWalletData} />
              <PoolTransactionHistoryPanel connectedAddress={connectedAddress} poolTransactionHistory={poolTransactionHistory} />
              <PoolWithdrawalResearchPanel poolWithdrawalResearch={poolWithdrawalResearch} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AutoPoolMiningButton({
  isBusy,
  isDisabled,
  label,
  onStart
}: {
  isBusy: boolean;
  isDisabled: boolean;
  label?: string;
  onStart: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onStart}
      disabled={isDisabled}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,#ffd166,#ff8100_48%,#ff4f00)] px-5 py-4 text-base font-black text-ink-950 shadow-glow transition hover:shadow-glow-strong disabled:cursor-not-allowed disabled:opacity-85"
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
    >
      {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Flame className="h-5 w-5 fill-current" />}
      {label ?? "Start Auto Pool Mining"}
    </motion.button>
  );
}

function JuicePreview({
  currentMinerEffort,
  fee,
  feeMicroAlgo,
  isHighFeeConfirmed,
  onConfirmHighFee
}: {
  currentMinerEffort?: bigint;
  fee: string;
  feeMicroAlgo: bigint | null;
  isHighFeeConfirmed: boolean;
  onConfirmHighFee: () => void;
}) {
  const comparison = getMinerEffortComparison(feeMicroAlgo, currentMinerEffort);
  const feeSafety = getFeeSafety(feeMicroAlgo, isHighFeeConfirmed);

  return (
    <div className="mt-5 rounded-lg border border-ora-300/20 bg-ora-400/[0.055] p-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase text-ora-300">Juice Preview</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
            This transaction adds mining effort. It does not guarantee an immediate ORA payout.
          </p>
        </div>
        <span className={cn("w-fit rounded-md border px-2.5 py-1 text-xs font-black", comparison.className)}>
          {comparison.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PreviewMetric label="Fee" value={feeMicroAlgo === null ? fee || "--" : `${formatUnits(feeMicroAlgo, 6, { maximumFractionDigits: 6 })} ALGO`} />
        <PreviewMetric label="Fee microAlgos" value={feeMicroAlgo === null ? "--" : formatInteger(feeMicroAlgo)} />
        <PreviewMetric
          label="Estimated effort added"
          value={feeMicroAlgo === null ? "--" : `${formatUnits(feeMicroAlgo, 6, { maximumFractionDigits: 6 })} ALGO`}
        />
        <PreviewMetric
          label="Current miner effort"
          value={currentMinerEffort === undefined ? "Loading..." : `${formatMicroAlgos(currentMinerEffort)} ALGO`}
        />
      </div>

      <FeeSafetyNotice feeSafety={feeSafety} onConfirmHighFee={onConfirmHighFee} />
    </div>
  );
}

function BeatCurrentMinerSuggestion({
  beatPlan,
  onApply
}: {
  beatPlan: ReturnType<typeof getBeatCurrentMinerPlan>;
  onApply: (fee: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase text-ora-300">Beat Current Miner</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">
          {beatPlan === null ? "Waiting for current miner effort" : beatPlan.detail}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (beatPlan !== null) {
            onApply(formatMicroAlgosForInput(beatPlan.applyFeeMicroAlgo));
          }
        }}
        disabled={beatPlan === null}
        className="rounded-lg border border-ora-300/25 bg-ora-400/[0.09] px-3 py-2 text-xs font-black text-ora-100 transition hover:border-ora-200/60 hover:bg-ora-400/[0.16] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.035] disabled:text-slate-500"
      >
        {beatPlan?.buttonLabel ?? "Apply"}
      </button>
    </div>
  );
}

function FeeSafetyNotice({
  feeSafety,
  onConfirmHighFee
}: {
  feeSafety: ReturnType<typeof getFeeSafety>;
  onConfirmHighFee: () => void;
}) {
  if (feeSafety.tone === "normal") {
    return null;
  }

  return (
    <div className={cn("mt-3 rounded-lg border p-3", feeSafety.className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase">{feeSafety.title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{feeSafety.detail}</p>
        </div>
        {feeSafety.requiresConfirmation && (
          <button
            type="button"
            onClick={onConfirmHighFee}
            className="shrink-0 rounded-lg border border-amber-200/35 bg-amber-300/15 px-3 py-2 text-xs font-black text-amber-100 transition hover:border-amber-100/60 hover:bg-amber-300/25"
          >
            Confirm high fee
          </button>
        )}
      </div>
    </div>
  );
}

function PoolDepositSafetyNotice({
  depositSafety,
  onConfirmHighDeposit
}: {
  depositSafety: ReturnType<typeof getPoolDepositSafety>;
  onConfirmHighDeposit: () => void;
}) {
  if (depositSafety.tone === "normal") {
    return null;
  }

  return (
    <div className={cn("mt-3 rounded-lg border p-3", depositSafety.className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase">{depositSafety.title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{depositSafety.detail}</p>
        </div>
        {depositSafety.requiresConfirmation && (
          <button
            type="button"
            onClick={onConfirmHighDeposit}
            className="shrink-0 rounded-lg border border-amber-200/35 bg-amber-300/15 px-3 py-2 text-xs font-black text-amber-100 transition hover:border-amber-100/60 hover:bg-amber-300/25"
          >
            Confirm deposit
          </button>
        )}
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-white">{value}</p>
    </div>
  );
}

function getMinerEffortComparison(feeMicroAlgo: bigint | null, currentMinerEffort?: bigint) {
  if (feeMicroAlgo === null) {
    return {
      className: "border-slate-400/20 bg-slate-400/10 text-slate-300",
      label: "Invalid fee"
    };
  }

  if (currentMinerEffort === undefined) {
    return {
      className: "border-slate-400/20 bg-slate-400/10 text-slate-300",
      label: "Waiting for miner effort"
    };
  }

  if (feeMicroAlgo > currentMinerEffort) {
    return {
      className: "border-emerald-300/25 bg-emerald-400/[0.12] text-emerald-100",
      label: "Above current miner effort"
    };
  }

  if (feeMicroAlgo < currentMinerEffort) {
    return {
      className: "border-amber-300/25 bg-amber-400/[0.12] text-amber-100",
      label: "Below current miner effort"
    };
  }

  return {
    className: "border-ora-300/25 bg-ora-400/[0.12] text-ora-100",
    label: "Matches current miner effort"
  };
}

function getFeeSafety(feeMicroAlgo: bigint | null, isHighFeeConfirmed: boolean) {
  if (feeMicroAlgo === null) {
    return {
      className: "border-red-300/25 bg-red-400/[0.1] text-red-100",
      detail: "Enter a valid ALGO amount with up to 6 decimal places.",
      requiresConfirmation: false,
      title: "Invalid fee",
      tone: "error" as const
    };
  }

  if (feeMicroAlgo < MIN_FEE_MICROALGO) {
    return {
      className: "border-red-300/25 bg-red-400/[0.1] text-red-100",
      detail: "Minimum ORA juice fee is 0.002 ALGO because contract inner transactions require more fee.",
      requiresConfirmation: false,
      title: "Fee too low",
      tone: "error" as const
    };
  }

  if (feeMicroAlgo > HARD_MAX_FEE_MICROALGO) {
    return {
      className: "border-red-300/25 bg-red-400/[0.1] text-red-100",
      detail: `Fees above ${HARD_MAX_FEE_LABEL} are blocked by the ORA contract.`,
      requiresConfirmation: false,
      title: "Fee blocked",
      tone: "error" as const
    };
  }

  if (feeMicroAlgo > HIGH_FEE_WARNING_MICROALGO) {
    return {
      className: isHighFeeConfirmed
        ? "border-emerald-300/25 bg-emerald-400/[0.1] text-emerald-100"
        : "border-amber-300/25 bg-amber-400/[0.1] text-amber-100",
      detail: isHighFeeConfirmed
        ? "High fee confirmed. Continue only if you are comfortable spending this fee."
        : "Selected fee is higher than 1 ALGO. Confirm this high-fee preview before continuing.",
      requiresConfirmation: !isHighFeeConfirmed,
      title: isHighFeeConfirmed ? "High fee confirmed" : "High fee warning",
      tone: isHighFeeConfirmed ? ("confirmed" as const) : ("warning" as const)
    };
  }

  return {
    className: "",
    detail: "",
    requiresConfirmation: false,
    title: "",
    tone: "normal" as const
  };
}

function getPoolDepositSafety(depositMicroAlgo: bigint | null, isHighDepositConfirmed: boolean) {
  if (depositMicroAlgo === null) {
    return {
      className: "border-red-300/25 bg-red-400/[0.1] text-red-100",
      detail: "Enter a valid ALGO amount with up to 6 decimal places.",
      requiresConfirmation: false,
      title: "Invalid deposit",
      tone: "error" as const
    };
  }

  if (depositMicroAlgo <= BigInt(0)) {
    return {
      className: "border-red-300/25 bg-red-400/[0.1] text-red-100",
      detail: "Deposit amount must be greater than 0 ALGO.",
      requiresConfirmation: false,
      title: "Deposit too low",
      tone: "error" as const
    };
  }

  if (depositMicroAlgo > POOL_DEPOSIT_MAX_MICROALGO) {
    return {
      className: "border-red-300/25 bg-red-400/[0.1] text-red-100",
      detail: "Deposits above 100 ALGO are blocked for now.",
      requiresConfirmation: false,
      title: "Deposit blocked",
      tone: "error" as const
    };
  }

  if (depositMicroAlgo > POOL_DEPOSIT_WARNING_MICROALGO) {
    return {
      className: isHighDepositConfirmed
        ? "border-emerald-300/25 bg-emerald-400/[0.1] text-emerald-100"
        : "border-amber-300/25 bg-amber-400/[0.1] text-amber-100",
      detail: isHighDepositConfirmed
        ? "High deposit confirmed. Continue only if you are comfortable depositing this ALGO into the official pool."
        : "Deposits above 10 ALGO need an extra confirmation before wallet signing.",
      requiresConfirmation: !isHighDepositConfirmed,
      title: isHighDepositConfirmed ? "High deposit confirmed" : "High deposit warning",
      tone: isHighDepositConfirmed ? ("confirmed" as const) : ("warning" as const)
    };
  }

  return {
    className: "",
    detail: "",
    requiresConfirmation: false,
    title: "",
    tone: "normal" as const
  };
}

function parseAlgoToMicroAlgos(value: string) {
  const trimmedValue = value.trim();

  if (!/^\d+(\.\d{0,6})?$/.test(trimmedValue)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = trimmedValue.split(".");
  const microAlgoText = `${wholePart}${fractionPart.padEnd(6, "0")}`;

  return BigInt(microAlgoText);
}

function getBeatCurrentMinerPlan(currentMinerEffort?: bigint) {
  if (currentMinerEffort === undefined) {
    return null;
  }

  const singleJuiceBeatFee = currentMinerEffort + BEAT_MINER_INCREMENT_MICROALGO;

  if (singleJuiceBeatFee <= HARD_MAX_FEE_MICROALGO) {
    return {
      applyFeeMicroAlgo: singleJuiceBeatFee,
      buttonLabel: "Apply",
      detail: `Beat current miner: ${formatUnits(singleJuiceBeatFee, 6, { maximumFractionDigits: 6 })} ALGO`
    };
  }

  const juicesRequired = ceilDivide(singleJuiceBeatFee, HARD_MAX_FEE_MICROALGO);

  return {
    applyFeeMicroAlgo: HARD_MAX_FEE_MICROALGO,
    buttonLabel: "Use max fee",
    detail: `${juicesRequired.toString()} max-fee juices at ${HARD_MAX_FEE_LABEL} needed to beat current miner.`
  };
}

function ceilDivide(value: bigint, divisor: bigint) {
  return (value + divisor - BigInt(1)) / divisor;
}

function formatMicroAlgosForInput(value: bigint) {
  const whole = value / MICROALGOS_PER_ALGO;
  const fraction = value % MICROALGOS_PER_ALGO;
  const fractionText = fraction.toString().padStart(6, "0").replace(/0+$/, "");

  return fractionText ? `${whole.toString()}.${fractionText}` : whole.toString();
}

function formatPoolTokenBalance(value: bigint | null | undefined) {
  return formatUnits(value ?? BigInt(0), 6, { maximumFractionDigits: 6 });
}

function formatOraReceived(value: bigint | null | undefined) {
  return formatUnits(value ?? BigInt(0), ORA_RECEIVED_DECIMALS, { maximumFractionDigits: 8 });
}

function formatSlippageBps(value: number) {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

function getPoolPositionSummary(transactions: OraPoolTransactionSummary[]) {
  const deposits = transactions.filter((transaction) => transaction.appArgs[0] === "kuA7HA==");
  const depositedMicroAlgos = deposits.reduce((total, transaction) => {
    const payment = transaction.groupTransactions.find((groupTransaction) => groupTransaction.type === "pay");

    return total + parseFormattedAlgoToMicroAlgos(payment?.amount);
  }, BigInt(0));

  if (depositedMicroAlgos > BigInt(0)) {
    return {
      deposited: `${formatMicroAlgos(depositedMicroAlgos)} ALGO`,
      note: "Deposited is derived from observed payment transactions in your OrangeMiner deposit groups."
    };
  }

  return {
    deposited: "Not loaded",
    note: "No reliable connected-wallet deposit payment was found in recent indexed OrangeMiner history."
  };
}

function hasPoolDepositEvidence(data: OraPoolWalletData | null, transactions: OraPoolTransactionSummary[]) {
  if (data?.boxFound || (data?.poolTokenBalance ?? BigInt(0)) > BigInt(0)) {
    return true;
  }

  return transactions.some((transaction) => transaction.appArgs[0] === "kuA7HA==");
}

function formatLastCheckedAt(value: Date | null | undefined, isLoading: boolean) {
  if (isLoading) {
    return "Checking...";
  }

  if (!value) {
    return "Not checked";
  }

  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function parseFormattedAlgoToMicroAlgos(value: string | undefined) {
  if (!value) {
    return BigInt(0);
  }

  const numericValue = value.replace(" ALGO", "").replace(/,/g, "");

  if (!/^\d+(\.\d{0,6})?$/.test(numericValue)) {
    return BigInt(0);
  }

  return parseAlgoToMicroAlgos(numericValue) ?? BigInt(0);
}

async function runOraAppOptInFlow({
  connectedAddress,
  onConfirmed,
  setConfirmedTxId,
  setJuiceKey,
  setParticles,
  setTransactionMessage,
  setTransactionStatus
}: {
  connectedAddress: string;
  onConfirmed: (transactionId: string) => Promise<void> | void;
  setConfirmedTxId: Dispatch<SetStateAction<string | null>>;
  setJuiceKey: Dispatch<SetStateAction<number>>;
  setParticles: Dispatch<SetStateAction<JuiceParticle[]>>;
  setTransactionMessage: Dispatch<SetStateAction<string | null>>;
  setTransactionStatus: Dispatch<SetStateAction<TransactionStatus>>;
}) {
  setJuiceKey((current) => current + 1);
  setTransactionStatus("preparing");
  setTransactionMessage("You need to opt in to the ORA mining app before juicing.");
  setConfirmedTxId(null);

  const unsignedTxn = await buildOraAppOptInTxn({ sender: connectedAddress });
  setTransactionStatus("signing");
  setTransactionMessage("Approve ORA mining app opt-in in Pera Wallet.");

  const wallet = await getPeraWallet();
  const txnsToSign = [
    [{ txn: unsignedTxn, signers: [connectedAddress] }]
  ];
  let signedTxns: Uint8Array[];

  try {
    signedTxns = await wallet.signTransaction(txnsToSign);
  } catch (signError) {    throw new Error(getPeraSigningErrorMessage(signError));
  }

  if (!signedTxns.length) {
    throw new Error("Wallet did not return a signed opt-in transaction.");
  }

  setTransactionStatus("pending");
  setTransactionMessage("Submitting ORA mining app opt-in.");

  let submitResponse: { txId?: string; txid?: string };

  try {
    submitResponse = await algodClient.sendRawTransaction(signedTxns).do() as { txId?: string; txid?: string };
  } catch (submitError) {    throw new Error(getAlgodSubmitErrorMessage(submitError));
  }

  const transactionId = submitResponse.txId ?? submitResponse.txid ?? unsignedTxn.txID();  await algosdk.waitForConfirmation(algodClient, transactionId, 6);

  setParticles([]);
  await onConfirmed(transactionId);
}

async function fetchPoolDepositPreflight({
  depositMicroAlgo,
  sender
}: {
  depositMicroAlgo: bigint;
  sender: string;
}) {
  const account = await algodClient.accountInformation(sender).do();
  const hasPoolTokenOptIn = Boolean(
    account.assets?.some((asset) => Number(asset.assetId) === ORA_POOL_TOKEN_ID)
  );
  const spendableAlgo = account.amount > account.minBalance
    ? account.amount - account.minBalance
    : BigInt(0);
  const depositFeeMicroAlgo = BigInt(ORA_POOL_DEPOSIT_TXN_FEE_MICROALGO * 2);
  const setupMicroAlgo = hasPoolTokenOptIn
    ? BigInt(0)
    : BigInt(ORA_POOL_TOKEN_OPT_IN_MIN_BALANCE_MICROALGO + ORA_POOL_TOKEN_OPT_IN_TXN_FEE_MICROALGO);
  const requiredSpendableMicroAlgo = depositMicroAlgo + depositFeeMicroAlgo + setupMicroAlgo;

  return {
    hasEnoughAlgo: spendableAlgo >= requiredSpendableMicroAlgo,
    hasPoolTokenOptIn
  };
}

async function buildOraAsaOptInTxn(sender: string) {
  if (!algosdk.isValidAddress(sender)) {
    throw new Error("Invalid Algorand sender address.");
  }

  const suggestedParams = await algodClient.getTransactionParams().do();
  const optInParams = {
    ...suggestedParams,
    fee: ORA_ASA_OPT_IN_TXN_FEE_MICROALGO,
    flatFee: true
  };

  const transaction = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    amount: 0,
    assetIndex: ORA_ASA_ID,
    receiver: sender,
    sender,
    suggestedParams: optInParams
  });
  transaction.fee = ORA_ASA_OPT_IN_TXN_FEE_MICROALGO;

  return transaction;
}

function getExactErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getPeraSigningErrorMessage(error: unknown) {
  return `Pera signing failed: ${getExactErrorMessage(error)}. Disconnect and reconnect Pera, then try again.`;
}

function getAlgodSubmitErrorMessage(error: unknown) {
  return `Algorand submit failed: ${getExactErrorMessage(error)}`;
}

function getJuiceErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.startsWith("pera signing failed:") || message.startsWith("algorand submit failed:")) {
      return error.message;
    }

    if (message.includes("reject") || message.includes("cancel") || message.includes("declin")) {
      return "Transaction signing was rejected.";
    }

    if (message.includes("fee")) {
      return error.message;
    }
  }

  return "Juicing transaction failed. Nothing was submitted unless a transaction ID was shown.";
}

function getPoolDepositErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.startsWith("pera signing failed:") || message.startsWith("algorand submit failed:")) {
      return error.message;
    }

    if (message.includes("reject") || message.includes("cancel") || message.includes("declin")) {
      return "Pool deposit signing was rejected.";
    }

    return error.message;
  }

  return "Auto Pool Mining deposit failed. Nothing was submitted unless a transaction ID was shown.";
}

type AutoConvertWalletSnapshot = {
  algoBalance: bigint;
  hasOraOptIn: boolean;
  hasPoolTokenOptIn: boolean;
  lpTokenBalance: bigint;
  minBalance: bigint;
  oraBalance: bigint;
  spendableAlgo: bigint;
};

async function fetchWalletAutoConvertSnapshot(address: string): Promise<AutoConvertWalletSnapshot> {
  const account = await algodClient.accountInformation(address).do();
  const oraHolding = account.assets?.find((asset) => Number(asset.assetId) === TINYMAN_ORA_ASA_ID);
  const poolTokenHolding = account.assets?.find((asset) => Number(asset.assetId) === ORA_POOL_TOKEN_ID);
  const spendableAlgo = account.amount > account.minBalance
    ? account.amount - account.minBalance
    : BigInt(0);

  return {
    algoBalance: account.amount,
    hasOraOptIn: Boolean(oraHolding),
    hasPoolTokenOptIn: Boolean(poolTokenHolding),
    lpTokenBalance: poolTokenHolding?.amount ?? BigInt(0),
    minBalance: account.minBalance,
    oraBalance: oraHolding?.amount ?? BigInt(0),
    spendableAlgo
  };
}

async function signSubmitAndConfirmTransactions({
  connectedAddress,
  logPrefix,
  onSigned,
  transactions
}: {
  connectedAddress: string;
  logPrefix: string;
  onSigned?: () => void;
  transactions: algosdk.Transaction[];
}): Promise<ConfirmedTransactionGroupResult> {
  const wallet = await getPeraWallet();
  const txnsToSign = [
    transactions.map((txn) => ({ txn, signers: [connectedAddress] }))
  ];
  let signedTxns: Uint8Array[];

  try {
    signedTxns = await wallet.signTransaction(txnsToSign);
  } catch (signError) {    throw new Error(getPeraSigningErrorMessage(signError));
  }

  if (signedTxns.length !== transactions.length) {
    throw new Error("Wallet did not return the full signed transaction group.");
  }  onSigned?.();

  let submitResponse: { txId?: string; txid?: string };

  try {
    submitResponse = await algodClient.sendRawTransaction(signedTxns).do() as { txId?: string; txid?: string };
  } catch (submitError) {    throw new Error(getAlgodSubmitErrorMessage(submitError));
  }

  const transactionIds = transactions.map((transaction) => transaction.txID());
  const transactionId = submitResponse.txId ?? submitResponse.txid ?? transactionIds[0]; const confirmationIds = Array.from(new Set([transactionId, ...transactionIds]));
  const confirmations = [];

  for (const confirmationId of confirmationIds) {
    confirmations.push(await algosdk.waitForConfirmation(algodClient, confirmationId, 6));
  }

  const indexerTransactions = await fetchConfirmedTransactionGroupFromIndexer(transactionId, transactionIds, logPrefix);

  return {
    indexerTransactions,
    txId: transactionId,
    txIds: transactionIds
  };
}

async function fetchConfirmedTransactionGroupFromIndexer(
  primaryTxId: string,
  transactionIds: string[],
  logPrefix: string
): Promise<unknown[]> {
  try {
    const primaryLookup = await retryIndexerRequest(
      () => indexerClient.lookupTransactionByID(primaryTxId).do(),
      `${logPrefix} lookup transaction`
    );
    const primaryTransaction = getUnknownValue(getUnknownRecord(primaryLookup), "transaction") ?? primaryLookup;
    const groupId = getTransactionGroupId(primaryTransaction);

    if (!groupId) {      return primaryTransaction ? [primaryTransaction] : [];
    }

    const groupResponse = await retryIndexerRequest(
      () => indexerClient.searchForTransactions().groupid(groupId).limit(32).do(),
      `${logPrefix} lookup group`
    );
    const groupTransactions = getUnknownArray(getUnknownValue(getUnknownRecord(groupResponse), "transactions"))
      .filter((transaction) => {
        const transactionGroupId = getTransactionGroupId(transaction);
        return !transactionGroupId || transactionGroupId === groupId;
      })
      .sort(
        (first, second) =>
          getIndexerTransactionOffset(first) - getIndexerTransactionOffset(second)
      );
    return groupTransactions.length > 0 ? groupTransactions : [primaryTransaction];
  } catch {
    return [];
  }
}

async function retryIndexerRequest<T>(request: () => Promise<T>, label: string, attempts = 5): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await waitForIndexerRetry(attempt * 700);
      }
    }
  }  throw lastError;
}

function waitForIndexerRetry(delayMs: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

function getTransactionGroupId(transaction: unknown) {
  const record = getUnknownRecord(transaction);
  return toBase64TransactionValue(getUnknownValue(record, "group", "groupId", "group-id"));
}

function getIndexerTransactionId(transaction: unknown, index = 0) {
  const record = getUnknownRecord(transaction);
  return String(getUnknownValue(record, "id", "txId", "txid") ?? `transaction-${index}`);
}

function getIndexerTransactionOffset(transaction: unknown) {
  const record = getUnknownRecord(transaction);
  return toNumberValue(getUnknownValue(record, "intraRoundOffset", "intra-round-offset")) ?? 0;
}

function toBase64TransactionValue(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return bytesToBase64Value(value);
  }

  if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) {
    return bytesToBase64Value(Uint8Array.from(value as number[]));
  }

  return null;
}

function bytesToBase64Value(bytes: Uint8Array) {
  let binaryValue = "";

  bytes.forEach((byte) => {
    binaryValue += String.fromCharCode(byte);
  });

  return globalThis.btoa(binaryValue);
}

function getConfirmedTransferAmounts({
  connectedAddress,
  indexerTransactions
}: {
  connectedAddress: string;
  indexerTransactions: unknown[];
}): ConfirmedTransferAmounts {
  if (indexerTransactions.length > 0) {
    const indexerAmounts = extractTransferAmountsFromIndexerTransactions(indexerTransactions, connectedAddress);
    return {
      amounts: indexerAmounts,
      isVerifiedFromIndexer: true
    };
  }
  return {
    amounts: createEmptyReceivedAmounts(),
    isVerifiedFromIndexer: false
  };
}

function createEmptyReceivedAmounts(): ReceivedAmounts {
  return {
    algo: BigInt(0),
    lp: BigInt(0),
    lpSent: BigInt(0),
    ora: BigInt(0)
  };
}

function extractTransferAmountsFromIndexerTransactions(transactions: unknown[], connectedAddress: string): ReceivedAmounts {
  const received = createEmptyReceivedAmounts();
  const seenTransfers = new Set<string>();

  transactions.forEach((transaction, index) => {
    collectIndexerTransferAmounts(transaction, connectedAddress, received, seenTransfers, `tx:${getIndexerTransactionId(transaction, index)}`);
  });

  return received;
}

function collectIndexerTransferAmounts(
  transaction: unknown,
  connectedAddress: string,
  received: ReceivedAmounts,
  seenTransfers: Set<string>,
  path: string
) {
  const record = getUnknownRecord(transaction);

  if (!record) {
    return;
  }

  const foundTopLevelTransfer = addTransferAmountsFromIndexerRecord(record, connectedAddress, received, seenTransfers, path);

  if (!foundTopLevelTransfer) {
    const wrapperRecord = getUnknownRecord(getUnknownValue(record, "txn", "transaction"));
    const transactionRecord = getUnknownRecord(getUnknownValue(wrapperRecord, "txn", "transaction")) ?? wrapperRecord;

    if (transactionRecord) {
      addTransferAmountsFromIndexerRecord(transactionRecord, connectedAddress, received, seenTransfers, `${path}:txn`);
    }
  }

  getUnknownArray(getUnknownValue(record, "inner-txns", "innerTxns", "innerTransactions", "inner-transactions"))
    .forEach((innerTransaction, index) => {
      collectIndexerTransferAmounts(innerTransaction, connectedAddress, received, seenTransfers, `${path}:inner:${index}`);
    });
}

function addTransferAmountsFromIndexerRecord(
  record: Record<string, unknown>,
  connectedAddress: string,
  received: ReceivedAmounts,
  seenTransfers: Set<string>,
  path: string
) {
  let foundTransfer = false;
  const paymentRecord = getUnknownRecord(getUnknownValue(record, "payment-transaction", "paymentTransaction", "payment"));
  const paymentSender = normalizeAlgorandAddress(getUnknownValue(record, "sender", "snd"));
  const paymentReceiver = normalizeAlgorandAddress(
    getUnknownValue(paymentRecord, "receiver", "rcv") ?? getUnknownValue(record, "receiver", "rcv")
  );
  const paymentAmount = toBigIntValue(
    getUnknownValue(paymentRecord, "amount", "amt") ?? getUnknownValue(record, "amount", "amt")
  );

  if (paymentReceiver === connectedAddress && paymentAmount > BigInt(0)) {
    addTransferAmount(received, seenTransfers, "algo", 0, paymentSender, paymentReceiver, paymentAmount, path);
    foundTransfer = true;
  }

  const assetRecord = getUnknownRecord(
    getUnknownValue(record, "asset-transfer-transaction", "assetTransferTransaction", "assetTransfer")
  );
  const assetSender = normalizeAlgorandAddress(
    getUnknownValue(assetRecord, "sender", "snd") ?? getUnknownValue(record, "sender", "snd")
  );
  const assetReceiver = normalizeAlgorandAddress(
    getUnknownValue(assetRecord, "receiver", "arcv", "assetReceiver") ??
      getUnknownValue(record, "receiver", "arcv", "assetReceiver")
  );
  const assetAmount = toBigIntValue(
    getUnknownValue(assetRecord, "amount", "aamt") ?? getUnknownValue(record, "amount", "aamt")
  );
  const assetId = toNumberValue(
    getUnknownValue(assetRecord, "asset-id", "assetId", "assetIndex", "xaid") ??
      getUnknownValue(record, "asset-id", "assetId", "assetIndex", "xaid")
  );

  if (assetAmount <= BigInt(0) || assetId === null) {
    return foundTransfer;
  }

  if (assetReceiver === connectedAddress && assetId === ORA_ASA_ID) {
    addTransferAmount(received, seenTransfers, "ora", assetId, assetSender, assetReceiver, assetAmount, path);
    foundTransfer = true;
  }

  if (assetReceiver === connectedAddress && assetId === ORA_POOL_TOKEN_ID) {
    addTransferAmount(received, seenTransfers, "lp", assetId, assetSender, assetReceiver, assetAmount, path);
    foundTransfer = true;
  }

  if (assetSender === connectedAddress && assetReceiver !== connectedAddress && assetId === ORA_POOL_TOKEN_ID) {
    addTransferAmount(received, seenTransfers, "lpSent", assetId, assetSender, assetReceiver, assetAmount, path);
    foundTransfer = true;
  }

  return foundTransfer;
}

function addTransferAmount(
  received: ReceivedAmounts,
  seenTransfers: Set<string>,
  key: keyof ReceivedAmounts,
  assetId: number,
  sender: string | null,
  receiver: string | null,
  amount: bigint,
  path: string
) {
  const transferKey = `${path}:${key}:${assetId}:${sender ?? ""}:${receiver ?? ""}:${amount.toString()}`;

  if (seenTransfers.has(transferKey)) {
    return;
  }

  seenTransfers.add(transferKey);
  received[key] += amount;
}

function getUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getUnknownArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getUnknownValue(record: Record<string, unknown> | null, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  const foundKey = keys.find((key) => record[key] !== undefined);

  return foundKey ? record[foundKey] : undefined;
}

function normalizeAlgorandAddress(value: unknown) {
  if (typeof value === "string") {
    return algosdk.isValidAddress(value) ? value : null;
  }

  if (value instanceof Uint8Array && value.length === 32) {
    return algosdk.encodeAddress(value);
  }

  if (Array.isArray(value) && value.length === 32 && value.every((item) => Number.isInteger(item))) {
    return algosdk.encodeAddress(new Uint8Array(value as number[]));
  }

  const record = getUnknownRecord(value);
  const publicKey = record?.publicKey;

  if (publicKey instanceof Uint8Array && publicKey.length === 32) {
    return algosdk.encodeAddress(publicKey);
  }

  if (value && typeof value === "object" && "toString" in value) {
    const textValue = String(value);
    return algosdk.isValidAddress(textValue) ? textValue : null;
  }

  return null;
}

function toBigIntValue(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }

  return BigInt(0);
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return null;
}

function getPoolWithdrawErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.startsWith("pera signing failed:") || message.startsWith("algorand submit failed:")) {
      return error.message;
    }

    if (message.includes("reject") || message.includes("cancel") || message.includes("declin")) {
      return "Withdraw/claim signing was rejected.";
    }

    return error.message;
  }

  return "OrangeMiner LP reward claim failed. Nothing was submitted unless a transaction ID was shown.";
}

function getAutoConvertErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.startsWith("pera signing failed:") || message.startsWith("algorand submit failed:")) {
      return error.message;
    }

    if (message.includes("reject") || message.includes("cancel") || message.includes("declin")) {
      return "Auto-convert signing was rejected.";
    }

    return error.message;
  }

  return "Claim ORA auto-convert failed. Nothing was submitted unless transaction IDs were shown.";
}

function getTinymanUnwrapErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.startsWith("pera signing failed:") || message.startsWith("algorand submit failed:")) {
      return error.message;
    }

    if (message.includes("reject") || message.includes("cancel") || message.includes("declin")) {
      return "Tinyman unwrap signing was rejected.";
    }

    return error.message;
  }

  return "Tinyman LP unwrap failed. Nothing was submitted unless a transaction ID was shown.";
}

function getPoolTokenOptInPreview(connectedAddress: string | null | undefined, hasPoolTokenOptIn: boolean | null) {
  if (!connectedAddress) return "Wallet needed";
  if (hasPoolTokenOptIn === null) return "Checking...";
  return hasPoolTokenOptIn ? `Opted in to ASA ${ORA_POOL_TOKEN_ID}` : `Opt-in required for ASA ${ORA_POOL_TOKEN_ID}`;
}

function getAutoPoolMiningButtonLabel(status: TransactionStatus, connectedAddress?: string | null) {
  if (!connectedAddress) return "Connect Wallet First";
  if (status === "preparing") return "Preparing Deposit";
  if (status === "signing") return "Approve Deposit in Pera";
  if (status === "pending") return "Confirming Deposit";
  if (status === "confirmed") return "Deposit Confirmed";
  if (status === "error") return "Retry Auto Pool Deposit";
  return "Start Auto Pool Mining";
}

function getClaimableRewardsButtonLabel({
  connectedAddress,
  hasDepositEvidence,
  isLoading,
  status
}: {
  connectedAddress?: string | null;
  hasDepositEvidence: boolean;
  isLoading: boolean;
  status: AutoConvertStatus;
}) {
  if (!connectedAddress) return "Connect Wallet First";
  if (isLoading) return "Checking Rewards";
  if (!hasDepositEvidence) return "No Rewards to Check";
  if (status === "checking") return "Checking Rewards";
  if (status === "claimSigning") return "Approve Claim in Pera";
  if (status === "claimPending") return "Confirming Claim";
  if (status === "detectingLp") return "Checking Returned Assets";
  if (status === "unwrapSigning") return "Approve Auto-Convert";
  if (status === "unwrapPending") return "Confirming Auto-Convert";
  if (status === "confirmed") return "Check / Claim Rewards Again";
  if (status === "error") return "Retry Check / Claim";
  return "Check / Claim Rewards";
}

function getPoolDepositStatusTitle(status: TransactionStatus) {
  if (status === "preparing") return "Preparing deposit";
  if (status === "signing") return "Wallet signature requested";
  if (status === "pending") return "Waiting for deposit confirmation";
  if (status === "confirmed") return "Deposit confirmed";
  if (status === "preview") return "Review deposit";
  if (status === "error") return "Deposit stopped";
  return "Auto Pool Mining";
}

function getAutoConvertStatusClass(status: AutoConvertStatus) {
  if (status === "confirmed") return "border-emerald-300/30 bg-emerald-400/[0.1] text-emerald-100";
  if (status === "error") return "border-red-300/30 bg-red-400/[0.1] text-red-100";
  if (status === "claimSigning" || status === "unwrapSigning") {
    return "border-cyan-300/30 bg-cyan-400/[0.08] text-cyan-100";
  }
  if (activeAutoConvertStatuses.includes(status)) return "border-ora-300/30 bg-ora-400/[0.08] text-ora-100";
  return "border-white/10 bg-white/[0.035] text-slate-300";
}

function getPoolWithdrawStatusClass(status: PoolWithdrawStatus) {
  if (status === "confirmed") return "border-emerald-300/30 bg-emerald-400/[0.1] text-emerald-100";
  if (status === "error") return "border-red-300/30 bg-red-400/[0.1] text-red-100";
  if (status === "preparing") return "border-ora-300/30 bg-ora-400/[0.08] text-ora-200";
  if (status === "signing") return "border-cyan-300/30 bg-cyan-400/[0.08] text-cyan-100";
  if (status === "pending") return "border-ora-300/30 bg-ora-400/[0.1] text-ora-100";
  return "border-white/10 bg-white/[0.035] text-slate-300";
}

function getTinymanUnwrapButtonLabel(
  status: TinymanUnwrapStatus,
  connectedAddress: string | null | undefined,
  isLoading: boolean,
  quote: TinymanOraAlgoUnwrapQuote | null
) {
  if (!connectedAddress) return "Connect Wallet First";
  if (isLoading) return "Loading Tinyman Quote";
  if (!quote) return "Quote Not Ready";
  if (status === "preparing") return "Preparing Unwrap";
  if (status === "signing") return "Approve in Pera";
  if (status === "pending") return "Confirming on Algorand";
  if (status === "confirmed") return "Unwrap Again";
  if (status === "error") return "Retry Unwrap LP";
  return "Unwrap LP to ORA + ALGO";
}

function getTinymanUnwrapBadgeClass(status: TinymanUnwrapStatus) {
  if (status === "confirmed") return "border-emerald-300/25 bg-emerald-400/[0.12] text-emerald-100";
  if (status === "error") return "border-red-300/25 bg-red-400/[0.12] text-red-100";
  if (activeTinymanUnwrapStatuses.includes(status)) return "border-cyan-300/25 bg-cyan-400/[0.12] text-cyan-100";
  return "border-emerald-300/25 bg-emerald-400/[0.12] text-emerald-100";
}

function getTinymanUnwrapStatusClass(status: TinymanUnwrapStatus) {
  if (status === "confirmed") return "border-emerald-300/30 bg-emerald-400/[0.1] text-emerald-100";
  if (status === "error") return "border-red-300/30 bg-red-400/[0.1] text-red-100";
  if (status === "preparing") return "border-emerald-300/30 bg-emerald-400/[0.08] text-emerald-100";
  if (status === "signing") return "border-cyan-300/30 bg-cyan-400/[0.08] text-cyan-100";
  if (status === "pending") return "border-emerald-300/30 bg-emerald-400/[0.1] text-emerald-100";
  return "border-white/10 bg-white/[0.035] text-slate-300";
}

function ConfirmationBurst({ status, juiceKey }: { status: TransactionStatus; juiceKey: number }) {
  const isConfirmed = status === "confirmed";
  const isError = status === "error";

  return (
    <AnimatePresence>
      {(isConfirmed || isError) && (
        <motion.div
          key={`settlement-${status}-${juiceKey}`}
          className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className={cn(
              "absolute h-24 w-24 rounded-full border",
              isConfirmed
                ? "border-emerald-300/70 shadow-[0_0_34px_rgba(52,211,153,0.48)]"
                : "border-red-300/70 shadow-[0_0_34px_rgba(248,113,113,0.38)]"
            )}
            initial={{ opacity: 0.78, scale: 0.38 }}
            animate={{ opacity: [0.78, 0.36, 0], scale: [0.38, 1.7, 2.35] }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
          <motion.div
            className={cn(
              "grid h-16 w-16 place-items-center rounded-full border bg-ink-950/72 backdrop-blur-sm",
              isConfirmed ? "border-emerald-300/50 text-emerald-200" : "border-red-300/50 text-red-200"
            )}
            initial={{ opacity: 0, scale: 0.74, y: 8 }}
            animate={{ opacity: 1, scale: [0.74, 1.08, 1], y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.36, ease: "easeOut" }}
          >
            {isConfirmed ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChargingEnergyRing({ isJuicing, juiceKey }: { isJuicing: boolean; juiceKey: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <motion.svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="absolute overflow-visible drop-shadow-[0_0_14px_rgba(255,129,0,0.34)]"
        style={{ height: "min(82%, 330px)", width: "min(82%, 330px)" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      >
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,186,91,0.18)" strokeWidth="0.8" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="rgba(255,159,38,0.5)"
          strokeDasharray="28 20 7 18"
          strokeLinecap="round"
          strokeWidth="1.1"
        />
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="rgba(255,129,0,0.3)"
          strokeDasharray="5 13"
          strokeLinecap="round"
          strokeWidth="0.9"
        />
      </motion.svg>

      <AnimatePresence>
        {isJuicing && (
          <motion.svg
            key={`charging-ring-${juiceKey}`}
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="absolute overflow-visible drop-shadow-[0_0_26px_rgba(255,159,38,0.74)]"
            style={{ height: "min(88%, 350px)", width: "min(88%, 350px)" }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: [0, 1, 0.92], scale: [0.96, 1.07, 1.02] }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.32, ease: "easeInOut" }}
          >
            <motion.g
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.25, repeat: Infinity, ease: "linear" }}
            >
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="rgba(255,214,102,0.84)"
                strokeDasharray="34 16 10 18"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <circle
                cx="50"
                cy="50"
                r="35"
                fill="none"
                stroke="rgba(255,129,0,0.7)"
                strokeDasharray="9 10"
                strokeLinecap="round"
                strokeWidth="1.1"
              />
            </motion.g>
            <motion.circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="rgba(255,129,0,0.28)"
              strokeWidth="1"
              animate={{ opacity: [0.2, 0.72, 0.2], scale: [0.98, 1.04, 0.98] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
}

function JuicingField({
  isJuicing,
  juiceKey,
  particles
}: {
  isJuicing: boolean;
  juiceKey: number;
  particles: JuiceParticle[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center overflow-hidden">
      <AnimatePresence>
        {isJuicing && (
          <>
            <motion.div
              key={`juice-glow-${juiceKey}`}
              className="absolute h-[78%] w-[78%] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,190,64,0.42),rgba(255,129,0,0.24)_36%,rgba(255,79,0,0.1)_60%,transparent_76%)]"
              initial={{ opacity: 0, scale: 0.72, filter: "blur(18px)" }}
              animate={{ opacity: [0, 0.95, 0.2], scale: [0.72, 1.2, 1.32], filter: ["blur(18px)", "blur(34px)", "blur(26px)"] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.25, ease: "easeInOut" }}
            />

            <motion.div
              key={`juice-ring-${juiceKey}`}
              className="absolute h-[72%] w-[72%] rounded-full border border-ora-300/40 border-t-ora-100 border-r-ora-300 shadow-[0_0_34px_rgba(255,129,0,0.46)]"
              initial={{ opacity: 0, rotate: 0, scale: 0.88 }}
              animate={{ opacity: [0, 0.92, 0], rotate: 420, scale: [0.88, 1.12, 1.2] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.22, ease: "easeInOut" }}
            />

            <motion.div
              key={`juice-ring-dashed-${juiceKey}`}
              className="absolute h-[56%] w-[56%] rounded-full border border-dashed border-ora-200/45 shadow-[0_0_22px_rgba(255,177,62,0.44)]"
              initial={{ opacity: 0, rotate: 0, scale: 0.82 }}
              animate={{ opacity: [0, 0.72, 0], rotate: -360, scale: [0.82, 1.05, 1.14] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.18, ease: "easeInOut" }}
            />

            <motion.div
              key={`juice-wave-${juiceKey}`}
              className="absolute h-24 w-24 rounded-full border border-ora-200/70 shadow-[0_0_28px_rgba(255,177,62,0.5)]"
              initial={{ opacity: 0.8, scale: 0.32 }}
              animate={{ opacity: [0.8, 0.45, 0], scale: [0.32, 2.35, 3.25] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.05, ease: "easeInOut" }}
            />

            {particles.map((particle) => (
              <motion.span
                key={`juice-particle-${juiceKey}-${particle.id}`}
                className="absolute rounded-full bg-ora-300 shadow-[0_0_12px_rgba(255,166,48,0.9)]"
                style={{
                  height: particle.size,
                  left: "50%",
                  marginLeft: -particle.size / 2,
                  marginTop: -particle.size / 2,
                  top: "50%",
                  width: particle.size
                }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.2 }}
                animate={{
                  x: particle.x,
                  y: particle.y,
                  opacity: [0, 1, 0],
                  scale: [0.2, 1.2, 0.4]
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.82, delay: particle.delay, ease: "easeOut" }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
