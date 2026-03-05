import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import {
  FACTORY_ADDRESS, FACTORY_ABI,
  ESCROW_ABI, USDC_ADDRESS, USDC_ABI,
  ARC_TESTNET, ARC_CHAIN_ID,
} from "@/constants";

declare global {
  interface Window { ethereum?: any; }
}

export type EscrowInfo = {
  address: string;
  state: number;
  buyer: string;
  seller: string;
  arbiter: string;
  amount: string;
};

// ── Error parser ─────────────────────────────────────────────────────────────

export function parseError(e: any): string {
  if (e?.message?.includes("user rejected")) return "Transaction cancelled.";
  if (e?.message?.includes("OnlyBuyer")) return "Only the buyer can do this.";
  if (e?.message?.includes("OnlyArbiter")) return "Only the arbiter can do this.";
  if (e?.message?.includes("OnlyBuyerOrArbiter")) return "Only the buyer or arbiter can do this.";
  if (e?.message?.includes("WrongState")) return "Action not allowed in the current escrow state.";
  if (e?.message?.includes("CALL_EXCEPTION")) return "Transaction failed — check your role and escrow state.";
  if (e?.message?.includes("Redirecting")) return "Redirecting to MetaMask...";
  return e?.message || "Something went wrong.";
}

// ── Wallet ───────────────────────────────────────────────────────────────────

export async function switchToArc() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_CHAIN_ID }],
    });
  } catch (e: any) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [ARC_TESTNET],
      });
    } else throw e;
  }
}

export async function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask not found. Please install it at metamask.io");
  return new BrowserProvider(window.ethereum);
}

export async function connectWallet(): Promise<{ address: string; chainId: string }> {
  if (!window.ethereum) {
    const url = window.location.href.replace(/^https?:\/\//, "");
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `https://metamask.app.link/dapp/${url}`;
      throw new Error("Redirecting to MetaMask...");
    }
    throw new Error("MetaMask not found. Install it at metamask.io");
  }
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  return {
    address: accounts[0].toLowerCase(),
    chainId: "0x" + network.chainId.toString(16),
  };
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createEscrow(
  seller: string,
  arbiter: string,
  amount: string,
  onStatus: (msg: string) => void
): Promise<string> {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
  const amountInUnits = parseUnits(amount, 6);
  onStatus("Waiting for wallet confirmation...");
  const tx = await factory.createEscrow(seller, arbiter, amountInUnits);
  onStatus("Deploying escrow on blockchain...");
  const receipt = await tx.wait();
  // Pull the escrow address from the EscrowCreated event
  const iface = new (await import("ethers")).Interface(FACTORY_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "EscrowCreated") {
        return parsed.args.escrow as string;
      }
    } catch {}
  }
  throw new Error("Could not find deployed escrow address in transaction logs.");
}

export async function getEscrowsForWallet(wallet: string): Promise<EscrowInfo[]> {
  const provider = await getProvider();
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  const addresses: string[] = await factory.getEscrowsForParty(wallet);
  const results = await Promise.all(addresses.map(addr => getEscrowState(addr)));
  return results.reverse(); // newest first
}

// ── Individual escrow ────────────────────────────────────────────────────────

export async function getEscrowState(escrowAddress: string): Promise<EscrowInfo> {
  const provider = await getProvider();
  const escrow = new Contract(escrowAddress, ESCROW_ABI, provider);
  const [state, buyer, seller, arbiter, amount] = await Promise.all([
    escrow.state(),
    escrow.buyer(),
    escrow.seller(),
    escrow.arbiter(),
    escrow.amount(),
  ]);
  return {
    address: escrowAddress,
    state: Number(state),
    buyer: (buyer as string).toLowerCase(),
    seller: (seller as string).toLowerCase(),
    arbiter: (arbiter as string).toLowerCase(),
    amount: formatUnits(amount, 6),
  };
}

export async function approveAndDeposit(
  escrowAddress: string,
  amount: string,
  onStatus: (msg: string) => void
) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
  const escrow = new Contract(escrowAddress, ESCROW_ABI, signer);
  const amountInUnits = parseUnits(amount, 6);
  onStatus("Waiting for approval in wallet...");
  const approveTx = await usdc.approve(escrowAddress, amountInUnits);
  onStatus("Approving USDC...");
  await approveTx.wait();
  onStatus("Waiting for deposit confirmation in wallet...");
  const depositTx = await escrow.deposit();
  onStatus("Depositing USDC...");
  await depositTx.wait();
}

export async function confirmDelivery(
  escrowAddress: string,
  onStatus: (msg: string) => void
) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const escrow = new Contract(escrowAddress, ESCROW_ABI, signer);
  onStatus("Waiting for wallet confirmation...");
  const tx = await escrow.confirmDelivery();
  onStatus("Confirming on blockchain...");
  await tx.wait();
}

export async function raiseDispute(
  escrowAddress: string,
  onStatus: (msg: string) => void
) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const escrow = new Contract(escrowAddress, ESCROW_ABI, signer);
  onStatus("Waiting for wallet confirmation...");
  const tx = await escrow.raiseDispute();
  onStatus("Raising dispute on blockchain...");
  await tx.wait();
}

export async function refundBuyer(
  escrowAddress: string,
  onStatus: (msg: string) => void
) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const escrow = new Contract(escrowAddress, ESCROW_ABI, signer);
  onStatus("Waiting for wallet confirmation...");
  const tx = await escrow.refundBuyer();
  onStatus("Processing refund on blockchain...");
  await tx.wait();
}