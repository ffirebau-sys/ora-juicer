import { Flame } from "lucide-react";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  return (
    <aside className="z-30 border-b border-white/10 bg-ink-950/[0.92] px-4 py-4 backdrop-blur-xl lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="flex items-center gap-3 lg:mb-10">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-ora-400 text-ink-950 shadow-glow">
          <Flame className="h-5 w-5 fill-current" />
        </div>
        <div>
          <p className="text-xl font-black text-white">ORA</p>
          <p className="text-xs font-medium text-ora-200/80">Mining console</p>
        </div>
      </div>

      <nav className="mt-5 flex gap-3 overflow-x-auto pb-1 lg:mt-0 lg:flex-col lg:gap-3.5 lg:overflow-visible lg:pb-0">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.label}
              href="#"
              className={cn(
                "group flex min-w-max items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-semibold text-slate-400 transition duration-300 hover:bg-white/[0.07] hover:text-white lg:px-4 lg:py-3.5",
                item.active &&
                  "bg-[linear-gradient(135deg,rgba(255,129,0,0.22),rgba(255,129,0,0.07))] text-white shadow-[0_0_24px_rgba(255,129,0,0.14)]"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition duration-300 group-hover:text-ora-300",
                  item.active && "text-ora-300"
                )}
              />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="mt-10 hidden rounded-lg border border-white/10 bg-white/[0.04] p-4 lg:mt-auto lg:block">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
          ORA Network
        </div>
        <p className="mt-3 text-sm font-bold text-white">Epoch 42</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Leader-based rewards follow ORA contract rules.</p>
      </div>
    </aside>
  );
}
