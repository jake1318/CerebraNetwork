// Define common types used across the application
export interface CoinBalance {
  coinType: string;
  symbol: string;
  name: string;
  balance: bigint;
  decimals: number;
  usdValue?: number;
  iconUrl?: string;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  balances: CoinBalance[];
  loading: boolean;
  error: string | null;
}

export interface PoolData {
  id: string;
  name: string;
  tvl: number;
  apr: number;
  volume24h: number;
  coins: {
    coinType: string;
    symbol: string;
    balance: bigint;
    weight: bigint;
    decimals: number;
  }[];
  lpCoinType: string;
  lpCoinSupply: bigint;
  userLpBalance?: bigint;
}

export interface SwapInfo {
  coinIn: string;
  coinOut: string;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  route: any;
}
export interface CachedToken {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
}
