import { Crown, ExternalLink, Trophy } from "lucide-react";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";

type CurrentLeader = {
  address: string;
  effort: string;
  streak: string;
};

type TopJuicer = {
  rank: number;
  address: string;
  effort: string;
};

type RecentWinner = {
  rank: number;
  reward: string;
  time: string;
};

type RecentJuicingTransaction = {
  fee: string;
  round: string;
  sender: string;
  time: string;
};

type LeaderboardSectionProps = {
  currentLeader: CurrentLeader;
  isRecentLoading?: boolean;
  recentError?: string | null;
  recentJuicingTransactions?: RecentJuicingTransaction[];
  topJuicers: TopJuicer[];
  recentWinners: RecentWinner[];
};

export function LeaderboardSection({
  currentLeader,
  isRecentLoading,
  recentError,
  recentJuicingTransactions = [],
  topJuicers,
  recentWinners
}: LeaderboardSectionProps) {
  const hasLiveJuicingTransactions = recentJuicingTransactions.length > 0;

  return (
    <section id="leaderboard" className="scroll-mt-24 space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ora-300">Leaderboard</p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Network leaders</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">
          Track the highest-effort juicers. ORA rewards follow the contract and go to the current leader.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr_1fr]">
        <Card className="p-5 lg:p-6" glow>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-ora-300">Current Leader</p>
              <h3 className="mt-1 text-xl font-black text-white">{currentLeader.address}</h3>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-yellow-300/[0.15] text-yellow-300 shadow-[0_0_26px_rgba(253,224,71,0.32)]">
              <Crown className="h-6 w-6 fill-current" />
            </div>
          </div>

          <div className="mt-7 grid place-items-center rounded-lg border border-yellow-300/20 bg-[radial-gradient(circle_at_center,rgba(253,224,71,0.2),rgba(255,129,0,0.08),transparent_68%)] p-8">
            <Trophy className="h-16 w-16 text-yellow-300 drop-shadow-[0_0_18px_rgba(253,224,71,0.7)]" />
            <p className="mt-4 text-3xl font-black text-white">{currentLeader.effort}</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">{currentLeader.streak}</p>
          </div>
        </Card>

        <Card className="p-5 lg:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-ora-300">Top Juicers</p>
              <h3 className="mt-1 text-xl font-black text-white">Effort leaders</h3>
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-ora-300/40 hover:text-white">
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
          <DataTable
            data={topJuicers}
            columns={[
              {
                key: "rank",
                label: "Rank",
                render: (item) => <span className="font-black text-ora-300">#{item.rank}</span>
              },
              { key: "address", label: "Address" },
              { key: "effort", label: "Effort", align: "right" }
            ]}
          />
        </Card>

        <Card className="p-5 lg:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-ora-300">
                {hasLiveJuicingTransactions ? "Recent Juicing" : "Recent Winners"}
              </p>
              <h3 className="mt-1 text-xl font-black text-white">
                {hasLiveJuicingTransactions ? "Application calls" : "Reward history"}
              </h3>
              {(isRecentLoading || recentError) && (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {isRecentLoading ? "Loading live Indexer data..." : "Live calls unavailable. Showing fallback."}
                </p>
              )}
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-ora-300/40 hover:text-white">
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
          {hasLiveJuicingTransactions ? (
            <DataTable
              data={recentJuicingTransactions}
              columns={[
                { key: "sender", label: "Sender" },
                { key: "fee", label: "Fee", align: "right" },
                { key: "time", label: "Time", align: "right" }
              ]}
            />
          ) : (
            <DataTable
              data={recentWinners}
              columns={[
                {
                  key: "rank",
                  label: "Rank",
                  render: (item) => <span className="font-black text-ora-300">#{item.rank}</span>
                },
                { key: "reward", label: "Reward", align: "right" },
                { key: "time", label: "Time", align: "right" }
              ]}
            />
          )}
        </Card>
      </div>
    </section>
  );
}
