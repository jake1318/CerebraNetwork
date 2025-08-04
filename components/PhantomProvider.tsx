// src/components/PhantomProvider.tsx
// Last Updated: 2025-07-31 19:41:29 UTC by jake1318

import { useEffect } from "react";

// Use a module-level variable to track if we've already started the SDK injection
let sdkInjectionStarted = false;

export default function PhantomProvider() {
  useEffect(() => {
    // Check if we're on a secure context (HTTPS or localhost)
    const isSecureContext =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isSecureContext) {
      console.error(
        "[PhantomProvider] Not a secure context:",
        window.location.origin
      );
      return; // Don't attempt to load the SDK on non-secure origins
    }

    // CRUCIAL CHECK: If Phantom extension is already present, don't bother with embedded SDK
    if (window.phantom) {
      console.log(
        "[PhantomProvider] Phantom extension already detected, skipping embedded SDK"
      );

      // Initialize the phantom window object to avoid errors
      if (!window.phantom.sui) {
        window.phantom.sui = { isPhantom: true };
      }

      return;
    }

    // If we already have the embedded wallet, we're good
    if (window.cerebraWallet) {
      console.log("[PhantomProvider] Embedded wallet already exists");
      return;
    }

    // If we've already started injection, don't do it again
    if (sdkInjectionStarted) {
      console.log("[PhantomProvider] SDK injection already started");
      return;
    }

    console.log("[PhantomProvider] Initializing embedded SDK...");

    // Mark that we've started injection to prevent double-injection
    sdkInjectionStarted = true;

    // Check if the container already exists first
    let host = document.getElementById("phantom-wallet-container");

    if (!host) {
      // Create the element that Phantom will mount into if it doesn't exist
      host = document.createElement("div");
      host.id = "phantom-wallet-container";
      host.style.cssText = `
          position: fixed; z-index: 9998;
          inset: 0; display: none;
      `;
      document.body.appendChild(host);
      console.log("[PhantomProvider] Container element created:", host.id);
    } else {
      console.log("[PhantomProvider] Container element already exists");
    }

    try {
      // Inject the SDK *once*
      const sdk = document.createElement("script");
      sdk.src =
        "https://sdk.phantom.app/sdk.js" +
        "?element=phantom-wallet-container" + // where to mount
        "&namespace=cerebraWallet" + // ONE global object
        "&colorScheme=dark" +
        "&blockchain=sui"; // Sui main‑net

      // Add event listeners to monitor script loading
      sdk.onload = () => {
        console.log("[PhantomProvider] SDK script loaded successfully");

        // Extra check to validate initialization
        setTimeout(() => {
          console.log(
            "[PhantomProvider] Checking wallet status after SDK load:",
            {
              cerebraWallet: !!window.cerebraWallet,
              cerebraShow: !!window.cerebraWallet?.show,
              container: !!document.getElementById("phantom-wallet-container"),
            }
          );
        }, 1000);
      };

      sdk.onerror = (error) => {
        console.error("[PhantomProvider] Failed to load SDK script", error);
      };

      // Important: must be async
      sdk.async = true;

      // Append to document body
      document.body.appendChild(sdk);
      console.log("[PhantomProvider] SDK script appended to DOM");
    } catch (error) {
      console.error("[PhantomProvider] Error initializing", error);
    }

    return () => {
      // Don't do cleanup of the SDK on unmount - it needs to persist!
      console.log(
        "[PhantomProvider] Component unmounted, but SDK will persist"
      );
    };
  }, []);

  return null; // no visual representation
}

// Extend Window interface
declare global {
  interface Window {
    phantom?: any;
    cerebraWallet?: any;
  }
}
