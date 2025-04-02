// src/pages/PoolsAndVaults.tsx
import React, { useState } from "react";
import PoolsTab from "../components/PoolsTab";
import VaultsTab from "../components/VaultsTab";

const PoolsAndVaults: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"pools" | "vaults">("pools");

  return (
    <div>
      {/* Simple tab switcher */}
      <div style={{ display: "flex", cursor: "pointer", marginBottom: "1rem" }}>
        <div
          onClick={() => setActiveTab("pools")}
          style={{
            marginRight: "1rem",
            padding: "0.5rem 1rem",
            borderBottom:
              activeTab === "pools"
                ? "3px solid #0070f3"
                : "3px solid transparent",
          }}
        >
          Pools
        </div>
        <div
          onClick={() => setActiveTab("vaults")}
          style={{
            padding: "0.5rem 1rem",
            borderBottom:
              activeTab === "vaults"
                ? "3px solid #0070f3"
                : "3px solid transparent",
          }}
        >
          Vaults
        </div>
      </div>

      {activeTab === "pools" ? <PoolsTab /> : <VaultsTab />}
    </div>
  );
};

export default PoolsAndVaults;
