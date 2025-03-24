import React, { useState } from "react";
import "./OrderForm.scss";
import { useWallet } from "@suiet/wallet-kit";
import { placeLimitOrder } from "@7kprotocol/sdk-ts";

interface OrderFormProps {
  pair: {
    name: string;
    baseAsset: string;
    quoteAsset: string;
    price: number;
  };
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
  const { connected, account } = useWallet();
  const [price, setPrice] = useState<string>(pair.price.toString());
  const [amount, setAmount] = useState<string>("");
  const [total, setTotal] = useState<string>("");
  const [expiration, setExpiration] = useState<string>("24"); // Default expiration in hours
  const [slippage, setSlippage] = useState<string>("1.0"); // Default slippage 1%
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [txResult, setTxResult] = useState<string>("");

  // Update total when price or amount changes
  const updateTotal = (newPrice: string, newAmount: string) => {
    if (newPrice && newAmount) {
      const calculatedTotal = parseFloat(newPrice) * parseFloat(newAmount);
      if (!isNaN(calculatedTotal)) {
        setTotal(calculatedTotal.toFixed(2));
      }
    } else {
      setTotal("");
    }
  };

  // Handle price change
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPrice = e.target.value;
    setPrice(newPrice);
    updateTotal(newPrice, amount);
  };

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value;
    setAmount(newAmount);
    updateTotal(price, newAmount);
  };

  // Handle total change
  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTotal = e.target.value;
    setTotal(newTotal);

    if (newTotal && price && parseFloat(price) > 0) {
      const calculatedAmount = parseFloat(newTotal) / parseFloat(price);
      setAmount(calculatedAmount.toFixed(6));
    }
  };

  // Calculate expiration timestamp from hours
  const calculateExpirationTimestamp = (hoursFromNow: number): BigInt => {
    const now = new Date();
    const expirationTime = new Date(
      now.getTime() + hoursFromNow * 60 * 60 * 1000
    );
    return BigInt(expirationTime.getTime());
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected || !account) {
      setTxResult("Please connect your wallet first");
      return;
    }

    if (!price || !amount || parseFloat(amount) <= 0) {
      setTxResult("Please enter valid amount and price");
      return;
    }

    setIsSubmitting(true);
    setTxResult("");

    try {
      // Mock coin types - in a real implementation, you would get these from your application state
      const payCoinType =
        orderType === "buy"
          ? "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
          : "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

      const targetCoinType =
        orderType === "buy"
          ? "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI"
          : "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

      // Convert values to BigInt with appropriate scaling
      const payCoinAmount = BigInt(
        Math.floor(parseFloat(orderType === "buy" ? total : amount) * 1000000)
      ); // Example: 6 decimals for USDC
      const expirationTs = calculateExpirationTimestamp(
        parseInt(expiration, 10)
      );

      // Calculate rate based on the documentation example
      // For example: If 1 USDC = 0.25 SUI, rate = 0.25 * 10^(9 - 6) * 10^12 = 250000000000000
      const rate = BigInt(Math.floor(parseFloat(price) * 1000000000000000)); // This scaling depends on the specific tokens

      // Slippage in basis points (1% = 100 basis points)
      const slippageValue = BigInt(parseFloat(slippage) * 100);

      if (orderMode === "limit") {
        const tx = await placeLimitOrder({
          accountAddress: account.address,
          payCoinType,
          targetCoinType,
          expireTs: expirationTs,
          payCoinAmount,
          rate,
          slippage: slippageValue,
          devInspect: false,
        });

        console.log("Limit order placed:", tx);
        setTxResult(
          "Limit order placed successfully! Transaction ID: " + tx.digest
        );
      } else {
        // Market order implementation would go here
        console.log("Market order submitted:", {
          pair: pair.name,
          type: orderType,
          mode: orderMode,
          amount: parseFloat(amount),
          total: parseFloat(total),
        });
        setTxResult("Market order placed successfully!");
      }

      // Reset form after successful submission
      setAmount("");
      setTotal("");
    } catch (error) {
      console.error("Error placing order:", error);
      setTxResult(`Error placing order: ${error.message || "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick amount selector percentages
  const amountPercentages = [25, 50, 75, 100];

  // Calculate available balance (mock data)
  const availableBalance = {
    base: orderType === "buy" ? 0 : 1.234, // Mock base token balance
    quote: orderType === "buy" ? 10000 : 0, // Mock quote token balance
  };

  // Handle percentage selection
  const handlePercentageClick = (percentage: number) => {
    if (orderType === "buy") {
      // For buy, calculate based on available quote asset
      const maxTotal = availableBalance.quote * (percentage / 100);
      setTotal(maxTotal.toFixed(2));

      if (price && parseFloat(price) > 0) {
        const calculatedAmount = maxTotal / parseFloat(price);
        setAmount(calculatedAmount.toFixed(6));
      }
    } else {
      // For sell, calculate based on available base asset
      const maxAmount = availableBalance.base * (percentage / 100);
      setAmount(maxAmount.toFixed(6));

      if (price) {
        const calculatedTotal = maxAmount * parseFloat(price);
        setTotal(calculatedTotal.toFixed(2));
      }
    }
  };

  return (
    <div className="order-form">
      <div className="order-form-header">
        <h3>Place Order</h3>
        <div className="order-type-selector">
          <button
            className={`${orderType === "buy" ? "active" : ""} buy`}
            onClick={() => setOrderType("buy")}
          >
            Buy
          </button>
          <button
            className={`${orderType === "sell" ? "active" : ""} sell`}
            onClick={() => setOrderType("sell")}
          >
            Sell
          </button>
        </div>
      </div>

      <div className="order-mode-selector">
        <button
          className={orderMode === "limit" ? "active" : ""}
          onClick={() => setOrderMode("limit")}
        >
          Limit
        </button>
        <button
          className={orderMode === "market" ? "active" : ""}
          onClick={() => setOrderMode("market")}
        >
          Market
        </button>
      </div>

      <form className="order-form-content" onSubmit={handleSubmit}>
        {orderMode === "limit" && (
          <div className="form-group">
            <label>Price ({pair.quoteAsset})</label>
            <input
              type="number"
              step="0.0000001"
              value={price}
              onChange={handlePriceChange}
              placeholder={`Price in ${pair.quoteAsset}`}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label>Amount ({pair.baseAsset})</label>
          <input
            type="number"
            step="0.0000001"
            value={amount}
            onChange={handleAmountChange}
            placeholder={`Amount in ${pair.baseAsset}`}
            required
          />
        </div>

        <div className="form-group">
          <label>Total ({pair.quoteAsset})</label>
          <input
            type="number"
            step="0.01"
            value={total}
            onChange={handleTotalChange}
            placeholder={`Total in ${pair.quoteAsset}`}
            required
          />
        </div>

        {orderMode === "limit" && (
          <>
            <div className="form-group">
              <label>Expiration (hours)</label>
              <select
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
              >
                <option value="1">1 hour</option>
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="168">1 week</option>
              </select>
            </div>

            <div className="form-group">
              <label>Slippage Tolerance (%)</label>
              <select
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
              >
                <option value="0.1">0.1%</option>
                <option value="0.5">0.5%</option>
                <option value="1.0">1.0%</option>
                <option value="2.0">2.0%</option>
                <option value="5.0">5.0%</option>
              </select>
            </div>
          </>
        )}

        <div className="percentage-selector">
          {amountPercentages.map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => handlePercentageClick(percent)}
            >
              {percent}%
            </button>
          ))}
        </div>

        <div className="available-balance">
          <span>Available: </span>
          <span className="balance-amount">
            {orderType === "buy"
              ? `${availableBalance.quote.toFixed(2)} ${pair.quoteAsset}`
              : `${availableBalance.base.toFixed(6)} ${pair.baseAsset}`}
          </span>
        </div>

        {txResult && <div className="tx-result">{txResult}</div>}

        <button
          type="submit"
          className={`submit-button ${orderType}`}
          disabled={isSubmitting || !connected}
        >
          {isSubmitting
            ? "Processing..."
            : `${orderType === "buy" ? "Buy" : "Sell"} ${pair.baseAsset}`}
        </button>
      </form>
    </div>
  );
};

export default OrderForm;
