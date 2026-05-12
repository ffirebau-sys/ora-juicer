import { ChevronDown, LogOut, RadioTower, Wallet } from "lucide-react";
import { shortenAddress } from "@/lib/format";

type TopbarProps = {
  connectedAddress: string | null;
  isConnecting: boolean;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
};

export function Topbar({
  connectedAddress,
  isConnecting,
  onConnectWallet,
  onDisconnectWallet
}: TopbarProps) {
  const isConnected = Boolean(connectedAddress);

  return (
    <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-white/10 bg-ink-950/[0.78] px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-ora-300">Live Mining Dashboard</p>
          <h1 className="mt-1 text-xl font-black text-white">Network Control Room</h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-200 shadow-[0_0_22px_rgba(52,211,153,0.1)] transition hover:border-emerald-300/50">
            <RadioTower className="h-4 w-4" />
            Mainnet
            <ChevronDown className="h-4 w-4 text-emerald-300/70" />
          </button>
          {isConnected ? (
            <div className="flex items-center gap-2 rounded-lg border border-ora-300/25 bg-ora-400/[0.09] p-1 shadow-glow">
              <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-black text-ora-100">
                <Wallet className="h-4 w-4 text-ora-300" />
                {shortenAddress(connectedAddress ?? "")}
              </div>
              <button
                type="button"
                onClick={onDisconnectWallet}
                className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/[0.07] text-slate-300 transition hover:border-red-300/40 hover:bg-red-400/[0.12] hover:text-red-100"
                aria-label="Disconnect wallet"
                title="Disconnect wallet"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onConnectWallet}
              disabled={isConnecting}
              className="flex items-center gap-2 rounded-lg bg-ora-400 px-4 py-2 text-sm font-black text-ink-950 shadow-glow transition duration-300 hover:-translate-y-0.5 hover:bg-ora-300 hover:shadow-glow-strong disabled:cursor-not-allowed disabled:opacity-80"
            >
              <Wallet className="h-4 w-4" />
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
