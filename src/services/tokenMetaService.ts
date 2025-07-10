// src/services/tokenMetaService.ts
// Created: 2025-07-09 23:13:24 UTC by jake1318

import { getCoinMeta } from "./suiMetadataService"; // on‑chain
import { getTokenMetadata } from "./birdeyeService"; // Birdeye
import { canonicaliseSuiAddress } from "./birdeyeService";
import type { TokenMetadata } from "./birdeyeService";

/** Local in‑memory cache keyed by *canonical* type‑tag */
const cache: Record<
  string,
  { decimals: number; symbol?: string; name?: string; logoUri?: string }
> = {};

/** Return fully‑resolved metadata for a Sui coin type */
export async function resolveTokenMeta(typeTag: string) {
  if (!typeTag) return { decimals: 9 };

  // canonicalise "0x2::sui::SUI" → "0x...0002::sui::SUI"
  const canonical = canonicaliseSuiAddress(typeTag);

  if (cache[canonical]) return cache[canonical];

  // ── 1. Prefer on‑chain metadata (fast, always correct) ────────────────
  try {
    const onChain = await getCoinMeta(canonical);
    cache[canonical] = { ...onChain }; // decimals, symbol, …
    return cache[canonical];
  } catch {
    /* ignore, fall through */
  }

  // ── 2. Fall back to Birdeye if on‑chain call failed ───────────────────
  try {
    const be: TokenMetadata | null = await getTokenMetadata(canonical);
    if (be) {
      cache[canonical] = {
        decimals: be.decimals,
        symbol: be.symbol,
        name: be.name,
        logoUri: be.logo_uri,
      };
      return cache[canonical];
    }
  } catch {
    /* ignore */
  }

  // ── 3. Last resort: assume 9 decimals but *log* the unknown token ────
  console.warn("[meta] Missing decimals for", canonical, "→ default 9");
  cache[canonical] = { decimals: 9 };
  return cache[canonical];
}
