import {
  getSuiClient,
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

    // Add core tokens directly
    const tokens: Token[] = [
      {
        symbol: "SUI",
        name: "Sui",
        address: "0x2::sui::SUI",
        decimals: 9,
        logo: "https://raw.githubusercontent.com/suiet/sui-wallet/main/packages/chrome/src/assets/sui.png",
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        address:
          "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
        decimals: 6,
        logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg",
      },
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

    // Try to get more tokens using the Sui RPC
    try {
      // Fetch additional tokens data if needed - this is a placeholder
      // In a production app, you'd fetch from a more comprehensive source
    } catch (tokenListError) {
      console.warn("Could not fetch additional tokens:", tokenListError);
    }

    return tokens;
  } catch (error) {
    console.error("Error fetching supported tokens:", error);
    throw error;
  }
}

// Get token price from the 7k Protocol SDK
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

// Get coin metadata to determine decimals
export async function getCoinMetadata(
  provider: any,
  coinType: string
): Promise<any> {
  try {
    const metadata = await provider.getCoinMetadata({ coinType });
    return metadata;
  } catch (error) {
    console.error(`Error fetching metadata for ${coinType}:`, error);

    // Default decimal values for common coins
    if (coinType === "0x2::sui::SUI") {
      return { decimals: 9, symbol: "SUI", name: "Sui" };
    }
    if (coinType.includes("USDC")) {
      return { decimals: 6, symbol: "USDC", name: "USD Coin" };
    }
    if (coinType.includes("USDT")) {
      return { decimals: 6, symbol: "USDT", name: "Tether USD" };
    }

    throw error;
  }
}
