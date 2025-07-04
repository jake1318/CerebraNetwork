// src/components/EnhancedTokenIcon.tsx
// Last Updated: 2025-05-20 06:46:49 UTC by jake1318

import React, { useState, useEffect, useRef } from "react";
import "../styles/components/TokenIcon.scss";

interface EnhancedTokenIconProps {
  symbol: string;
  logoUrl?: string;
  address?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

// Default token icon for fallbacks
const DEFAULT_TOKEN_ICON = "/assets/token-placeholder.png";

// Expanded token logos map for common tokens - MORE LOGO URLS
const TOKEN_LOGOS: Record<string, string> = {
  // Basic tokens
  SUI: "https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png", // Better SUI logo with more contrast
  CETUS: "https://coin-images.coingecko.com/coins/images/30256/large/cetus.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",

  // Add more logos for the tokens in the screenshot

  // Additional tokens from other DEXes

  WETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/2396.png",

  WBTC: "https://s2.coinmarketcap.com/static/img/coins/64x64/3717.png",

  // Handle aliases - some tokens might appear with different names
  "HA-SUI": "https://s2.coinmarketcap.com/static/img/coins/64x64/27469.png",
  $SUI: "https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png",
  $USDC:
    "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
};

// List of common token name normalizations - MORE ALIASES
const TOKEN_ALIASES: Record<string, string> = {
  $SUI: "SUI",
  $USDC: "USDC",
  WUSDC: "USDC",
  "HA-SUI": "HASUI",
  HASUI: "HASUI",
  SUISUI: "SUI",
  SSWP: "SWAP",
  B: "BLUE", // Some tokens might be abbreviated in UI
  T: "TOILET",
  S: "SQUIRT",
  U: "UP",
  P: "PSY",
  W: "WAL",
};

// Track which URLs have successfully loaded to avoid repeated failures
const successfulUrls = new Set<string>();
const failedUrls = new Set<string>();

// Debug logging
const DEBUG = true;
function debugLog(...args: any[]) {
  if (DEBUG) {
    console.debug(...args);
  }
}

// Clean symbol name for consistent lookup
function normalizeSymbol(symbol: string): string {
  if (!symbol) return "";

  // Remove $ prefix if present
  const cleaned = symbol.trim().toUpperCase();

  // Check aliases first
  if (TOKEN_ALIASES[cleaned]) {
    return TOKEN_ALIASES[cleaned];
  }

  return cleaned;
}

// Sanitize logo URLs to handle IPFS and HTTP URLs
function sanitizeLogoUrl(url?: string): string {
  if (!url) return "";

  // Skip sanitizing if we already know this URL fails
  if (failedUrls.has(url)) return "";

  // Return cached successful URL
  if (successfulUrls.has(url)) return url;

  // Handle IPFS URLs
  if (url.startsWith("ipfs://")) {
    return url.replace(/^ipfs:\/\//, "https://cloudflare-ipfs.com/ipfs/");
  }

  // Fix IPFS gateway URLs
  if (url.includes("ipfs.io")) {
    url = url.replace("http://", "https://");
    return url.replace("https://ipfs.io", "https://cloudflare-ipfs.com");
  }

  // Convert HTTP to HTTPS
  if (url.startsWith("http://")) {
    return "https://" + url.slice(7);
  }

  return url;
}

// Special tokens that need a lighter background
const TOKENS_NEEDING_LIGHT_BG = new Set(["SUI", "WAL"]);

const EnhancedTokenIcon: React.FC<EnhancedTokenIconProps> = ({
  symbol,
  logoUrl,
  address,
  size = "md",
  className = "",
}) => {
  const safeSymbol = symbol || "?";
  const normalizedSymbol = normalizeSymbol(safeSymbol);
  const symbolFirstChar = safeSymbol.charAt(0).toUpperCase();

  // Try to get logo from hardcoded mapping first
  const knownLogo = TOKEN_LOGOS[normalizedSymbol];

  // Debug the input and mapping
  useEffect(() => {
    debugLog(`Token: ${safeSymbol} (normalized: ${normalizedSymbol})`);
    debugLog(`Known logo: ${knownLogo ? "✓" : "✗"}`);
    debugLog(`Provided logoUrl: ${logoUrl ? "✓" : "✗"}`);
    if (logoUrl) debugLog(`Logo URL: ${logoUrl}`);
  }, [safeSymbol, normalizedSymbol, knownLogo, logoUrl]);

  // Initialize with the best available logo URL
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string>("");
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const loadAttempted = useRef<boolean>(false);

  // Update logo URL when props change
  useEffect(() => {
    // Reset state when props change
    setImgFailed(false);
    loadAttempted.current = false;

    // Try to find the best logo in this order:
    // 1. Known hardcoded logo
    // 2. Provided logo URL from props
    // 3. Default placeholder
    const sanitizedLogoUrl = sanitizeLogoUrl(logoUrl);
    const bestLogo = knownLogo || sanitizedLogoUrl;

    debugLog(`Best logo for ${safeSymbol}: ${bestLogo || "NONE"}`);

    if (bestLogo) {
      setCurrentLogoUrl(bestLogo);
    } else {
      setImgFailed(true);
    }
  }, [symbol, logoUrl, knownLogo]);

  // Handle image load errors
  const handleError = () => {
    console.warn(`Failed to load icon for ${symbol}: ${currentLogoUrl}`);

    // Track failed URL
    if (currentLogoUrl) {
      failedUrls.add(currentLogoUrl);
    }

    // Mark as failed
    setImgFailed(true);
    loadAttempted.current = true;
  };

  // Handle successful load
  const handleSuccess = () => {
    if (currentLogoUrl) {
      successfulUrls.add(currentLogoUrl);
    }
    loadAttempted.current = true;
  };

  // Map size prop to CSS class names
  const sizeMap = {
    sm: "token-icon--small",
    md: "token-icon--medium",
    lg: "token-icon--large",
    xl: "token-icon--xl",
  };

  const sizeClass = sizeMap[size] || "token-icon--medium";
  const fallbackClass = imgFailed ? "token-fallback" : "";

  // Add special class for SUI token to improve visibility
  const needsLightBg = TOKENS_NEEDING_LIGHT_BG.has(normalizedSymbol)
    ? "token-light-bg"
    : "";

  // Container style - add a border if this is a token that needs better visibility
  const containerStyle = {
    backgroundColor: needsLightBg ? "#ffffff" : undefined,
    border: needsLightBg ? "1px solid rgba(255, 255, 255, 0.5)" : undefined,
  };

  // Inline styles for the image
  const imgStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    borderRadius: "50%",
  };

  return (
    <div
      className={`token-icon ${sizeClass} ${fallbackClass} ${needsLightBg} ${className}`}
      title={safeSymbol}
      style={containerStyle}
    >
      {!imgFailed && currentLogoUrl ? (
        <img
          src={currentLogoUrl}
          alt={safeSymbol}
          onError={handleError}
          onLoad={handleSuccess}
          style={imgStyle}
        />
      ) : (
        <div className="token-fallback-letter">{symbolFirstChar}</div>
      )}
    </div>
  );
};

export default EnhancedTokenIcon;
