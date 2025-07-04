import React, { useEffect, useState } from "react";
import { useDeepBook } from "../../contexts/DeepBookContext";
import { useWallet } from "@suiet/wallet-kit";
import "./UserOrders.scss";

interface UserOrdersProps {
  poolKey: string;
}

interface Order {
  order_id: string;
  client_order_id: string;
  price: number;
  quantity: number;
  filled_quantity: number;
  isBid: boolean;
  status: number;
  timestamp: number;
}

const UserOrders: React.FC<UserOrdersProps> = ({ poolKey }) => {
  const { deepBookService, getUserOrders, cancelOrder } = useDeepBook();
  const { signAndExecuteTransactionBlock } = useWallet();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!deepBookService) return;

      try {
        setLoading(true);
        const userOrders = await getUserOrders(poolKey, "CEREBRA_MANAGER");

        // Transform orders into a simpler format
        const formattedOrders = userOrders.map((order: any) => ({
          order_id: order.order_id,
          client_order_id: order.client_order_id || "Unknown",
          price: order.price || 0,
          quantity: order.quantity || 0,
          filled_quantity: order.filled_quantity || 0,
          isBid: order.isBid || false,
          status: order.status || 0,
          timestamp: order.timestamp || Date.now(),
        }));

        setOrders(formattedOrders);
      } catch (err) {
        console.error("Error fetching user orders:", err);
        setError("Failed to load your orders");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();

    // Refresh orders every 10 seconds
    const intervalId = setInterval(fetchOrders, 10000);

    return () => clearInterval(intervalId);
  }, [poolKey, deepBookService]);

  const handleCancelOrder = async (orderId: string) => {
    if (!deepBookService || !poolKey) return;

    try {
      setCancellingOrder(orderId);
      const tx = cancelOrder(poolKey, "CEREBRA_MANAGER", orderId);

      await signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });

      // Remove the cancelled order from the list
      setOrders((prevOrders) =>
        prevOrders.filter((o) => o.order_id !== orderId)
      );
    } catch (err) {
      console.error("Error cancelling order:", err);
      setError("Failed to cancel order");
    } finally {
      setCancellingOrder(null);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="user-orders">
        <div className="loading-spinner-small"></div>
      </div>
    );
  }

  return (
    <div className="user-orders">
      {error && <div className="error-message-small">{error}</div>}

      {orders.length === 0 ? (
        <div className="no-orders">You have no open orders</div>
      ) : (
        <table className="orders-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Price</th>
              <th>Amount</th>
              <th>Filled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.order_id}
                className={order.isBid ? "buy-order" : "sell-order"}
              >
                <td>{order.isBid ? "Buy" : "Sell"}</td>
                <td>{order.price.toFixed(6)}</td>
                <td>{order.quantity.toFixed(4)}</td>
                <td>
                  {((order.filled_quantity / order.quantity) * 100).toFixed(1)}%
                </td>
                <td>
                  <button
                    className="cancel-btn"
                    onClick={() => handleCancelOrder(order.order_id)}
                    disabled={cancellingOrder === order.order_id}
                  >
                    {cancellingOrder === order.order_id
                      ? "Cancelling..."
                      : "Cancel"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default UserOrders;
