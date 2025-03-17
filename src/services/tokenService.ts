import { fetchSupportedTokens, fetchTokenBalances } from "./sdkService";

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

// Popular tokens on Sui with their logos as fallbacks
const POPULAR_TOKENS: Partial<Record<string, { logo: string; name: string }>> =
  {
    "0x2::sui::SUI": {
      logo: "https://raw.githubusercontent.com/suiet/sui-wallet/main/packages/chrome/src/assets/sui.png",
      name: "Sui",
    },
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC":
      {
        logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg",
        name: "USD Coin",
      },
    "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::USDT":
      {
        logo: "https://cryptologos.cc/logos/tether-usdt-logo.svg",
        name: "Tether USD",
      },
    "0xaf8cd5edc19c4512f64bc6d869881b5c21506091de5a950a9a9544dd53f12a1a::coin::WETH":
      {
        logo: "https://cryptologos.cc/logos/ethereum-eth-logo.svg",
        name: "Wrapped Ethereum",
      },
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::BTC":
      {
        logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.svg",
        name: "Wrapped Bitcoin",
      },
  };

// Define a list of common tokens to include by default (in case API fails)
const COMMON_TOKEN_ADDRESSES = [
  "0x2::sui::SUI",
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::USDT",
  "0xaf8cd5edc19c4512f64bc6d869881b5c21506091de5a950a9a9544dd53f12a1a::coin::WETH",
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::BTC",
];

// Fetch tokens from SDK or fallback to common list
export async function fetchTokens(): Promise<Token[]> {
  try {
    // Try to fetch from SDK first
    const sdkTokens = await fetchSupportedTokens();

    if (sdkTokens && sdkTokens.length > 0) {
      return sdkTokens;
    }

    // Fallback to hardcoded tokens if SDK fails
    console.log("Falling back to common tokens list");
    return COMMON_TOKEN_ADDRESSES.map((address) => {
      const symbol = address.split("::").pop() || "";
      const tokenInfo = POPULAR_TOKENS[address];

      return {
        address,
        symbol,
        name: tokenInfo?.name || symbol,
        decimals: address.includes("SUI")
          ? 9
          : address.includes("USDC") || address.includes("USDT")
          ? 6
          : 8,
        logo:
          tokenInfo?.logo ||
          `https://ui-avatars.com/api/?name=${symbol}&background=random`,
      };
    });
  } catch (error) {
    console.error("Error fetching tokens:", error);
    // Return the fallback list if fetching fails
    return COMMON_TOKEN_ADDRESSES.map((address) => {
      const symbol = address.split("::").pop() || "";
      const tokenInfo = POPULAR_TOKENS[address];

      return {
        address,
        symbol,
        name: tokenInfo?.name || symbol,
        decimals: address.includes("SUI")
          ? 9
          : address.includes("USDC") || address.includes("USDT")
          ? 6
          : 8,
        logo:
          tokenInfo?.logo ||
          `https://ui-avatars.com/api/?name=${symbol}&background=random`,
      };
    });
  }
}

// Fetch user token balances
export async function getUserTokenBalances(
  address: string,
  tokens: Token[]
): Promise<Token[]> {
  try {
    return await fetchTokenBalances(address, tokens);
  } catch (error) {
    console.error("Error fetching token balances:", error);
    return tokens;
  }
}
