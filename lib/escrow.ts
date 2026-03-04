import { BrowserProvider, Contract, formatUnits } from "ethers";
import {
  ESCROW_ADDRESS, ESCROW_ABI,
  USDC_ADDRESS, USDC_ABI,
  ARC_TESTNET, ARC_CHAIN_ID,
} from "@/constants";

declare global {
  interface Window { ethereum?: any; }
}

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
  if (!window.ethereum) throw new Error("MetaMask not found. Please install it.");
  return new BrowserProvider(window.ethereum);
}

export async function connectWallet(): Promise<{ address: string; chainId: string }> {
  if (!window.ethereum) throw new Error("MetaMask not found. Please install it.");
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  return {
    address: accounts[0].toLowerCase(),
    chainId: "0x" + network.chainId.toString(16),
  };
}

export async function getEscrowState() {
  const provider = await getProvider();
  const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);
  const [state, buyer, seller, arbiter, amount] = await Promise.all([
    escrow.state(),
    escrow.buyer(),
    escrow.seller(),
    escrow.arbiter(),
    escrow.amount(),
  ]);
  return {
    state: Number(state),
    buyer: (buyer as string).toLowerCase(),
    seller: (seller as string).toLowerCase(),
    arbiter: (arbiter as string).toLowerCase(),
    amount: formatUnits(amount, 6),
  };
}

export async function approveAndDeposit(onStatus: (msg: string) => void) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
  const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  onStatus("Waiting for approval in wallet...");
  const approveTx = await usdc.approve(ESCROW_ADDRESS, 10000000n);
  onStatus("Approving USDC... waiting for confirmation");
  await approveTx.wait();
  onStatus("Waiting for deposit confirmation in wallet...");
  const depositTx = await escrow.deposit();
  onStatus("Depositing USDC... waiting for confirmation");
  await depositTx.wait();
}

export async function confirmDelivery(onStatus: (msg: string) => void) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  onStatus("Waiting for wallet confirmation...");
  const tx = await escrow.confirmDelivery();
  onStatus("Confirming on blockchain...");
  await tx.wait();
}

export async function raiseDispute(onStatus: (msg: string) => void) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  onStatus("Waiting for wallet confirmation...");
  const tx = await escrow.raiseDispute();
  onStatus("Raising dispute on blockchain...");
  await tx.wait();
}

export async function refundBuyer(onStatus: (msg: string) => void) {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  onStatus("Waiting for wallet confirmation...");
  const tx = await escrow.refundBuyer();
  onStatus("Processing refund on blockchain...");
  await tx.wait();
}