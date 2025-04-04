import { fetchSupportedTokens as fetchSDKTokens } from "./sdkService";

// Define the token interface
export interface Token {
  symbol: string;
  address: string;
  name?: string;
  decimals: number;
  logo?: string;
  price?: number;
  balance?: string;
  balanceUsd?: string;
  volume24h?: number; // 24-hour trading volume
  marketCap?: number; // Market capitalization
}

// Fetch tokens from SDK with error handling and additional data
export async function fetchTokens(): Promise<Token[]> {
  try {
    // Try to fetch from SDK
    const sdkTokens = await fetchSDKTokens();

    if (sdkTokens && sdkTokens.length > 0) {
      // Sort by trading volume if available, otherwise keep original order
      const sortedTokens = sdkTokens.sort((a, b) => {
        if (a.volume24h && b.volume24h) {
          return b.volume24h - a.volume24h;
        }
        return 0;
      });

      // Return top 50 tokens or all if less than 50
      return sortedTokens.slice(0, 50);
    }

    throw new Error("No tokens returned from SDK");
  } catch (error) {
    console.error("Error fetching tokens:", error);
    // Return basic tokens if SDK fails
    return getDefaultTokens();
  }
}

// Function to get default tokens as a fallback
function getDefaultTokens(): Token[] {
  return [
    {
      symbol: "SUI",
      address: "0x2::sui::SUI",
      name: "Sui",
      decimals: 9,
      logo: "https://raw.githubusercontent.com/suiet/sui-wallet/main/packages/chrome/src/assets/sui.png",
      volume24h: 10000000, // Example volume
      marketCap: 1200000000, // Example market cap
    },
    {
      symbol: "USDC",
      address:
        "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      name: "USD Coin",
      decimals: 6,
      logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg",
      volume24h: 8000000,
      marketCap: 28000000000,
    },
    {
      symbol: "USDT",
      address:
        "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::USDT",
      name: "Tether USD",
      decimals: 6,
      logo: "https://cryptologos.cc/logos/tether-usdt-logo.svg",
      volume24h: 7500000,
      marketCap: 85000000000,
    },
    {
      symbol: "WETH",
      name: "Wrapped Ethereum",
      address:
        "0xaf8cd5edc19c4512f64bc6d869881b5c21506091de5a950a9a9544dd53f12a1a::coin::WETH",
      decimals: 8,
      logo: "https://cryptologos.cc/logos/ethereum-eth-logo.svg",
      volume24h: 6500000,
      marketCap: 245000000000,
    },
    {
      symbol: "BTC",
      name: "Wrapped Bitcoin",
      address:
        "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::BTC",
      decimals: 8,
      logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.svg",
      volume24h: 9000000,
      marketCap: 730000000000,
    },
    {
      symbol: "CETUS",
      name: "Cetus Token",
      address:
        "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
      decimals: 9,
      logo: "https://raw.githubusercontent.com/cetus-app/brand-kit/main/Cetus%20brand%20kit/logo/cetus.png",
      volume24h: 4500000,
      marketCap: 120000000,
    },
    // Add more default tokens to reach 50 as needed
    {
      symbol: "TURBOS",
      name: "Turbos Finance",
      address:
        "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::turbos::TURBOS",
      decimals: 9,
      logo: "https://assets.coingecko.com/coins/images/30795/large/Turbos.png",
      volume24h: 3500000,
      marketCap: 85000000,
    },
    {
      symbol: "SUIA",
      name: "Suia",
      address:
        "0x1a097f8462f9233b6d3dfa17d1f5c5e5791846a3d7621a834134c27d52177a4e::suia::SUIA",
      decimals: 9,
      logo: "https://assets.coingecko.com/coins/images/30938/large/suia.jpg",
      volume24h: 2800000,
      marketCap: 42000000,
    },
    {
      symbol: "WSUM",
      name: "Wrapped SUI Miner",
      address:
        "0x5029d5a94429a73b8036cd631c9d0f4ada873ea7fe9c8c889659b8b480e7eada::coin::WSUM",
      decimals: 9,
      logo: "https://assets.coingecko.com/coins/images/31057/large/wsum.jpg",
      volume24h: 2200000,
      marketCap: 18000000,
    },
    {
      symbol: "MFIN",
      name: "Mystenlabs Finance",
      address:
        "0x1e8b532cca6c4cabcbc0a8bd0e3cadbe3a9f92b6c43b8c3781ec91c0c4fe0b9f::coin::MFIN",
      decimals: 9,
      logo: "https://assets.coingecko.com/coins/images/31127/large/MFIN.png",
      volume24h: 1900000,
      marketCap: 12000000,
    },
    // Add more tokens to reach 50...
  ];
}

// Get user token balances - this is now handled directly in TokenSelector using Suiet hooks
export async function getUserTokenBalances(
  address: string,
  tokens: Token[]
): Promise<Token[]> {
  // This function exists for backward compatibility, but all balance fetching is now done with Suiet hooks
  return tokens;
}
