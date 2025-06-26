// src/pages/Dex/components/OrderForm.tsx
import React, { useEffect, useState } from "react";
import { placeLimitOrder } from "@7kprotocol/sdk-ts";
import { useWallet } from "@suiet/wallet-kit";
import "./OrderForm.scss";

const TOKEN_DECIMALS: Record<string, number> = {
  SUI: 9,
  USDC: 6,
  CETUS: 9,
  DEEP: 9,
  ETH: 8,
  WBTC: 8,
  NAVX: 9,
  SCA: 9,
  WSOL: 9,
  WBNB: 8,
  APT: 8,
};

interface TradingPair {
  id: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  baseAddress: string; // e.g. "0x...::cetus::CETUS"
  quoteAddress: string; // e.g. "0x...::usdc::USDC"
}

interface OrderFormProps {
  pair: TradingPair;
  orderType: "buy" | "sell";
  setOrderType: (t: "buy" | "sell") => void;
  orderMode: "limit" | "market";
  setOrderMode: (m: "limit" | "market") => void;
}

const BLOCKVISION_API_KEY = import.meta.env.VITE_BLOCKVISION_API_KEY as string;

const OrderForm: React.FC<OrderFormProps> = ({
  pair,
  orderType,
  setOrderType,
  orderMode,
  setOrderMode,
}) => {
  const { connected, account, signAndExecuteTransactionBlock } = useWallet();
  const walletAddress = account?.address || "";

  // coinBalances keyed by coinType
  const [coinBalances, setCoinBalances] = useState<
    Record<string, { balance: string; decimals: number }>
  >({});

  const [price, setPrice] = useState(pair.price.toString());
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderStatus, setOrderStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Which coinType is being spent?
  const payCoinType =
    orderType === "buy" ? pair.quoteAddress : pair.baseAddress;

  const payInfo = coinBalances[payCoinType] || {
    balance: "0",
    decimals:
      TOKEN_DECIMALS[orderType === "buy" ? pair.quoteAsset : pair.baseAsset] ||
      9,
  };

  const payNum = Number(payInfo.balance) / Math.pow(10, payInfo.decimals);

  /** Fetch all coins for this account from BlockVision v2 */
  const fetchBalances = async (addr: string) => {
    if (!addr) return;
    try {
      const url = `https://api.blockvision.org/v2/sui/account/coins?account=${addr}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": BLOCKVISION_API_KEY,
        },
      });
      const json = await resp.json();
      if (!json.result?.coins) {
        console.error("Unexpected response:", json);
        return;
      }

      // Build a map coinType -> {balance, decimals}
      const map: typeof coinBalances = {};
      for (const coin of json.result.coins) {
        const { coinType, balance, decimals } = coin;
        if (coinType && balance != null && decimals != null) {
          map[coinType] = { balance, decimals };
        }
      }

      // Ensure base and quote coinTypes exist with defaults if missing
      [pair.baseAddress, pair.quoteAddress].forEach((ct) => {
        if (!map[ct]) {
          const sym =
            ct === pair.baseAddress ? pair.baseAsset : pair.quoteAsset;
          map[ct] = {
            balance: "0",
            decimals: TOKEN_DECIMALS[sym] ?? 9,
          };
        }
      });

      setCoinBalances(map);
    } catch (err) {
      console.error("fetchBalances error:", err);
    }
  };

  // Refresh on wallet connect or pair change
  useEffect(() => {
    if (connected && walletAddress) fetchBalances(walletAddress);
  }, [connected, walletAddress, pair.baseAddress, pair.quoteAddress]);

  // Keep price in sync
  useEffect(() => {
    setPrice(pair.price.toString());
  }, [pair.price]);

  const handlePercentage = (pct: number) => {
    const total = payNum;
    const p = parseFloat(price) || 0;
    let a = 0;
    if (orderType === "buy") {
      const spend = total * (pct / 100);
      a = p > 0 ? spend / p : 0;
    } else {
      a = total * (pct / 100);
    }
    setAmount(a.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderMode === "market") return;

    setOrderStatus(null);
    const p = parseFloat(price);
    const a = parseFloat(amount);
    if (!connected || !walletAddress || !p || !a) {
      setOrderStatus({ success: false, message: "Missing data or wallet" });
      return;
    }

    setIsSubmitting(true);
    try {
      const payDecimals = payInfo.decimals;
      const targetDecimals =
        coinBalances[orderType === "buy" ? pair.baseAddress : pair.quoteAddress]
          ?.decimals ||
        TOKEN_DECIMALS[orderType === "buy" ? pair.baseAsset : pair.quoteAsset];

      let payRaw: bigint;
      let rate: bigint;

      if (orderType === "buy") {
        const spend = p * a;
        payRaw = BigInt(Math.floor(spend * 10 ** payDecimals));
        const exch = 1 / p;
        rate = BigInt(
          Math.floor(exch * 10 ** (targetDecimals - payDecimals) * 10 ** 12)
        );
      } else {
        payRaw = BigInt(Math.floor(a * 10 ** payDecimals));
        const exch = p;
        rate = BigInt(
          Math.floor(exch * 10 ** (targetDecimals - payDecimals) * 10 ** 12)
        );
      }

      const expireTs = BigInt(Date.now() + 7 * 24 * 3600 * 1000);
      const slippage = BigInt(100);

      const tx = await placeLimitOrder({
        accountAddress: walletAddress,
        payCoinType,
        targetCoinType:
          orderType === "buy" ? pair.baseAddress : pair.quoteAddress,
        expireTs,
        payCoinAmount: payRaw,
        rate,
        slippage,
        devInspect: false,
      });

      if (!signAndExecuteTransactionBlock) {
        throw new Error("Wallet signer unavailable");
      }
      await signAndExecuteTransactionBlock({ transactionBlock: tx });

      setOrderStatus({ success: true, message: "Limit order placed!" });
      fetchBalances(walletAddress);
      setAmount("");
    } catch (err: any) {
      console.error("order error:", err);
      setOrderStatus({ success: false, message: err.message || "Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dex-order-form">
      {/* Buy/Sell Tabs */}
      <div className="order-form-tabs">
        <button
          className={`tab buy ${orderType === "buy" ? "active" : ""}`}
          onClick={() => setOrderType("buy")}
        >
          Buy {pair.baseAsset}
        </button>
        <button
          className={`tab sell ${orderType === "sell" ? "active" : ""}`}
          onClick={() => setOrderType("sell")}
        >
          Sell {pair.baseAsset}
        </button>
      </div>

      {/* Mode selector */}
      <div className="order-form-mode-selector">
        <button
          className={`mode-btn ${orderMode === "limit" ? "active" : ""}`}
          onClick={() => setOrderMode("limit")}
        >
          Limit
        </button>
        <button
          className={`mode-btn ${orderMode === "market" ? "active" : ""}`}
          onClick={() => setOrderMode("market")}
        >
          Market
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="order-form-content">
        {orderMode === "limit" && (
          <>
            <div className="form-group">
              <label>Price ({pair.quoteAsset})</label>
              <div className="input-container">
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`Price in ${pair.quoteAsset}`}
                  min="0"
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Amount ({pair.baseAsset})</label>
              <div className="input-container">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Amount in ${pair.baseAsset}`}
                  min="0"
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="balance-info">
                Available: {payNum.toFixed(4)}{" "}
                {orderType === "buy" ? pair.quoteAsset : pair.baseAsset}
              </div>
              <div className="percentage-buttons">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className="pct-btn"
                    onClick={() => handlePercentage(pct)}
                    disabled={isSubmitting}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Total {pair.quoteAsset}</label>
              <div className="total-value">
                {price && amount
                  ? (parseFloat(price) * parseFloat(amount)).toFixed(6)
                  : "0"}{" "}
                {pair.quoteAsset}
              </div>
            </div>
          </>
        )}

        {orderMode === "market" && (
          <div className="market-notice">
            <p>Market orders are handled via the swap page.</p>
          </div>
        )}

        {orderStatus && (
          <div
            className={`order-status ${
              orderStatus.success ? "success" : "error"
            }`}
          >
            {orderStatus.message}
          </div>
        )}

        <button
          type="submit"
          className={`submit-order-btn ${orderType}`}
          disabled={
            !connected ||
            orderMode === "market" ||
            !price ||
            !amount ||
            isSubmitting
          }
        >
          {isSubmitting
            ? "Processing..."
            : orderMode === "limit"
            ? `Place ${orderType === "buy" ? "Buy" : "Sell"} Order`
            : `${orderType === "buy" ? "Buy" : "Sell"} Market`}
        </button>
      </form>
    </div>
  );
};

export default OrderForm;
