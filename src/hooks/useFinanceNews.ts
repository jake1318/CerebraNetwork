// src/hooks/useFinanceNews.ts
// Last Updated: 2025-07-12 22:01:15 UTC by jake1318

import { useQuery, UseQueryOptions } from "@tanstack/react-query";

// Define proper TypeScript interfaces for our data
interface NewsItem {
  position: number;
  title: string;
  link: string;
  source: string;
  date: string;
  snippet: string;
  thumbnail?: string;
  favicon?: string;
}

interface NewsData {
  query: string;
  news: NewsItem[];
  metadata: Record<string, any>;
  success?: boolean;
}

interface ApiResponse {
  success: boolean;
  data: NewsData;
  error?: string;
}

/**
 * React hook to fetch financial news data
 * @param query - Optional ticker or keyword to get specific news (e.g. "SUI", "BTC-USD")
 * @param options - Additional options for useQuery
 */
export function useFinanceNews(
  query: string = "",
  options: Partial<UseQueryOptions<NewsData, Error>> = {}
) {
  return useQuery<NewsData, Error>({
    queryKey: ["finance-news", query],
    queryFn: async () => {
      const url = `/api/finance/news${
        query ? `?q=${encodeURIComponent(query)}` : ""
      }`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const json = (await res.json()) as ApiResponse;

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch finance news");
      }

      // No need to process dates anymore since they're already in a good format
      return json.data;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    ...options,
  });
}
