import { Coins, Database, LineChart } from "lucide-react";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";

type GlobalStat = {
  label: string;
  value: string;
  tone: string;
};

type GlobalStatsProps = {
  stats: GlobalStat[];
};

const toneStyles: Record<string, string> = {
  yellow: "text-yellow-300 bg-yellow-300/[0.12] border-yellow-300/20",
  orange: "text-ora-300 bg-ora-400/[0.12] border-ora-300/20",
  red: "text-red-300 bg-red-400/[0.12] border-red-300/20"
};

const icons = [Database, Coins, LineChart];

export function GlobalStats({ stats }: GlobalStatsProps) {
  return (
    <div className={cn("grid gap-4", stats.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
      {stats.map((stat, index) => {
        const Icon = icons[index] ?? Coins;

        return (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-4">
              <div className={cn("grid h-11 w-11 place-items-center rounded-lg border", toneStyles[stat.tone])}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">{stat.label}</p>
                <p className="mt-1 text-2xl font-black text-white">{stat.value}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
