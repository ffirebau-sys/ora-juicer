"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type OraMascotProps = {
  variant?: "hero" | "panel";
  isJuicing?: boolean;
  juiceKey?: number;
  className?: string;
};

export function OraMascot({ variant = "hero", isJuicing = false, juiceKey = 0, className }: OraMascotProps) {
  const isHero = variant === "hero";
  const floatDistance = isHero ? -10 : -7;

  return (
    <motion.div
      key={isJuicing ? `juicing-${juiceKey}` : "idle"}
      className={cn(
        "group/ora relative mx-auto grid aspect-square max-w-full shrink-0 place-items-center overflow-visible",
        isHero
          ? "w-[min(70vw,300px)] sm:w-[380px] xl:w-[410px]"
          : "w-[min(72vw,260px)] sm:w-[300px] xl:w-[320px]",
        className
      )}
      style={{
        aspectRatio: "1 / 1",
        display: "grid",
        maxWidth: "100%",
        overflow: "visible",
        placeItems: "center",
        position: "relative",
        width: isHero ? "min(70vw, 410px)" : "min(72vw, 320px)"
      }}
      animate={
        isJuicing
          ? {
              x: [0, -1.4, 1.2, -0.8, 0.8, 0],
              y: [0, -4, 2, -2, 1, 0],
              scale: [1, 1.1, 1.04, 1],
              filter: [
                "brightness(1) drop-shadow(0 0 18px rgba(255,129,0,0.4))",
                "brightness(1.28) drop-shadow(0 0 46px rgba(255,151,35,0.92))",
                "brightness(1.12) drop-shadow(0 0 30px rgba(255,129,0,0.62))",
                "brightness(1) drop-shadow(0 0 18px rgba(255,129,0,0.4))"
              ]
            }
          : {
              y: [0, floatDistance, 0],
              scale: [1, 1.012, 1],
              filter: "brightness(1) drop-shadow(0 0 14px rgba(255,129,0,0.28))"
            }
      }
      transition={
        isJuicing
          ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
          : { duration: isHero ? 5.8 : 5.2, repeat: Infinity, ease: "easeInOut" }
      }
      whileHover={{ scale: isHero ? 1.018 : 1.025 }}
      aria-label="ORA mascot artwork"
      role="img"
    >
      <motion.div
        className={cn(
          "pointer-events-none absolute -z-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,151,35,0.28)_0%,rgba(255,113,18,0.16)_36%,rgba(255,91,0,0.07)_58%,transparent_76%)]",
          isHero ? "inset-[1%] opacity-80" : "inset-[4%] opacity-72"
        )}
        animate={
          isJuicing
            ? {
                opacity: [0.72, 1, 0.74],
                scale: [0.98, 1.2, 1.04],
                filter: ["blur(26px)", "blur(44px)", "blur(30px)"]
              }
            : {
                opacity: isHero ? [0.58, 0.78, 0.58] : [0.5, 0.68, 0.5],
                scale: [0.98, 1.04, 0.98],
                filter: "blur(32px)"
              }
        }
        transition={
          isJuicing
            ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
            : { duration: 6.4, repeat: Infinity, ease: "easeInOut" }
        }
      />
      <Image
        src="/ora-mascot.png"
        alt="ORA glowing orange mascot"
        fill
        priority={isHero}
        sizes={isHero ? "(min-width: 1280px) 410px, (min-width: 640px) 380px, 70vw" : "(min-width: 1280px) 320px, (min-width: 640px) 300px, 72vw"}
        className="h-full w-full select-none object-contain"
        draggable={false}
        unoptimized
      />
    </motion.div>
  );
}
