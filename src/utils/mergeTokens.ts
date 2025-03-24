interface TokenInfo {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  balance?: string; // balance user holds (if any)
  usdValue?: number; // total USD value of user's holding (if any)
  // ... any other fields like price, etc.
}

export function mergeTokens(
  walletTokens: TokenInfo[],
  trendingTokens: TokenInfo[],
  allTokens: TokenInfo[]
): TokenInfo[] {
  // 1. Sort wallet tokens by usdValue (descending)
  const walletSorted = [...walletTokens];
  walletSorted.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));

  // 2. Create a map to track tokens added (by coinType) to avoid duplicates
  const added = new Set<string>();
  const mergedList: TokenInfo[] = [];

  // Add wallet tokens first
  for (const token of walletSorted) {
    mergedList.push(token);
    added.add(token.coinType);
  }

  // Add trending tokens (if not already in wallet list)
  for (const token of trendingTokens) {
    if (!added.has(token.coinType)) {
      mergedList.push(token);
      added.add(token.coinType);
    }
  }

  // Add remaining tokens from full list
  // Optionally sort the remaining tokens alphabetically by symbol or name
  const remainingTokens = allTokens.filter((t) => !added.has(t.coinType));
  remainingTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
  for (const token of remainingTokens) {
    mergedList.push(token);
    added.add(token.coinType);
  }

  return mergedList;
}
