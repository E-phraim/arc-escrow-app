"use client";

import { useState, useEffect, useCallback } from "react";
import {
  connectWallet, switchToArc, getEscrowState,
  approveAndDeposit, confirmDelivery, raiseDispute, refundBuyer,
} from "@/lib/escrow";
import { STATE_LABELS, ESCROW_ADDRESS, ARC_CHAIN_ID } from "@/constants";

type EscrowInfo = {
  state: number;
  buyer: string;
  seller: string;
  arbiter: string;
  amount: string;
};

type TxState = "idle" | "pending" | "success" | "error";

const STATE_COLORS: Record<number, { bg: string; text: string; dot: string }> = {
  0: { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400"  },
  1: { bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-400"   },
  2: { bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-400" },
  3: { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400"    },
  4: { bg: "bg-slate-50",  text: "text-slate-600",  dot: "bg-slate-400"  },
};

const STEPS = [
  { icon: "💰", title: "Buyer Funds", desc: "Buyer locks USDC in the smart contract" },
  { icon: "📦", title: "Seller Delivers", desc: "Seller completes the agreed work or delivery" },
  { icon: "✅", title: "Funds Released", desc: "Buyer confirms and USDC transfers to seller" },
];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function Home() {
  const [view, setView] = useState<"landing" | "dashboard">("landing");
  const [wallet, setWallet] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [escrow, setEscrow] = useState<EscrowInfo | null>(null);
  const [txState, setTxState] = useState<TxState>("idle");
  const [txMsg, setTxMsg] = useState("");
  const [loadingEscrow, setLoadingEscrow] = useState(false);

  const isWrongNetwork = chainId !== null && chainId.toLowerCase() !== ARC_CHAIN_ID.toLowerCase();

  const fetchEscrow = useCallback(async () => {
    setLoadingEscrow(true);
    try {
      const data = await getEscrowState();
      setEscrow(data);
    } catch (e: any) {
      setTxMsg(e.message);
      setTxState("error");
    } finally {
      setLoadingEscrow(false);
    }
  }, []);

  useEffect(() => {
    if (wallet && view === "dashboard") fetchEscrow();
  }, [wallet, view, fetchEscrow]);

  // Listen for account/network changes
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccounts = (accounts: string[]) => setWallet(accounts[0]?.toLowerCase() || null);
    const handleChain = (id: string) => setChainId(id);
    window.ethereum.on("accountsChanged", handleAccounts);
    window.ethereum.on("chainChanged", handleChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccounts);
      window.ethereum.removeListener("chainChanged", handleChain);
    };
  }, []);

  async function handleConnect() {
    try {
      setTxState("idle");
      const { address, chainId: cid } = await connectWallet();
      setWallet(address);
      setChainId(cid);
      setView("dashboard");
    } catch (e: any) {
      setTxMsg(e.message);
      setTxState("error");
    }
  }

  async function handleSwitchNetwork() {
    try {
      await switchToArc();
      const { chainId: cid } = await connectWallet();
      setChainId(cid);
    } catch (e: any) {
      setTxMsg(e.message);
      setTxState("error");
    }
  }

  async function handleAction(fn: (onStatus: (m: string) => void) => Promise<void>) {
    setTxState("pending");
    setTxMsg("");
    try {
      await fn((msg) => setTxMsg(msg));
      setTxState("success");
      setTxMsg("Transaction confirmed ✅");
      await fetchEscrow();
    } catch (e: any) {
      setTxState("error");
      setTxMsg(e.message?.includes("user rejected") ? "Transaction cancelled." : e.message);
    }
  }

  const isBuyer   = wallet && escrow && wallet === escrow.buyer;
  const isArbiter = wallet && escrow && wallet === escrow.arbiter;
  const isSeller  = wallet && escrow && wallet === escrow.seller;

  // ── Landing Page ──────────────────────────────────────────────────────────
  if (view === "landing") {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
        {/* Grid background */}
        <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

        {/* Glow */}
        <div className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 py-20 flex flex-col items-center text-center gap-16">

          {/* Hero */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-blue-300 font-medium tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Live on Arc Testnet
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight">
              Trustless payments,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                secured onchain.
              </span>
            </h1>
            <p className="text-lg text-white/50 max-w-xl mx-auto leading-relaxed">
              Hold USDC in a smart contract until both parties are satisfied.
              No middlemen. No disputes over lost funds.
            </p>
          </div>

          {/* 3-step flow */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STEPS.map((step, i) => (
              <div
                key={i}
                className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 text-left hover:bg-white/[0.06] transition-colors"
              >
                <div className="text-3xl mb-3">{step.icon}</div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-white/30">0{i + 1}</span>
                  <h3 className="font-semibold text-white">{step.title}</h3>
                </div>
                <p className="text-sm text-white/40 leading-relaxed">{step.desc}</p>
                {i < 2 && (
                  <div className="hidden sm:block absolute top-1/2 -right-2 -translate-y-1/2 text-white/20 text-lg z-10">→</div>
                )}
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <button
              onClick={handleConnect}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] active:scale-95"
            >
              Open Escrow Dashboard
            </button>
          </div>

          {/* Footer */}
          <div className="flex flex-col items-center gap-2 text-xs text-white/25">
            <p>Powered by smart contracts on Arc — built with Circle's USDC</p>
            <a
              href={`https://testnet.arcscan.app/address/${ESCROW_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-white/50 transition-colors"
            >
              {shortAddr(ESCROW_ADDRESS)} ↗
            </a>
          </div>
        </div>
      </main>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      <div className="relative max-w-lg mx-auto px-4 py-10 space-y-4">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView("landing")}
            className="text-white/30 hover:text-white/60 text-sm transition-colors"
          >
            ← Back
          </button>
          {wallet ? (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-mono text-white/60">{shortAddr(wallet)}</span>
              {isBuyer   && <span className="text-xs text-blue-400 font-medium">Buyer</span>}
              {isSeller  && <span className="text-xs text-emerald-400 font-medium">Seller</span>}
              {isArbiter && <span className="text-xs text-purple-400 font-medium">Arbiter</span>}
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-full transition"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Wrong network banner */}
        {isWrongNetwork && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-400">Wrong Network</p>
              <p className="text-xs text-amber-400/60 mt-0.5">Switch to Arc Testnet to continue</p>
            </div>
            <button
              onClick={handleSwitchNetwork}
              className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg transition flex-shrink-0"
            >
              Switch Network
            </button>
          </div>
        )}

        {/* Escrow card */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">

          {/* Card header */}
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">USDC Escrow</h2>
              <a
                href={`https://testnet.arcscan.app/address/${ESCROW_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-white/30 hover:text-white/50 transition-colors"
              >
                {shortAddr(ESCROW_ADDRESS)} ↗
              </a>
            </div>
            {escrow && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${STATE_COLORS[escrow.state].bg} ${STATE_COLORS[escrow.state].text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATE_COLORS[escrow.state].dot}`} />
                {STATE_LABELS[escrow.state]}
              </div>
            )}
          </div>

          {/* Card body */}
          <div className="p-5 space-y-5">
            {loadingEscrow ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
              </div>
            ) : escrow ? (
              <>
                {/* Amount */}
                <div className="text-center py-2">
                  <p className="text-4xl font-bold text-white">{escrow.amount}</p>
                  <p className="text-sm text-white/30 mt-1">USDC locked in escrow</p>
                </div>

                {/* Progress tracker */}
                <div className="flex items-center gap-1">
                  {[
                    { label: "Funded",    done: escrow.state >= 1 },
                    { label: "Delivered", done: escrow.state >= 2 },
                    { label: "Released",  done: escrow.state === 2 },
                  ].map((s, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className={`w-full h-1 rounded-full transition-colors ${s.done ? "bg-blue-500" : "bg-white/10"}`} />
                      <span className={`text-[10px] font-medium ${s.done ? "text-blue-400" : "text-white/25"}`}>
                        {s.done ? "✓ " : ""}{s.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Parties */}
                <div className="space-y-2">
                  {[
                    { label: "Buyer",   addr: escrow.buyer,   color: "text-blue-400"   },
                    { label: "Seller",  addr: escrow.seller,  color: "text-emerald-400"},
                    { label: "Arbiter", addr: escrow.arbiter, color: "text-purple-400" },
                  ].map(({ label, addr, color }) => (
                    <div key={label} className="flex justify-between items-center text-sm">
                      <span className={`text-xs font-medium ${color}`}>{label}</span>
                      <span className="font-mono text-white/40 text-xs">
                        {shortAddr(addr)}
                        {addr === wallet && <span className="ml-1 text-white/20">(you)</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="space-y-2 pt-1">
                  {isBuyer && escrow.state === 0 && (
                    <ActionButton
                      label={`Approve & Deposit ${escrow.amount} USDC`}
                      color="blue"
                      loading={txState === "pending"}
                      onClick={() => handleAction(approveAndDeposit)}
                    />
                  )}
                  {isBuyer && escrow.state === 1 && (
                    <>
                      <ActionButton
                        label="Confirm Delivery → Release Funds"
                        color="green"
                        loading={txState === "pending"}
                        onClick={() => handleAction(confirmDelivery)}
                      />
                      <ActionButton
                        label="Raise Dispute"
                        color="red"
                        loading={txState === "pending"}
                        onClick={() => handleAction(raiseDispute)}
                      />
                    </>
                  )}
                  {isArbiter && escrow.state === 1 && (
                    <ActionButton
                      label="Release Funds to Seller"
                      color="green"
                      loading={txState === "pending"}
                      onClick={() => handleAction(confirmDelivery)}
                    />
                  )}
                  {isArbiter && escrow.state === 3 && (
                    <ActionButton
                      label="Refund Buyer"
                      color="purple"
                      loading={txState === "pending"}
                      onClick={() => handleAction(refundBuyer)}
                    />
                  )}
                  {(escrow.state === 2 || escrow.state === 4) && (
                    <p className="text-center text-xs text-white/25 py-2">
                      This escrow is {STATE_LABELS[escrow.state].toLowerCase()}. No further actions.
                    </p>
                  )}
                  {!isBuyer && !isArbiter && escrow.state < 2 && (
                    <p className="text-center text-xs text-white/25 py-2">
                      Connect as buyer or arbiter to take action.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-8 space-y-3">
                <p className="text-white/30 text-sm">Connect your wallet to view the escrow</p>
                <button
                  onClick={handleConnect}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition"
                >
                  Connect MetaMask
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tx feedback */}
        {txMsg && (
          <div className={`rounded-xl px-4 py-3 text-sm text-center border ${
            txState === "error"
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : txState === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-blue-500/10 border-blue-500/20 text-blue-400"
          }`}>
            {txState === "pending" && (
              <span className="inline-block w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mr-2 align-middle" />
            )}
            {txMsg}
          </div>
        )}

        {/* View on explorer */}
        {escrow && (
          <div className="text-center">
            <a
              href={`https://testnet.arcscan.app/address/${ESCROW_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/20 hover:text-white/40 transition-colors"
            >
              View contract on Arc Explorer ↗
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Reusable action button ──────────────────────────────────────────────────
function ActionButton({
  label, color, loading, onClick,
}: {
  label: string;
  color: "blue" | "green" | "red" | "purple";
  loading: boolean;
  onClick: () => void;
}) {
  const colors = {
    blue:   "bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]",
    green:  "bg-emerald-600 hover:bg-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]",
    red:    "bg-red-600/80 hover:bg-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]",
    purple: "bg-purple-600 hover:bg-purple-500 hover:shadow-[0_0_20px_rgba(147,51,234,0.3)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full ${colors[color]} disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all active:scale-95 text-sm`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Processing...
        </span>
      ) : label}
    </button>
  );
}