import React, { useEffect, useState } from "react";
import { placeLimitOrder } from "@7kprotocol/sdk-ts";
import { useWallet } from "@suiet/wallet-kit";
import blockvisionService from "../../../services/blockvisionService";
import "./OrderForm.scss";

// Map supported token symbols to their full Sui coinType strings
const COIN_TYPE_MAP: Record<string, string> = {
  CETUS:
    "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  SUI: "0x2::sui::SUI",
  DEEP: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  ETH: "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  WBTC: "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC",
  NAVX: "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
  SCA: "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA",
  WSOL: "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
  WBNB: "0xb848cce11ef3a8f62eccea6eb5b35a12c4c2b1ee1af7755d02d7bd6218e8226f::coin::COIN",
  APT: "0x3a5143bb1196e3bcdfab6203d1683ae29edd26294fc8bfeafe4aaa9d2704df37::coin::COIN",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
};

// Default decimals for common tokens
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
  baseAddress: string;
  quoteAddress: string;
}

interface OrderFormProps {
  pair: TradingPair;
  orderType: "buy" | "sell";
  setOrderType: (type: "buy" | "sell") => void;
  orderMode: "limit" | "market";
  setOrderMode: (mode: "limit" | "market") => void;
}

const OrderForm: React.FC<OrderFormProps> = ({
  pair,
  orderType,
  setOrderType,
  orderMode,
  setOrderMode,
}) => {
  // Update to include signAndExecuteTransactionBlock
  const { connected, account, signAndExecuteTransactionBlock } = useWallet();
  const walletAddress = account?.address || "";

  // State for fetched balances: symbol -> { balance (raw string), decimals (number) }
  const [balances, setBalances] = useState<
    Record<string, { balance: string; decimals: number }>
  >({});

  // Form inputs for price and amount
  const [price, setPrice] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [orderStatus, setOrderStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Extract base and quote assets from the pair
  const baseAsset = pair.baseAsset;
  const quoteAsset = pair.quoteAsset;
  const baseAddress = pair.baseAddress;
  const quoteAddress = pair.quoteAddress;

  // Determine which token is being spent (pay) and which is received (target)
  const payAssetSymbol = orderType === "buy" ? quoteAsset : baseAsset;
  const targetAssetSymbol = orderType === "buy" ? baseAsset : quoteAsset;
  const payCoinType = orderType === "buy" ? quoteAddress : baseAddress;
  const targetCoinType = orderType === "buy" ? baseAddress : quoteAddress;

  // Compute the available balance (in human-readable units) of the asset being spent
  const payAssetBalanceInfo = balances[payAssetSymbol];
  let payAssetBalanceNum = 0;
  if (payAssetBalanceInfo) {
    const { balance, decimals } = payAssetBalanceInfo;
    payAssetBalanceNum = Number(balance) / Math.pow(10, decimals);
  }

  // Fetch token balances using the blockvisionService
  const fetchBalances = async (address: string) => {
    if (!address) return;
    try {
      const resp = await blockvisionService.getAccountCoins(address);
      const result = resp.data;
      const coinsList = result.coins ?? [];
      const newBalances: Record<string, { balance: string; decimals: number }> =
        {};
      if (Array.isArray(coinsList)) {
        for (const coin of coinsList) {
          if (coin.symbol && coin.balance && coin.decimals !== undefined) {
            newBalances[coin.symbol] = {
              balance: coin.balance,
              decimals: coin.decimals,
            };
          }
        }
      }

      // Ensure base and quote assets are present with correct decimals
      if (!newBalances[baseAsset]) {
        newBalances[baseAsset] = {
          balance: "0",
          decimals: TOKEN_DECIMALS[baseAsset] || 9,
        };
      }

      if (!newBalances[quoteAsset]) {
        newBalances[quoteAsset] = {
          balance: "0",
          decimals: TOKEN_DECIMALS[quoteAsset] || 6,
        };
      }

      console.log("Fetched balances:", newBalances);
      setBalances(newBalances);
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    }
  };

  // Fetch balances whenever the wallet address or trading pair changes
  useEffect(() => {
    if (connected && walletAddress) {
      fetchBalances(walletAddress);
    }
  }, [connected, walletAddress, baseAsset, quoteAsset]);

  // Update price when pair price changes
  useEffect(() => {
    if (pair && pair.price) {
      setPrice(pair.price.toString());
    }
  }, [pair]);

  // Handler for clicking percentage buttons to fill the amount
  const handlePercentage = (percent: number) => {
    if (!payAssetBalanceInfo) return;
    const { balance: rawBalance, decimals } = payAssetBalanceInfo;
    const totalPayBalance = Number(rawBalance) / Math.pow(10, decimals);
    if (totalPayBalance <= 0) return;
    let newAmount = 0;
    if (orderType === "buy") {
      const spendAmount = totalPayBalance * (percent / 100);
      const priceNum = parseFloat(price);
      if (!priceNum || priceNum <= 0) return;
      newAmount = spendAmount / priceNum;
    } else {
      newAmount = totalPayBalance * (percent / 100);
    }
    setAmount(newAmount.toString());
  };

  // Form submission handler
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderMode === "market") {
      alert("Market orders are handled via the swap page.");
      return;
    }

    // Reset previous status
    setOrderStatus(null);

    const priceNum = parseFloat(price);
    const amountNum = parseFloat(amount);
    if (
      !connected ||
      !walletAddress ||
      !payCoinType ||
      !targetCoinType ||
      !priceNum ||
      !amountNum
    ) {
      setOrderStatus({
        success: false,
        message: "Missing required fields or wallet not connected",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get token decimals - use defaults if balances aren't available
      const payDecimals =
        balances[payAssetSymbol]?.decimals ||
        TOKEN_DECIMALS[payAssetSymbol] ||
        (payAssetSymbol === "USDC" ? 6 : 9);

      const targetDecimals =
        balances[targetAssetSymbol]?.decimals ||
        TOKEN_DECIMALS[targetAssetSymbol] ||
        (targetAssetSymbol === "USDC" ? 6 : 9);

      console.log(`Pay asset: ${payAssetSymbol}, decimals: ${payDecimals}`);
      console.log(
        `Target asset: ${targetAssetSymbol}, decimals: ${targetDecimals}`
      );

      let payAmountRaw: bigint;
      let rate: bigint;

      // Calculate parameters for the buy order (buying baseAsset with quoteAsset)
      if (orderType === "buy") {
        // Amount of quoteAsset to pay (e.g., amount of USDC to spend)
        const quoteAmount = priceNum * amountNum;
        payAmountRaw = BigInt(
          Math.floor(quoteAmount * Math.pow(10, payDecimals))
        );

        // For buy orders, rate calculation follows the SDK docs:
        // rate = exchange_rate * 10^(target_decimals - pay_decimals) * 10^12
        // But for buying, exchange_rate is (1/price) because we're calculating
        // how much base asset we get per quote asset
        const exchangeRate = 1 / priceNum;
        rate = BigInt(
          Math.floor(
            exchangeRate *
              Math.pow(10, targetDecimals - payDecimals) *
              Math.pow(10, 12)
          )
        );
      }
      // Calculate parameters for the sell order (selling baseAsset for quoteAsset)
      else {
        // Amount of baseAsset to pay
        payAmountRaw = BigInt(
          Math.floor(amountNum * Math.pow(10, payDecimals))
        );

        // For sell orders, rate calculation follows the SDK docs:
        // rate = exchange_rate * 10^(target_decimals - pay_decimals) * 10^12
        // The exchange_rate is price because we're calculating how much quote asset
        // we get per base asset
        const exchangeRate = priceNum;
        rate = BigInt(
          Math.floor(
            exchangeRate *
              Math.pow(10, targetDecimals - payDecimals) *
              Math.pow(10, 12)
          )
        );
      }

      // Set expiration to 7 days from now
      const expireTs = BigInt(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Slippage tolerance of 1%
      const slippage = BigInt(100);

      console.log("Placing limit order with parameters:", {
        accountAddress: walletAddress,
        payCoinType,
        targetCoinType,
        expireTs: expireTs.toString(),
        payCoinAmount: payAmountRaw.toString(),
        rate: rate.toString(),
        slippage: slippage.toString(),
      });

      const tx = await placeLimitOrder({
        accountAddress: walletAddress,
        payCoinType,
        targetCoinType,
        expireTs,
        payCoinAmount: payAmountRaw,
        rate,
        slippage,
        devInspect: false,
      });

      console.log("Transaction built:", tx);

      // NEW CODE: Send transaction to wallet for signing and execution
      if (!signAndExecuteTransactionBlock) {
        throw new Error("Wallet does not support transaction signing");
      }

      console.log("Sending transaction to Suiet wallet for signing...");
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });

      console.log("Transaction signed and executed:", result);
      setOrderStatus({
        success: true,
        message: "Limit order placed and executed successfully!",
      });

      fetchBalances(walletAddress);
      setAmount("");
    } catch (err) {
      console.error("Failed to place or execute limit order:", err);
      setOrderStatus({
        success: false,
        message: `Failed to process limit order: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dex-order-form">
      <div className="order-form-tabs">
        <button
          className={`tab ${orderType === "buy" ? "active" : ""}`}
          onClick={() => setOrderType("buy")}
        >
          Buy {baseAsset}
        </button>
        <button
          className={`tab ${orderType === "sell" ? "active" : ""}`}
          onClick={() => setOrderType("sell")}
        >
          Sell {baseAsset}
        </button>
      </div>

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

      <form onSubmit={handleSubmitOrder} className="order-form-content">
        {orderMode === "limit" && (
          <>
            <div className="form-group">
              <label>Price ({quoteAsset})</label>
              <div className="input-container">
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`Price in ${quoteAsset}`}
                  min="0"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Amount ({baseAsset})</label>
              <div className="input-container">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Amount in ${baseAsset}`}
                  min="0"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="balance-info">
                Available: {payAssetBalanceNum.toFixed(4)} {payAssetSymbol}
              </div>
              <div className="percentage-buttons">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    type="button"
                    key={pct}
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
              <label>Total {quoteAsset}</label>
              <div className="total-value">
                {price && amount
                  ? (parseFloat(price) * parseFloat(amount)).toFixed(6)
                  : "0"}{" "}
                {quoteAsset}
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
          className={`submit-order-btn ${
            orderType === "buy" ? "buy" : "sell"
          } ${isSubmitting ? "loading" : ""}`}
          disabled={
            !connected ||
            !walletAddress ||
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
