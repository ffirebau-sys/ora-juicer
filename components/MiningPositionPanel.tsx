import { Crown, Target, Trophy, Zap } from "lucide-react";
import { Card } from "@/components/Card";
import { formatInteger, formatMicroAlgos, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

type MiningPositionPanelProps = {
  connectedAddress: string | null;
  currentMinerAddress?: string;
  currentMinerEffort?: bigint;
  hasMiningState?: boolean;
  isLoading?: boolean;
  isWalletConnected: boolean;
  walletEffort?: bigint;
};

const MAX_JUICE_FEE_MICROALGO = BigInt(20_000);
const MIN_WIN_INCREMENT_MICROALGO = BigInt(1_000);

export function MiningPositionPanel({
  connectedAddress,
  currentMinerAddress,
  currentMinerEffort,
  hasMiningState,
  isLoading,
  isWalletConnected,
  walletEffort
}: MiningPositionPanelProps) {
  const hasWalletMiningState = isWalletConnected && hasMiningState;
  const myEffort = hasWalletMiningState ? walletEffort ?? BigInt(0) : null;
  const gap = myEffort !== null && currentMinerEffort !== undefined ? currentMinerEffort - myEffort : null;
  const normalizedConnectedAddress = connectedAddress?.toLowerCase();
  const isConnectedWalletWinning =
    Boolean(normalizedConnectedAddress && currentMinerAddress?.toLowerCase() === normalizedConnectedAddress);
  const isLeading = isConnectedWalletWinning || (gap !== null && gap <= BigInt(0));
  const juicesNeeded = gap !== null && gap > BigInt(0)
    ? ceilDivide(gap + MIN_WIN_INCREMENT_MICROALGO, MAX_JUICE_FEE_MICROALGO)
    : BigInt(0);

  const statusText = getStatusText({ gap, hasWalletMiningState, isConnectedWalletWinning, isLoading, isWalletConnected });
  const winningAddress = currentMinerAddress ? shortenAddress(currentMinerAddress) : isLoading ? "Loading..." : "--";

  return (
    <Card className="p-5" glow={isConnectedWalletWinning}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-ora-300">Mining Position</p>
          <h3 className="mt-1 text-xl font-black text-white">Leader check</h3>
        </div>
        <div
          className={cn(
            "grid h-11 w-11 place-items-center rounded-lg border",
            isConnectedWalletWinning
              ? "border-emerald-300/35 bg-emerald-400/[0.14] text-emerald-200"
              : "border-ora-300/25 bg-ora-400/[0.12] text-ora-300"
          )}
        >
          {isConnectedWalletWinning ? <Trophy className="h-5 w-5" /> : <Target className="h-5 w-5" />}
        </div>
      </div>

      <div
        className={cn(
          "mb-4 rounded-lg border p-3",
          isLeading
            ? "border-emerald-300/25 bg-emerald-400/[0.1] text-emerald-100"
            : "border-ora-300/25 bg-ora-400/[0.08] text-ora-100"
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/20">
            {isLeading ? <Crown className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-black">{statusText}</p>
            <p className="mt-1 text-xs font-semibold leading-5 opacity-75">
              ORA rewards go to the current leader according to the ORA contract rules.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <MiningPositionMetric
          label="My cumulative effort"
          value={isLoading ? "Loading..." : myEffort === null ? "-- ALGO" : `${formatMicroAlgos(myEffort)} ALGO`}
        />
        <MiningPositionMetric
          label="Current miner effort"
          value={currentMinerEffort === undefined ? (isLoading ? "Loading..." : "-- ALGO") : `${formatMicroAlgos(currentMinerEffort)} ALGO`}
        />
        <MiningPositionMetric
          label="Gap"
          value={gap === null ? "-- ALGO" : `${formatMicroAlgos(gap > BigInt(0) ? gap : BigInt(0))} ALGO`}
        />
        <MiningPositionMetric
          label="Estimated juices to win"
          value={gap === null ? "--" : `${formatInteger(juicesNeeded)} max-fee juice${juicesNeeded === BigInt(1) ? "" : "s"}`}
        />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-slate-300">Current winning address</p>
          <div className="text-right">
            <p className="text-sm font-black text-white">{winningAddress}</p>
            {isConnectedWalletWinning && (
              <p className="mt-1 text-[11px] font-black uppercase text-emerald-200">Connected wallet</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MiningPositionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <p className="text-sm font-semibold text-slate-300">{label}</p>
      <p className="text-right text-sm font-black text-white">{value}</p>
    </div>
  );
}

function getStatusText({
  gap,
  hasWalletMiningState,
  isConnectedWalletWinning,
  isLoading,
  isWalletConnected
}: {
  gap: bigint | null;
  hasWalletMiningState?: boolean;
  isConnectedWalletWinning: boolean;
  isLoading?: boolean;
  isWalletConnected: boolean;
}) {
  if (!isWalletConnected) {
    return "Connect your wallet to see if you are winning";
  }

  if (isLoading) {
    return "Checking mining position";
  }

  if (!hasWalletMiningState) {
    return "No ORA mining state found";
  }

  if (isConnectedWalletWinning || (gap !== null && gap <= BigInt(0))) {
    return "You are currently leading";
  }

  return gap === null ? "Mining position unavailable" : `You are behind by ${formatMicroAlgos(gap)} ALGO`;
}

function ceilDivide(value: bigint, divisor: bigint) {
  return (value + divisor - BigInt(1)) / divisor;
}
