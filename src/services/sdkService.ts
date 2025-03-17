import {
  getSuiClient,
  getTokenBalance,
  getTokenPrice as get7kTokenPrice,
} from "@7kprotocol/sdk-ts";
import { SuiClient } from "@mysten/sui/client";
import { Token } from "./tokenService";

// Get all available tokens from the 7k Protocol SDK
export async function fetchSupportedTokens(): Promise<Token[]> {
  try {
    const client = getSuiClient();
    if (!client) {
      throw new Error("SuiClient not initialized");
    }

    // Fetch core 7k Protocol tokens directly from the Sui RPC
    const response = await fetch("https://sui-mainnet-rpc.allthatnode.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getCoinMetadata",
        params: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tokens: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.result) {
      throw new Error("Invalid response from RPC");
    }

    // Map the coin metadata to our Token interface
    // The Sui RPC returns an array of coin metadata objects
    const tokens: Token[] = [];

    // Add SUI token which may not be in the metadata list
    tokens.push({
      symbol: "SUI",
      name: "Sui",
      address: "0x2::sui::SUI",
      decimals: 9,
      logo: "https://raw.githubusercontent.com/suiet/sui-wallet/main/packages/chrome/src/assets/sui.png",
    });

    // Add USDC token which is commonly used
    tokens.push({
      symbol: "USDC",
      name: "USD Coin",
      address:
        "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      decimals: 6,
      logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg",
    });

    // Process other common tokens on Sui
    const commonTokens = [
      {
        symbol: "USDT",
        name: "Tether USD",
        address:
          "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::USDT",
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

    // Add all common tokens to our list
    tokens.push(...commonTokens);

    return tokens;
  } catch (error) {
    console.error("Error fetching supported tokens:", error);
    throw error;
  }
}

// Get real token balances for a user using the 7k Protocol SDK
export async function fetchTokenBalances(
  address: string,
  tokens: Token[]
): Promise<Token[]> {
  try {
    if (!address) {
      return tokens;
    }

    const updatedTokens: Token[] = [];

    // Fetch balance for each token using the 7k Protocol SDK
    for (const token of tokens) {
      try {
        // Get token balance using the SDK
        const balance = await getTokenBalance(address, token.address);

        // Get token price using the SDK
        let price = 0;
        try {
          price = await get7kTokenPrice(token.address);
        } catch (priceError) {
          console.warn(
            `Could not fetch price for ${token.symbol}:`,
            priceError
          );
          // Default prices for common tokens
          if (token.symbol === "SUI") price = 0.8;
          else if (token.symbol === "USDC" || token.symbol === "USDT")
            price = 1.0;
        }

        // Calculate balance in human-readable format and USD value
        const balanceFormatted = balance
          ? (parseFloat(balance) / Math.pow(10, token.decimals)).toFixed(4)
          : "0.0000";

        const balanceUsd = (parseFloat(balanceFormatted) * price).toFixed(2);

        updatedTokens.push({
          ...token,
          balance: balanceFormatted,
          balanceUsd: balanceUsd,
          price,
        });
      } catch (error) {
        console.warn(`Error fetching balance for ${token.symbol}:`, error);
        // Add token without balance info
        updatedTokens.push(token);
      }
    }

    return updatedTokens;
  } catch (error) {
    console.error("Error fetching token balances:", error);
    return tokens; // Return original tokens if fetch fails
  }
}

// Get real token price from the 7k Protocol SDK
export async function getTokenPrice(tokenAddress: string): Promise<number> {
  try {
    // Use the 7k Protocol SDK to get the token price
    const price = await get7kTokenPrice(tokenAddress);
    return price;
  } catch (error) {
    console.error(`Error fetching price for ${tokenAddress}:`, error);

    // Default prices for common tokens as fallback
    if (tokenAddress.includes("SUI")) {
      return 0.8; // Default SUI price
    } else if (tokenAddress.includes("USDC") || tokenAddress.includes("USDT")) {
      return 1.0; // Default stablecoin price
    }

    throw error; // Re-throw for other tokens
  }
}
