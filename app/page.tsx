"use client";

import { useState, useEffect, useCallback } from "react";
import {
  connectWallet, switchToArc,
  createEscrow, getEscrowsForWallet, getEscrowState,
  approveAndDeposit, confirmDelivery, raiseDispute, refundBuyer,
  parseError, type EscrowInfo,
} from "@/lib/escrow";
import { STATE_LABELS, FACTORY_ADDRESS, ARC_CHAIN_ID } from "@/constants";

type View = "landing" | "dashboard" | "create" | "detail";
type TxState = "idle" | "pending" | "success" | "error";

const STATE_COLORS: Record<number, { bg: string; text: string; dot: string }> = {
  0: { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400"   },
  1: { bg: "bg-blue-500/10",    text: "text-blue-400",    dot: "bg-blue-400"    },
  2: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  3: { bg: "bg-red-500/10",     text: "text-red-400",     dot: "bg-red-400"     },
  4: { bg: "bg-slate-500/10",   text: "text-slate-400",   dot: "bg-slate-400"   },
};

const STEPS = [
  { icon: "💰", title: "Buyer Funds",      desc: "Buyer locks USDC in the smart contract"     },
  { icon: "📦", title: "Seller Delivers",  desc: "Seller completes the agreed work"            },
  { icon: "✅", title: "Funds Released",   desc: "Buyer confirms and USDC transfers to seller" },
];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isValidAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function ActionButton({ label, color, loading, onClick }: {
  label: string; color: "blue"|"green"|"red"|"purple"|"amber";
  loading: boolean; onClick: () => void;
}) {
  const colors = {
    blue:   "bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]",
    green:  "bg-emerald-600 hover:bg-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]",
    red:    "bg-red-600/80 hover:bg-red-500",
    purple: "bg-purple-600 hover:bg-purple-500",
    amber:  "bg-amber-500 hover:bg-amber-400 text-black",
  };
  return (
    <button onClick={onClick} disabled={loading}
      className={`w-full ${colors[color]} disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all active:scale-95 text-sm`}>
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Processing...
        </span>
      ) : label}
    </button>
  );
}

function TxFeedback({ state, msg }: { state: TxState; msg: string }) {
  if (!msg || state === "idle") return null;
  const styles = {
    pending: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    error:   "bg-red-500/10 border-red-500/20 text-red-400",
    idle:    "",
  };
  return (
    <div className={`rounded-xl px-4 py-3 text-sm text-center border ${styles[state]}`}>
      {state === "pending" && (
        <span className="inline-block w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mr-2 align-middle" />
      )}
      {msg}
    </div>
  );
}

function EscrowCard({ escrow, wallet, onClick }: {
  escrow: EscrowInfo; wallet: string; onClick: () => void;
}) {
  const c = STATE_COLORS[escrow.state];
  const role = escrow.buyer === wallet ? "Buyer"
    : escrow.seller === wallet ? "Seller"
    : escrow.arbiter === wallet ? "Arbiter" : "";
  return (
    <button onClick={onClick}
      className="w-full bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-2xl p-4 text-left transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-white/30">{shortAddr(escrow.address)}</span>
            {role && <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">{role}</span>}
          </div>
          <p className="text-xl font-bold text-white">{escrow.amount} <span className="text-sm font-normal text-white/40">USDC</span></p>
          <p className="text-xs text-white/30">
            {escrow.buyer === wallet ? `To: ${shortAddr(escrow.seller)}` : `From: ${shortAddr(escrow.buyer)}`}
          </p>
        </div>
        <div className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
          {STATE_LABELS[escrow.state]}
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const [view, setView]         = useState<View>("landing");
  const [wallet, setWallet]     = useState<string | null>(null);
  const [chainId, setChainId]   = useState<string | null>(null);
  const [escrows, setEscrows]   = useState<EscrowInfo[]>([]);
  const [selected, setSelected] = useState<EscrowInfo | null>(null);
  const [loading, setLoading]   = useState(false);
  const [txState, setTxState]   = useState<TxState>("idle");
  const [txMsg, setTxMsg]       = useState("");
  const [seller, setSeller]     = useState("");
  const [arbiter, setArbiter]   = useState("");
  const [amount, setAmount]     = useState("");

  const isWrongNetwork = chainId !== null && chainId.toLowerCase() !== ARC_CHAIN_ID.toLowerCase();
  const resetTx = () => { setTxState("idle"); setTxMsg(""); };

  const fetchDashboard = useCallback(async (addr: string) => {
    setLoading(true);
    try {
      const data = await getEscrowsForWallet(addr);
      setEscrows(data);
    } catch (e: any) { setTxMsg(parseError(e)); setTxState("error"); }
    finally { setLoading(false); }
  }, []);

  const refreshSelected = useCallback(async () => {
    if (!selected) return;
    try {
      const updated = await getEscrowState(selected.address);
      setSelected(updated);
      if (wallet) { const data = await getEscrowsForWallet(wallet); setEscrows(data); }
    } catch {}
  }, [selected, wallet]);

  useEffect(() => {
    if (wallet && view === "dashboard") fetchDashboard(wallet);
  }, [wallet, view, fetchDashboard]);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (a: string[]) => setWallet(a[0]?.toLowerCase() || null);
    const onChain = (id: string) => setChainId(id);
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, []);

  async function handleConnect() {
    try {
      resetTx();
      const { address, chainId: cid } = await connectWallet();
      setWallet(address); setChainId(cid);
      setView("dashboard");
    } catch (e: any) { setTxMsg(parseError(e)); setTxState("error"); }
  }

  async function handleSwitchNetwork() {
    try { await switchToArc(); const { chainId: cid } = await connectWallet(); setChainId(cid); }
    catch (e: any) { setTxMsg(parseError(e)); setTxState("error"); }
  }

  async function handleAction(fn: () => Promise<void>) {
    setTxState("pending"); setTxMsg("");
    try {
      await fn();
      setTxState("success"); setTxMsg("Transaction confirmed ✅");
      await refreshSelected();
    } catch (e: any) { setTxState("error"); setTxMsg(parseError(e)); }
  }

  async function handleCreate() {
    if (!isValidAddress(seller))  { setTxMsg("Invalid seller address.");  setTxState("error"); return; }
    if (!isValidAddress(arbiter)) { setTxMsg("Invalid arbiter address."); setTxState("error"); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setTxMsg("Enter a valid USDC amount."); setTxState("error"); return;
    }
    setTxState("pending"); setTxMsg("");
    try {
      const addr = await createEscrow(seller, arbiter, amount, (msg) => setTxMsg(msg));
      setTxState("success"); setTxMsg("Escrow created ✅");
      setSeller(""); setArbiter(""); setAmount("");
      if (wallet) await fetchDashboard(wallet);
      const info = await getEscrowState(addr);
      setSelected(info);
      setView("detail");
    } catch (e: any) { setTxState("error"); setTxMsg(parseError(e)); }
  }

  const isBuyer   = wallet && selected && wallet === selected.buyer;
  const isArbiter = wallet && selected && wallet === selected.arbiter;

  // ── Landing ───────────────────────────────────────────────────────────────
  if (view === "landing") return (
    <main className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="relative max-w-4xl mx-auto px-6 py-20 flex flex-col items-center text-center gap-16">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-blue-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live on Arc Testnet
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight">
            Trustless payments,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">secured onchain.</span>
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto leading-relaxed">
            Create or join a USDC escrow in seconds. Funds locked in a smart contract until both parties agree.
          </p>
        </div>
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <div key={i} className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 text-left hover:bg-white/[0.06] transition-colors">
              <div className="text-3xl mb-3">{s.icon}</div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-white/30">0{i+1}</span>
                <h3 className="font-semibold text-white">{s.title}</h3>
              </div>
              <p className="text-sm text-white/40 leading-relaxed">{s.desc}</p>
              {i < 2 && <div className="hidden sm:block absolute top-1/2 -right-2 -translate-y-1/2 text-white/20 text-lg z-10">→</div>}
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <button onClick={handleConnect}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 px-6 rounded-xl transition-all hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] active:scale-95">
            Open Dashboard
          </button>
        </div>
        {txMsg && <p className="text-sm text-red-400">{txMsg}</p>}
        <div className="flex flex-col items-center gap-2 text-xs text-white/25">
          <p>Powered by smart contracts on Arc — built with Circle&apos;s USDC</p>
          <a href={`https://testnet.arcscan.app/address/${FACTORY_ADDRESS}`} target="_blank" rel="noopener noreferrer"
            className="font-mono hover:text-white/50 transition-colors">
            Factory: {shortAddr(FACTORY_ADDRESS)} ↗
          </a>
        </div>
      </div>
    </main>
  );

  const Layout = ({ children, title, back }: { children: React.ReactNode; title: string; back?: () => void }) => (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />
      <div className="relative max-w-lg mx-auto px-4 py-10 space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={back || (() => setView("landing"))} className="text-white/30 hover:text-white/60 text-sm transition-colors">
            ← {back ? "Back" : "Home"}
          </button>
          {wallet ? (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-mono text-white/60">{shortAddr(wallet)}</span>
            </div>
          ) : (
            <button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-full transition">
              Connect Wallet
            </button>
          )}
        </div>
        {isWrongNetwork && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-400">Wrong Network</p>
              <p className="text-xs text-amber-400/60 mt-0.5">Switch to Arc Testnet to continue</p>
            </div>
            <button onClick={handleSwitchNetwork} className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg transition flex-shrink-0">
              Switch
            </button>
          </div>
        )}
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {children}
      </div>
    </main>
  );

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (view === "dashboard") return (
    <Layout title="Your Escrows">
      {/* Faucet banner */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-xs text-white/40 leading-relaxed">
          Need testnet USDC to get started?{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2">
            Get it free at faucet.circle.com
          </a>{" "}
          → select <span className="text-white/60 font-medium">Arc Testnet</span>
        </p>
      </div>
      
      <button onClick={() => { resetTx(); setView("create"); }}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95 text-sm">
        + Create New Escrow
      </button>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : !wallet ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-white/30 text-sm">Connect your wallet to see your escrows</p>
          <button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition">
            Connect MetaMask
          </button>
        </div>
      ) : escrows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/20 text-sm">No escrows yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {escrows.map(e => (
            <EscrowCard key={e.address} escrow={e} wallet={wallet}
              onClick={() => { setSelected(e); resetTx(); setView("detail"); }} />
          ))}
        </div>
      )}
    </Layout>
  );

  // ── Create Escrow ─────────────────────────────────────────────────────────
  if (view === "create") return (
    <Layout title="Create Escrow" back={() => setView("dashboard")}>
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-white/40 font-medium">Seller Address</label>
          <input value={seller} onChange={e => setSeller(e.target.value)} placeholder="0x..."
            className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-white/20 outline-none focus:border-blue-500/50 transition-colors ${seller && !isValidAddress(seller) ? "border-red-500/50" : "border-white/10"}`} />
          {seller && !isValidAddress(seller) && <p className="text-xs text-red-400">Invalid address</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 font-medium">Arbiter Address</label>
          <input value={arbiter} onChange={e => setArbiter(e.target.value)} placeholder="0x..."
            className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-white/20 outline-none focus:border-blue-500/50 transition-colors ${arbiter && !isValidAddress(arbiter) ? "border-red-500/50" : "border-white/10"}`} />
          {arbiter && !isValidAddress(arbiter) && <p className="text-xs text-red-400">Invalid address</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/40 font-medium">Amount (USDC)</label>
          <div className="relative">
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.00" type="number" min="0" step="0.01"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/50 transition-colors pr-16" />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-medium">USDC</span>
          </div>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-xs text-blue-400/70 leading-relaxed">
          Funds will be locked in a new smart contract until you confirm delivery or raise a dispute.
        </div>
        <ActionButton label="Create & Deploy Escrow" color="blue" loading={txState === "pending"} onClick={handleCreate} />
      </div>
      <TxFeedback state={txState} msg={txMsg} />
    </Layout>
  );

  // ── Escrow Detail ─────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    const c = STATE_COLORS[selected.state];
    return (
      <Layout title="Escrow Detail" back={() => { setView("dashboard"); resetTx(); }}>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-white/30">{shortAddr(selected.address)}</p>
              <a href={`https://testnet.arcscan.app/address/${selected.address}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400/50 hover:text-blue-400 transition-colors">View on Explorer ↗</a>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              {STATE_LABELS[selected.state]}
            </div>
          </div>
          <div className="p-5 space-y-5">
            <div className="text-center py-2">
              <p className="text-4xl font-bold text-white">{selected.amount}</p>
              <p className="text-sm text-white/30 mt-1">USDC locked in escrow</p>
            </div>
            <div className="flex items-center gap-1">
              {[
                { label: "Funded",    done: selected.state >= 1 },
                { label: "Delivered", done: selected.state >= 2 },
                { label: "Released",  done: selected.state === 2 },
              ].map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-full h-1 rounded-full transition-colors ${s.done ? "bg-blue-500" : "bg-white/10"}`} />
                  <span className={`text-[10px] font-medium ${s.done ? "text-blue-400" : "text-white/25"}`}>
                    {s.done ? "✓ " : ""}{s.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[
                { label: "Buyer",   addr: selected.buyer,   color: "text-blue-400"    },
                { label: "Seller",  addr: selected.seller,  color: "text-emerald-400" },
                { label: "Arbiter", addr: selected.arbiter, color: "text-purple-400"  },
              ].map(({ label, addr, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className={`text-xs font-medium ${color}`}>{label}</span>
                  <span className="font-mono text-white/40 text-xs">
                    {shortAddr(addr)}{addr === wallet && <span className="ml-1 text-white/20">(you)</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-1">
              {isBuyer && selected.state === 0 && (
                <ActionButton label={`Approve & Deposit ${selected.amount} USDC`} color="blue"
                  loading={txState === "pending"}
                  onClick={() => handleAction(() => approveAndDeposit(selected.address, selected.amount, (m) => setTxMsg(m)))} />
              )}
              {isBuyer && selected.state === 1 && (<>
                <ActionButton label="Confirm Delivery → Release Funds" color="green"
                  loading={txState === "pending"}
                  onClick={() => handleAction(() => confirmDelivery(selected.address, (m) => setTxMsg(m)))} />
                <ActionButton label="Raise Dispute" color="red"
                  loading={txState === "pending"}
                  onClick={() => handleAction(() => raiseDispute(selected.address, (m) => setTxMsg(m)))} />
              </>)}
              {isArbiter && selected.state === 1 && (
                <ActionButton label="Release Funds to Seller" color="green"
                  loading={txState === "pending"}
                  onClick={() => handleAction(() => confirmDelivery(selected.address, (m) => setTxMsg(m)))} />
              )}
              {isArbiter && selected.state === 3 && (
                <ActionButton label="Refund Buyer" color="purple"
                  loading={txState === "pending"}
                  onClick={() => handleAction(() => refundBuyer(selected.address, (m) => setTxMsg(m)))} />
              )}
              {(selected.state === 2 || selected.state === 4) && (
                <p className="text-center text-xs text-white/25 py-2">
                  This escrow is {STATE_LABELS[selected.state].toLowerCase()}. No further actions.
                </p>
              )}
              {!isBuyer && !isArbiter && selected.state < 2 && wallet && (
                <p className="text-center text-xs text-white/25 py-2">
                  You are viewing as {selected.seller === wallet ? "seller" : "observer"}. No actions available for your role.
                </p>
              )}
              {!wallet && (
                <button onClick={handleConnect} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition text-sm">
                  Connect Wallet to Take Action
                </button>
              )}
            </div>
          </div>
        </div>
        <TxFeedback state={txState} msg={txMsg} />
      </Layout>
    );
  }

  return null;
}