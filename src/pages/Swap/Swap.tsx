import React from "react";
import { useWallet } from "@suiet/wallet-kit";
import SwapForm from "../../components/SwapForm";
import "./Swap.scss";

const Swap: React.FC = () => {
  const { connected } = useWallet();

  return (
    <div className="swap-page">
      <div className="swap-page__container">
        <div className="swap-page__header">
          <h1>Swap Tokens</h1>
          <p>Trade tokens instantly with zero slippage and low fees</p>
        </div>

        <div className="swap-page__content">
          {connected ? (
            <SwapForm />
          ) : (
            <div className="connect-prompt">
              <h2>Connect Wallet</h2>
              <p>Please connect your wallet to start trading tokens</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Swap;
