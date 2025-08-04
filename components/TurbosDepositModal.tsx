// src/components/TurbosDepositModal.tsx
// Created: 2025-05-24 00:35:47 UTC by jake1318
// Last Updated: 2025-05-24 04:53:03 UTC by jake1318

import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Slider,
  Statistic,
  Tooltip,
  Alert,
  Radio,
  Space,
  Typography,
  Row,
  Col,
  Divider,
  notification,
  Spin,
} from "antd";
import {
  InfoCircleOutlined,
  SwapOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  LinkOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import { useWallet } from "@suiet/wallet-kit";
import BigNumber from "bignumber.js";
import { PoolInfo } from "../services/coinGeckoService";
import * as turbosService from "../services/turbosService";
import { birdeyeService } from "../services/birdeyeService";
import blockvisionService from "../services/blockvisionService";
import TokenIcon from "./TokenIcon";

// Define constants directly in the file since we don't have a constants file
const DEFAULT_SLIPPAGE = 0.5;
const SUI_VISION_TX_URL = "https://suivision.xyz/txblock/";

// Define formatters since they're not available in the formatters utility file
const formatTokenAmount = (value: string, decimals: number = 6): string => {
  const parsedAmount = parseFloat(value);
  if (isNaN(parsedAmount)) return "0";

  if (parsedAmount > 1000) return parsedAmount.toFixed(2);
  if (parsedAmount > 100) return parsedAmount.toFixed(4);
  if (parsedAmount > 1) return parsedAmount.toFixed(6);
  return parsedAmount.toFixed(8);
};

const formatPercentage = (value: number): string => {
  return (value * 100).toFixed(2) + "%";
};

const getTheme = (): string => {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
};

const { Text, Paragraph, Title } = Typography;

/**
 * Transaction Success Popup Component
 * Shows details about the successful transaction with a link to SuiVision
 */
interface TransactionSuccessPopupProps {
  visible: boolean;
  onClose: () => void;
  txData: {
    digest: string;
    tokenA?: { symbol: string; amount: number };
    tokenB?: { symbol: string; amount: number };
    timestamp?: number;
    poolId?: string;
  };
}

const TransactionSuccessPopup: React.FC<TransactionSuccessPopupProps> = ({
  visible,
  onClose,
  txData,
}) => {
  // Format the timestamp
  const formattedDate = txData.timestamp
    ? new Date(txData.timestamp).toLocaleString()
    : new Date().toLocaleString();

  // Create SuiVision link
  const explorerLink = `${SUI_VISION_TX_URL}${txData.digest}`;

  const isDarkMode = getTheme() === "dark";

  return (
    <Modal
      title={
        <Space>
          <CheckCircleFilled style={{ color: "#52c41a", fontSize: "24px" }} />
          <Title level={4} style={{ margin: 0 }}>
            Transaction Successful
          </Title>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="explorer"
          type="primary"
          icon={<LinkOutlined />}
          onClick={() =>
            window.open(explorerLink, "_blank", "noopener,noreferrer")
          }
        >
          View on SuiVision
        </Button>,
      ]}
      width={500}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Alert
          message="Your liquidity has been successfully added!"
          type="success"
          showIcon
        />

        <div
          style={{
            marginTop: "16px",
            background: isDarkMode ? "#1f1f1f" : "#f5f5f5",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <Paragraph>
            <Text strong>Tokens Deposited:</Text>
          </Paragraph>
          {txData.tokenA && (
            <Paragraph>
              <Text>
                {formatTokenAmount(String(txData.tokenA.amount))}{" "}
                {txData.tokenA.symbol}
              </Text>
            </Paragraph>
          )}
          {txData.tokenB && (
            <Paragraph>
              <Text>
                {formatTokenAmount(String(txData.tokenB.amount))}{" "}
                {txData.tokenB.symbol}
              </Text>
            </Paragraph>
          )}
          {txData.poolId && (
            <Paragraph>
              <Text strong>Pool:</Text> {txData.poolId?.substring(0, 10)}...
              {txData.poolId?.substring(txData.poolId.length - 6)}
            </Paragraph>
          )}
          <Paragraph>
            <Text strong>Date:</Text> {formattedDate}
          </Paragraph>
          <Paragraph>
            <Text strong>Transaction ID:</Text>
            <div
              style={{
                wordBreak: "break-all",
                background: isDarkMode ? "#000000" : "#ffffff",
                padding: "8px",
                borderRadius: "4px",
                marginTop: "4px",
              }}
            >
              {txData.digest}
            </div>
          </Paragraph>
        </div>
      </Space>
    </Modal>
  );
};

interface TurbosDepositModalProps {
  visible: boolean;
  onCancel: () => void;
  onDeposit: (
    poolId: string,
    amountA: number,
    amountB: number,
    tickLower: number,
    tickUpper: number,
    slippage: number
  ) => Promise<void>;
  poolInfo: PoolInfo | null;
  tokenABalance: string;
  tokenBBalance: string;
}

/**
 * TurbosDepositModal - A specialized modal for depositing into Turbos Finance pools
 *
 * This component is optimized for Turbos pools, particularly SUI/USDC pairs,
 * with correct price conversion handling and tick calculations.
 */
const TurbosDepositModal: React.FC<TurbosDepositModalProps> = ({
  visible,
  onCancel,
  onDeposit,
  poolInfo,
  tokenABalance: initialTokenABalance,
  tokenBBalance: initialTokenBBalance,
}) => {
  const [form] = Form.useForm();
  const wallet = useWallet();
  const isDarkMode = getTheme() === "dark";

  // Form state
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [tickLower, setTickLower] = useState<number | null>(null);
  const [tickUpper, setTickUpper] = useState<number | null>(null);
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);
  const [customSlippage, setCustomSlippage] = useState<boolean>(false);

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [fetchingPrice, setFetchingPrice] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  // For USDC/SUI, default to NOT inverting price (USDC per SUI from screenshot)
  const [invertPrice, setInvertPrice] = useState<boolean>(false);
  const [expectedAPR, setExpectedAPR] = useState<number | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [rangeWidth, setRangeWidth] = useState<number>(5);
  const [activeTab, setActiveTab] = useState<string>("recommended");
  const [positionMeta, setPositionMeta] = useState<any>(null);

  // Pool & token data
  const [turbosPool, setTurbosPool] = useState<any>(null);
  const [isSuiUsdcPool, setIsSuiUsdcPool] = useState<boolean>(false);
  const [tokenASymbol, setTokenASymbol] = useState<string>("USDC");
  const [tokenBSymbol, setTokenBSymbol] = useState<string>("SUI");
  const [tokenADecimals, setTokenADecimals] = useState<number>(6); // Default for USDC
  const [tokenBDecimals, setTokenBDecimals] = useState<number>(9); // Default for SUI
  const [usdcIndex, setUsdcIndex] = useState<number>(0);
  const [suiIndex, setSuiIndex] = useState<number>(1);

  // Token addresses - to correctly fetch prices
  const [tokenAAddress, setTokenAAddress] = useState<string>("");
  const [tokenBAddress, setTokenBAddress] = useState<string>("");

  // Token balances - we'll update these from the blockvision API
  const [tokenABalance, setTokenABalance] = useState<string>(
    initialTokenABalance || "0"
  );
  const [tokenBBalance, setTokenBBalance] = useState<string>(
    initialTokenBBalance || "0"
  );
  const [fetchingBalances, setFetchingBalances] = useState<boolean>(false);

  // Transaction success state
  const [txSuccess, setTxSuccess] = useState<boolean>(false);
  const [txData, setTxData] = useState<{
    digest: string;
    tokenA?: { symbol: string; amount: number };
    tokenB?: { symbol: string; amount: number };
    timestamp?: number;
    poolId?: string;
  }>({ digest: "" });

  // Initialize with pool data
  useEffect(() => {
    if (poolInfo && poolInfo.address) {
      console.log(
        "Initializing Turbos deposit modal for pool:",
        poolInfo.address
      );

      // Check if this is a SUI/USDC pool
      const isSuiUsdc = turbosService.isSuiUsdcPool(poolInfo.address, poolInfo);
      setIsSuiUsdcPool(isSuiUsdc);

      console.log("Pool identified as SUI/USDC pool:", isSuiUsdc);

      // For SUI/USDC pool, ensure USDC is tokenA and SUI is tokenB
      if (isSuiUsdc) {
        console.log("Setting up SUI/USDC specific configuration");
        setTokenASymbol("USDC");
        setTokenBSymbol("SUI");
        setTokenADecimals(6); // USDC has 6 decimals
        setTokenBDecimals(9); // SUI has 9 decimals
        // Based on the screenshot, we're displaying price as USDC per SUI
        setInvertPrice(false);
      } else {
        // Extract token symbols for other pools
        const symbolA =
          poolInfo.tokenA.split("::").pop()?.replace(/"/g, "") || "TokenA";
        const symbolB =
          poolInfo.tokenB.split("::").pop()?.replace(/"/g, "") || "TokenB";
        setTokenASymbol(symbolA);
        setTokenBSymbol(symbolB);
        console.log(
          `Non-SUI/USDC pool setup with tokens: ${symbolA}/${symbolB}`
        );
      }

      // Additional logging for initial state
      console.log("Initial token configuration:", {
        tokenASymbol: isSuiUsdc
          ? "USDC"
          : poolInfo.tokenA.split("::").pop()?.replace(/"/g, "") || "TokenA",
        tokenBSymbol: isSuiUsdc
          ? "SUI"
          : poolInfo.tokenB.split("::").pop()?.replace(/"/g, "") || "TokenB",
        tokenADecimals: isSuiUsdc ? 6 : tokenADecimals,
        tokenBDecimals: isSuiUsdc ? 9 : tokenBDecimals,
        tokenAAddress: poolInfo.tokenAAddress || poolInfo.tokenA,
        tokenBAddress: poolInfo.tokenBAddress || poolInfo.tokenB,
      });

      // Store token addresses if available
      if (poolInfo.tokenAAddress) setTokenAAddress(poolInfo.tokenAAddress);
      if (poolInfo.tokenBAddress) setTokenBAddress(poolInfo.tokenBAddress);

      // If we don't have addresses yet, try to extract them from tokenA/tokenB
      if (!tokenAAddress && poolInfo.tokenA && poolInfo.tokenA.includes("::")) {
        setTokenAAddress(poolInfo.tokenA);
      }
      if (!tokenBAddress && poolInfo.tokenB && poolInfo.tokenB.includes("::")) {
        setTokenBAddress(poolInfo.tokenB);
      }

      // Set initial token ordering and fetch pool data
      fetchPoolData(poolInfo.address);

      // Fetch token balances
      if (wallet.connected && wallet.account?.address) {
        fetchTokenBalances(wallet.account.address);
      }
    }
  }, [poolInfo, wallet.connected, wallet.account]);

  // Fetch price when we have token addresses
  useEffect(() => {
    // as soon as we know both token addresses, grab the live ratio
    if (tokenAAddress && tokenBAddress) {
      fetchPairPrice();
    }
  }, [tokenAAddress, tokenBAddress]);

  // Calculate position metadata when inputs change
  useEffect(() => {
    if (
      poolInfo &&
      currentPrice &&
      tickLower !== null &&
      tickUpper !== null &&
      amountA &&
      amountB
    ) {
      calculatePositionMeta();
    }
  }, [
    poolInfo,
    currentPrice,
    tickLower,
    tickUpper,
    amountA,
    amountB,
    expectedAPR,
  ]);

  /**
   * Fetch the USD prices for token A & B and compute tokenB/tokenA.
   */
  const fetchPairPrice = async () => {
    if (!tokenAAddress || !tokenBAddress) return;

    try {
      setFetchingPrice(true);
      console.log(`Fetching prices for ${tokenAAddress} and ${tokenBAddress}`);

      const [aData, bData] = await Promise.all([
        birdeyeService.getPriceVolumeSingle(tokenAAddress),
        birdeyeService.getPriceVolumeSingle(tokenBAddress),
      ]);

      console.log("Price data A:", aData);
      console.log("Price data B:", bData);

      const pa = aData?.price ?? aData?.data?.price;
      const pb = bData?.price ?? bData?.data?.price;

      if (pa != null && pb != null) {
        // priceB_per_A = USD(B) / USD(A)
        const ratio = parseFloat(pb.toString()) / parseFloat(pa.toString());
        console.log(`Price ratio ${tokenBSymbol}/${tokenASymbol}: ${ratio}`);

        // Set the current price and initialize price range
        setCurrentPrice(ratio);
        initializePriceRange(ratio);
      } else {
        // Fallback to default price for SUI/USDC pools
        if (isSuiUsdcPool) {
          console.log("Using default price for SUI/USDC pool: 1.0");
          setCurrentPrice(1.0);
          initializePriceRange(1.0);
        } else {
          // For other pools, try to use price from tick
          const poolData = turbosPool;
          if (poolData && poolData.current_tick) {
            const price = Math.pow(1.0001, poolData.current_tick);
            console.log(`Using tick-based price: ${price}`);
            setCurrentPrice(price);
            initializePriceRange(price);
          } else {
            // Last resort: use 1.0
            setCurrentPrice(1.0);
            initializePriceRange(1.0);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch pair price:", e);
      // Fallback to default price for SUI/USDC pools
      if (isSuiUsdcPool) {
        setCurrentPrice(1.0);
        initializePriceRange(1.0);
      } else if (turbosPool && turbosPool.current_tick) {
        // For other pools, fallback to tick-based price
        const price = Math.pow(1.0001, turbosPool.current_tick);
        setCurrentPrice(price);
        initializePriceRange(price);
      }
    } finally {
      setFetchingPrice(false);
    }
  };

  /**
   * Fetch token balances from the Blockvision API
   *
   * FIXED: Use exact coinType match first, then fall back to symbol matching
   * to prevent matching the same coin twice
   */
  const fetchTokenBalances = async (walletAddress: string) => {
    if (!poolInfo) return;

    setFetchingBalances(true);
    try {
      console.log(`Fetching token balances for ${walletAddress}`);

      // Get all account coins
      const response = await blockvisionService.getAccountCoins(walletAddress);
      if (response && response.data) {
        // Store the raw coins data for debugging
        const coins = response.data;
        console.log("Raw BlockVision coins:", coins);

        // For SUI/USDC pools, ensure we're looking for the right tokens
        let tokenAType = poolInfo.tokenA;
        let tokenBType = poolInfo.tokenB;

        if (isSuiUsdcPool) {
          // FIXED: More explicit token matching
          // Try to find USDC for token A
          const usdcCoin = coins.find(
            (coin) =>
              coin.symbol.toUpperCase() === "USDC" ||
              coin.coinType.toLowerCase().includes("usdc")
          );

          // Try to find SUI for token B
          const suiCoin = coins.find(
            (coin) =>
              coin.symbol.toUpperCase() === "SUI" ||
              coin.coinType === "0x2::sui::SUI"
          );

          // Update token types if found
          if (usdcCoin) tokenAType = usdcCoin.coinType;
          if (suiCoin) tokenBType = suiCoin.coinType;

          // Update token addresses for price lookup
          if (usdcCoin) setTokenAAddress(usdcCoin.coinType);
          if (suiCoin) setTokenBAddress(suiCoin.coinType);

          console.log("Identified token types:", {
            USDC: tokenAType,
            SUI: tokenBType,
          });
        }

        // FIXED: Create separate local variables for each token to prevent confusion
        let foundTokenA = null;
        let foundTokenB = null;

        // Log the tokens we're looking for
        console.log({ tokenAType, tokenBType });

        // FIXED: First try exact coinType match (this guarantees uniqueness)
        foundTokenA = coins.find((coin) => coin.coinType === tokenAType);
        foundTokenB = coins.find((coin) => coin.coinType === tokenBType);

        // Fallback: if that fails, match by symbol (still distinct)
        if (!foundTokenA) {
          foundTokenA = coins.find(
            (coin) => coin.symbol.toUpperCase() === tokenASymbol.toUpperCase()
          );
        }
        if (!foundTokenB) {
          foundTokenB = coins.find(
            (coin) => coin.symbol.toUpperCase() === tokenBSymbol.toUpperCase()
          );
        }

        console.log("Found tokens:", {
          tokenA: foundTokenA,
          tokenB: foundTokenB,
        });

        // FIXED: Set token A balance if found - handle completely separately from token B
        if (foundTokenA) {
          console.log(
            `Found ${tokenASymbol} balance:`,
            foundTokenA.balance,
            "with decimals",
            foundTokenA.decimals
          );
          setTokenABalance(foundTokenA.balance);
          setTokenADecimals(foundTokenA.decimals);
        } else {
          console.log(`No balance found for ${tokenASymbol}`);
          setTokenABalance("0");
        }

        // FIXED: Set token B balance if found - completely independent logic
        if (foundTokenB) {
          console.log(
            `Found ${tokenBSymbol} balance:`,
            foundTokenB.balance,
            "with decimals",
            foundTokenB.decimals
          );
          setTokenBBalance(foundTokenB.balance);
          setTokenBDecimals(foundTokenB.decimals);
        } else {
          console.log(`No balance found for ${tokenBSymbol}`);
          setTokenBBalance("0");
        }
      }
    } catch (error) {
      console.error("Error fetching token balances:", error);
      // Fallback to initial balances if provided
      setTokenABalance(initialTokenABalance || "0");
      setTokenBBalance(initialTokenBBalance || "0");
    } finally {
      setFetchingBalances(false);
    }
  };

  /**
   * Fetches pool data from the Turbos service
   */
  const fetchPoolData = async (poolAddress: string) => {
    try {
      setLoading(true);
      console.log(`Fetching Turbos pool data for ${poolAddress}`);

      // Get pool data from Turbos
      const poolData = await turbosService.getPool(poolAddress);
      if (poolData) {
        setTurbosPool(poolData);

        // Determine token ordering in the pool for correct deposit mapping
        if (poolData.coinTypes) {
          const [type0, type1] = poolData.coinTypes;
          console.log(`Pool coin types: [${type0}, ${type1}]`);

          // Update token addresses for price lookups
          if (!tokenAAddress || !tokenBAddress) {
            if (isSuiUsdcPool) {
              // Detect which index is USDC vs SUI
              const usdc = type0.toLowerCase().includes("usdc") ? 0 : 1;
              const sui = usdc === 0 ? 1 : 0;
              setUsdcIndex(usdc);
              setSuiIndex(sui);
              console.log(`USDC is at index ${usdc}, SUI is at index ${sui}`);

              // Set addresses based on detected indices
              setTokenAAddress(usdc === 0 ? type0 : type1);
              setTokenBAddress(sui === 0 ? type0 : type1);
            } else {
              // For non-SUI/USDC pools, just use the order from pool
              setTokenAAddress(type0);
              setTokenBAddress(type1);
            }
          }
        }

        // Fetch APR data
        if (
          isSuiUsdcPool &&
          blockvisionService &&
          blockvisionService.getPoolStats
        ) {
          try {
            const statsData = await blockvisionService.getPoolStats(
              poolAddress
            );
            if (statsData && statsData.volume24h && statsData.tvl) {
              const volume24h = statsData.volume24h;
              const feeRate = 0.003; // 0.3% fee
              const annualFees = volume24h * feeRate * 365;
              const tvl = statsData.tvl || 1;
              const apr = (annualFees / tvl) * 100;
              setExpectedAPR(apr);
            }
          } catch (error) {
            console.error("Failed to fetch APR data:", error);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch pool data:", error);
      notification.error({
        message: "Error",
        description: "Failed to load pool data. Please try again later.",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get price range from ticks (if not available in turbosService)
   */
  const getPriceRangeFromTicks = (tickLower: number, tickUpper: number) => {
    if (turbosService.getPriceRangeFromTicks) {
      return turbosService.getPriceRangeFromTicks(
        tickLower,
        tickUpper,
        isSuiUsdcPool
      );
    }

    // Fallback implementation if not available in service
    const minPrice = Math.pow(1.0001, tickLower);
    const maxPrice = Math.pow(1.0001, tickUpper);
    return { minPrice, maxPrice };
  };

  /**
   * Initializes the price range based on the current price
   */
  const initializePriceRange = (price: number) => {
    if (!price) return;

    console.log(`Initializing price range around ${price}`);

    // For SUI/USDC pools, use recommended ticks
    if (isSuiUsdcPool && poolInfo) {
      // Try to get recommended ticks for SUI/USDC
      if (turbosService.getRecommendedTicks) {
        const recommendedTicks = turbosService.getRecommendedTicks(
          poolInfo.address,
          poolInfo
        );
        if (recommendedTicks) {
          console.log(
            `Using recommended ticks: [${recommendedTicks.tickLower}, ${recommendedTicks.tickUpper}]`
          );
          setTickLower(recommendedTicks.tickLower);
          setTickUpper(recommendedTicks.tickUpper);

          // Get price range
          const priceRange = getPriceRangeFromTicks(
            recommendedTicks.tickLower,
            recommendedTicks.tickUpper
          );
          setPriceRange([priceRange.minPrice, priceRange.maxPrice]);
          return;
        }
      }
    }

    // For other pools or if recommended ticks aren't available:
    // Set range width based on active tab
    let width = 5;
    if (activeTab === "recommended") {
      width = rangeWidth;
    } else if (activeTab === "full") {
      width = 100;
    }

    // Calculate price range
    const lowerPricePercent = 1 - width / 100;
    const upperPricePercent = 1 + width / 100;

    const lowerPrice = price * lowerPricePercent;
    const upperPrice = price * upperPricePercent;

    // Calculate ticks
    const { tickLower: lowerTick, tickUpper: upperTick } = calculateTickRange([
      lowerPrice,
      upperPrice,
    ]);

    console.log(`Setting tick range: [${lowerTick}, ${upperTick}]`);
    setTickLower(lowerTick);
    setTickUpper(upperTick);

    // Get the actual price range from the ticks (may be slightly different due to rounding)
    const actualPriceRange = getPriceRangeFromTicks(lowerTick, upperTick);
    console.log(
      `Actual price range: [${actualPriceRange.minPrice}, ${actualPriceRange.maxPrice}]`
    );
    setPriceRange([actualPriceRange.minPrice, actualPriceRange.maxPrice]);
  };

  /**
   * Calculates tick range from price range with spacing
   */
  const calculateTickRange = (
    priceRange: [number, number],
    spacing: number = 60
  ): { tickLower: number; tickUpper: number } => {
    console.log(
      `Calculating tick range for price range: [${priceRange[0]}, ${priceRange[1]}]`
    );

    // If this is a SUI/USDC pool and we have recommended ticks, use them
    if (isSuiUsdcPool && poolInfo && turbosService.getRecommendedTicks) {
      const recommendedTicks = turbosService.getRecommendedTicks(
        poolInfo.address,
        poolInfo
      );
      if (recommendedTicks) {
        console.log(
          `Using recommended ticks: [${recommendedTicks.tickLower}, ${recommendedTicks.tickUpper}]`
        );
        return recommendedTicks;
      }
    }

    // Otherwise calculate from the price range
    // Convert price to ticks
    const tickLower = Math.floor(Math.log(priceRange[0]) / Math.log(1.0001));
    const tickUpper = Math.ceil(Math.log(priceRange[1]) / Math.log(1.0001));

    // Round to the nearest tick spacing
    const roundedTickLower = Math.floor(tickLower / spacing) * spacing;
    const roundedTickUpper = Math.ceil(tickUpper / spacing) * spacing;

    console.log(
      `Calculated tick range: [${roundedTickLower}, ${roundedTickUpper}]`
    );
    return { tickLower: roundedTickLower, tickUpper: roundedTickUpper };
  };

  /**
   * Handles changes to Token A amount (USDC)
   */
  const handleAmountAChange = (v: string) => {
    if (v === "") {
      setAmountA("");
      setAmountB("");
      return;
    }

    setAmountA(v);

    if (currentPrice) {
      if (isSuiUsdcPool) {
        // For SUI/USDC Turbos pools where price is USDC per SUI:
        // 1 SUI = x USDC, so to get SUI amount, divide USDC by price
        setAmountB((Number(v) / (currentPrice || 1)).toFixed(6));
      } else {
        // For other pools, use standard conversion
        setAmountB((Number(v) * (currentPrice || 1)).toFixed(6));
      }
    }
  };

  /**
   * Handles changes to Token B amount (SUI)
   */
  const handleAmountBChange = (v: string) => {
    if (v === "") {
      setAmountA("");
      setAmountB("");
      return;
    }

    setAmountB(v);

    if (currentPrice) {
      if (isSuiUsdcPool) {
        // For SUI/USDC Turbos pools where price is USDC per SUI:
        // 1 SUI = x USDC, so to get USDC amount, multiply SUI by price
        setAmountA((Number(v) * (currentPrice || 1)).toFixed(6));
      } else {
        // For other pools, use standard conversion
        setAmountA((Number(v) / (currentPrice || 1)).toFixed(6));
      }
    }
  };

  /**
   * Calculates position metadata for display
   */
  const calculatePositionMeta = () => {
    try {
      const numA = Number(amountA);
      const numB = Number(amountB);

      // Calculate geometric mean for liquidity estimation
      const geometricMean = Math.sqrt(numA * numB);

      let meta: any = {
        pool: poolInfo,
        tokenA: poolInfo?.tokenA,
        tokenB: poolInfo?.tokenB,
        amountA: numA,
        amountB: numB,
        tickLower,
        tickUpper,
        liquidity: geometricMean * 1000000, // Rough estimate
        apr: expectedAPR || 0,
      };

      // Add price range info
      if (currentPrice && tickLower !== null && tickUpper !== null) {
        const priceRange = getPriceRangeFromTicks(tickLower, tickUpper);
        meta = {
          ...meta,
          minPrice: priceRange.minPrice,
          maxPrice: priceRange.maxPrice,
          currentPrice,
        };
      }

      setPositionMeta(meta);
    } catch (error) {
      console.error("Error calculating position metadata:", error);
    }
  };

  /**
   * Handles range width change in the UI
   */
  const handleRangeWidthChange = (width: number) => {
    setRangeWidth(width);

    if (!currentPrice) return;

    // Calculate new price range
    const lowerPricePercent = 1 - width / 100;
    const upperPricePercent = 1 + width / 100;

    const lowerPrice = currentPrice * lowerPricePercent;
    const upperPrice = currentPrice * upperPricePercent;

    // Calculate tick range
    const { tickLower, tickUpper } = calculateTickRange([
      lowerPrice,
      upperPrice,
    ]);

    console.log(
      `Setting tick range for ${width}% width: [${tickLower}, ${tickUpper}]`
    );
    setTickLower(tickLower);
    setTickUpper(tickUpper);

    // Get actual price range
    const priceRange = getPriceRangeFromTicks(tickLower, tickUpper);
    setPriceRange([priceRange.minPrice, priceRange.maxPrice]);
  };

  /**
   * Handles slippage setting
   */
  const handleSlippageChange = (value: number) => {
    setSlippage(value);
  };

  /**
   * Toggles custom slippage input
   */
  const toggleCustomSlippage = () => {
    setCustomSlippage(!customSlippage);
  };

  /**
   * Function to set max amount for token A (USDC)
   * FIXED: Ensure we use the correct balance and decimals
   */
  const handleMaxAmountA = () => {
    if (tokenABalance) {
      console.log(
        `Setting max amount for ${tokenASymbol} with balance ${tokenABalance} and decimals ${tokenADecimals}`
      );
      // Use the correct decimals from state for this specific token
      const maxAmount = new BigNumber(tokenABalance)
        .dividedBy(10 ** tokenADecimals)
        .toString();
      handleAmountAChange(maxAmount);
    }
  };

  /**
   * Function to set max amount for token B (SUI)
   * FIXED: Ensure we use the correct balance and decimals
   */
  const handleMaxAmountB = () => {
    if (tokenBBalance) {
      console.log(
        `Setting max amount for ${tokenBSymbol} with balance ${tokenBBalance} and decimals ${tokenBDecimals}`
      );
      // Use the correct decimals from state for this specific token
      const maxAmount = new BigNumber(tokenBBalance)
        .dividedBy(10 ** tokenBDecimals)
        .toString();
      handleAmountBChange(maxAmount);
    }
  };

  /**
   * Function to toggle price inversion
   */
  const togglePriceInversion = () => {
    setInvertPrice(!invertPrice);
  };

  /**
   * Reset function for the form
   */
  const handleReset = () => {
    form.resetFields();
    setAmountA("");
    setAmountB("");
    setSlippage(DEFAULT_SLIPPAGE);
    setCustomSlippage(false);

    // Reset to initial values
    if (currentPrice) {
      initializePriceRange(currentPrice);
    }
  };

  /**
   * Refresh token balances
   */
  const refreshBalances = () => {
    if (wallet.connected && wallet.account?.address) {
      fetchTokenBalances(wallet.account.address);
    }
  };

  /**
   * Function to handle form submission
   */
  const handleSubmit = async () => {
    if (
      !poolInfo ||
      !poolInfo.address ||
      tickLower === null ||
      tickUpper === null
    ) {
      notification.error({
        message: "Error",
        description: "Missing required pool information or price range.",
        placement: "bottomRight",
      });
      return;
    }

    try {
      setSubmitting(true);

      const numA = parseFloat(amountA);
      const numB = parseFloat(amountB);

      if (isNaN(numA) || isNaN(numB) || numA <= 0 || numB <= 0) {
        notification.error({
          message: "Error",
          description: "Please enter valid token amounts.",
          placement: "bottomRight",
        });
        return;
      }

      // Check if wallet is connected before proceeding
      if (!wallet.connected || !wallet.account) {
        notification.error({
          message: "Wallet Not Connected",
          description:
            "Please connect your wallet to continue with the deposit.",
          placement: "bottomRight",
        });
        return;
      }

      // Log deposit details
      console.log("Initiating Turbos deposit with parameters:");
      console.log(`- Pool Address: ${poolInfo.address}`);
      console.log(`- Amount A (${tokenASymbol}): ${numA}`);
      console.log(`- Amount B (${tokenBSymbol}): ${numB}`);
      console.log(`- Tick Range: [${tickLower}, ${tickUpper}]`);
      console.log(`- Slippage: ${slippage}%`);

      // Use the direct turbosService deposit function (updated version)
      try {
        // Directly call turbosService deposit function
        const result = await turbosService.deposit(
          wallet,
          poolInfo.address,
          numA,
          numB,
          poolInfo,
          tickLower,
          tickUpper,
          slippage
        );

        if (result.success) {
          // Set transaction data for the success popup
          setTxData({
            digest: result.digest,
            tokenA: result.tokenA || { symbol: tokenASymbol, amount: numA },
            tokenB: result.tokenB || { symbol: tokenBSymbol, amount: numB },
            timestamp: result.timestamp || Date.now(),
            poolId: result.poolId || poolInfo.address,
          });

          // Show success popup
          setTxSuccess(true);

          // Clear form
          form.resetFields();
          setAmountA("");
          setAmountB("");

          // Refresh balances after successful deposit
          if (wallet.connected && wallet.account?.address) {
            fetchTokenBalances(wallet.account.address);
          }

          // Don't close the modal, keep showing the success popup
        } else {
          throw new Error("Transaction failed");
        }
      } catch (error) {
        console.error("Error during Turbos deposit:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error submitting deposit:", error);
      notification.error({
        message: "Error",
        description: `Failed to deposit: ${
          error instanceof Error ? error.message : String(error)
        }`,
        placement: "bottomRight",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Check token balances
  const hasInsufficientBalance = useMemo(() => {
    if (!amountA || !amountB || !tokenABalance || !tokenBBalance) {
      return false;
    }

    const numA = parseFloat(amountA);
    const numB = parseFloat(amountB);

    // Check balances with the correct decimals
    const balanceA = new BigNumber(tokenABalance).dividedBy(
      10 ** tokenADecimals
    );
    const balanceB = new BigNumber(tokenBBalance).dividedBy(
      10 ** tokenBDecimals
    );

    return balanceA.isLessThan(numA) || balanceB.isLessThan(numB);
  }, [
    amountA,
    amountB,
    tokenABalance,
    tokenBBalance,
    tokenADecimals,
    tokenBDecimals,
  ]);

  return (
    <>
      <Modal
        title={`Add Liquidity to Turbos ${tokenASymbol}/${tokenBSymbol}`}
        open={visible}
        onCancel={onCancel}
        width={500}
        footer={[
          <Button key="reset" onClick={handleReset}>
            Reset
          </Button>,
          <Button
            key="deposit"
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
            disabled={
              !amountA ||
              !amountB ||
              parseFloat(amountA) <= 0 ||
              parseFloat(amountB) <= 0 ||
              tickLower === null ||
              tickUpper === null ||
              hasInsufficientBalance ||
              loading ||
              !wallet.connected
            }
          >
            {!wallet.connected
              ? "Connect Wallet"
              : hasInsufficientBalance
              ? "Insufficient Balance"
              : "Add Liquidity"}
          </Button>,
        ]}
      >
        <Spin
          spinning={loading || fetchingBalances}
          tip={loading ? "Loading Pool Data..." : "Fetching Balances..."}
        >
          <Form form={form} layout="vertical">
            {/* Wallet Connection Status */}
            {!wallet.connected && (
              <Alert
                message="Wallet Not Connected"
                description="Please connect your wallet to add liquidity."
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                action={
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => wallet.select()}
                  >
                    Connect Wallet
                  </Button>
                }
              />
            )}

            {/* Pool Info Display */}
            {poolInfo && (
              <div className="pool-info-summary">
                <Row gutter={16} align="middle" justify="space-between">
                  <Col>
                    <Space>
                      <TokenIcon tokenAddress={poolInfo.tokenA} size={24} />
                      <TokenIcon tokenAddress={poolInfo.tokenB} size={24} />
                      <Text strong>
                        {tokenASymbol}/{tokenBSymbol}
                      </Text>
                    </Space>
                  </Col>
                  <Col>
                    <Text type="secondary">
                      {poolInfo.fee
                        ? `Fee: ${formatPercentage(poolInfo.fee)}`
                        : "Fee: 0.3%"}
                    </Text>
                  </Col>
                </Row>
              </div>
            )}

            {/* Current Price Indicator */}
            {currentPrice && (
              <div className="current-price-indicator">
                <Space align="center">
                  <Text type="secondary">Current Price:</Text>
                  <Text strong>
                    {invertPrice
                      ? `${formatTokenAmount(
                          String(1 / currentPrice)
                        )} ${tokenBSymbol} per ${tokenASymbol}`
                      : `${formatTokenAmount(
                          String(currentPrice)
                        )} ${tokenASymbol} per ${tokenBSymbol}`}
                  </Text>
                  <Tooltip title="Invert Price Display">
                    <Button
                      type="text"
                      icon={<SwapOutlined />}
                      onClick={togglePriceInversion}
                      size="small"
                    />
                  </Tooltip>
                  <Tooltip title="Refresh Price">
                    <Button
                      type="text"
                      icon={<ReloadOutlined spin={fetchingPrice} />}
                      onClick={fetchPairPrice}
                      size="small"
                      disabled={fetchingPrice}
                    />
                  </Tooltip>
                </Space>
              </div>
            )}

            {/* Token Amounts */}
            <div className="token-inputs">
              {/* Token A Input (USDC) */}
              <Form.Item label={`${tokenASymbol} Amount`}>
                <Input
                  suffix={
                    <Button
                      type="link"
                      size="small"
                      onClick={handleMaxAmountA}
                      disabled={!wallet.connected}
                    >
                      MAX
                    </Button>
                  }
                  placeholder="0.00"
                  value={amountA}
                  onChange={(e) => handleAmountAChange(e.target.value)}
                  disabled={!wallet.connected}
                  addonBefore={
                    <Space>
                      <TokenIcon
                        tokenAddress={tokenAAddress || poolInfo?.tokenA || ""}
                        size={20}
                      />
                      <span>{tokenASymbol}</span>
                    </Space>
                  }
                  addonAfter={
                    <Tooltip
                      title={
                        wallet.connected
                          ? `${new BigNumber(tokenABalance)
                              .dividedBy(10 ** tokenADecimals)
                              .toString()} ${tokenASymbol}`
                          : "Connect wallet to see balance"
                      }
                    >
                      <Space>
                        <span>
                          Balance:{" "}
                          {wallet.connected
                            ? formatTokenAmount(
                                new BigNumber(tokenABalance)
                                  .dividedBy(10 ** tokenADecimals)
                                  .toString()
                              )
                            : "?"}
                        </span>
                        {wallet.connected && (
                          <Button
                            type="link"
                            size="small"
                            onClick={refreshBalances}
                            disabled={fetchingBalances}
                            icon={<SwapOutlined spin={fetchingBalances} />}
                          />
                        )}
                      </Space>
                    </Tooltip>
                  }
                />
              </Form.Item>

              {/* Token B Input (SUI) */}
              <Form.Item label={`${tokenBSymbol} Amount`}>
                <Input
                  suffix={
                    <Button
                      type="link"
                      size="small"
                      onClick={handleMaxAmountB}
                      disabled={!wallet.connected}
                    >
                      MAX
                    </Button>
                  }
                  placeholder="0.00"
                  value={amountB}
                  onChange={(e) => handleAmountBChange(e.target.value)}
                  disabled={!wallet.connected}
                  addonBefore={
                    <Space>
                      <TokenIcon
                        tokenAddress={tokenBAddress || poolInfo?.tokenB || ""}
                        size={20}
                      />
                      <span>{tokenBSymbol}</span>
                    </Space>
                  }
                  addonAfter={
                    <Tooltip
                      title={
                        wallet.connected
                          ? `${new BigNumber(tokenBBalance)
                              .dividedBy(10 ** tokenBDecimals)
                              .toString()} ${tokenBSymbol}`
                          : "Connect wallet to see balance"
                      }
                    >
                      <Space>
                        <span>
                          Balance:{" "}
                          {wallet.connected
                            ? formatTokenAmount(
                                new BigNumber(tokenBBalance)
                                  .dividedBy(10 ** tokenBDecimals)
                                  .toString()
                              )
                            : "?"}
                        </span>
                        {wallet.connected && (
                          <Button
                            type="link"
                            size="small"
                            onClick={refreshBalances}
                            disabled={fetchingBalances}
                            icon={<SwapOutlined spin={fetchingBalances} />}
                          />
                        )}
                      </Space>
                    </Tooltip>
                  }
                />
              </Form.Item>
            </div>

            {/* Exchange Rate Display */}
            {currentPrice && amountA && amountB && (
              <div className="exchange-rate">
                <Text type="secondary">
                  Exchange Rate: 1 {tokenBSymbol} ={" "}
                  {formatTokenAmount(String(currentPrice))} {tokenASymbol}
                </Text>
              </div>
            )}

            {/* Price Range Section */}
            <div className="price-range-section">
              <Divider orientation="left">Price Range</Divider>

              {/* Price Range Tabs */}
              <Radio.Group
                value={activeTab}
                onChange={(e) => {
                  setActiveTab(e.target.value);
                  if (e.target.value === "recommended" && currentPrice) {
                    handleRangeWidthChange(rangeWidth);
                  } else if (
                    e.target.value === "full" &&
                    currentPrice &&
                    turbosService.getFullRangeTicksForPool
                  ) {
                    // Set to full range for the pool
                    const fullRange = turbosService.getFullRangeTicksForPool(
                      "0.3%",
                      isSuiUsdcPool
                    );
                    setTickLower(fullRange.tickLower);
                    setTickUpper(fullRange.tickUpper);

                    // Get actual price range from ticks
                    const priceRange = getPriceRangeFromTicks(
                      fullRange.tickLower,
                      fullRange.tickUpper
                    );
                    setPriceRange([priceRange.minPrice, priceRange.maxPrice]);
                  } else if (e.target.value === "full" && currentPrice) {
                    // Fallback implementation if getFullRangeTicksForPool is not available
                    const tickLower = -887220; // Common default for full range
                    const tickUpper = 887220;
                    setTickLower(tickLower);
                    setTickUpper(tickUpper);

                    // Get price range
                    const priceRange = getPriceRangeFromTicks(
                      tickLower,
                      tickUpper
                    );
                    setPriceRange([priceRange.minPrice, priceRange.maxPrice]);
                  }
                }}
                buttonStyle="solid"
                className="price-range-tabs"
                disabled={!wallet.connected}
              >
                <Radio.Button value="recommended">
                  Recommended ({rangeWidth}%)
                </Radio.Button>
                <Radio.Button value="full">Full Range</Radio.Button>
              </Radio.Group>

              {/* Recommended Range with Slider */}
              {activeTab === "recommended" && currentPrice && (
                <div className="recommended-range">
                  <Form.Item label="Range Width (%)">
                    <Slider
                      min={1}
                      max={25}
                      value={rangeWidth}
                      onChange={handleRangeWidthChange}
                      disabled={!wallet.connected}
                      marks={{
                        1: "1%",
                        5: "5%",
                        10: "10%",
                        15: "15%",
                        20: "20%",
                        25: "25%",
                      }}
                    />
                  </Form.Item>

                  {priceRange && (
                    <div className="price-range-display">
                      <Space direction="vertical" style={{ width: "100%" }}>
                        <Text>
                          Min Price:{" "}
                          <Text strong>
                            {invertPrice
                              ? `${formatTokenAmount(
                                  String(1 / priceRange[1])
                                )} ${tokenBSymbol} per ${tokenASymbol}`
                              : `${formatTokenAmount(
                                  String(priceRange[0])
                                )} ${tokenASymbol} per ${tokenBSymbol}`}
                          </Text>
                        </Text>
                        <Text>
                          Max Price:{" "}
                          <Text strong>
                            {invertPrice
                              ? `${formatTokenAmount(
                                  String(1 / priceRange[0])
                                )} ${tokenBSymbol} per ${tokenASymbol}`
                              : `${formatTokenAmount(
                                  String(priceRange[1])
                                )} ${tokenASymbol} per ${tokenBSymbol}`}
                          </Text>
                        </Text>
                      </Space>
                    </div>
                  )}
                </div>
              )}

              {/* Full Range */}
              {activeTab === "full" && (
                <Alert
                  message="Full Range"
                  description="Your position will be earning fees on the full price range of this pool. Your position will not earn concentrated liquidity rewards."
                  type="info"
                  showIcon
                />
              )}

              {/* Price Range Visual */}
              {currentPrice && priceRange && (
                <div className="price-range-visual">
                  <div
                    className="current-price-marker"
                    style={{
                      left: `${
                        ((Math.log(currentPrice) - Math.log(priceRange[0])) /
                          (Math.log(priceRange[1]) - Math.log(priceRange[0]))) *
                        100
                      }%`,
                    }}
                  />
                  <div className="price-range-bar" />
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <Divider orientation="left">
              <Space>
                <SettingOutlined />
                <span>Settings</span>
              </Space>
            </Divider>

            {/* Slippage Settings */}
            <Form.Item label="Slippage Tolerance">
              <Space direction="vertical" style={{ width: "100%" }}>
                <Radio.Group
                  value={customSlippage ? "custom" : slippage}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      toggleCustomSlippage();
                    } else {
                      setCustomSlippage(false);
                      handleSlippageChange(e.target.value);
                    }
                  }}
                  buttonStyle="outline"
                  disabled={!wallet.connected}
                >
                  <Radio.Button value={0.1}>0.1%</Radio.Button>
                  <Radio.Button value={0.5}>0.5%</Radio.Button>
                  <Radio.Button value={1.0}>1.0%</Radio.Button>
                  <Radio.Button value="custom">Custom</Radio.Button>
                </Radio.Group>

                {customSlippage && (
                  <InputNumber
                    min={0.01}
                    max={50}
                    value={slippage}
                    onChange={handleSlippageChange}
                    style={{ width: "100%" }}
                    addonAfter="%"
                    disabled={!wallet.connected}
                  />
                )}
              </Space>
            </Form.Item>

            {/* Position Summary */}
            {positionMeta && wallet.connected && (
              <div className="position-summary">
                <Divider orientation="left">Position Summary</Divider>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic
                        title={`${tokenASymbol} Deposit`}
                        value={formatTokenAmount(String(positionMeta.amountA))}
                        suffix={tokenASymbol}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title={`${tokenBSymbol} Deposit`}
                        value={formatTokenAmount(String(positionMeta.amountB))}
                        suffix={tokenBSymbol}
                      />
                    </Col>
                  </Row>

                  {positionMeta.currentPrice && (
                    <React.Fragment>
                      <Divider orientation="left" plain>
                        Price Range
                      </Divider>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Statistic
                            title="Min Price"
                            value={
                              invertPrice
                                ? formatTokenAmount(
                                    String(1 / positionMeta.maxPrice)
                                  )
                                : formatTokenAmount(
                                    String(positionMeta.minPrice)
                                  )
                            }
                            suffix={
                              invertPrice
                                ? `${tokenBSymbol}/${tokenASymbol}`
                                : `${tokenASymbol}/${tokenBSymbol}`
                            }
                            valueStyle={{ fontSize: "14px" }}
                          />
                        </Col>
                        <Col span={8}>
                          <Statistic
                            title="Current Price"
                            value={
                              invertPrice
                                ? formatTokenAmount(
                                    String(1 / positionMeta.currentPrice)
                                  )
                                : formatTokenAmount(
                                    String(positionMeta.currentPrice)
                                  )
                            }
                            suffix={
                              invertPrice
                                ? `${tokenBSymbol}/${tokenASymbol}`
                                : `${tokenASymbol}/${tokenBSymbol}`
                            }
                            valueStyle={{ fontSize: "14px" }}
                          />
                        </Col>
                        <Col span={8}>
                          <Statistic
                            title="Max Price"
                            value={
                              invertPrice
                                ? formatTokenAmount(
                                    String(1 / positionMeta.minPrice)
                                  )
                                : formatTokenAmount(
                                    String(positionMeta.maxPrice)
                                  )
                            }
                            suffix={
                              invertPrice
                                ? `${tokenBSymbol}/${tokenASymbol}`
                                : `${tokenASymbol}/${tokenBSymbol}`
                            }
                            valueStyle={{ fontSize: "14px" }}
                          />
                        </Col>
                      </Row>
                    </React.Fragment>
                  )}

                  {/* Fee and APR Info */}
                  {expectedAPR !== null && (
                    <Alert
                      message={
                        <Space>
                          <span>Estimated APR:</span>
                          <Text strong>{expectedAPR.toFixed(2)}%</Text>
                          <Tooltip title="Estimated based on 24h trading volume. Actual APR may vary.">
                            <InfoCircleOutlined />
                          </Tooltip>
                        </Space>
                      }
                      type="info"
                      showIcon
                    />
                  )}
                </Space>
              </div>
            )}
          </Form>
        </Spin>
      </Modal>

      {/* Success Popup */}
      <TransactionSuccessPopup
        visible={txSuccess}
        onClose={() => {
          setTxSuccess(false);
          onCancel(); // Close the main modal after success
        }}
        txData={txData}
      />
    </>
  );
};

export default TurbosDepositModal;
