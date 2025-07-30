/* Updated Search.tsx - removing YouTube URL address */
/* Last Updated: 2025-07-13 23:08:58 UTC by jake1318 */

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import "./SearchPage.scss";

const Search: React.FC = () => {
  // State for search and results
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>({
    aiAnswer: "",
    videos: [],
    webResults: [],
  });
  const [loading, setLoading] = useState(false);

  // Pagination state
  const [videoPage, setVideoPage] = useState(1);
  const [webPage, setWebPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState({ videos: false, web: false });
  const videosPerPage = 12;
  const webResultsPerPage = 10;

  // For carousel functionality
  const carouselRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [currentVideoSlide, setCurrentVideoSlide] = useState(0);
  const [maxVideoSlides, setMaxVideoSlides] = useState(1);

  // For AI answer collapsible functionality
  const [aiExpanded, setAiExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const aiTextRef = useRef<HTMLDivElement>(null);

  // Effect to determine if toggle is needed (if content overflows 5 lines)
  useEffect(() => {
    if (results.aiAnswer && aiTextRef.current) {
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
        typeof results.aiAnswer === "string"
          ? results.aiAnswer
              .split("\n")
              .map(
                (line, i) =>
                  line +
                  (i < results.aiAnswer.split("\n").length - 1 ? "<br>" : "")
              )
              .join("")
          : results.aiAnswer;

      document.body.appendChild(tempDiv);
      const fullHeight = tempDiv.clientHeight;
      document.body.removeChild(tempDiv);

      // Calculate approximate 5-line height
      const lineHeight = 16 * 1.7; // font-size * line-height
      const approxFiveLines = lineHeight * 5;

      // Show toggle if content is taller than ~5 lines
      setShowToggle(fullHeight > approxFiveLines);
    }
  }, [results.aiAnswer]);

  // Update scroll position indicator for carousel
  useEffect(() => {
    if (!carouselRef.current || !results.videos || !results.videos.length)
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
      const slidesCount = Math.ceil(results.videos.length / visibleCards);
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
  }, [results.videos]);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    // Reset pagination when starting a new search
    setVideoPage(1);
    setWebPage(1);
    // Reset AI expanded state for new searches
    setAiExpanded(false);

    try {
      const res = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
      console.log("API Response:", res.data);
      setResults(res.data);
    } catch (error) {
      console.error("Error fetching search results", error);
      setResults({
        aiAnswer: "Sorry, an error occurred while fetching results.",
        videos: [],
        webResults: [],
      });
    }
    setLoading(false);
  };

  const loadMoreVideos = async () => {
    if (loadingMore.videos) return;
    setLoadingMore((prev) => ({ ...prev, videos: true }));

    try {
      const nextPage = videoPage + 1;
      const res = await axios.get(
        `/api/search?q=${encodeURIComponent(query)}&videoPage=${nextPage}`
      );

      if (res.data.videos && res.data.videos.length > 0) {
        setResults((prev) => ({
          ...prev,
          videos: [...prev.videos, ...res.data.videos],
        }));
        setVideoPage(nextPage);
      }
    } catch (error) {
      console.error("Error loading more videos", error);
    }

    setLoadingMore((prev) => ({ ...prev, videos: false }));
  };

  const loadMoreWebResults = async () => {
    if (loadingMore.web) return;
    setLoadingMore((prev) => ({ ...prev, web: true }));

    try {
      const nextPage = webPage + 1;
      const res = await axios.get(
        `/api/search?q=${encodeURIComponent(query)}&webPage=${nextPage}`
      );

      if (res.data.webResults && res.data.webResults.length > 0) {
        setResults((prev) => ({
          ...prev,
          webResults: [...prev.webResults, ...res.data.webResults],
        }));
        setWebPage(nextPage);
      }
    } catch (error) {
      console.error("Error loading more web results", error);
    }

    setLoadingMore((prev) => ({ ...prev, web: false }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
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

  return (
    <div className="search-page">
      {/* Background effects */}
      <div className="vertical-scan"></div>
      <div className="glow-1"></div>
      <div className="glow-2"></div>
      <div className="glow-3"></div>

      <div className="container">
        <div className="search-form">
          <div className="input-group">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter search term"
              className="search-input"
            />
            <button onClick={handleSearch} className="search-button">
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading">
            <div className="loading-spinner"></div>
            <div className="loading-text">Searching...</div>
          </div>
        )}

        {results && (
          <div className="search-results">
            {/* AI Answer Section */}
            {results.aiAnswer && (
              <div className="result-card">
                <div className="result-header">
                  <h2>AI</h2>
                </div>
                <div className="result-content-wrapper">
                  <div
                    id="aiAnswerText"
                    ref={aiTextRef}
                    style={{
                      maxHeight: aiExpanded ? "none" : "136px", // ~5 lines
                      overflow: aiExpanded ? "visible" : "hidden",
                    }}
                    className="result-content"
                  >
                    {typeof results.aiAnswer === "string"
                      ? results.aiAnswer.split("\n").map((line, i) => (
                          <React.Fragment key={i}>
                            {line}
                            {i < results.aiAnswer.split("\n").length - 1 && (
                              <br />
                            )}
                          </React.Fragment>
                        ))
                      : results.aiAnswer}
                  </div>
                </div>
                {showToggle && (
                  <button
                    className="show-more"
                    onClick={() => setAiExpanded((prev) => !prev)}
                    aria-expanded={aiExpanded}
                    aria-controls="aiAnswerText"
                  >
                    {aiExpanded ? "Show Less" : "Show More"}
                  </button>
                )}
              </div>
            )}

            {/* Video Carousel Section */}
            {results.videos && results.videos.length > 0 && (
              <div className="result-card">
                <div className="result-header">
                  <h2>Video Resources</h2>
                </div>

                <div className="video-carousel">
                  <div className="carousel-container">
                    {/* Left navigation button */}
                    <button
                      className={`carousel-nav-button prev ${
                        currentVideoSlide === 0 ? "disabled" : ""
                      }`}
                      onClick={() => scrollCarousel("left")}
                      disabled={currentVideoSlide === 0}
                      aria-label="Previous videos"
                    >
                      <i className="arrow left"></i>
                    </button>

                    {/* Scrollable carousel track */}
                    <div className="carousel-track" ref={carouselRef}>
                      {results.videos.map((video: any, index: number) => (
                        <div
                          key={`${video.videoId || index}`}
                          className="video-card"
                        >
                          <div className="video-thumbnail">
                            <a
                              href={`https://youtu.be/${video.videoId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img src={video.thumbnail} alt={video.title} />
                            </a>
                          </div>
                          <h3 className="video-title">
                            <a
                              href={`https://youtu.be/${video.videoId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {video.title}
                            </a>
                          </h3>
                          <div className="video-channel">
                            {video.channel || "YouTube"}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right navigation button */}
                    <button
                      className={`carousel-nav-button next ${
                        currentVideoSlide === maxVideoSlides - 1
                          ? "disabled"
                          : ""
                      }`}
                      onClick={() => scrollCarousel("right")}
                      disabled={currentVideoSlide === maxVideoSlides - 1}
                      aria-label="Next videos"
                    >
                      <i className="arrow right"></i>
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="carousel-progress">
                    <div
                      className="progress-bar"
                      style={{ width: `${scrollPosition}%` }}
                    ></div>
                  </div>

                  {/* Dots navigation */}
                  {maxVideoSlides > 1 && (
                    <div className="carousel-dots">
                      {Array.from({ length: maxVideoSlides }).map(
                        (_, index) => (
                          <div
                            key={index}
                            className={`dot ${
                              currentVideoSlide === index ? "active" : ""
                            }`}
                            onClick={() => scrollToDot(index)}
                          ></div>
                        )
                      )}
                    </div>
                  )}
                </div>

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

            {/* Web Results Section */}
            {results.webResults && results.webResults.length > 0 && (
              <div className="result-card">
                <div className="result-header">
                  <h2>Web Resources</h2>
                </div>
                <div className="web-results-container">
                  {results.webResults.map((result: any, index: number) => (
                    <div
                      key={`${result.url}-${index}`}
                      className="web-link-card"
                    >
                      <div className="web-link-header">
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {result.title}
                        </a>
                        <span className="website-domain">
                          {extractDomain(result.url)}
                        </span>
                      </div>
                      <p>{result.snippet}</p>
                    </div>
                  ))}
                </div>

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
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
