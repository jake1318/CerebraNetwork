/* Updated Search.tsx - ChatGPT-Style Layout with simplified search interface */
/* Last Updated: 2025-08-03 19:36:02 UTC by jake1318 */

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useWallet } from "@suiet/wallet-kit";
import "./SearchPage.scss";

interface SearchHistoryItem {
  query: string;
  timestamp: number;
  mode: "standard" | "ai-only" | "deep-research";
  searchType: "default"; // Simplified to only support default type
  results: {
    aiAnswer: string;
    videos?: any[];
    webResults?: any[];
    deepResearch?: boolean;
    aiOnly?: boolean;
  };
}

const Search: React.FC = () => {
  // Access wallet from the navbar via wallet-kit
  const { connected, account } = useWallet();

  // State for search and results
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);

  // New state for search type - now locked to "default"
  const [searchType] = useState<"default">("default"); // still fixed

  // ► Default is ON whenever no special mode is enabled
  const defaultActive = !aiOnly && !deepResearch;

  /** Flip the Default switch – when turning ON it simply clears the other two. */
  const handleDefaultToggle = () => {
    if (!defaultActive) {
      // user wants the baseline again
      setAiOnly(false);
      setDeepResearch(false);
    }
  };

  // Search history state
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<
    number | null
  >(null);

  // For web/video content toggle
  const [showWebContent, setShowWebContent] = useState(true);

  // Refs for scroll behavior
  const mainContentRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const aiTextRef = useRef<HTMLDivElement>(null);

  // For carousel functionality
  const [scrollPosition, setScrollPosition] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [currentVideoSlide, setCurrentVideoSlide] = useState(0);
  const [maxVideoSlides, setMaxVideoSlides] = useState(1);

  // For AI answer collapsible functionality
  const [aiExpanded, setAiExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);

  // Get the current results to display
  const currentResults =
    selectedHistoryIndex !== null && searchHistory.length > 0
      ? searchHistory[selectedHistoryIndex].results
      : { aiAnswer: "", videos: [], webResults: [] };

  // Pagination state
  const [videoPage, setVideoPage] = useState(1);
  const [webPage, setWebPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState({ videos: false, web: false });

  // Scroll to bottom when a new message is added
  useEffect(() => {
    if (mainContentRef.current && selectedHistoryIndex !== null) {
      mainContentRef.current.scrollTop = mainContentRef.current.scrollHeight;
    }
  }, [selectedHistoryIndex]);

  // Effect to determine if toggle is needed (if content overflows 5 lines)
  useEffect(() => {
    if (currentResults.aiAnswer && aiTextRef.current) {
      // Create a temporary div to measure full content height
      const tempDiv = document.createElement("div");
      tempDiv.style.cssText = `
        position: absolute;
        visibility: hidden;
        width: ${aiTextRef.current.clientWidth}px;
        font-size: 16px;
        line-height: 1.7;
        font-family: "Inter", "Segoe UI", Roboto, sans-serif;
        white-space: pre-wrap;
      `;

      // Same content formatting as the original div
      tempDiv.innerHTML =
        typeof currentResults.aiAnswer === "string"
          ? currentResults.aiAnswer
              .split("\n")
              .map(
                (line, i) =>
                  line +
                  (i < currentResults.aiAnswer.split("\n").length - 1
                    ? "<br>"
                    : "")
              )
              .join("")
          : currentResults.aiAnswer;

      document.body.appendChild(tempDiv);
      const fullHeight = tempDiv.clientHeight;
      document.body.removeChild(tempDiv);

      // Calculate approximate 5-line height
      const lineHeight = 16 * 1.7; // font-size * line-height
      const approxFiveLines = lineHeight * 5;

      // Show toggle if content is taller than ~5 lines
      setShowToggle(fullHeight > approxFiveLines);
    }
  }, [currentResults.aiAnswer]);

  // Update scroll position indicator for carousel
  useEffect(() => {
    if (
      !carouselRef.current ||
      !currentResults.videos ||
      !currentResults.videos.length
    )
      return;

    const updateScrollIndicator = () => {
      if (!carouselRef.current) return;

      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      const maxScrollValue = scrollWidth - clientWidth;
      setMaxScroll(maxScrollValue);

      // Calculate scroll percentage (0 to 100)
      const scrollPercent =
        maxScrollValue === 0 ? 0 : (scrollLeft / maxScrollValue) * 100;
      setScrollPosition(scrollPercent);

      // Calculate current slide
      const cardWidth = 220; // card width + margin
      const visibleCards = Math.floor(clientWidth / cardWidth);
      const slidesCount = Math.ceil(
        currentResults.videos.length / visibleCards
      );
      setMaxVideoSlides(slidesCount);

      const currentIndex = Math.min(
        Math.floor(scrollLeft / (cardWidth * visibleCards)),
        slidesCount - 1
      );
      setCurrentVideoSlide(currentIndex);
    };

    // Initial update
    updateScrollIndicator();

    // Add scroll event listener
    const carousel = carouselRef.current;
    carousel.addEventListener("scroll", updateScrollIndicator);

    // Recalculate on window resize
    const handleResize = () => {
      updateScrollIndicator();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      carousel.removeEventListener("scroll", updateScrollIndicator);
      window.removeEventListener("resize", handleResize);
    };
  }, [currentResults.videos]);

  const handleSearch = async () => {
    if (!query) return;

    // Prevent search if wallet not connected
    if (!connected || !account) {
      alert("Please connect your Sui wallet to use search");
      return;
    }

    setLoading(true);
    // Reset pagination when starting a new search
    setVideoPage(1);
    setWebPage(1);
    // Reset AI expanded state for new searches
    setAiExpanded(false);

    // Get the current mode
    const currentMode = deepResearch
      ? "deep-research"
      : aiOnly
      ? "ai-only"
      : "standard";

    try {
      // Include wallet address in the request header and search mode parameters
      const res = await axios.get(
        `/api/search?q=${encodeURIComponent(
          query
        )}&deep=${deepResearch}&aiOnly=${aiOnly}&searchType=${searchType}`,
        {
          headers: {
            "x-wallet-address": account.address,
          },
        }
      );

      // Add result to search history
      const newSearchResult: SearchHistoryItem = {
        query,
        timestamp: Date.now(),
        mode: currentMode,
        searchType,
        results: res.data,
      };

      setSearchHistory((prev) => [...prev, newSearchResult]);

      // Set the selected result to the newly added one
      setSelectedHistoryIndex(searchHistory.length);

      // Clear the query after successful search
      setQuery("");
    } catch (error: any) {
      console.error("Error fetching search results", error);

      // Handle rate limit errors specifically
      const errorMessage =
        error.response && error.response.status === 429
          ? "Rate limit exceeded. Please try again in a minute."
          : "Sorry, an error occurred while fetching results.";

      // Create error result
      const errorResult = {
        aiAnswer: errorMessage,
        videos: [],
        webResults: [],
        deepResearch: deepResearch,
        aiOnly: aiOnly,
      };

      // Add error result to search history
      const errorSearchResult: SearchHistoryItem = {
        query,
        timestamp: Date.now(),
        mode: currentMode,
        searchType,
        results: errorResult,
      };

      setSearchHistory((prev) => [...prev, errorSearchResult]);
      setSelectedHistoryIndex(searchHistory.length);
      setQuery("");
    }

    setLoading(false);
  };

  const loadMoreVideos = async () => {
    if (
      loadingMore.videos ||
      !connected ||
      !account ||
      selectedHistoryIndex === null ||
      !searchHistory[selectedHistoryIndex]
    )
      return;

    const historyItem = searchHistory[selectedHistoryIndex];
    if (historyItem.mode !== "standard") return;

    setLoadingMore((prev) => ({ ...prev, videos: true }));

    try {
      const nextPage = videoPage + 1;
      const res = await axios.get(
        `/api/search?q=${encodeURIComponent(
          historyItem.query
        )}&videoPage=${nextPage}&deep=false&aiOnly=false&searchType=${
          historyItem.searchType
        }`,
        {
          headers: {
            "x-wallet-address": account.address,
          },
        }
      );

      if (res.data.videos && res.data.videos.length > 0) {
        // Update the search history with new videos
        setSearchHistory((prev) => {
          const updated = [...prev];
          const updatedResults = {
            ...updated[selectedHistoryIndex].results,
            videos: [
              ...(updated[selectedHistoryIndex].results.videos || []),
              ...res.data.videos,
            ],
          };
          updated[selectedHistoryIndex] = {
            ...updated[selectedHistoryIndex],
            results: updatedResults,
          };
          return updated;
        });
        setVideoPage(nextPage);
      }
    } catch (error) {
      console.error("Error loading more videos", error);
    }

    setLoadingMore((prev) => ({ ...prev, videos: false }));
  };

  const loadMoreWebResults = async () => {
    if (
      loadingMore.web ||
      !connected ||
      !account ||
      selectedHistoryIndex === null ||
      !searchHistory[selectedHistoryIndex]
    )
      return;

    const historyItem = searchHistory[selectedHistoryIndex];
    if (historyItem.mode !== "standard") return;

    setLoadingMore((prev) => ({ ...prev, web: true }));

    try {
      const nextPage = webPage + 1;
      const res = await axios.get(
        `/api/search?q=${encodeURIComponent(
          historyItem.query
        )}&webPage=${nextPage}&deep=false&aiOnly=false&searchType=${
          historyItem.searchType
        }`,
        {
          headers: {
            "x-wallet-address": account.address,
          },
        }
      );

      if (res.data.webResults && res.data.webResults.length > 0) {
        // Update the search history with new web results
        setSearchHistory((prev) => {
          const updated = [...prev];
          const updatedResults = {
            ...updated[selectedHistoryIndex].results,
            webResults: [
              ...(updated[selectedHistoryIndex].results.webResults || []),
              ...res.data.webResults,
            ],
          };
          updated[selectedHistoryIndex] = {
            ...updated[selectedHistoryIndex],
            results: updatedResults,
          };
          return updated;
        });
        setWebPage(nextPage);
      }
    } catch (error) {
      console.error("Error loading more web results", error);
    }

    setLoadingMore((prev) => ({ ...prev, web: false }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const toggleDeepResearch = () => {
    if (aiOnly) setAiOnly(false);
    setDeepResearch(!deepResearch);
  };

  const toggleAiOnly = () => {
    if (deepResearch) setDeepResearch(false);
    setAiOnly(!aiOnly);
  };

  // Clear search history
  const clearHistory = () => {
    setSearchHistory([]);
    setSelectedHistoryIndex(null);
  };

  // Select a history item
  const selectHistoryItem = (index: number) => {
    setSelectedHistoryIndex(index);

    // Set the search mode and type based on the selected history item
    const item = searchHistory[index];
    setDeepResearch(item.mode === "deep-research");
    setAiOnly(item.mode === "ai-only");

    // Reset pagination
    setVideoPage(1);
    setWebPage(1);

    // Reset AI answer expanded state
    setAiExpanded(false);
  };

  // Format the timestamp for display
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Scroll carousel by a specific amount
  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;

    const containerWidth = carouselRef.current.clientWidth;
    const currentScroll = carouselRef.current.scrollLeft;

    carouselRef.current.scrollTo({
      left:
        direction === "left"
          ? Math.max(0, currentScroll - containerWidth)
          : currentScroll + containerWidth,
      behavior: "smooth",
    });

    // Update current slide
    setCurrentVideoSlide((prev) =>
      direction === "left"
        ? Math.max(0, prev - 1)
        : Math.min(maxVideoSlides - 1, prev + 1)
    );
  };

  // Scroll to specific dot/slide
  const scrollToDot = (index: number) => {
    if (!carouselRef.current) return;

    const containerWidth = carouselRef.current.clientWidth;
    const targetScroll = containerWidth * index;

    carouselRef.current.scrollTo({
      left: targetScroll,
      behavior: "smooth",
    });

    setCurrentVideoSlide(index);
  };

  // Scroll carousel to a specific position using the progress bar
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!carouselRef.current || maxScroll === 0) return;

    // Get click position relative to the progress bar
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPositionX = e.clientX - rect.left;
    const progressBarWidth = rect.width;

    // Calculate the target scroll position
    const targetScrollPercent = clickPositionX / progressBarWidth;
    const targetScrollPosition = maxScroll * targetScrollPercent;

    // Scroll to the target position
    carouselRef.current.scrollTo({
      left: targetScrollPosition,
      behavior: "smooth",
    });
  };

  // Extract domain from URL for display
  const extractDomain = (url: string) => {
    try {
      const domain = new URL(url);
      return domain.hostname.replace("www.", "");
    } catch {
      return "";
    }
  };

  // Get CSS class for different search modes
  const getModeClass = (mode: string) => {
    switch (mode) {
      case "deep-research":
        return "deep-research";
      case "ai-only":
        return "ai-only";
      default:
        return "standard";
    }
  };

  // Create a new chat/search
  const startNewChat = () => {
    setSearchHistory([]);
    setSelectedHistoryIndex(null);
    setQuery("");
    setDeepResearch(false);
    setAiOnly(false);
  };

  // Get loading message based on search mode
  const getLoadingMessage = () => {
    if (deepResearch) return "Performing Deep Research...";
    if (aiOnly) return "Processing AI-Only Search...";
    return "Searching Across All Sources...";
  };

  return (
    <div className="search-page chatgpt-style">
      {/* Background effects preserved from original design */}
      <div className="vertical-scan"></div>
      <div className="glow-1"></div>
      <div className="glow-2"></div>
      <div className="glow-3"></div>

      {/* Left Sidebar */}
      <div className="sidebar">
        {/* New Chat Button */}
        <button className="new-chat-button" onClick={startNewChat}>
          <span className="icon-plus"></span>
          <span>New search</span>
        </button>

        {/* History List */}
        <div className="history-list">
          {searchHistory.map((item, index) => (
            <div
              key={index}
              className={`history-item ${
                selectedHistoryIndex === index ? "selected" : ""
              }`}
              onClick={() => selectHistoryItem(index)}
            >
              <div className="history-icon">
                {item.mode === "deep-research"
                  ? "🔍+"
                  : item.mode === "ai-only"
                  ? "🤖"
                  : "🔍"}
              </div>
              <div className="history-content">
                <div className="history-title">{item.query}</div>
                <div className="history-date">
                  {formatTimestamp(item.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {searchHistory.length > 0 && (
          <div className="sidebar-footer">
            <button className="clear-history" onClick={clearHistory}>
              Clear history
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Header - now only contains the title */}
        <div className="chat-header">
          <h1>Cerebra Search</h1>
        </div>

        {/* Chat Messages Area */}
        <div className="messages-container" ref={mainContentRef}>
          {/* Welcome Message when no searches */}
          {(!searchHistory.length || selectedHistoryIndex === null) &&
            !loading && (
              <div className="welcome-container">
                <h2>Welcome to Cerebra Search</h2>
                <p>Ask a question about Sui, Web3, crypto.....or anything!</p>

                {!connected && (
                  <div className="wallet-required-message">
                    <p>
                      Connect your Sui wallet using the button in the navbar to
                      use the search feature.
                    </p>
                  </div>
                )}
              </div>
            )}

          {/* Loading Indicator */}
          {loading && (
            <div className="loading-message">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className="loading-text">{getLoadingMessage()}</div>
            </div>
          )}

          {/* Chat Messages */}
          {selectedHistoryIndex !== null && (
            <div className="chat-messages">
              {/* User Query */}
              <div className="message user-message">
                <div className="message-icon user-icon">
                  {connected && account ? account.address.substring(0, 2) : "U"}
                </div>
                <div className="message-content">
                  <p>{searchHistory[selectedHistoryIndex].query}</p>
                </div>
              </div>

              {/* AI Response */}
              <div
                className={`message ai-message ${getModeClass(
                  searchHistory[selectedHistoryIndex].mode
                )}`}
              >
                <div className="message-icon ai-icon">AI</div>
                <div className="message-content">
                  {currentResults.aiAnswer ? (
                    <div className="ai-answer" ref={aiTextRef}>
                      {typeof currentResults.aiAnswer === "string"
                        ? currentResults.aiAnswer.split("\n").map((line, i) => (
                            <React.Fragment key={i}>
                              {line}
                              {i <
                                currentResults.aiAnswer.split("\n").length -
                                  1 && <br />}
                            </React.Fragment>
                          ))
                        : currentResults.aiAnswer}
                    </div>
                  ) : (
                    <p>No AI response available.</p>
                  )}

                  {showToggle && (
                    <button
                      className="show-more"
                      onClick={() => setAiExpanded((prev) => !prev)}
                      aria-expanded={aiExpanded}
                      aria-controls="aiAnswerText"
                      style={{
                        marginBottom: "15px",
                      }}
                    >
                      {aiExpanded ? "Show Less" : "Show More"}
                    </button>
                  )}

                  {/* Sources/Additional Content Section - Only for standard search */}
                  {searchHistory[selectedHistoryIndex].mode === "standard" &&
                    (currentResults.videos?.length > 0 ||
                      currentResults.webResults?.length > 0) && (
                      <div className="additional-content">
                        {/* Tabs for Web/Video Content */}
                        <div className="content-tabs">
                          <button
                            className={`tab ${showWebContent ? "" : "active"}`}
                            onClick={() => setShowWebContent(false)}
                          >
                            Videos ({currentResults.videos?.length || 0})
                          </button>
                          <button
                            className={`tab ${showWebContent ? "active" : ""}`}
                            onClick={() => setShowWebContent(true)}
                          >
                            Web Results (
                            {currentResults.webResults?.length || 0})
                          </button>
                        </div>

                        {/* Content Display */}
                        <div className="tab-content">
                          {showWebContent ? (
                            <div className="web-results">
                              {currentResults.webResults?.map(
                                (result, index) => (
                                  <div key={index} className="web-result-item">
                                    <a
                                      href={result.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <h4>{result.title}</h4>
                                      <span className="result-url">
                                        {extractDomain(result.url)}
                                      </span>
                                    </a>
                                    <p>{result.snippet}</p>
                                  </div>
                                )
                              )}

                              {/* Load More Web Results Button */}
                              <div className="load-more-container">
                                <button
                                  className="load-more-button"
                                  onClick={loadMoreWebResults}
                                  disabled={loadingMore.web}
                                >
                                  {loadingMore.web ? (
                                    <>
                                      <span className="loading-dot"></span>
                                      <span className="loading-dot"></span>
                                      <span className="loading-dot"></span>
                                    </>
                                  ) : (
                                    "Load More Results"
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="video-results">
                              {currentResults.videos?.map((video, index) => (
                                <div key={index} className="video-result-item">
                                  <a
                                    href={`https://youtu.be/${video.videoId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <div className="video-thumbnail">
                                      <img
                                        src={video.thumbnail}
                                        alt={video.title}
                                      />
                                      <div className="play-overlay">▶</div>
                                    </div>
                                    <h4>{video.title}</h4>
                                    <span className="video-channel">
                                      {video.channel || "YouTube"}
                                    </span>
                                  </a>
                                </div>
                              ))}

                              {/* Load More Videos Button */}
                              <div className="load-more-container">
                                <button
                                  className="load-more-button"
                                  onClick={loadMoreVideos}
                                  disabled={loadingMore.videos}
                                >
                                  {loadingMore.videos ? (
                                    <>
                                      <span className="loading-dot"></span>
                                      <span className="loading-dot"></span>
                                      <span className="loading-dot"></span>
                                    </>
                                  ) : (
                                    "Load More Videos"
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Input Area */}
        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                connected && account
                  ? "Ask a question about Sui, Web3, crypto.....or anything!"
                  : "Connect wallet to search"
              }
              disabled={!connected || !account || loading}
              className="chat-input"
            />
            <button
              onClick={handleSearch}
              className="send-button"
              disabled={!query.trim() || loading || !connected || !account}
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
              </svg>
            </button>
          </div>
          <div className="input-footer">
            {/* Search type and mode toggles */}
            <div className="search-controls">
              {/* Search Modes */}
              <div className="search-modes">
                {/* ─── Default toggle ───────────────────────────── */}
                <div className="mode-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={defaultActive}
                      onChange={handleDefaultToggle}
                      disabled={!connected || !account || loading}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toggle-label">Default</span>
                </div>

                <div className="mode-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={aiOnly}
                      onChange={toggleAiOnly}
                      disabled={!connected || !account || loading}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toggle-label">
                    AI Only{aiOnly ? " (ON)" : ""}
                  </span>
                </div>

                <div className="mode-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={deepResearch}
                      onChange={toggleDeepResearch}
                      disabled={!connected || !account || loading}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toggle-label">
                    Deep Research{deepResearch ? " (ON)" : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="disclaimer">
              Cerebra Search may produce inaccurate information about people,
              places, or facts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Search;
