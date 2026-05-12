import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type CardProps = ComponentPropsWithoutRef<"section"> & {
  glow?: boolean;
};

export function Card({ children, className, glow = false, ...props }: CardProps) {
  return (
    <section
      {...props}
      className={cn(
        "relative w-full min-w-0 max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-white/10 bg-panel-gradient shadow-panel",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.09),transparent_35%,rgba(255,129,0,0.08))] before:opacity-70",
        glow && "shadow-glow",
        className
      )}
    >
      <div className="relative z-10">{children}</div>
    </section>
  );
}
