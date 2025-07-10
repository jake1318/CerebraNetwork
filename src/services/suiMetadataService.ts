// src/services/suiMetadataService.ts
import { SuiClient } from "@mysten/sui.js/client";

const sui = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

const metaCache: Record<
  string,
  { decimals: number; symbol?: string; name?: string; iconUrl?: string }
> = {};

export async function getCoinMeta(coinType: string) {
  if (metaCache[coinType]) return metaCache[coinType];

  try {
    const m = await sui.getCoinMetadata({ coinType });
    metaCache[coinType] = {
      decimals: m.decimals ?? 9,
      symbol: m.symbol,
      name: m.name,
      iconUrl: m.iconUrl,
    };
  } catch {
    metaCache[coinType] = { decimals: 9 }; // safe fallback
  }
  return metaCache[coinType];
}
