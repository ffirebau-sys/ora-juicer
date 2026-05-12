import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  icon?: ReactNode;
  detail?: string;
  className?: string;
};

export function StatCard({ label, value, icon, detail, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-0.5 hover:border-ora-300/40 hover:bg-white/[0.065]",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ora-400/[0.15] text-ora-300 shadow-glow">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="mt-1 text-xl font-bold text-white">{value}</p>
          {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}
