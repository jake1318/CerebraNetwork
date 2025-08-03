// src/utils/waitForPhantom.ts
// Last Updated: 2025-07-31 19:41:29 UTC by jake1318

export function waitForPhantom(
  timeoutMs = 20000
): Promise<"extension" | "embedded"> {
  return new Promise((resolve, reject) => {
    // Check if we're on a secure context (HTTPS or localhost)
    const isSecureContext =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isSecureContext) {
      console.error(
        "[waitForPhantom] Not a secure context:",
        window.location.origin
      );
      reject(
        new Error(
          `Phantom requires HTTPS or localhost. Current origin: ${window.location.origin}`
        )
      );
      return;
    }

    // Start with a check if it's already ready
    const { phantom, cerebraWallet } = window as any;

    // Log initial state
    console.log("[waitForPhantom] Initial state:", {
      hasPhantom: !!phantom,
      hasPhantomSui: !!phantom?.sui,
      hasPhantomSolana: !!phantom?.solana,
      hasCerebraWallet: !!cerebraWallet,
      hasCerebraShow: !!cerebraWallet?.show,
      hasCerebraHide: !!cerebraWallet?.hide,
      origin: window.location.origin,
    });

    // IMPORTANT FIX: If window.phantom exists but sui is not initialized,
    // we can just treat it as if the extension is ready
    if (phantom) {
      console.log(
        "[waitForPhantom] Phantom object detected, treating as extension"
      );

      // Force initialize the phantom.sui object if it doesn't exist
      if (!phantom.sui) {
        phantom.sui = { isPhantom: true };
      }

      return resolve("extension");
    }

    // Check if embedded wallet is ready
    if (cerebraWallet?.show && cerebraWallet?.hide) {
      console.log("[waitForPhantom] Embedded wallet detected immediately");
      return resolve("embedded");
    }

    // Check if container exists
    const containerExists = !!document.getElementById(
      "phantom-wallet-container"
    );
    if (!containerExists) {
      console.error(
        "[waitForPhantom] Container element not found - PhantomProvider may not have run"
      );
    }

    let checkCount = 0;
    const timeout = setTimeout(() => {
      console.error("[waitForPhantom] Timed out after", timeoutMs, "ms");
      console.log("[waitForPhantom] Final state:", {
        hasPhantom: !!window.phantom,
        hasPhantomSui: !!window.phantom?.sui,
        hasPhantomSolana: !!window.phantom?.solana,
        hasCerebraWallet: !!window.cerebraWallet,
        hasCerebraShow: !!window.cerebraWallet?.show,
        hasCerebraHide: !!window.cerebraWallet?.hide,
        container: !!document.getElementById("phantom-wallet-container"),
        origin: window.location.origin,
      });

      // Show more diagnostic information
      try {
        const networkRequests = performance
          .getEntriesByType("resource")
          .filter((entry) => entry.name.includes("sdk.phantom.app"))
          .map((entry) => ({
            url: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
            transferSize: (entry as any).transferSize || "unknown",
          }));

        console.log("[waitForPhantom] SDK network requests:", networkRequests);
      } catch (err) {
        console.log("[waitForPhantom] Could not get network performance data");
      }

      // FALLBACK LOGIC: If Phantom object exists but no extension or embedded features are detected,
      // let's default to treating it as an extension to avoid timeout
      if (window.phantom) {
        console.log(
          "[waitForPhantom] Timeout occurred but window.phantom exists - defaulting to extension mode"
        );
        // Initialize the sui property if needed
        if (!window.phantom.sui) {
          window.phantom.sui = { isPhantom: true };
        }
        return resolve("extension");
      }

      reject(new Error("Phantom SDK not ready"));
    }, timeoutMs);

    const check = () => {
      const { phantom, cerebraWallet } = window as any;
      checkCount++;

      // Only log every 10 checks to avoid console spam
      if (checkCount % 10 === 0 || checkCount <= 2) {
        console.log(`[waitForPhantom] Check #${checkCount}:`, {
          hasPhantom: !!phantom,
          hasPhantomSui: !!phantom?.sui?.isPhantom,
          hasPhantomSolana: !!phantom?.solana?.isPhantom,
          hasCerebraWallet: !!cerebraWallet,
          hasCerebraShow: !!cerebraWallet?.show,
          hasCerebraHide: !!cerebraWallet?.hide,
          container: !!document.getElementById("phantom-wallet-container"),
        });
      }

      // ➊ If phantom object exists, treat as extension (even without sui/solana properties)
      if (phantom) {
        console.log(
          "[waitForPhantom] Phantom object detected after",
          checkCount,
          "checks"
        );
        clearTimeout(timeout);

        // Initialize the sui property if needed
        if (!phantom.sui) {
          phantom.sui = { isPhantom: true };
        }

        return resolve("extension");
      }

      // ➋ embedded wallet object ready?
      if (cerebraWallet?.show && cerebraWallet?.hide) {
        console.log(
          "[waitForPhantom] Embedded wallet detected after",
          checkCount,
          "checks"
        );
        clearTimeout(timeout);
        return resolve("embedded");
      }

      // ➌ retry every 100 ms
      setTimeout(check, 100);
    };

    check();
  });
}
