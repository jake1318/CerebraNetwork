// src/hooks/useFinanceNews.ts
// Last Updated: 2025-08-07 02:11:40 UTC by jake1318

import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";

// Define proper TypeScript interfaces for our data
interface NewsItem {
  position: number;
  title: string;
  link: string;
  source: string;
  date: string;
  isoDate?: string;
  snippet: string;
  thumbnail?: string;
  favicon?: string;
  rss?: boolean;
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

// Constants for API endpoints - using port 5000 as confirmed working
const FINANCE_API_BASE = "http://localhost:5000/api/finance";

/**
 * Helper to format relative time strings
 */
export function formatRelativeDate(dateString: string): string {
  if (!dateString) return "Recent";

  try {
    // If it's already a relative date (like "2 days ago"), return as is
    if (
      dateString.includes("ago") ||
      dateString.includes("hour") ||
      dateString.includes("day")
    ) {
      return dateString;
    }

    // Try to parse the date string
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (e) {
    // If parsing fails, return the original string
    return dateString;
  }
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
      // Include RSS feeds by default for CRYPTO and COINTELEGRAPH queries
      const includeRss =
        query === "CRYPTO" || query === "COINTELEGRAPH" || !query;

      // Build the URL with proper parameters
      const url = `${FINANCE_API_BASE}/news${
        query ? `?q=${encodeURIComponent(query)}` : ""
      }${
        includeRss ? (query ? "&include_rss=true" : "?include_rss=true") : ""
      }`;

      // Log the URL being requested (helpful for debugging)
      console.log(`Fetching finance news from: ${url}`);

      const res = await fetch(url, {
        // Add a longer timeout to avoid network issues
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const json = (await res.json()) as ApiResponse;

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch finance news");
      }

      // Process and enhance news items
      const processedNews = json.data.news.map((item) => ({
        ...item,
        // Ensure we have both date formats
        date: item.date || "Recent",
        isoDate: item.isoDate || item.date || new Date().toISOString(),
      }));

      return {
        ...json.data,
        news: processedNews,
      };
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    retry: 2, // Retry up to 2 times if the request fails
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
    ...options,
  });
}
