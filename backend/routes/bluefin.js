// routes/bluefin.js
// Updated: 2025-07-17 01:12:04 UTC by jake1318

import express from "express";
import * as bluefinService from "../services/bluefinService.js";
import {
  buildDepositTx,
  buildRemoveLiquidityTx,
  buildCollectFeesTx,
  buildCollectRewardsTx,
  buildClosePositionTx,
  buildCollectFeesAndRewardsTx,
  buildForceClosePositionTx, // Added new builder
} from "../services/bluefinTxBuilder.js";
import {
  BLUEFIN_PACKAGE_ID,
  GLOBAL_CONFIG_ID,
  SUI_CLOCK_OBJECT_ID,
} from "../services/bluefinService.js";

const router = express.Router();

/* ──────────────────────────────────────────────────────────
 *  Helpers
 * ──────────────────────────────────────────────────────────*/
const jsonError = (res, status, msg) =>
  res.status(status).json({ success: false, error: msg });

/* ──────────────────────────────────────────────────────────
 *  Read-only endpoints
 * ──────────────────────────────────────────────────────────*/
router.get("/pool/:poolId", async (req, res) => {
  try {
    const { poolId } = req.params;
    const pool = await bluefinService.getPoolDetails(poolId);
    if (!pool) return jsonError(res, 404, "Pool not found");
    res.json({ success: true, data: pool });
  } catch (e) {
    console.error("Error fetching pool:", e);
    jsonError(res, 500, e.message);
  }
});

router.get("/positions/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const positions = await bluefinService.getPositionsByOwner(walletAddress);
    res.json({ success: true, data: positions });
  } catch (e) {
    console.error("Error fetching positions:", e);
    jsonError(res, 500, e.message);
  }
});

/* ──────────────────────────────────────────────────────────
 *  Parameter helpers
 * ──────────────────────────────────────────────────────────*/
router.post("/get-deposit-params", async (req, res) => {
  try {
    const { poolId, amountA, amountB } = req.body;
    if (!poolId || typeof amountA !== "number")
      return jsonError(res, 400, "Missing required parameters");

    const pool = await bluefinService.getPoolDetails(poolId);
    if (!pool) return jsonError(res, 404, "Pool not found");

    // Calculate parameters
    const tickSpacing = pool.parsed?.tickSpacing || 60;
    const coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
    const coinTypeB =
      pool.parsed?.coinTypeB ||
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
    const currentPrice = pool.currentPrice || 4.08;

    // Calculate price range
    const lowerPrice = currentPrice * 0.5; // 50% below current price
    const upperPrice = currentPrice * 2.0; // 100% above current price
    const lowerTick = bluefinService.priceToTick(lowerPrice, tickSpacing);
    const upperTick = bluefinService.priceToTick(upperPrice, tickSpacing);

    // Calculate on-chain amounts
    const decimalsA = 9; // SUI has 9 decimals
    const decimalsB = 6; // USDC has 6 decimals

    const toUint = (amt, dec) => Math.floor(amt * 10 ** dec).toString();

    res.json({
      success: true,
      packageId: BLUEFIN_PACKAGE_ID,
      globalConfigId: GLOBAL_CONFIG_ID,
      clockObjectId: SUI_CLOCK_OBJECT_ID,
      coinTypeA,
      coinTypeB,
      lowerTick,
      upperTick,
      coinAAmount: toUint(amountA, decimalsA),
      coinBAmount: toUint(amountB || 0, decimalsB),
      tickSpacing,
      decimalsA,
      decimalsB,
    });
  } catch (e) {
    console.error("Error get-deposit-params:", e);
    jsonError(res, 500, e.message);
  }
});

router.post("/get-remove-liquidity-params", async (req, res) => {
  try {
    const { poolId, positionId, percent = 100 } = req.body;

    if (!poolId || !positionId) {
      return jsonError(res, 400, "Missing required parameters");
    }

    // Get position details
    try {
      const suiClient = await bluefinService.getSuiClient();
      const position = await suiClient.getObject({
        id: positionId,
        options: { showContent: true },
      });

      const currentLiquidity = position.data?.content?.fields?.liquidity || "0";
      // Calculate liquidity to remove based on percentage
      const liquidityToRemove =
        (BigInt(currentLiquidity) * BigInt(percent)) / BigInt(100);

      // Get pool details
      const pool = await bluefinService.getPoolDetails(poolId);
      const coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
      const coinTypeB =
        pool.parsed?.coinTypeB ||
        "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

      // Return parameters
      res.json({
        success: true,
        packageId: BLUEFIN_PACKAGE_ID,
        globalConfigId: GLOBAL_CONFIG_ID,
        clockObjectId: SUI_CLOCK_OBJECT_ID,
        coinTypeA,
        coinTypeB,
        liquidityToRemove: liquidityToRemove.toString(),
        percent,
      });
    } catch (err) {
      console.error("Error fetching position details:", err);
      return jsonError(
        res,
        404,
        `Failed to fetch liquidity for position ${positionId}`
      );
    }
  } catch (error) {
    console.error("Error getting remove liquidity parameters:", error);
    jsonError(res, 500, error.message);
  }
});

router.post("/get-collect-fees-params", async (req, res) => {
  try {
    const { poolId, positionId } = req.body;
    if (!poolId || !positionId) {
      return jsonError(res, 400, "Missing required parameters");
    }

    // Get pool details
    const pool = await bluefinService.getPoolDetails(poolId);
    const coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
    const coinTypeB =
      pool.parsed?.coinTypeB ||
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

    // Return parameters
    res.json({
      success: true,
      packageId: BLUEFIN_PACKAGE_ID,
      globalConfigId: GLOBAL_CONFIG_ID,
      clockObjectId: SUI_CLOCK_OBJECT_ID,
      coinTypeA,
      coinTypeB,
    });
  } catch (error) {
    console.error("Error getting collect fees parameters:", error);
    jsonError(res, 500, error.message);
  }
});

router.post("/get-collect-rewards-params", async (req, res) => {
  try {
    const { poolId, positionId } = req.body;
    if (!poolId || !positionId) {
      return jsonError(res, 400, "Missing required parameters");
    }

    // Get pool details
    const pool = await bluefinService.getPoolDetails(poolId);
    const coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
    const coinTypeB =
      pool.parsed?.coinTypeB ||
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

    // Default reward coin type
    const rewardCoinTypes = [
      "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::blue::BLUE",
    ];

    // Return parameters
    res.json({
      success: true,
      packageId: BLUEFIN_PACKAGE_ID,
      globalConfigId: GLOBAL_CONFIG_ID,
      clockObjectId: SUI_CLOCK_OBJECT_ID,
      coinTypeA,
      coinTypeB,
      rewardCoinTypes,
    });
  } catch (error) {
    console.error("Error getting collect rewards parameters:", error);
    jsonError(res, 500, error.message);
  }
});

router.post("/get-collect-fees-and-rewards-params", async (req, res) => {
  try {
    const { poolId, positionId } = req.body;
    if (!poolId || !positionId) {
      return jsonError(res, 400, "Missing required parameters");
    }

    // Get pool details
    const pool = await bluefinService.getPoolDetails(poolId);
    const coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
    const coinTypeB =
      pool.parsed?.coinTypeB ||
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

    // Return parameters
    res.json({
      success: true,
      packageId: BLUEFIN_PACKAGE_ID,
      globalConfigId: GLOBAL_CONFIG_ID,
      clockObjectId: SUI_CLOCK_OBJECT_ID,
      coinTypeA,
      coinTypeB,
    });
  } catch (error) {
    console.error("Error getting collect fees and rewards parameters:", error);
    jsonError(res, 500, error.message);
  }
});

router.post("/get-close-position-params", async (req, res) => {
  try {
    const { poolId, positionId } = req.body;
    if (!poolId || !positionId) {
      return jsonError(res, 400, "Missing required parameters");
    }

    // Get pool details
    const pool = await bluefinService.getPoolDetails(poolId);
    const coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
    const coinTypeB =
      pool.parsed?.coinTypeB ||
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

    // Default reward coin types (empty for simple closing)
    const rewardCoinTypes = [];

    // Return parameters
    res.json({
      success: true,
      packageId: BLUEFIN_PACKAGE_ID,
      globalConfigId: GLOBAL_CONFIG_ID,
      clockObjectId: SUI_CLOCK_OBJECT_ID,
      coinTypeA,
      coinTypeB,
      rewardCoinTypes,
    });
  } catch (error) {
    console.error("Error getting close position parameters:", error);
    jsonError(res, 500, error.message);
  }
});

router.post("/get-force-close-params", async (req, res) => {
  try {
    const { poolId, positionId } = req.body;
    if (!poolId || !positionId) {
      return jsonError(res, 400, "Missing required parameters");
    }

    // Get pool details
    const pool = await bluefinService.getPoolDetails(poolId);
    const coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
    const coinTypeB =
      pool.parsed?.coinTypeB ||
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";

    // Return parameters
    res.json({
      success: true,
      packageId: BLUEFIN_PACKAGE_ID,
      globalConfigId: GLOBAL_CONFIG_ID,
      clockObjectId: SUI_CLOCK_OBJECT_ID,
      coinTypeA,
      coinTypeB,
    });
  } catch (error) {
    console.error("Error getting force close parameters:", error);
    jsonError(res, 500, error.message);
  }
});

/* ──────────────────────────────────────────────────────────
 *  BUILD + SERIALISE (all return { txb64 }) - SIMPLIFIED
 * ──────────────────────────────────────────────────────────*/

// Modified to return a proper JSON response with txBytes field
const buildAndReturn = (builder) => async (req, res, next) => {
  try {
    const txb64 = await builder(req.body);
    // CHANGED: Return JSON object with txBytes field instead of raw string
    res.json({ success: true, txBytes: txb64 });
  } catch (e) {
    console.error("Builder error:", e);
    jsonError(res, 500, e.message);
  }
};

router.post(
  "/create-deposit-tx",
  buildAndReturn(
    ({
      poolId,
      amountA,
      amountB,
      lowerTickFactor,
      upperTickFactor,
      walletAddress,
    }) =>
      buildDepositTx({
        poolId,
        amountA,
        amountB,
        lowerTickFactor,
        upperTickFactor,
        walletAddress,
      })
  )
);

router.post(
  "/create-remove-liquidity-tx",
  buildAndReturn(({ poolId, positionId, percent, walletAddress }) =>
    buildRemoveLiquidityTx({
      poolId,
      positionId,
      percent,
      walletAddress,
    })
  )
);

router.post(
  "/create-collect-fees-tx",
  buildAndReturn(({ poolId, positionId, walletAddress }) =>
    buildCollectFeesTx({ poolId, positionId, walletAddress })
  )
);

router.post(
  "/create-collect-rewards-tx",
  buildAndReturn(({ poolId, positionId, walletAddress }) =>
    buildCollectRewardsTx({ poolId, positionId, walletAddress })
  )
);

router.post(
  "/create-collect-fees-and-rewards-tx",
  buildAndReturn(({ poolId, positionId, walletAddress }) =>
    buildCollectFeesAndRewardsTx({ poolId, positionId, walletAddress })
  )
);

router.post(
  "/create-close-position-tx",
  buildAndReturn(({ poolId, positionId, walletAddress }) =>
    buildClosePositionTx({ poolId, positionId, walletAddress })
  )
);

// New endpoint for force-closing positions
router.post(
  "/force-close-position-tx",
  buildAndReturn(({ poolId, positionId, walletAddress, force }) =>
    buildForceClosePositionTx({
      poolId,
      positionId,
      walletAddress,
      force: force !== undefined ? force : true,
    })
  )
);

export { router };
export default router;
