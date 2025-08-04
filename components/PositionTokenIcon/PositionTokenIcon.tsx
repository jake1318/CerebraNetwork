// src/components/PositionTokenIcon/PositionTokenIcon.tsx
// Last Updated: 2025-05-17 00:34:15 UTC by jake1318

import React, { useState, useEffect } from "react";
import {
  fetchTokenLogoFallback,
  sanitizeLogoUrl,
  getKnownLogoBySymbol,
} from "../../services/tokenService";
import "../TokenIcon/TokenIcon.scss"; // Reuse the same styles

interface PositionTokenIconProps {
  token: {
    symbol: string;
    name?: string;
    address?: string;
  };
  metadata?: {
    logo_uri?: string;
    logoUrl?: string;
    logoURI?: string;
    logo?: string;
    address?: string;
  };
  size?: "small" | "medium" | "large" | "xl";
  className?: string;
}

const DEFAULT_ICON = "/assets/token-placeholder.png";

// Track tokens that have successfully loaded logos
const successfulLogos = new Map<string, string>();

// Track symbol-to-logo mappings for quick lookup without needing addresses
const symbolToLogoMap = new Map<string, string>();

const PositionTokenIcon: React.FC<PositionTokenIconProps> = ({
  token,
  metadata,
  size = "medium",
  className = "",
}) => {
  // Try all available logo URLs from metadata in priority order
  const getInitialLogoUrl = () => {
    // First try hardcoded logos by symbol
    if (token.symbol) {
      const knownLogo = getKnownLogoBySymbol(token.symbol);
      if (knownLogo) {
        symbolToLogoMap.set(token.symbol.toUpperCase(), knownLogo);
        return knownLogo;
      }
    }

    // Then check if we have a successful logo for this token by address
    const tokenAddress = token.address || metadata?.address;
    if (tokenAddress && successfulLogos.has(tokenAddress)) {
      return successfulLogos.get(tokenAddress)!;
    }

    // Then check if we have a successful logo for this token by symbol
    if (token.symbol && symbolToLogoMap.has(token.symbol.toUpperCase())) {
      return symbolToLogoMap.get(token.symbol.toUpperCase())!;
    }

    // Otherwise try all available logo properties
    const logoUrl =
      metadata?.logo_uri ||
      metadata?.logoUrl ||
      metadata?.logoURI ||
      metadata?.logo;

    // Sanitize the URL to handle IPFS and HTTP URLs
    return logoUrl ? sanitizeLogoUrl(logoUrl) : DEFAULT_ICON;
  };

  const [logoUrl, setLogoUrl] = useState<string>(getInitialLogoUrl());
  const [imgError, setImgError] = useState<boolean>(false);
  const [loadingFallback, setLoadingFallback] = useState<boolean>(false);
  const tokenAddress = token.address || metadata?.address;
  const tokenSymbol = token.symbol;

  // When the component mounts or token/metadata changes, reset state
  useEffect(() => {
    setImgError(false);
    setLogoUrl(getInitialLogoUrl());
  }, [token, metadata]);

  // If image fails to load, try to fetch a better logo from our fallback services
  useEffect(() => {
    const tryFallbackLogo = async () => {
      if (!imgError || loadingFallback) {
        return;
      }

      setLoadingFallback(true);

      try {
        console.log(
          `Image failed for ${tokenSymbol} (${tokenAddress}), trying fallback...`
        );
        // Use symbol-first approach if we have a symbol
        let fallbackLogo: string | null = null;

        if (tokenSymbol) {
          console.log(`Trying to find logo for symbol: ${tokenSymbol}`);
          // First try by symbol from our cache
          if (symbolToLogoMap.has(tokenSymbol.toUpperCase())) {
            fallbackLogo = symbolToLogoMap.get(tokenSymbol.toUpperCase())!;
            console.log(
              `Found cached logo for ${tokenSymbol}: ${fallbackLogo}`
            );
          } else {
            // Try by symbol using the tokenService function
            fallbackLogo = getKnownLogoBySymbol(tokenSymbol);
          }
        }

        // If no logo yet and we have an address, try by address
        if (!fallbackLogo && tokenAddress) {
          fallbackLogo = await fetchTokenLogoFallback(
            tokenAddress,
            tokenSymbol
          );
        }

        if (fallbackLogo) {
          console.log(
            `Found fallback logo for ${
              tokenSymbol || tokenAddress
            }: ${fallbackLogo}`
          );
          setLogoUrl(fallbackLogo);

          // Cache by both address and symbol if available
          if (tokenAddress) {
            successfulLogos.set(tokenAddress, fallbackLogo);
          }
          if (tokenSymbol) {
            symbolToLogoMap.set(tokenSymbol.toUpperCase(), fallbackLogo);
          }

          setImgError(false); // Reset error state so image has a chance to load
        } else {
          console.log(
            `No fallback logo found for ${
              tokenSymbol || tokenAddress
            }, using default`
          );
          setLogoUrl(DEFAULT_ICON);
        }
      } catch (error) {
        console.warn(
          `Failed to fetch fallback logo for ${tokenSymbol || tokenAddress}:`,
          error
        );
        setLogoUrl(DEFAULT_ICON);
      } finally {
        setLoadingFallback(false);
      }
    };

    if (imgError) {
      tryFallbackLogo();
    }
  }, [imgError, tokenSymbol, tokenAddress, loadingFallback]);

  const handleError = () => {
    console.log(
      `Failed to load image for ${tokenSymbol || tokenAddress}: ${logoUrl}`
    );

    // Only set error if we're not already showing default
    if (logoUrl !== DEFAULT_ICON) {
      setImgError(true);
    }
  };

  // When an image successfully loads, cache it for future use
  const handleLoad = () => {
    if (logoUrl !== DEFAULT_ICON) {
      console.log(
        `Successfully loaded image for ${
          tokenSymbol || tokenAddress
        }: ${logoUrl}`
      );
      if (tokenAddress) {
        successfulLogos.set(tokenAddress, logoUrl);
      }
      if (tokenSymbol) {
        symbolToLogoMap.set(tokenSymbol.toUpperCase(), logoUrl);
      }
    }
  };

  const sizeClass = `token-icon--${size}`;

  return (
    <div className={`token-icon ${sizeClass} ${className}`}>
      {loadingFallback ? (
        <div className="token-icon-loader"></div>
      ) : (
        <img
          src={logoUrl}
          alt={tokenSymbol || "token"}
          onError={handleError}
          onLoad={handleLoad}
        />
      )}
      {size === "small" && <div className="token-symbol">{tokenSymbol}</div>}
    </div>
  );
};

export default PositionTokenIcon;
