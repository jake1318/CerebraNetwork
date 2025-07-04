// src/components/TokenIcon.tsx
// Last Updated: 2025-05-19 01:28:08 UTC by jake1318

import React, { useState, useEffect } from "react";
import { sanitizeLogoUrl } from "../services/tokenService"; // Fixed import path
import "../styles/components/TokenIcon.scss";

// Define both prop interfaces to support different usage patterns
interface TokenObjectProps {
  token: {
    symbol: string;
    name: string;
    address?: string;
  };
  metadata?: {
    logo_uri?: string;
    logoUrl?: string;
    logoURI?: string;
    logo?: string;
    address?: string;
  };
  size?: "small" | "medium" | "large" | "xl" | "sm" | "md" | "lg";
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

interface TokenDirectProps {
  symbol: string;
  logoUrl?: string;
  address?: string;
  size?: "small" | "medium" | "large" | "xl" | "sm" | "md" | "lg";
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

// Union type to support both styles
type TokenIconProps = TokenObjectProps | TokenDirectProps;

const DEFAULT_ICON = "/assets/token-placeholder.png";

// Track tokens that have successfully loaded logos
const successfulLogos = new Map<string, string>();

// Hardcoded token logos for common tokens
const TOKEN_LOGOS: Record<string, string> = {
  SUI: "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpg?1696523592",
  CETUS:
    "https://coin-images.coingecko.com/coins/images/30256/large/cetus.png?1696529165",
  USDC: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",
  WAL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS/logo.png",
  HASUI: "https://archive.cetus.zone/assets/image/sui/hasui.png",
  "HA-SUI": "https://archive.cetus.zone/assets/image/sui/hasui.png",
  PSY: "https://raw.githubusercontent.com/psychics-finance/web/main/public/psychics-logo.png",
  BLUE: "https://bluemove.net/logo.png",
  BOOST:
    "https://pbs.twimg.com/profile_images/1665564447388065793/GW1NZ-Tm_400x400.jpg",
  SQUIRT:
    "https://pbs.twimg.com/profile_images/1707865474370764800/CpYTQbWf_400x400.jpg",
  WUSDC:
    "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
  ISG: "https://i.imgur.com/ofLWmnu.png",
  TOILET:
    "https://raw.githubusercontent.com/bracket-finance/assets/main/logos/sui/tokens/toilet.png",
};

// Known token symbols for custom styling
const TOKEN_CLASS_MAP: Record<string, string> = {
  SUI: "sui-token",
  USDC: "usdc-token",
  WUSDC: "usdc-token",
  USDT: "usdt-token",
  WAL: "wal-token",
  CETUS: "cetus-token",
  BLUE: "blue-token",
  PSY: "psy-token",
  BOOST: "boost-token",
  SQUIRT: "squirt-token",
  ISG: "isg-token",
  HASUI: "hasui-token",
  TOILET: "toilet-token",
};

// List of common token name normalizations
const TOKEN_ALIASES: Record<string, string> = {
  $SUI: "SUI",
  $USDC: "USDC",
  WUSDC: "USDC",
  "HA-SUI": "HASUI",
  HASUI: "HASUI",
};

// Helper function to check if a prop is of TokenObjectProps type
const isTokenObjectProps = (
  props: TokenIconProps
): props is TokenObjectProps => {
  return (props as TokenObjectProps).token !== undefined;
};

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

// Convert size prop to CSS class name
function getSizeClass(size?: string): string {
  switch (size) {
    case "sm":
      return "token-icon--small";
    case "md":
      return "token-icon--medium";
    case "lg":
      return "token-icon--large";
    case "xl":
      return "token-icon--xl";
    case "small":
      return "token-icon--small";
    case "medium":
      return "token-icon--medium";
    case "large":
      return "token-icon--large";
    default:
      return "token-icon--medium";
  }
}

const TokenIcon: React.FC<TokenIconProps> = (props) => {
  // Extract values from either prop style
  let symbol: string;
  let name: string;
  let tokenAddress: string | undefined;
  let logoUrlFromProps: string | undefined;
  let className: string;
  let sizeClass: string;
  let onErrorHandler:
    | ((e: React.SyntheticEvent<HTMLImageElement>) => void)
    | undefined;

  // Choose the appropriate prop structure
  if (isTokenObjectProps(props)) {
    // Original style with token object
    symbol = props.token.symbol;
    name = props.token.name;
    tokenAddress = props.token.address || props.metadata?.address;
    logoUrlFromProps =
      props.metadata?.logo_uri ||
      props.metadata?.logoUrl ||
      props.metadata?.logoURI ||
      props.metadata?.logo;
    sizeClass = getSizeClass(props.size);
    className = props.className || "";
    onErrorHandler = props.onError;
  } else {
    // Direct props style
    symbol = props.symbol;
    name = props.symbol;
    tokenAddress = props.address;
    logoUrlFromProps = props.logoUrl;
    sizeClass = getSizeClass(props.size);
    className = props.className || "";
    onErrorHandler = props.onError;
  }

  // Get the initial logo URL
  const getInitialLogoUrl = () => {
    // First check if this is a known token
    const normalizedSymbol = normalizeSymbol(symbol);
    if (TOKEN_LOGOS[normalizedSymbol]) {
      return TOKEN_LOGOS[normalizedSymbol];
    }

    // If we already have a successful logo for this token, use it
    if (tokenAddress && successfulLogos.has(tokenAddress)) {
      return successfulLogos.get(tokenAddress)!;
    }

    // Otherwise use the URL from props or default
    return logoUrlFromProps ? sanitizeLogoUrl(logoUrlFromProps) : DEFAULT_ICON;
  };

  const [logoUrl, setLogoUrl] = useState<string>(getInitialLogoUrl());
  const [imgError, setImgError] = useState<boolean>(false);
  const normalizedSymbol = normalizeSymbol(symbol || "");
  const tokenClass = TOKEN_CLASS_MAP[normalizedSymbol] || "";

  // When the component mounts or props change, reset state
  useEffect(() => {
    setImgError(false);
    setLogoUrl(getInitialLogoUrl());
  }, [symbol, logoUrlFromProps, tokenAddress]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.log(`Failed to load image for ${symbol}: ${logoUrl}`);

    // Call custom error handler if provided
    if (onErrorHandler) {
      onErrorHandler(e);
    }

    // Only set error if we're not already showing default
    if (logoUrl !== DEFAULT_ICON) {
      setLogoUrl(DEFAULT_ICON);
      setImgError(true);
    }
  };

  // When an image successfully loads, cache it for future use
  const handleLoad = () => {
    if (tokenAddress && logoUrl !== DEFAULT_ICON) {
      successfulLogos.set(tokenAddress, logoUrl);
    }
  };

  // Determine if size is small for additional text display
  const showSymbol = props.size === "small";

  return (
    <div
      className={`token-icon ${sizeClass} ${tokenClass} ${className} ${
        imgError ? "token-fallback" : ""
      }`}
    >
      {!imgError ? (
        <img
          src={logoUrl}
          alt={symbol}
          onError={handleError}
          onLoad={handleLoad}
        />
      ) : (
        <div className="token-fallback-letter">
          {symbol ? symbol.charAt(0).toUpperCase() : "?"}
        </div>
      )}
      {showSymbol && <div className="token-symbol">{symbol}</div>}
    </div>
  );
};

export default TokenIcon;
