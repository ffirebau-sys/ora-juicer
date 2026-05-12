"use client";

import { motion } from "framer-motion";
import { Clock3, Gauge, Gem, SplitSquareHorizontal } from "lucide-react";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";

type Halving = {
  progress: number;
  daysToHalving: number;
  currentReward: string;
  nextReward: string;
};

type HalvingProgressProps = {
  halving: Halving;
};

const fillTransition = { duration: 1.45, ease: [0.22, 1, 0.36, 1] as const };

const miningSparks = [
  { x: 15, y: -12, size: 3, delay: 0 },
  { x: 24, y: 8, size: 2.1, delay: 0.28 },
  { x: 11, y: 15, size: 2.4, delay: 0.5 },
  { x: 31, y: -6, size: 2, delay: 0.74 },
  { x: 19, y: -20, size: 1.8, delay: 1.02 },
  { x: 37, y: 12, size: 2.2, delay: 1.28 }
];

export function HalvingProgress({ halving }: HalvingProgressProps) {
  const progress = Math.min(Math.max(halving.progress, 0), 100);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase text-ora-300">Halving Progress</p>
            <h3 className="mt-1 text-lg font-black text-white">{progress.toFixed(2)}% complete</h3>
          </div>
          <div className="w-fit rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-sm font-bold text-white">
            {halving.daysToHalving.toFixed(2)} days left
          </div>
        </div>

        <MiningProgressBar progress={progress} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Halving progress"
          value={`${progress.toFixed(2)}%`}
          icon={<Gauge className="h-5 w-5" />}
          detail="Current epoch"
        />
        <StatCard
          label="Days to halving"
          value={halving.daysToHalving.toFixed(2)}
          icon={<Clock3 className="h-5 w-5" />}
          detail="Estimated"
        />
        <StatCard
          label="Current reward"
          value={halving.currentReward}
          icon={<Gem className="h-5 w-5" />}
          detail="Per winning round"
        />
        <StatCard
          label="Next reward"
          value={halving.nextReward}
          icon={<SplitSquareHorizontal className="h-5 w-5" />}
          detail="After halving"
        />
      </div>
    </div>
  );
}

function MiningProgressBar({ progress }: { progress: number }) {
  return (
    <div className="relative mt-5 py-3">
      <div className="relative h-4 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,rgba(0,0,0,0.68),rgba(15,23,42,0.42))] shadow-[inset_0_0_18px_rgba(0,0,0,0.55)]">
        <motion.div
          className="relative h-full overflow-visible rounded-lg bg-[linear-gradient(90deg,#ffd166_0%,#ff9f26_42%,#ff5b00_100%)] shadow-[0_0_26px_rgba(255,129,0,0.34)]"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={fillTransition}
        >
          <motion.div
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),transparent_38%,rgba(255,78,0,0.34))]"
            animate={{ opacity: [0.52, 0.92, 0.58] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-y-0 right-0 w-2.5 bg-white shadow-[0_0_16px_rgba(255,255,255,0.95),0_0_32px_rgba(255,202,86,0.86),0_0_52px_rgba(255,129,0,0.8)]"
            animate={{ opacity: [0.82, 1, 0.86], scaleX: [0.86, 1.28, 0.92] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-shimmer" />
        </motion.div>
      </div>

      <motion.div
        className="pointer-events-none absolute top-1/2 z-20 h-11 w-11 -translate-x-1/2 -translate-y-1/2"
        initial={{ left: "0%" }}
        animate={{ left: `${progress}%` }}
        transition={fillTransition}
      >
        <motion.div
          className="absolute left-1/2 top-1/2 h-12 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.72)_0%,rgba(255,203,92,0.52)_20%,rgba(255,129,0,0.24)_48%,transparent_74%)] blur-sm"
          animate={{ opacity: [0.44, 0.88, 0.5], scale: [0.82, 1.12, 0.9], x: [0, 2, 0] }}
          transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.95)_0%,rgba(255,214,102,0.66)_26%,rgba(255,129,0,0.28)_56%,transparent_76%)]"
          animate={{ opacity: [0.68, 1, 0.72], scale: [0.86, 1.14, 0.9] }}
          transition={{ duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
        />

        {miningSparks.map((spark, index) => (
          <motion.span
            key={`${spark.x}-${spark.y}-${index}`}
            className="absolute left-1/2 top-1/2 rounded-full bg-ora-200 shadow-[0_0_10px_rgba(255,214,102,0.9)]"
            style={{
              height: spark.size,
              marginLeft: -spark.size / 2,
              marginTop: -spark.size / 2,
              width: spark.size
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={{
              x: spark.x,
              y: spark.y,
              opacity: [0, 0.95, 0],
              scale: [0.3, 1, 0.25]
            }}
            transition={{
              delay: spark.delay,
              duration: 0.72,
              ease: "easeOut",
              repeat: Infinity,
              repeatDelay: 1.2
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
