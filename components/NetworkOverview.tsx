import { Activity, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/Card";

type NetworkMetric = {
  label: string;
  value: string;
  trend: string;
};

type NetworkOverviewProps = {
  metrics: NetworkMetric[];
  status?: {
    error?: string | null;
    isLoading?: boolean;
  };
};

export function NetworkOverview({ metrics, status }: NetworkOverviewProps) {
  return (
    <Card className="h-full p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-ora-300">Network Overview</p>
          <h3 className="mt-1 text-lg font-black text-white">ORA pulse</h3>
          {(status?.isLoading || status?.error) && (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {status.isLoading ? "Loading live Algorand data..." : "Live query failed. Showing fallback values."}
            </p>
          )}
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-ora-400/[0.15] text-ora-300 shadow-glow">
          <Activity className="h-5 w-5" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-white/10 bg-white/[0.04] p-3 transition hover:border-ora-300/[0.35] hover:bg-white/[0.065]"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-400">{metric.label}</p>
                <p className="mt-1 text-xl font-black text-white">{metric.value}</p>
              </div>
              <span className="inline-flex w-fit items-center gap-1 rounded-md bg-ora-400/[0.08] px-2 py-1 text-xs font-bold text-ora-300 sm:bg-transparent sm:px-0 sm:py-0">
                {metric.trend}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
