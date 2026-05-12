"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import algosdk from "algosdk";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Wallet } from "lucide-react";
import { JuicePanel } from "@/components/JuicePanel";
import { OraMascot } from "@/components/OraMascot";
import { formatUnits, shortenAddress } from "@/lib/format";
import mockData from "@/lib/mock-data.json";
import {
  fetchOraAssetInfo,
  fetchOraGlobalState,
  fetchOraPoolMiningStatus,
  fetchOraPoolWalletTransactions,
  fetchOraPoolWalletData,
  fetchOraWalletData,
  getOraPoolWithdrawalResearch,
  type OraGlobalState,
  type OraPoolMiningStatus,
  type OraPoolTransactionSummary,
  type OraPoolWalletData,
  type OraPoolWithdrawalResearch,
  type OraWalletData
} from "@/lib/ora";
import {
  fetchTinymanOraAlgoUnwrapQuote,
  type TinymanOraAlgoUnwrapQuote
} from "@/lib/tinyman";
import { cn } from "@/lib/utils";

const ORA_CLAIM_DISPLAY_DECIMALS = 8;

type JuiceCelebrationKind = "claim" | "deposit";

function getFirstValidAddress(accounts: string[]) {
  return accounts.find((account) => algosdk.isValidAddress(account)) ?? accounts[0] ?? null;
}

function formatClaimSplashOra(value: bigint) {
  return formatUnits(value, ORA_CLAIM_DISPLAY_DECIMALS, { maximumFractionDigits: 8 });
}

async function getPeraWallet() {
  const { peraWallet } = await import("@/lib/peraWallet");
  return peraWallet;
}

export function DashboardClient() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [oraGlobalState, setOraGlobalState] = useState<OraGlobalState | null>(null);
  const [, setNetworkError] = useState<string | null>(null);
  const [, setIsNetworkLoading] = useState(true);
  const [walletData, setWalletData] = useState<OraWalletData | null>(null);
  const [, setWalletError] = useState<string | null>(null);
  const [, setIsWalletLoading] = useState(false);
  const [poolMiningStatus, setPoolMiningStatus] = useState<OraPoolMiningStatus | null>(null);
  const [poolMiningError, setPoolMiningError] = useState<string | null>(null);
  const [isPoolMiningLoading, setIsPoolMiningLoading] = useState(true);
  const [poolWalletData, setPoolWalletData] = useState<OraPoolWalletData | null>(null);
  const [poolWalletError, setPoolWalletError] = useState<string | null>(null);
  const [isPoolWalletLoading, setIsPoolWalletLoading] = useState(false);
  const [poolTransactions, setPoolTransactions] = useState<OraPoolTransactionSummary[]>([]);
  const [poolTransactionsError, setPoolTransactionsError] = useState<string | null>(null);
  const [isPoolTransactionsLoading, setIsPoolTransactionsLoading] = useState(false);
  const [tinymanUnwrapQuote, setTinymanUnwrapQuote] = useState<TinymanOraAlgoUnwrapQuote | null>(null);
  const [tinymanUnwrapError, setTinymanUnwrapError] = useState<string | null>(null);
  const [isTinymanUnwrapLoading, setIsTinymanUnwrapLoading] = useState(false);
  const [poolDataLastCheckedAt, setPoolDataLastCheckedAt] = useState<Date | null>(null);
  const [isJuicerActive, setIsJuicerActive] = useState(false);
  const [isJuicerCelebrating, setIsJuicerCelebrating] = useState(false);
  const [juiceCelebrationKey, setJuiceCelebrationKey] = useState(0);
  const [juiceCelebrationText, setJuiceCelebrationText] = useState<string | null>(null);
  const [juiceCelebrationKind, setJuiceCelebrationKind] = useState<JuiceCelebrationKind>("claim");
  const celebrationTimer = useRef<number | null>(null);

  const isPoolActive = Boolean(poolMiningStatus?.isActive);
  const poolTokenBalance = poolWalletData?.poolTokenBalance ?? BigInt(0);
  const isMascotJuicing = isJuicerActive || isJuicerCelebrating;
  const isJuicerOverloaded = isJuicerCelebrating && juiceCelebrationKind === "deposit";
  const poolWithdrawalResearch = useMemo<OraPoolWithdrawalResearch>(
    () => getOraPoolWithdrawalResearch(connectedAddress),
    [connectedAddress]
  );

  const triggerJuiceCelebration = useCallback((label: string, kind: JuiceCelebrationKind = "claim") => {
    if (celebrationTimer.current) {
      window.clearTimeout(celebrationTimer.current);
    }

    setJuiceCelebrationText(kind === "deposit" ? "JUICER LOADED" : label);
    setJuiceCelebrationKind(kind);
    setJuiceCelebrationKey((currentKey) => currentKey + 1);
    setIsJuicerCelebrating(true);
    celebrationTimer.current = window.setTimeout(() => {
      setIsJuicerCelebrating(false);
      celebrationTimer.current = null;
    }, kind === "deposit" ? 2300 : 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (celebrationTimer.current) {
        window.clearTimeout(celebrationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    getPeraWallet()
      .then((wallet) => wallet.reconnectSession())
      .then((accounts) => {
        if (!isMounted) {
          return;
        }

        const nextAddress = getFirstValidAddress(accounts);

        setConnectedAddress(nextAddress);
      })
      .catch(() => {
        if (isMounted) {
          setConnectedAddress(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    setIsNetworkLoading(true);
    setNetworkError(null);
    setIsPoolMiningLoading(true);
    setPoolMiningError(null);

    Promise.allSettled([
      fetchOraAssetInfo(),
      fetchOraGlobalState(),
      fetchOraPoolMiningStatus()
    ])
      .then(([assetResult, globalStateResult, poolMiningResult]) => {
        if (!isMounted) {
          return;
        }

        if (globalStateResult.status === "fulfilled") {
          setOraGlobalState(globalStateResult.value);
        }

        if (poolMiningResult.status === "fulfilled") {
          setPoolMiningStatus(poolMiningResult.value);
        }

        if (assetResult.status === "rejected" || globalStateResult.status === "rejected") {
          setNetworkError("Unable to load all ORA network values.");
        }

        if (poolMiningResult.status === "rejected") {
          setPoolMiningError("Unable to load OrangeMiner pool mining status.");
        }
      })
      .finally(() => {
        if (!isMounted) {
          return;
        }

        setIsNetworkLoading(false);
        setIsPoolMiningLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const interval = window.setInterval(() => {
      Promise.allSettled([
        fetchOraPoolMiningStatus(),
        connectedAddress ? fetchOraPoolWalletData(connectedAddress) : Promise.resolve(null)
      ])
        .then(([poolMiningResult, poolWalletResult]) => {
          if (!isMounted) {
            return;
          }

          if (poolMiningResult.status === "fulfilled") {
            setPoolMiningStatus(poolMiningResult.value);
            setPoolMiningError(null);
          } else {
            setPoolMiningError("Unable to refresh OrangeMiner pool mining status.");
          }

          if (poolWalletResult.status === "fulfilled" && poolWalletResult.value) {
            setPoolWalletData(poolWalletResult.value);
            setPoolWalletError(null);
            setPoolDataLastCheckedAt(new Date());
          } else if (poolWalletResult.status === "rejected") {
            setPoolWalletError("Unable to refresh connected wallet OrangeMiner pool data.");
          }
        })
        .catch(() => undefined);
    }, 30_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [connectedAddress]);

  useEffect(() => {
    let isMounted = true;

    if (!connectedAddress) {
      setWalletData(null);
      setWalletError(null);
      setIsWalletLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsWalletLoading(true);
    setWalletError(null);

    fetchOraWalletData(connectedAddress)
      .then((data) => {
        if (isMounted) {
          setWalletData(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setWalletData(null);
          setWalletError("Unable to load connected wallet ORA data.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsWalletLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connectedAddress]);

  useEffect(() => {
    let isMounted = true;

    if (!connectedAddress) {
      setPoolWalletData(null);
      setPoolWalletError(null);
      setIsPoolWalletLoading(false);
      setPoolTransactions([]);
      setPoolTransactionsError(null);
      setIsPoolTransactionsLoading(false);
      setPoolDataLastCheckedAt(null);
      setTinymanUnwrapQuote(null);
      setTinymanUnwrapError(null);
      setIsTinymanUnwrapLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsPoolWalletLoading(true);
    setPoolWalletError(null);
    setIsPoolTransactionsLoading(true);
    setPoolTransactionsError(null);

    Promise.allSettled([
      fetchOraPoolWalletData(connectedAddress),
      fetchOraPoolWalletTransactions(connectedAddress)
    ])
      .then(([walletResult, transactionResult]) => {
        if (isMounted) {
          if (walletResult.status === "fulfilled") {
            setPoolWalletData(walletResult.value);
          } else {
            setPoolWalletData(null);
            setPoolWalletError("Unable to load connected wallet OrangeMiner pool data.");
          }

          if (transactionResult.status === "fulfilled") {
            setPoolTransactions(transactionResult.value);
          } else {
            setPoolTransactions([]);
            setPoolTransactionsError("Unable to load connected wallet OrangeMiner transaction history.");
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsPoolWalletLoading(false);
          setIsPoolTransactionsLoading(false);
          setPoolDataLastCheckedAt(new Date());
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connectedAddress]);

  useEffect(() => {
    let isMounted = true;

    if (!connectedAddress || poolTokenBalance <= BigInt(0)) {
      setTinymanUnwrapQuote(null);
      setTinymanUnwrapError(null);
      setIsTinymanUnwrapLoading(false);

      return () => {
        isMounted = false;
      };
    }

    setIsTinymanUnwrapLoading(true);
    setTinymanUnwrapError(null);

    fetchTinymanOraAlgoUnwrapQuote({ lpTokenAmount: poolTokenBalance })
      .then((quote) => {
        if (isMounted) {
          setTinymanUnwrapQuote(quote);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTinymanUnwrapQuote(null);
          setTinymanUnwrapError("Unable to quote Tinyman ORA-ALGO LP unwrap.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsTinymanUnwrapLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connectedAddress, poolTokenBalance]);

  const connectWallet = useCallback(async () => {
    if (isConnecting) {
      return;
    }

    setIsConnecting(true);

    try {
      const wallet = await getPeraWallet();
      const accounts = await wallet.connect();
      const nextAddress = getFirstValidAddress(accounts);

      setConnectedAddress(nextAddress);
    } catch {
      setConnectedAddress(null);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  const disconnectWallet = useCallback(async () => {
    setIsConnecting(false);

    try {
      const wallet = await getPeraWallet();
      await wallet.disconnect();
    } catch {
      // Ignore disconnect errors; the local session state still needs clearing.
    } finally {
      setConnectedAddress(null);
    }
  }, []);

  const refreshAfterJuiceConfirmation = useCallback(async () => {
    setIsNetworkLoading(true);
    setNetworkError(null);
    setIsPoolMiningLoading(true);
    setPoolMiningError(null);

    if (connectedAddress) {
      setIsWalletLoading(true);
      setWalletError(null);
      setIsPoolWalletLoading(true);
      setPoolWalletError(null);
      setIsPoolTransactionsLoading(true);
      setPoolTransactionsError(null);
    }

    const [
      globalStateResult,
      walletResult,
      poolWalletResult,
      poolTransactionsResult,
      poolMiningResult
    ] = await Promise.allSettled([
      fetchOraGlobalState(),
      connectedAddress ? fetchOraWalletData(connectedAddress) : Promise.resolve(null),
      connectedAddress ? fetchOraPoolWalletData(connectedAddress) : Promise.resolve(null),
      connectedAddress ? fetchOraPoolWalletTransactions(connectedAddress) : Promise.resolve([]),
      fetchOraPoolMiningStatus()
    ]);

    if (globalStateResult.status === "fulfilled") {
      setOraGlobalState(globalStateResult.value);
    } else {
      setNetworkError("Unable to refresh ORA network values.");
    }

    if (walletResult.status === "fulfilled" && walletResult.value) {
      setWalletData(walletResult.value);
    } else if (walletResult.status === "rejected") {
      setWalletError("Unable to refresh connected wallet ORA data.");
    }

    if (poolWalletResult.status === "fulfilled" && poolWalletResult.value) {
      setPoolWalletData(poolWalletResult.value);
    } else if (poolWalletResult.status === "rejected") {
      setPoolWalletError("Unable to refresh connected wallet OrangeMiner pool data.");
    }

    if (poolTransactionsResult.status === "fulfilled") {
      setPoolTransactions(poolTransactionsResult.value);
    } else {
      setPoolTransactionsError("Unable to refresh connected wallet OrangeMiner transaction history.");
    }

    if (poolMiningResult.status === "fulfilled") {
      setPoolMiningStatus(poolMiningResult.value);
    } else {
      setPoolMiningError("Unable to refresh OrangeMiner pool mining status.");
    }

    setIsNetworkLoading(false);
    setIsPoolMiningLoading(false);
    setIsWalletLoading(false);
    setIsPoolWalletLoading(false);
    setIsPoolTransactionsLoading(false);
    setPoolDataLastCheckedAt(new Date());
  }, [connectedAddress]);

  return (
    <main className="min-h-screen overflow-x-hidden">
      <AnimatePresence>
        {juiceCelebrationKey > 0 && (
          <OrangeJuiceSplash
            key={juiceCelebrationKey}
            kind={juiceCelebrationKind}
            label={juiceCelebrationText}
          />
        )}
      </AnimatePresence>
      <motion.div
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-4 sm:px-6 sm:py-7"
        animate={isJuicerOverloaded ? { x: [0, -5, 4, -3, 3, -2, 1, 0], y: [0, 3, -2, 2, -1, 1, 0, 0] } : { x: 0, y: 0 }}
        transition={isJuicerOverloaded ? { duration: 0.45, ease: "easeInOut" } : { duration: 0.2 }}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-normal text-white sm:text-4xl">ORA Juicer</h1>
            <p className="mt-2 text-sm font-semibold text-slate-400">Deposit ALGO. Mine ORA automatically.</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {connectedAddress ? (
              <div className="flex items-center gap-2 rounded-full border border-ora-300/20 bg-white/[0.05] p-1 shadow-[0_0_24px_rgba(255,129,0,0.12)]">
                <span className="px-3 py-1.5 text-xs font-black text-ora-100">{shortenAddress(connectedAddress)}</span>
                <button
                  type="button"
                  onClick={disconnectWallet}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.07] text-slate-300 transition hover:bg-red-400/[0.14] hover:text-red-100"
                  aria-label="Disconnect wallet"
                  title="Disconnect wallet"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                disabled={isConnecting}
                className="inline-flex items-center gap-2 rounded-full bg-ora-400 px-4 py-2 text-sm font-black text-ink-950 shadow-glow transition hover:-translate-y-0.5 hover:bg-ora-300 disabled:cursor-not-allowed disabled:opacity-75"
              >
                <Wallet className="h-4 w-4" />
                {isConnecting ? "Connecting..." : "Connect"}
              </button>
            )}
          </div>
        </header>

        <section className="relative grid flex-1 place-items-center overflow-visible py-4 sm:py-7">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-56 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,129,0,0.16)_0%,rgba(255,129,0,0.07)_38%,transparent_72%)] blur-2xl sm:h-64" />
          <motion.div
            className="pointer-events-none absolute h-[min(72vw,400px)] w-[min(72vw,400px)] rounded-full border border-ora-300/25 shadow-[0_0_44px_rgba(255,129,0,0.24),inset_0_0_34px_rgba(255,129,0,0.14)] sm:h-[min(82vw,440px)] sm:w-[min(82vw,440px)]"
            animate={{
              opacity: isJuicerOverloaded ? [0.78, 1, 0.86, 1, 0.5] : isMascotJuicing ? [0.46, 0.88, 0.46] : isPoolActive ? [0.34, 0.62, 0.34] : [0.18, 0.32, 0.18],
              rotate: 360,
              scale: isJuicerOverloaded ? [0.88, 1.16, 0.96, 1.08, 1] : isMascotJuicing ? [0.96, 1.05, 0.96] : [0.98, 1.02, 0.98]
            }}
            transition={{
              opacity: { duration: isJuicerOverloaded ? 0.54 : isMascotJuicing ? 1.15 : 3.4, ease: "easeInOut", repeat: Infinity },
              rotate: { duration: isJuicerOverloaded ? 0.48 : isMascotJuicing ? 1.25 : isPoolActive ? 5.5 : 28, ease: "linear", repeat: Infinity },
              scale: { duration: isJuicerOverloaded ? 0.54 : isMascotJuicing ? 1.15 : 4.2, ease: "easeInOut", repeat: Infinity }
            }}
          />
          <motion.div
            className="pointer-events-none absolute h-[min(56vw,320px)] w-[min(56vw,320px)] rounded-full border border-transparent border-t-ora-100/70 border-r-ora-400/55 shadow-[0_0_30px_rgba(255,151,35,0.32)] sm:h-[min(66vw,360px)] sm:w-[min(66vw,360px)]"
            animate={{
              opacity: isJuicerOverloaded ? [0.84, 1, 0.74, 1] : isMascotJuicing ? [0.58, 1, 0.58] : isPoolActive ? [0.42, 0.76, 0.42] : [0.22, 0.42, 0.22],
              rotate: -360,
              scale: isJuicerOverloaded ? [0.95, 1.14, 1, 1.08] : isMascotJuicing ? [1, 1.07, 1] : [1, 1.025, 1]
            }}
            transition={{
              opacity: { duration: isJuicerOverloaded ? 0.42 : isMascotJuicing ? 0.9 : 2.8, ease: "easeInOut", repeat: Infinity },
              rotate: { duration: isJuicerOverloaded ? 0.36 : isMascotJuicing ? 1 : isPoolActive ? 3.8 : 22, ease: "linear", repeat: Infinity },
              scale: { duration: isJuicerOverloaded ? 0.42 : isMascotJuicing ? 0.9 : 3.8, ease: "easeInOut", repeat: Infinity }
            }}
          />
          <AnimatePresence>
            {isJuicerOverloaded && (
              <motion.div
                className="pointer-events-none absolute h-[min(78vw,480px)] w-[min(78vw,480px)] rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,245,188,0.78)_24deg,rgba(255,129,0,0.2)_52deg,transparent_78deg,rgba(255,129,0,0.72)_136deg,transparent_172deg,rgba(255,209,102,0.62)_245deg,transparent_302deg)] opacity-80 blur-[1px] sm:h-[min(86vw,520px)] sm:w-[min(86vw,520px)]"
                initial={{ opacity: 0, rotate: 0, scale: 0.78 }}
                animate={{ opacity: [0, 1, 0.8, 0], rotate: 540, scale: [0.78, 1.08, 1.18, 1.36] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.8, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
          <OraMascot variant="hero" isJuicing={isMascotJuicing} juiceKey={juiceCelebrationKey} />
        </section>

        <JuicePanel
          connectedAddress={connectedAddress}
          currentMinerEffort={oraGlobalState?.currentMinerEffort}
          estimate={mockData.juiceEstimate}
          isOraAppOptedIn={connectedAddress ? walletData?.hasMiningState : undefined}
          onClaimSuccess={(oraReceived) => triggerJuiceCelebration(`+${formatClaimSplashOra(oraReceived)} ORA`, "claim")}
          onJuicerLoaded={() => triggerJuiceCelebration("JUICER LOADED", "deposit")}
          onJuiceConfirmed={refreshAfterJuiceConfirmation}
          onActivityChange={setIsJuicerActive}
          poolMiningStatus={{
            error: poolMiningError,
            isLoading: isPoolMiningLoading,
            status: poolMiningStatus
          }}
          onPoolDataRefresh={refreshAfterJuiceConfirmation}
          poolDataLastCheckedAt={poolDataLastCheckedAt}
          poolWalletData={{
            data: poolWalletData,
            error: poolWalletError,
            isLoading: isPoolWalletLoading
          }}
          poolTransactionHistory={{
            error: poolTransactionsError,
            isLoading: isPoolTransactionsLoading,
            transactions: poolTransactions
          }}
          tinymanUnwrapPreview={{
            data: tinymanUnwrapQuote,
            error: tinymanUnwrapError,
            isLoading: isTinymanUnwrapLoading
          }}
          poolWithdrawalResearch={poolWithdrawalResearch}
        />
      </motion.div>
    </main>
  );
}

const juiceSplashDrops = [
  { delay: 0.02, left: "16%", size: 10, top: "42%", x: -90, y: -80 },
  { delay: 0.04, left: "25%", size: 18, top: "36%", x: -56, y: -120 },
  { delay: 0.08, left: "36%", size: 9, top: "44%", x: -28, y: -96 },
  { delay: 0.03, left: "48%", size: 22, top: "39%", x: 0, y: -132 },
  { delay: 0.07, left: "58%", size: 12, top: "43%", x: 38, y: -108 },
  { delay: 0.05, left: "70%", size: 17, top: "37%", x: 74, y: -116 },
  { delay: 0.1, left: "82%", size: 10, top: "45%", x: 104, y: -76 }
];

const juiceExplosionParticles = [
  { delay: 0.03, size: 10, x: -360, y: -170 },
  { delay: 0.04, size: 18, x: -280, y: -245 },
  { delay: 0.02, size: 8, x: -170, y: -315 },
  { delay: 0.08, size: 22, x: -86, y: -265 },
  { delay: 0.06, size: 12, x: 38, y: -330 },
  { delay: 0.04, size: 16, x: 160, y: -290 },
  { delay: 0.07, size: 9, x: 292, y: -222 },
  { delay: 0.05, size: 24, x: 388, y: -126 },
  { delay: 0.08, size: 11, x: 430, y: 10 },
  { delay: 0.03, size: 20, x: 336, y: 126 },
  { delay: 0.07, size: 9, x: 238, y: 230 },
  { delay: 0.06, size: 15, x: 86, y: 284 },
  { delay: 0.04, size: 18, x: -70, y: 290 },
  { delay: 0.09, size: 10, x: -210, y: 224 },
  { delay: 0.05, size: 26, x: -336, y: 132 },
  { delay: 0.07, size: 12, x: -430, y: 12 },
  { delay: 0.11, size: 7, x: -240, y: -82 },
  { delay: 0.1, size: 7, x: 256, y: -62 },
  { delay: 0.12, size: 8, x: 148, y: 156 },
  { delay: 0.09, size: 8, x: -154, y: 148 }
];

const juiceExplosionBlobs = [
  { delay: 0.04, height: 94, rotate: -22, width: 132, x: -330, y: -145 },
  { delay: 0.08, height: 126, rotate: 18, width: 176, x: 292, y: -194 },
  { delay: 0.02, height: 72, rotate: 42, width: 108, x: 24, y: -310 },
  { delay: 0.1, height: 114, rotate: -38, width: 158, x: -288, y: 176 },
  { delay: 0.12, height: 86, rotate: 28, width: 132, x: 306, y: 162 },
  { delay: 0.16, height: 62, rotate: -8, width: 94, x: -42, y: 278 }
];

const juiceExplosionStreaks = [
  { delay: 0.02, rotate: -24, width: 230, x: -500, y: -138 },
  { delay: 0.05, rotate: 12, width: 290, x: 470, y: -82 },
  { delay: 0.08, rotate: -8, width: 210, x: -430, y: 78 },
  { delay: 0.04, rotate: 28, width: 260, x: 440, y: 126 },
  { delay: 0.12, rotate: 4, width: 190, x: -120, y: -330 },
  { delay: 0.1, rotate: -34, width: 180, x: 98, y: 310 },
  { delay: 0.14, rotate: 18, width: 200, x: -360, y: 245 },
  { delay: 0.09, rotate: -14, width: 220, x: 360, y: -252 }
];

const juiceScreenDrips = [
  { delay: 0.72, height: 164, left: "8%", width: 12 },
  { delay: 0.86, height: 118, left: "19%", width: 8 },
  { delay: 0.78, height: 196, left: "34%", width: 14 },
  { delay: 0.9, height: 132, left: "63%", width: 10 },
  { delay: 0.82, height: 174, left: "76%", width: 13 },
  { delay: 0.96, height: 106, left: "91%", width: 8 }
];

function OrangeJuiceSplash({ kind, label }: { kind: JuiceCelebrationKind; label: string | null }) {
  const isDepositExplosion = kind === "deposit";

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      exit={{ opacity: 0 }}
      transition={{
        duration: isDepositExplosion ? 2.1 : 1.55,
        times: [0, 0.1, 0.74, 1],
        ease: "easeOut"
      }}
    >
      {isDepositExplosion && (
        <>
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,245,188,0.95)_0%,rgba(255,185,52,0.6)_18%,rgba(255,94,0,0.28)_43%,rgba(3,6,9,0)_76%)] mix-blend-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.34, 0] }}
            transition={{ duration: 0.75, times: [0, 0.12, 0.55, 1], ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-0 bg-ora-500/20 mix-blend-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.62, 0.08, 0] }}
            transition={{ duration: 1.2, times: [0, 0.14, 0.72, 1], ease: "easeOut" }}
          />
          <motion.div
            className="absolute left-1/2 top-1/2 h-[min(112vw,840px)] w-[min(112vw,840px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ora-100/45 shadow-[0_0_90px_rgba(255,129,0,0.55),inset_0_0_80px_rgba(255,209,102,0.16)]"
            initial={{ opacity: 0, scale: 0.18 }}
            animate={{ opacity: [0, 1, 0.5, 0], scale: [0.18, 0.9, 1.28, 1.58] }}
            transition={{ duration: 1.28, ease: "easeOut" }}
          />
          <motion.div
            className="absolute left-1/2 top-1/2 h-[min(88vw,620px)] w-[min(88vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-ora-200/60 shadow-[0_0_60px_rgba(255,190,71,0.42)]"
            initial={{ opacity: 0, rotate: 0, scale: 0.34 }}
            animate={{ opacity: [0, 0.9, 0], rotate: 220, scale: [0.34, 1.02, 1.34] }}
            transition={{ duration: 1.18, ease: "easeOut" }}
          />
        </>
      )}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[min(82vw,520px)] w-[min(82vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,177,54,0.42)_0%,rgba(255,129,0,0.22)_32%,rgba(255,80,0,0.08)_58%,transparent_74%)] blur-2xl"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{
          scale: isDepositExplosion ? [0.34, 1.22, 1.58] : [0.5, 1.08, 1.28],
          opacity: isDepositExplosion ? [0, 1, 0] : [0, 0.9, 0]
        }}
        transition={{ duration: isDepositExplosion ? 1.65 : 1.35, ease: "easeOut" }}
      />
      <motion.div
        className="absolute left-[-8%] top-[47%] h-7 w-[116%] rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,190,71,0.08),rgba(255,129,0,0.64),rgba(255,239,170,0.78),rgba(255,129,0,0.5),transparent)] blur-[2px]"
        initial={{ x: "-18%", scaleX: 0.18, opacity: 0 }}
        animate={{
          x: isDepositExplosion ? ["-24%", "0%", "18%"] : ["-18%", "0%", "12%"],
          scaleX: isDepositExplosion ? [0.12, 1.16, 0.74] : [0.18, 1, 0.82],
          opacity: [0, 1, 0]
        }}
        transition={{ duration: isDepositExplosion ? 1.18 : 1.05, ease: "easeOut" }}
      />
      {label && (
        <motion.div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 rounded-full border border-ora-200/35 bg-black/45 px-5 py-2 font-black text-ora-50 shadow-[0_0_42px_rgba(255,129,0,0.42)] backdrop-blur-md",
            isDepositExplosion
              ? "top-[34%] text-3xl tracking-normal sm:text-6xl"
              : "top-[42%] text-xl sm:text-3xl"
          )}
          initial={{ opacity: 0, scale: 0.72, y: 22 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: isDepositExplosion ? [0.62, 1.18, 1, 0.92] : [0.72, 1.08, 1, 0.96],
            y: isDepositExplosion ? [42, -12, -44, -86] : [22, -8, -34, -58]
          }}
          transition={{
            duration: isDepositExplosion ? 1.85 : 1.45,
            times: [0, 0.16, 0.68, 1],
            ease: "easeOut"
          }}
        >
          {label}
        </motion.div>
      )}
      {isDepositExplosion && juiceExplosionStreaks.map((streak, index) => (
        <motion.span
          key={`streak-${index}`}
          className="absolute left-1/2 top-1/2 h-3 origin-left rounded-full bg-[linear-gradient(90deg,rgba(255,248,209,0.95),rgba(255,166,35,0.78),transparent)] shadow-[0_0_24px_rgba(255,151,35,0.72)]"
          style={{ rotate: `${streak.rotate}deg`, width: streak.width }}
          initial={{ opacity: 0, scaleX: 0.1, x: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], scaleX: [0.1, 1, 0.34], x: streak.x, y: streak.y }}
          transition={{ delay: streak.delay, duration: 0.82, ease: "easeOut" }}
        />
      ))}
      {isDepositExplosion && juiceExplosionBlobs.map((blob, index) => (
        <motion.span
          key={`blob-${index}`}
          className="absolute left-1/2 top-1/2 rounded-full bg-[radial-gradient(circle_at_32%_28%,#fff9bf_0%,#ffd166_22%,#ff8a00_58%,#f54a00_100%)] opacity-90 shadow-[0_0_36px_rgba(255,129,0,0.72)]"
          style={{
            borderRadius: "58% 42% 64% 36% / 44% 54% 46% 56%",
            height: blob.height,
            rotate: `${blob.rotate}deg`,
            width: blob.width
          }}
          initial={{ opacity: 0, scale: 0.16, x: "-50%", y: "-50%" }}
          animate={{
            opacity: [0, 0.96, 0],
            scale: [0.16, 1.1, 2.6],
            x: `calc(-50% + ${blob.x}px)`,
            y: `calc(-50% + ${blob.y}px)`
          }}
          transition={{ delay: blob.delay, duration: 1.24, ease: "easeOut" }}
        />
      ))}
      {isDepositExplosion && juiceExplosionParticles.map((particle, index) => (
        <motion.span
          key={`particle-${index}`}
          className="absolute left-1/2 top-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff8c9_0%,#ffc24a_30%,#ff8100_68%,#ff4f00_100%)] shadow-[0_0_22px_rgba(255,129,0,0.78)]"
          style={{ height: particle.size, width: particle.size }}
          initial={{ opacity: 0, scale: 0.18, x: "-50%", y: "-50%" }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0.18, 1.25, 0.32],
            x: `calc(-50% + ${particle.x}px)`,
            y: `calc(-50% + ${particle.y}px)`
          }}
          transition={{ delay: particle.delay, duration: 1.14, ease: "easeOut" }}
        />
      ))}
      {juiceSplashDrops.map((drop) => (
        <motion.span
          key={`${drop.left}-${drop.top}`}
          className="absolute rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff7c2_0%,#ffc24a_28%,#ff8100_66%,#ff4f00_100%)] shadow-[0_0_22px_rgba(255,129,0,0.68)]"
          style={{
            height: drop.size,
            left: drop.left,
            top: drop.top,
            width: drop.size
          }}
          initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1.15, 0.55], x: drop.x, y: drop.y }}
          transition={{ delay: drop.delay, duration: 1.05, ease: "easeOut" }}
        />
      ))}
      {isDepositExplosion && juiceScreenDrips.map((drip, index) => (
        <motion.span
          key={`drip-${index}`}
          className="absolute top-[-18px] rounded-b-full rounded-t-md bg-[linear-gradient(180deg,rgba(255,235,151,0.86),rgba(255,129,0,0.62),rgba(255,79,0,0.16))] shadow-[0_0_18px_rgba(255,129,0,0.42)]"
          style={{ height: drip.height, left: drip.left, width: drip.width }}
          initial={{ opacity: 0, scaleY: 0.15, y: -30 }}
          animate={{ opacity: [0, 0.72, 0.5, 0], scaleY: [0.15, 1, 1.08, 1.08], y: [-30, 28, 92, 150] }}
          transition={{ delay: drip.delay, duration: 1.38, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}
