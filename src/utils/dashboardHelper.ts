// src/utils/dashboardHelper.ts
// Last Updated: 2025-07-15 04:41:35 UTC by jake1318

/**
 * Helper function to clean dollar values by removing extra dollar signs
 */
export function cleanDollarValue(value: string | number): string {
  if (typeof value !== "string") {
    return `$${value}`;
  }

  // Remove all dollar signs first
  const cleanValue = value.replace(/\$/g, "").trim();

  // Now add back a single dollar sign
  return `$${cleanValue}`;
}

/**
 * Fix values in the portfolio dashboard to prevent double dollar signs
 * Call this function after the portfolio dashboard is mounted
 */
export function fixPortfolioDashboard(): void {
  // Run on a slight delay to ensure the DOM is ready
  setTimeout(() => {
    try {
      const totalValueEl = document.querySelector(
        ".dashboard-stat-card:nth-child(1) .stat-value"
      );
      const totalRewardsEl = document.querySelector(
        ".dashboard-stat-card:nth-child(2) .stat-value"
      );

      if (
        totalValueEl &&
        totalValueEl.textContent &&
        totalValueEl.textContent.includes("$")
      ) {
        // Extract clean value without dollar signs
        const cleanValue = totalValueEl.textContent.replace(/\$/g, "").trim();
        // Set as a data attribute
        totalValueEl.setAttribute("data-clean-value", cleanValue);
      }

      if (
        totalRewardsEl &&
        totalRewardsEl.textContent &&
        totalRewardsEl.textContent.includes("$")
      ) {
        // Extract clean value without dollar signs
        const cleanValue = totalRewardsEl.textContent.replace(/\$/g, "").trim();
        // Set as a data attribute
        totalRewardsEl.setAttribute("data-clean-value", cleanValue);
      }

      // Also fix the protocol breakdown values
      document.querySelectorAll(".protocol-value").forEach((el) => {
        if (el.textContent && el.textContent.includes("$$")) {
          el.textContent = el.textContent.replace(/\$\$/g, "$");
        }
      });
    } catch (err) {
      console.error("Error fixing portfolio dashboard values:", err);
    }
  }, 100);
}
