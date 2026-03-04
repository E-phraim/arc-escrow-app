export const ESCROW_ADDRESS = "0xa162f00b430d15a0c229FB30b3937C80DEcB9eBa";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

export const ESCROW_ABI = [
  "function state() view returns (uint8)",
  "function buyer() view returns (address)",
  "function seller() view returns (address)",
  "function arbiter() view returns (address)",
  "function amount() view returns (uint256)",
  "function deposit() external",
  "function confirmDelivery() external",
  "function raiseDispute() external",
  "function refundBuyer() external",
];

export const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

export const STATE_LABELS: Record<number, string> = {
  0: "Awaiting Deposit",
  1: "Awaiting Delivery",
  2: "Complete",
  3: "Disputed",
  4: "Refunded",
};

export const ARC_CHAIN_ID = "0x45C";  // 1116 in hex

export const ARC_TESTNET = {
  chainId: ARC_CHAIN_ID,
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.network"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};