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
}

// Fetch tokens from SDK with error handling
export async function fetchTokens(): Promise<Token[]> {
  try {
    // Try to fetch from SDK
    const sdkTokens = await fetchSDKTokens();

    if (sdkTokens && sdkTokens.length > 0) {
      return sdkTokens;
    }

    throw new Error("No tokens returned from SDK");
  } catch (error) {
    console.error("Error fetching tokens:", error);
    // Return basic tokens if SDK fails
    return [
      {
        symbol: "SUI",
        address: "0x2::sui::SUI",
        name: "Sui",
        decimals: 9,
        logo: "https://raw.githubusercontent.com/suiet/sui-wallet/main/packages/chrome/src/assets/sui.png",
      },
      {
        symbol: "USDC",
        address:
          "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
        name: "USD Coin",
        decimals: 6,
        logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg",
      },
      {
        symbol: "USDT",
        address:
          "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::USDT",
        name: "Tether USD",
        decimals: 6,
        logo: "https://cryptologos.cc/logos/tether-usdt-logo.svg",
      },
      {
        symbol: "WETH",
        name: "Wrapped Ethereum",
        address:
          "0xaf8cd5edc19c4512f64bc6d869881b5c21506091de5a950a9a9544dd53f12a1a::coin::WETH",
        decimals: 8,
        logo: "https://cryptologos.cc/logos/ethereum-eth-logo.svg",
      },
      {
        symbol: "BTC",
        name: "Wrapped Bitcoin",
        address:
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::BTC",
        decimals: 8,
        logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.svg",
      },
      {
        symbol: "CETUS",
        name: "Cetus Token",
        address:
          "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
        decimals: 9,
        logo: "https://raw.githubusercontent.com/cetus-app/brand-kit/main/Cetus%20brand%20kit/logo/cetus.png",
      },
    ];
  }
}

// Get user token balances - this is now handled directly in TokenSelector using Suiet hooks
export async function getUserTokenBalances(
  address: string,
  tokens: Token[]
): Promise<Token[]> {
  // This function exists for backward compatibility, but all balance fetching is now done with Suiet hooks
  return tokens;
}
