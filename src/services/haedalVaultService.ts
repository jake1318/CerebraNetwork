// src/services/haedalVaultService.ts
// Last Updated: 2025-07-05 00:25:10 UTC by jake1318

import { CetusVaultsSDK } from "@cetusprotocol/vaults-sdk";

const haedalSdk = CetusVaultsSDK.createSDK({ env: "mainnet" });

/** Main‑net vault IDs managed by Haedal */
const HAEDAL_VAULT_IDS = [
  //SUI – USDC
  "0x41a4ab1e82f90f5965bbcd828b8ffa13bab7560bd2e352ab067e343db552f527",
  //WAL – SUI
  "0x083981a898882322f1ac035e9b56ea11474866bb4c97a1883e9b789bedca4412",
  //DEEP – SUI
  "0xed754b6a3a6c7549c3d734cb7b464bccf9c805814b9e47b0cb99f43b4efcb4a6",
  //LBTC - SUI
  "0xbd6252e0d56ae5eaabf055fd6c518ee5f66c1114287ca957cc698a17c3d25b16",
  //CETUS – SUI
  "0xbbd2d4850e4f238d39c3aa24957d2dfbb5787fa43d6c7de306bf15abe27f29f2",
  // If Haedal launches more, add them here ↓
];

export type HaedalVault = Awaited<
  ReturnType<typeof haedalSdk.Vaults.getVault>
> & {
  protocol: "haedal";
};

export async function getHaedalVaults(): Promise<HaedalVault[]> {
  const res: HaedalVault[] = [];

  for (const id of HAEDAL_VAULT_IDS) {
    try {
      const v = await haedalSdk.Vaults.getVault(id);
      if (v) res.push({ ...v, protocol: "haedal" });
    } catch (e) {
      console.warn("Haedal vault fetch failed", id, e);
    }
  }
  return res;
}

// Future enhancement: Query Haedal's API directly
/*
export async function getHaedalVaultsFromAPI(): Promise<HaedalVault[]> {
  try {
    const { data } = await axios.get<string[]>('https://api.haedal.fi/vaults');
    const res: HaedalVault[] = [];
    
    for (const id of data) {
      try {
        const v = await haedalSdk.Vaults.getVault(id);
        if (v) res.push({ ...v, protocol: 'haedal' });
      } catch (e) {
        console.warn('Haedal vault fetch failed', id, e);
      }
    }
    
    return res;
  } catch (err) {
    console.error('Failed to fetch Haedal vaults from API:', err);
    // Fall back to static list
    return getHaedalVaults();
  }
}
*/
