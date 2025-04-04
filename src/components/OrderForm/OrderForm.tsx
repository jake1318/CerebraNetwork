import React, { useState, useEffect } from "react";
import { useDeepBook } from "../../contexts/DeepBookContext";
import { useWallet } from "@suiet/wallet-kit";
import "./OrderForm.scss";

interface OrderFormProps {
  poolKey: string;
  orderType: "limit" | "market";
}

const OrderForm: React.FC<OrderFormProps> = ({ poolKey, orderType }) => {
  const { deepBookService, placeLimitOrder, placeMarketOrder, loading } =
    useDeepBook();
  const { signAndExecuteTransactionBlock } = useWallet();

  const [price, setPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [isBuy, setIsBuy] = useState<boolean>(true);
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [poolDetails, setPoolDetails] = useState<any>(null);

  // Get pool details
  useEffect(() => {
    if (!deepBookService || !poolKey) return;

    const getPoolDetails = async () => {
      try {
        const pools = await deepBookService.getPools();
        const pool = pools.find((p: any) => p.pool_id === poolKey);
        setPoolDetails(pool);
      } catch (err) {
        console.error("Error fetching pool details:", err);
      }
    };

    getPoolDetails();
  }, [deepBookService, poolKey]);

  // Reset error and success messages
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (success) {
      timeout = setTimeout(() => setSuccess(null), 5000);
    }

    return () => clearTimeout(timeout);
  }, [success]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !deepBookService ||
      !poolKey ||
      !quantity ||
      (orderType === "limit" && !price)
    ) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setSuccess(null);

      // Generate client order ID (timestamp + random string)
      const clientOrderId = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      let tx;
      if (orderType === "limit") {
        tx = placeLimitOrder({
          poolKey,
          balanceManagerKey: "CEREBRA_MANAGER",
          clientOrderId,
          price: parseFloat(price),
          quantity: parseFloat(quantity),
          isBid: isBuy,
        });
      } else {
        tx = placeMarketOrder({
          poolKey,
          balanceManagerKey: "CEREBRA_MANAGER",
          clientOrderId,
          quantity: parseFloat(quantity),
          isBid: isBuy,
        });
      }

      await signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });

      setSuccess(`${isBuy ? "Buy" : "Sell"} order placed successfully!`);
      // Clear form fields
      setQuantity("");
      if (orderType === "limit") {
        setPrice("");
      }
    } catch (err: any) {
      console.error("Error placing order:", err);
      setError(err.message || "Failed to place order");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="order-form">
      <div className={`order-type ${isBuy ? "buy" : "sell"}`}>
        <button
          className={`order-type-btn buy ${isBuy ? "active" : ""}`}
          onClick={() => setIsBuy(true)}
        >
          Buy
        </button>
        <button
          className={`order-type-btn sell ${!isBuy ? "active" : ""}`}
          onClick={() => setIsBuy(false)}
        >
          Sell
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {orderType === "limit" && (
          <div className="form-group">
            <label>Price</label>
            <input
              type="number"
              step="0.000001"
              placeholder="Enter price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0"
            />
            {poolDetails && (
              <span className="input-info">
                Tick size: {poolDetails.tick_size}
              </span>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Quantity</label>
          <input
            type="number"
            step="0.000001"
            placeholder="Enter quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="0"
          />
          {poolDetails && (
            <span className="input-info">
              Lot size: {poolDetails.lot_size}, Min size: {poolDetails.min_size}
            </span>
          )}
        </div>

        {orderType === "limit" && (
          <div className="order-summary">
            <div className="summary-row">
              <span>Total:</span>
              <span>
                {price && quantity
                  ? (parseFloat(price) * parseFloat(quantity)).toFixed(6)
                  : "0.00"}
              </span>
            </div>
          </div>
        )}

        {success && <div className="success-message">{success}</div>}
        {error && <div className="error-message">{error}</div>}

        <button
          type="submit"
          className={`submit-button ${isBuy ? "buy" : "sell"}`}
          disabled={processing || loading}
        >
          {processing
            ? "Processing..."
            : `${isBuy ? "Buy" : "Sell"} ${
                orderType === "limit" ? "Limit" : "Market"
              }`}
        </button>
      </form>
    </div>
  );
};

export default OrderForm;
