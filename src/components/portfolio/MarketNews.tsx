// src/components/portfolio/MarketNews.tsx
// Last Updated: 2025-08-07 02:16:01 UTC by jake1318

import React, { useState, useEffect } from "react";
import "./MarketNews.scss";
import { parseISO, formatDistanceToNow } from "date-fns";

// Define types for news data
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
}

interface MarketNewsProps {
  defaultQuery?: string;
}

// Helper to format relative time strings
function formatRelativeDate(dateString: string): string {
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

const MarketNews: React.FC<MarketNewsProps> = ({ defaultQuery = "" }) => {
  const [activeQuery, setActiveQuery] = useState<string>(defaultQuery);
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Predefined categories for quick filtering
  const categories = [
    { id: "crypto", label: "Crypto", query: "CRYPTO" },
    { id: "cointelegraph", label: "Cointelegraph", query: "COINTELEGRAPH" },
    { id: "sui", label: "SUI", query: "SUI" },
    { id: "bitcoin", label: "Bitcoin", query: "BTC-USD" },
    { id: "stocks", label: "Stocks", query: "STOCK" },
    { id: "markets", label: "Markets", query: "MARKET" },
  ];

  // Function to fetch news directly
  const fetchNews = async (query: string) => {
    setIsLoading(true);
    setError(null);

    // Determine whether to include RSS feeds
    const includeRss =
      query === "CRYPTO" || query === "COINTELEGRAPH" || !query;

    // Try multiple ports, starting with 5000 (confirmed working)
    const portsToTry = [5000];
    let success = false;

    for (const port of portsToTry) {
      try {
        // Build the URL with proper parameters
        const url = `http://localhost:${port}/api/finance/news${
          query ? `?q=${encodeURIComponent(query)}` : ""
        }${
          includeRss ? (query ? "&include_rss=true" : "?include_rss=true") : ""
        }`;

        console.log(`Fetching news from: ${url}`);

        // Set a timeout to avoid hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const json = await response.json();

        if (!json.success) {
          throw new Error(json.error || "Failed to fetch finance news");
        }

        // Process and enhance news items
        const processedNews = json.data.news.map((item: NewsItem) => ({
          ...item,
          // Ensure we have both date formats
          date: item.date || "Recent",
          isoDate: item.isoDate || item.date || new Date().toISOString(),
        }));

        setNewsData({
          ...json.data,
          news: processedNews,
        });

        success = true;
        break; // Stop trying other ports if successful
      } catch (err) {
        console.error(`Error fetching from port ${port}:`, err);
        // Continue to next port
      }
    }

    if (!success) {
      setError("Failed to fetch news data. Please try again later.");
    }

    setIsLoading(false);
  };

  // Initial fetch on component mount or when activeQuery changes
  useEffect(() => {
    fetchNews(activeQuery);
  }, [activeQuery]);

  const handleRefresh = () => {
    fetchNews(activeQuery);
  };

  const handleCategoryChange = (query: string) => {
    setActiveQuery(query);
  };

  return (
    <div className="market-news">
      <div className="news-header">
        <h2>Market News</h2>
        <div className="news-controls">
          <div className="category-filters">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-button ${
                  activeQuery === category.query ? "active" : ""
                }`}
                onClick={() => handleCategoryChange(category.query)}
              >
                {category.label}
              </button>
            ))}
          </div>
          <button className="refresh-button" onClick={handleRefresh}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="news-content">
        {isLoading && (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading market news...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={handleRefresh}>Retry</button>
          </div>
        )}

        {!isLoading && !error && newsData?.news && (
          <>
            <p className="results-info">
              Showing {newsData.news.length} results for{" "}
              {newsData.query || "latest financial news"}
            </p>

            <div className="news-list">
              {newsData.news.map((newsItem, index) => (
                <a
                  key={`${newsItem.link}-${index}`}
                  className={`news-item ${newsItem.rss ? "rss-item" : ""}`}
                  href={newsItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {newsItem.thumbnail && (
                    <div className="news-thumbnail">
                      <img
                        src={newsItem.thumbnail}
                        alt={newsItem.title}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}

                  <div className="news-details">
                    <h3 className="news-title">{newsItem.title}</h3>
                    <div className="news-meta">
                      <span className="news-source">
                        {newsItem.rss && (
                          <span className="source-badge">RSS</span>
                        )}
                        {newsItem.source}
                      </span>
                      <span className="news-date">
                        {formatRelativeDate(newsItem.isoDate || newsItem.date)}
                      </span>
                    </div>
                    {newsItem.snippet && (
                      <p className="news-snippet">{newsItem.snippet}</p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {!isLoading &&
          !error &&
          (!newsData?.news || newsData.news.length === 0) && (
            <div className="empty-state">
              <p>No news found for the selected category.</p>
              <button onClick={() => handleCategoryChange("CRYPTO")}>
                View Crypto News
              </button>
            </div>
          )}
      </div>
    </div>
  );
};

export default MarketNews;
