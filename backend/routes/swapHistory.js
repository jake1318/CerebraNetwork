// routes/swapHistory.js
// Last Updated: 2025-07-11 06:35:12 UTC by jake1318

import express from "express";
import axios from "axios";

const router = express.Router();
const K7_STATISTIC_API = "https://statistic.7k.ag";

/**
 * Route to fetch swap/trading history from 7K API
 * Proxies requests to avoid CORS issues in the frontend
 */
router.post("/trading-history", async (req, res) => {
  try {
    // Extract parameters from request body
    const { address, offset = 0, limit = 10, tokenPair } = req.body;

    // Validate required parameters
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Address parameter is required",
      });
    }

    // Ensure address is correctly formatted with 0x prefix
    const formattedAddress = address.startsWith("0x")
      ? address
      : `0x${address}`;

    // Construct the URL to 7K's API
    let url = `${K7_STATISTIC_API}/trading-history?addr=${formattedAddress}&offset=${offset}&limit=${limit}`;

    // Add token pair if provided
    if (tokenPair) {
      url += `&token_pair=${encodeURIComponent(tokenPair)}`;
    }

    console.log(`[7K API] Requesting swap history: ${url}`);

    // Make the API call to 7K with extended debugging
    try {
      const response = await axios.get(url, {
        headers: {
          Accept: "application/json",
        },
        timeout: 10000, // 10 second timeout
        validateStatus: function (status) {
          // Consider 404 as valid response for empty history
          return (status >= 200 && status < 300) || status === 404;
        },
      });

      // Log response details for debugging
      console.log(`[7K API] Response status: ${response.status}`);

      // Handle 404 case (no history)
      if (response.status === 404) {
        console.log(
          "[7K API] No history found for this address (404 response)"
        );
        return res.json({
          success: true,
          history: [],
          count: 0,
          message: "No swap history found for this address",
        });
      }

      // Process the successful response
      // The expected format is { count: number, history: array }
      if (response.data && response.data.history) {
        console.log(
          `[7K API] Found ${response.data.history.length} swap history items`
        );

        // Map the 7K API response format to our expected SwapHistoryItem format
        const mappedHistory = response.data.history.map((item) => ({
          id: item.digest || `tx-${item.timestamp}`,
          timestamp: parseInt(item.timestamp) || 0,
          fromToken: {
            address: item.coin_in || "",
            symbol: getSymbolFromAddress(item.coin_in) || "Unknown",
            amount: item.amount_in || "0",
            decimals: getDecimalsForToken(item.coin_in) || 9,
          },
          toToken: {
            address: item.coin_out || "",
            symbol: getSymbolFromAddress(item.coin_out) || "Unknown",
            amount: item.amount_out || "0",
            decimals: getDecimalsForToken(item.coin_out) || 9,
          },
          txHash: item.digest || "",
          status: "completed", // 7K API doesn't provide status, assume completed
          priceImpact:
            calculatePriceImpact(
              item.amount_in,
              item.amount_out,
              item.coin_in,
              item.coin_out
            ) || 0,
        }));

        return res.json({
          success: true,
          history: mappedHistory,
          count: response.data.count || mappedHistory.length,
        });
      } else if (Array.isArray(response.data)) {
        // Handle case where response is directly an array
        console.log(
          `[7K API] Found ${response.data.length} swap history items (array format)`
        );

        // Similar mapping as above but for array format
        const mappedHistory = response.data.map((item) => ({
          id: item.digest || `tx-${item.timestamp}`,
          timestamp: parseInt(item.timestamp) || 0,
          fromToken: {
            address: item.coin_in || "",
            symbol: getSymbolFromAddress(item.coin_in) || "Unknown",
            amount: item.amount_in || "0",
            decimals: getDecimalsForToken(item.coin_in) || 9,
          },
          toToken: {
            address: item.coin_out || "",
            symbol: getSymbolFromAddress(item.coin_out) || "Unknown",
            amount: item.amount_out || "0",
            decimals: getDecimalsForToken(item.coin_out) || 9,
          },
          txHash: item.digest || "",
          status: "completed",
          priceImpact:
            calculatePriceImpact(
              item.amount_in,
              item.amount_out,
              item.coin_in,
              item.coin_out
            ) || 0,
        }));

        return res.json({
          success: true,
          history: mappedHistory,
          count: mappedHistory.length,
        });
      } else {
        // Handle unexpected response format
        console.warn("[7K API] Unexpected response format:", response.data);
        return res.json({
          success: true,
          history: [],
          count: 0,
          message: "No history found or unexpected response format",
        });
      }
    } catch (axiosError) {
      // Detailed error logging for network/request issues
      console.error("[7K API] Request error:", {
        message: axiosError.message,
        code: axiosError.code,
        response: axiosError.response
          ? {
              status: axiosError.response.status,
              statusText: axiosError.response.statusText,
              data: axiosError.response.data,
            }
          : "No response",
        config: axiosError.config
          ? {
              url: axiosError.config.url,
              method: axiosError.config.method,
              headers: axiosError.config.headers,
            }
          : "No config",
      });

      // Special handling for 404 - treat as empty history
      if (axiosError.response && axiosError.response.status === 404) {
        return res.json({
          success: true,
          history: [],
          count: 0,
          message: "No history found for this address",
        });
      }

      throw axiosError; // Re-throw for the outer catch block
    }
  } catch (error) {
    console.error("Error proxying swap history:", error.message);

    // Return error response
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch swap history",
    });
  }
});

// Helper functions

// Map common token addresses to symbols
const COMMON_TOKENS = {
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI":
    {
      symbol: "SUI",
      decimals: 9,
    },
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC":
    {
      symbol: "USDC",
      decimals: 6,
    },
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN":
    {
      symbol: "USDT",
      decimals: 6,
    },
  // Add more common tokens as needed
};

function getSymbolFromAddress(address) {
  if (!address) return "Unknown";

  // Check if we know this token
  const knownToken = COMMON_TOKENS[address];
  if (knownToken) {
    return knownToken.symbol;
  }

  // Try to extract symbol from address format like "0x123::module::SYMBOL"
  const parts = address.split("::");
  if (parts.length >= 3) {
    return parts[2]; // Return the symbol part
  }

  return "Unknown";
}

function getDecimalsForToken(address) {
  if (!address) return 9; // Default to 9 decimals (SUI standard)

  const knownToken = COMMON_TOKENS[address];
  if (knownToken && knownToken.decimals !== undefined) {
    return knownToken.decimals;
  }

  // Default values based on common standards
  if (
    address.toLowerCase().includes("usdc") ||
    address.toLowerCase().includes("usdt")
  ) {
    return 6;
  }

  return 9; // Default to 9 decimals (SUI standard)
}

function calculatePriceImpact(amountIn, amountOut, coinIn, coinOut) {
  // This is a simplified placeholder implementation
  // Real price impact calculation would need token prices and liquidity data
  return 0.5; // Return a default small value
}

export default router;
