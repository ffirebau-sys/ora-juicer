import { ArrowUpRight, Sparkles } from "lucide-react";
import { AnimatedSection } from "@/components/AnimatedSection";
import { Card } from "@/components/Card";
import { OraMascot } from "@/components/OraMascot";

export function HeroSection() {
  return (
    <AnimatedSection>
      <Card className="min-h-[360px] p-5 sm:p-8 lg:p-10" glow>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_42%,rgba(255,129,0,0.22),transparent_34%),radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.09),transparent_30%)]" />
        <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] xl:gap-14">
          <div className="min-w-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-ora-300/30 bg-ora-400/10 px-3 py-2 text-xs font-bold text-ora-200 shadow-glow">
              <Sparkles className="h-4 w-4" />
              Halving progress live
            </div>
            <h2 className="max-w-[330px] text-[2rem] font-black leading-[1.08] text-white sm:text-5xl lg:max-w-[720px] xl:text-6xl">
              Mine <span className="text-ora-300 drop-shadow-[0_0_18px_rgba(255,129,0,0.7)]">ORA.</span>
              <br />
              Fuel the network.
              <br />
              Earn together.
            </h2>
            <p className="mt-5 max-w-[310px] text-base leading-7 text-slate-300 sm:text-lg lg:max-w-xl">
              ORA mining turns ALGO fees into shared network effort. Juice ORA, add momentum to the
              current round, and compete for leader-based rewards with every participant.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#juice"
                className="inline-flex items-center gap-2 rounded-lg bg-ora-400 px-5 py-3 text-sm font-black text-ink-950 shadow-glow transition hover:-translate-y-0.5 hover:bg-ora-300"
              >
                Start Juicing
                <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href="#leaderboard"
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:border-ora-300/40 hover:bg-white/10"
              >
                View Leaderboard
              </a>
            </div>
          </div>

          <div className="relative grid min-h-[210px] place-items-center justify-self-center px-4 py-5 sm:min-h-[340px] sm:p-8 xl:min-h-[360px]">
            <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ora-400/[0.14] blur-3xl sm:h-56 sm:w-56" />
            <OraMascot variant="hero" />
          </div>
        </div>
      </Card>
    </AnimatedSection>
  );
}
