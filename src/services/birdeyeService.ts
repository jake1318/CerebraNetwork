// src/services/birdeyeService.ts
import axios from "axios";

const API_BASE = "/api";
const DEFAULT_CHAIN = "sui";

export interface BirdeyeTrendingToken {
  address: string; // KEEP original case!
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
  price: number;
  price24hChangePercent?: number;
}

export interface BirdeyeListToken {
  address: string; // KEEP original case!
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
  v24hUSD: number;
  v24hChangePercent: number;
}

export interface PriceVolumeSingle {
  price: string;
  volume24hUSD: string;
}

export const birdeyeService = {
  /**
   * GET /api/token_trending
   * Returns the top trending tokens (with their current price).
   */
  async getTrendingTokens(
    chain: string = DEFAULT_CHAIN,
    limit = 20,
    offset = 0
  ): Promise<BirdeyeTrendingToken[]> {
    try {
      const resp = await axios.get(`${API_BASE}/token_trending`, {
        headers: { "x-chain": chain },
        params: { sort_by: "rank", sort_type: "asc", limit, offset },
      });
      if (!resp.data.success || !resp.data.data?.tokens) return [];

      return resp.data.data.tokens.map((t: any) => ({
        address: t.address, // ← no .toLowerCase()
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI || t.logo_uri || "",
        decimals: t.decimals,
        price: Number(t.price),
        price24hChangePercent: t.price24hChangePercent,
      }));
    } catch (err) {
      console.error("birdeyeService.getTrendingTokens:", err);
      return [];
    }
  },

  /**
   * GET /api/tokenlist
   * Returns the top tokens by 24h volume.
   * Note: this endpoint does not return a spot price—you can call getPriceVolumeSingle().
   */
  async getTokenList(
    chain: string = DEFAULT_CHAIN,
    limit = 50,
    offset = 0,
    min_liquidity = 100
  ): Promise<BirdeyeListToken[]> {
    try {
      const resp = await axios.get(`${API_BASE}/tokenlist`, {
        headers: { "x-chain": chain },
        params: {
          sort_by: "v24hUSD",
          sort_type: "desc",
          offset,
          limit,
          min_liquidity,
        },
      });
      if (!resp.data.success || !resp.data.data?.tokens) return [];

      return resp.data.data.tokens.map((t: any) => ({
        address: t.address, // ← no .toLowerCase()
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI || t.logo_uri || "",
        decimals: t.decimals,
        v24hUSD: Number(t.v24hUSD),
        v24hChangePercent: Number(t.v24hChangePercent),
      }));
    } catch (err) {
      console.error("birdeyeService.getTokenList:", err);
      return [];
    }
  },

  /**
   * GET /api/price_volume/single
   * Fetches the current spot price (and volume) for a single token.
   */
  async getPriceVolumeSingle(
    address: string,
    type: string = "24h",
    chain: string = DEFAULT_CHAIN
  ): Promise<PriceVolumeSingle | null> {
    try {
      const resp = await axios.get(`${API_BASE}/price_volume/single`, {
        headers: { "x-chain": chain },
        params: { address, type },
      });
      if (!resp.data.success || !resp.data.data) return null;
      return resp.data.data as PriceVolumeSingle;
    } catch (err) {
      console.error("birdeyeService.getPriceVolumeSingle:", err);
      return null;
    }
  },

  /**
   * GET /api/history_price
   * Returns historical price points for charting.
   */
  async getLineChartData(
    address: string,
    type: string = "1d",
    chain: string = DEFAULT_CHAIN
  ): Promise<any[]> {
    const now = Math.floor(Date.now() / 1000);
    const spanMap: Record<string, number> = {
      "1m": 3600,
      "5m": 3600 * 3,
      "15m": 3600 * 6,
      "1h": 3600 * 24,
      "1d": 3600 * 24 * 7,
      "1w": 3600 * 24 * 30,
    };
    const time_from = now - (spanMap[type] || spanMap["1d"]);

    try {
      const resp = await axios.get(`${API_BASE}/history_price`, {
        headers: { "x-chain": chain },
        params: {
          address,
          address_type: "token",
          type,
          time_from,
          time_to: now,
        },
      });
      if (!resp.data.success || !Array.isArray(resp.data.data)) return [];
      return resp.data.data;
    } catch (err) {
      console.error("birdeyeService.getLineChartData:", err);
      return [];
    }
  },
};
