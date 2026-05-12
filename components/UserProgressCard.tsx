import { LockKeyhole } from "lucide-react";
import { Card } from "@/components/Card";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

type ProgressMetric = {
  label: string;
  value: string;
};

type UserProgressCardProps = {
  connectedAddress: string | null;
  error?: string | null;
  isLoading?: boolean;
  isWalletConnected: boolean;
  metrics: ProgressMetric[];
  nextReward: string;
  notice?: string | null;
};

export function UserProgressCard({
  connectedAddress,
  error,
  isLoading,
  isWalletConnected,
  metrics,
  nextReward,
  notice
}: UserProgressCardProps) {
  return (
    <Card className="h-full p-5">
      <div className="mb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-ora-300">Your Progress</p>
          <h3 className="mt-1 text-xl font-black text-white">Wallet snapshot</h3>
        </div>
      </div>

      {isWalletConnected && connectedAddress ? (
        <div className="mb-4 rounded-lg border border-ora-300/25 bg-ora-400/[0.08] px-3 py-2.5 text-sm font-black text-ora-100">
          <span>{shortenAddress(connectedAddress)}</span>
          {(isLoading || error || notice) && (
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {isLoading ? "Loading wallet data..." : error ? "Wallet query failed. Showing fallback values." : notice}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm font-semibold text-slate-400">
          Connect your wallet to view your mining progress
        </div>
      )}

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={cn(
              "flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-3",
              !isWalletConnected && "text-slate-500"
            )}
          >
            <div className="flex items-center gap-3">
              {!isWalletConnected && (
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-ora-400/[0.12] text-ora-300/80">
                  <LockKeyhole className="h-4 w-4" />
                </span>
              )}
              <p className="text-sm font-semibold text-slate-300">{metric.label}</p>
            </div>
            <p className={cn("text-sm font-black text-white", !isWalletConnected && "text-slate-500")}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-ora-300/20 bg-[linear-gradient(135deg,rgba(255,129,0,0.16),rgba(255,255,255,0.04))] p-4">
        <p className="text-xs font-bold uppercase text-ora-200">Reward Status</p>
        <p className={cn("mt-2 text-2xl font-black text-white", !isWalletConnected && "text-slate-500")}>
          {nextReward}
        </p>
      </div>
    </Card>
  );
}
