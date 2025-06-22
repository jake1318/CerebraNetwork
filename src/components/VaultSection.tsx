// src/components/VaultSection.tsx
// Last Updated: 2025-05-22 19:33:17 UTC by jake1318

import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Typography,
  Spin,
  message,
  Empty,
  Avatar,
  Space,
  Tooltip,
  Row,
  Col,
  Divider,
  Popconfirm,
  Badge,
  Tag,
} from "antd";
import { useWallet } from "@suiet/wallet-kit";
import { ReloadOutlined, CheckCircleOutlined } from "@ant-design/icons";
import {
  getAllAvailableVaults,
  getOwnerVaultsBalances,
  depositToVault,
  depositOneSidedToVault,
  withdrawFromVault,
  withdrawAllFromVault,
  clearCache,
} from "../services/cetusVaultService";
import blockvisionService from "../services/blockvisionService";

// Import the styles
import "../styles/Vaults.scss";

const { Title, Text } = Typography;
const { Option } = Select;

// Default token placeholder image
const DEFAULT_TOKEN_ICON = "/assets/token-placeholder.png";

const VaultSection = () => {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [vaults, setVaults] = useState([]);
  const [userVaultBalances, setUserVaultBalances] = useState([]);
  const [selectedVault, setSelectedVault] = useState(null);
  const [depositAmountA, setDepositAmountA] = useState("");
  const [depositAmountB, setDepositAmountB] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [oneSided, setOneSided] = useState(false);
  const [oneSidedCoin, setOneSidedCoin] = useState("A");
  const [slippage, setSlippage] = useState(0.5); // 0.5%
  const [isDepositModalVisible, setIsDepositModalVisible] = useState(false);
  const [isWithdrawModalVisible, setIsWithdrawModalVisible] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [blockVisionData, setBlockVisionData] = useState(null);
  const [activeTab, setActiveTab] = useState("available"); // 'available' or 'positions'

  // Load vaults on component mount
  useEffect(() => {
    loadVaults();
  }, []);

  // Reload user balances when wallet changes
  useEffect(() => {
    if (wallet?.connected) {
      loadUserVaultBalances();
    } else {
      setUserVaultBalances([]);
      setBlockVisionData(null);
    }
  }, [wallet?.connected]);

  const loadVaults = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const availableVaults = await getAllAvailableVaults();
      setVaults(availableVaults);

      // Set the first vault as selected by default
      if (availableVaults.length > 0 && !selectedVault) {
        setSelectedVault(availableVaults[0]);
      }
    } catch (error) {
      console.error("Failed to load vaults:", error);
      setLoadError("Failed to load vaults. Please try again later.");
      message.error("Failed to load vaults");
    } finally {
      setLoading(false);
    }
  };

  const loadUserVaultBalances = async () => {
    if (!wallet?.account?.address) return;

    setLoading(true);
    try {
      // Try to fetch BlockVision data first to get APY information
      try {
        const blockVisionResponse =
          await blockvisionService.getDefiPortfolioData(wallet.account.address);
        if (blockVisionResponse?.rawData?.cetus?.vaults) {
          setBlockVisionData(blockVisionResponse.rawData);
          console.log("BlockVision data loaded:", blockVisionResponse.rawData);
        }
      } catch (error) {
        console.warn("Failed to load BlockVision data:", error);
        // Continue execution even if BlockVision fails
      }

      // Now fetch vault balances - this will automatically use any BlockVision APY data
      const balances = await getOwnerVaultsBalances(wallet.account.address);
      setUserVaultBalances(balances);
    } catch (error) {
      console.error("Failed to load user vault balances:", error);
      message.error("Failed to load your vault positions");
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    try {
      clearCache();
      await loadVaults();
      if (wallet?.connected) {
        await loadUserVaultBalances();
      }
      message.success("Data refreshed successfully");
    } catch (error) {
      console.error("Failed to refresh data:", error);
      message.error("Failed to refresh data");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDepositSubmit = async () => {
    if (!wallet?.connected) {
      message.warning("Please connect your wallet first");
      return;
    }

    if (!selectedVault) {
      message.warning("Please select a vault first");
      return;
    }

    setLoading(true);
    try {
      let result;

      if (oneSided) {
        // One-sided deposit
        const amount = parseFloat(
          oneSidedCoin === "A" ? depositAmountA : depositAmountB
        );

        if (isNaN(amount) || amount <= 0) {
          throw new Error("Please enter a valid amount");
        }

        result = await depositOneSidedToVault(
          wallet,
          selectedVault.id,
          amount,
          oneSidedCoin === "A",
          slippage / 100
        );
      } else {
        // Two-sided deposit
        const amountA = parseFloat(depositAmountA);
        const amountB = parseFloat(depositAmountB);

        if (isNaN(amountA) || isNaN(amountB) || amountA <= 0 || amountB <= 0) {
          throw new Error("Please enter valid amounts for both tokens");
        }

        result = await depositToVault(
          wallet,
          selectedVault.id,
          amountA,
          amountB,
          slippage / 100
        );
      }

      if (result.success) {
        message.success("Deposit successful!");
        setIsDepositModalVisible(false);

        // Reset form and reload balances
        setDepositAmountA("");
        setDepositAmountB("");
        loadUserVaultBalances();
      }
    } catch (error) {
      console.error("Deposit failed:", error);
      message.error(`Deposit failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async () => {
    if (!wallet?.connected) {
      message.warning("Please connect your wallet first");
      return;
    }

    if (!selectedVault) {
      message.warning("Please select a vault first");
      return;
    }

    setLoading(true);
    try {
      const amount = parseFloat(withdrawAmount);

      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid withdrawal amount");
      }

      const userBalance = userVaultBalances.find(
        (balance) => balance.vault_id === selectedVault.id
      );

      if (!userBalance || userBalance.lp_token_balance < amount) {
        throw new Error("Insufficient LP token balance");
      }

      const result = await withdrawFromVault(
        wallet,
        selectedVault.id,
        amount,
        slippage / 100,
        oneSided
      );

      if (result.success) {
        message.success("Withdrawal successful!");
        setIsWithdrawModalVisible(false);

        // Reset form and reload balances
        setWithdrawAmount("");
        loadUserVaultBalances();
      }
    } catch (error) {
      console.error("Withdrawal failed:", error);
      message.error(`Withdrawal failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawAll = async (vaultId) => {
    if (!wallet?.connected) {
      message.warning("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      const result = await withdrawAllFromVault(
        wallet,
        vaultId,
        slippage / 100,
        false // Get both tokens on withdrawal
      );

      if (result.success) {
        message.success("Full withdrawal successful!");
        loadUserVaultBalances();
      }
    } catch (error) {
      console.error("Full withdrawal failed:", error);
      message.error(`Full withdrawal failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Format APY with color based on value and include verified badge if from BlockVision
  const renderAPY = (apy, hasBlockVisionAPY) => {
    if (apy === undefined || apy === null) return <span>--</span>;

    let aprClass = "low";
    if (apy >= 50) aprClass = "high";
    else if (apy >= 10) aprClass = "medium";

    return (
      <div className="apy-display">
        <span className={`apr-value ${aprClass}`}>{apy.toFixed(2)}%</span>
        {hasBlockVisionAPY && (
          <Tooltip title="Verified APY from protocol data">
            <CheckCircleOutlined className="verified-icon" />
          </Tooltip>
        )}
      </div>
    );
  };

  // Render token pair with logos
  const renderTokenPair = (record) => {
    const tokenALogo =
      record.tokenAMetadata?.logoURI ||
      record.tokenAMetadata?.logo_uri ||
      DEFAULT_TOKEN_ICON;

    const tokenBLogo =
      record.tokenBMetadata?.logoURI ||
      record.tokenBMetadata?.logo_uri ||
      DEFAULT_TOKEN_ICON;

    return (
      <div className="pool-pair">
        <div className="token-icons">
          <Avatar src={tokenALogo} size="small" className="token-a" />
          <Avatar src={tokenBLogo} size="small" className="token-b" />
        </div>
        <div className="pair-text">
          {record.coin_a_symbol || "Token A"}/
          {record.coin_b_symbol || "Token B"}
        </div>
      </div>
    );
  };

  // Render vault name with logos
  const renderVaultName = (name, record) => {
    const tokenALogo =
      record.tokenAMetadata?.logoURI ||
      record.tokenAMetadata?.logo_uri ||
      DEFAULT_TOKEN_ICON;

    const tokenBLogo =
      record.tokenBMetadata?.logoURI ||
      record.tokenBMetadata?.logo_uri ||
      DEFAULT_TOKEN_ICON;

    return (
      <div className="vault-name">
        <div className="token-icons">
          <Avatar src={tokenALogo} size="small" className="token-a" />
          <Avatar src={tokenBLogo} size="small" className="token-b" />
        </div>
        <div className="name-text">{name}</div>
      </div>
    );
  };

  // Format number helper
  const formatNumber = (value) => {
    if (value === undefined || value === null) return "--";
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Render token pair for display
  const renderTokenPairForTable = (record) => {
    return (
      <div className="token-pair-display">
        <div className="token-icons">
          <img
            src={record.tokenAMetadata?.logoURI || DEFAULT_TOKEN_ICON}
            alt={record.coin_a_symbol}
            className="token-icon token-a"
          />
          <img
            src={record.tokenBMetadata?.logoURI || DEFAULT_TOKEN_ICON}
            alt={record.coin_b_symbol}
            className="token-icon token-b"
          />
        </div>
        <span className="pair-name">
          {record.coin_a_symbol || "Token A"}/
          {record.coin_b_symbol || "Token B"}
        </span>
      </div>
    );
  };

  return (
    <div className="vaults-page">
      <div className="content-container">
        <div className="vaults-header">
          <div>
            <h2>Cetus Vaults</h2>
            <div className="description">
              Automated LP strategies - deposit assets and earn with
              auto-compounding
            </div>
          </div>
          <button
            className={`refresh-button ${refreshing ? "refreshing" : ""}`}
            onClick={refreshData}
            disabled={refreshing}
          >
            <ReloadOutlined className="refresh-icon" />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Tab navigation */}
        <div className="vaults-tabs">
          <button
            className={`tab-button ${
              activeTab === "available" ? "active" : ""
            }`}
            onClick={() => setActiveTab("available")}
          >
            Available Vaults
          </button>
          <button
            className={`tab-button ${
              activeTab === "positions" ? "active" : ""
            }`}
            onClick={() => setActiveTab("positions")}
          >
            My Vault Positions
            {userVaultBalances.length > 0 && (
              <span className="tab-count">{userVaultBalances.length}</span>
            )}
          </button>
        </div>

        {/* Available Vaults Tab Content */}
        {activeTab === "available" && (
          <Spin spinning={loading}>
            {loadError ? (
              <div className="empty-state">
                <div className="empty-icon">⚠️</div>
                <h3>Error Loading Vaults</h3>
                <p>{loadError}</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={loadVaults}
                >
                  Retry
                </button>
              </div>
            ) : vaults.length > 0 ? (
              <div className="positions-table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Vault</th>
                      <th>Pool</th>
                      <th className="align-right">TVL</th>
                      <th className="align-right">APY</th>
                      <th className="actions-column">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaults.map((vault) => (
                      <tr key={vault.id}>
                        <td>{renderVaultName(vault.name, vault)}</td>
                        <td>{renderTokenPairForTable(vault)}</td>
                        <td className="align-right">
                          ${formatNumber(vault.tvl)}
                        </td>
                        <td className="align-right">
                          {renderAPY(vault.apy, vault.hasBlockVisionAPY)}
                        </td>
                        <td className="actions-cell">
                          <Button
                            type="primary"
                            onClick={() => {
                              setSelectedVault(vault);
                              setIsDepositModalVisible(true);
                            }}
                            style={{ marginRight: 8 }}
                            disabled={!wallet?.connected}
                          >
                            Deposit
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedVault(vault);
                              setIsWithdrawModalVisible(true);
                            }}
                            disabled={
                              !wallet?.connected ||
                              !userVaultBalances.some(
                                (balance) =>
                                  balance.vault_id === vault.id &&
                                  Number(balance.lp_token_balance) > 0
                              )
                            }
                          >
                            Withdraw
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <h3>No Vaults Available</h3>
                <p>There are no vaults available right now.</p>
              </div>
            )}
          </Spin>
        )}

        {/* My Positions Tab Content */}
        {activeTab === "positions" && (
          <Spin spinning={loading}>
            {wallet?.connected ? (
              <>
                {/* Display BlockVision Cetus vaults if available */}
                {blockVisionData?.cetus?.vaults &&
                  blockVisionData.cetus.vaults.length > 0 && (
                    <div className="blockVision-section">
                      <Title level={4}>
                        <Space>
                          Your Cetus Vaults
                          <Tag color="blue">
                            <Space>
                              <CheckCircleOutlined /> Verified Data
                            </Space>
                          </Tag>
                        </Space>
                      </Title>
                      <div className="positions-table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Vault</th>
                              <th>Token A</th>
                              <th>Token B</th>
                              <th className="align-right">APY</th>
                              <th className="actions-column">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {blockVisionData.cetus.vaults.map((record) => (
                              <tr key={record.id}>
                                <td>
                                  <div className="vault-name">
                                    <div className="token-icons">
                                      <img
                                        src={
                                          record.coinA?.iconUrl ||
                                          DEFAULT_TOKEN_ICON
                                        }
                                        alt=""
                                        className="token-icon"
                                      />
                                      <img
                                        src={
                                          record.coinB?.iconUrl ||
                                          DEFAULT_TOKEN_ICON
                                        }
                                        alt=""
                                        className="token-icon"
                                      />
                                    </div>
                                    <div className="name-text">
                                      {record.name}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div className="token-balance-display">
                                    <img
                                      src={
                                        record.coinA?.iconUrl ||
                                        DEFAULT_TOKEN_ICON
                                      }
                                      alt=""
                                      className="token-icon"
                                    />
                                    <span className="balance-text">
                                      <span className="amount">
                                        {(
                                          parseFloat(record.coinAAmount) /
                                          Math.pow(
                                            10,
                                            record.coinA?.decimals || 9
                                          )
                                        ).toFixed(4)}
                                      </span>
                                      <span className="symbol">
                                        {record.coinA?.symbol}
                                      </span>
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="token-balance-display">
                                    <img
                                      src={
                                        record.coinB?.iconUrl ||
                                        DEFAULT_TOKEN_ICON
                                      }
                                      alt=""
                                      className="token-icon"
                                    />
                                    <span className="balance-text">
                                      <span className="amount">
                                        {(
                                          parseFloat(record.coinBAmount) /
                                          Math.pow(
                                            10,
                                            record.coinB?.decimals || 9
                                          )
                                        ).toFixed(4)}
                                      </span>
                                      <span className="symbol">
                                        {record.coinB?.symbol}
                                      </span>
                                    </span>
                                  </div>
                                </td>
                                <td className="align-right">
                                  <div className="apy-display">
                                    <span className="apr-value high">
                                      {parseFloat(record.apy).toFixed(2)}%
                                    </span>
                                    <CheckCircleOutlined className="verified-icon" />
                                  </div>
                                </td>
                                <td className="actions-cell">
                                  <Button
                                    onClick={() => {
                                      const matchingVault = vaults.find(
                                        (v) => v.id === record.id
                                      );
                                      if (matchingVault) {
                                        setSelectedVault(matchingVault);
                                        setIsWithdrawModalVisible(true);
                                      } else {
                                        message.warning(
                                          "Vault details are not available"
                                        );
                                      }
                                    }}
                                  >
                                    Manage
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <hr className="section-divider" />
                    </div>
                  )}

                {/* Display user vault balances as before */}
                {userVaultBalances.length > 0 ? (
                  <div className="positions-table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Vault</th>
                          <th className="align-right">LP Balance</th>
                          <th>Token A</th>
                          <th>Token B</th>
                          <th className="align-right">Value (USD)</th>
                          <th className="align-right">APY</th>
                          <th className="actions-column">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userVaultBalances.map((balance) => {
                          const vault = vaults.find(
                            (v) => v.id === balance.vault_id
                          );
                          const tokenALogo =
                            balance.tokenAMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON;
                          const tokenBLogo =
                            balance.tokenBMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON;

                          return (
                            <tr key={balance.vault_id}>
                              <td>
                                {vault ? (
                                  renderVaultName(vault.name, vault)
                                ) : (
                                  <div className="vault-name">
                                    <div className="token-icons">
                                      <img
                                        src={tokenALogo}
                                        alt=""
                                        className="token-icon"
                                      />
                                      <img
                                        src={tokenBLogo}
                                        alt=""
                                        className="token-icon"
                                      />
                                    </div>
                                    <div className="name-text">
                                      {balance.vault_id.substring(0, 10)}...
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="align-right">
                                {parseFloat(
                                  balance.lp_token_balance || 0
                                ).toFixed(6)}
                              </td>
                              <td>
                                <div className="token-balance-display">
                                  <img
                                    src={tokenALogo}
                                    alt=""
                                    className="token-icon"
                                  />
                                  <span className="balance-text">
                                    <span className="amount">
                                      {parseFloat(
                                        balance.amount_a || 0
                                      ).toFixed(6)}
                                    </span>
                                    <span className="symbol">
                                      {balance.coin_a_symbol || "A"}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="token-balance-display">
                                  <img
                                    src={tokenBLogo}
                                    alt=""
                                    className="token-icon"
                                  />
                                  <span className="balance-text">
                                    <span className="amount">
                                      {parseFloat(
                                        balance.amount_b || 0
                                      ).toFixed(6)}
                                    </span>
                                    <span className="symbol">
                                      {balance.coin_b_symbol || "B"}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td className="align-right">
                                ${formatNumber(balance.value_usd)}
                              </td>
                              <td className="align-right">
                                {renderAPY(
                                  balance.apy,
                                  balance.hasBlockVisionAPY
                                )}
                              </td>
                              <td className="actions-cell">
                                <Button
                                  type="primary"
                                  onClick={() =>
                                    handleWithdrawAll(balance.vault_id)
                                  }
                                  loading={loading}
                                  disabled={
                                    !balance.lp_token_balance ||
                                    Number(balance.lp_token_balance) <= 0
                                  }
                                >
                                  Withdraw All
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">💰</div>
                    <h3>No Vault Positions</h3>
                    <p>You don't have any vault positions yet.</p>
                    <button
                      className="btn btn--primary"
                      onClick={() => setActiveTab("available")}
                    >
                      Browse Available Vaults
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="connect-wallet-prompt">
                <h3>Connect Your Wallet</h3>
                <p>Please connect your wallet to view your vault positions.</p>
                <button
                  className="connect-button"
                  onClick={() => wallet.select()}
                >
                  Connect Wallet
                </button>
              </div>
            )}
          </Spin>
        )}

        {/* Deposit Modal */}
        {selectedVault && (
          <Modal
            title={`Deposit to ${selectedVault?.name || "Vault"}`}
            open={isDepositModalVisible}
            onCancel={() => setIsDepositModalVisible(false)}
            footer={[
              <Button
                key="back"
                onClick={() => setIsDepositModalVisible(false)}
              >
                Cancel
              </Button>,
              <Button
                key="submit"
                type="primary"
                loading={loading}
                onClick={handleDepositSubmit}
              >
                Deposit
              </Button>,
            ]}
          >
            <div className="modal-body">
              <Card style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card.Meta
                      avatar={
                        <Avatar
                          src={
                            selectedVault.tokenAMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="large"
                        />
                      }
                      title={selectedVault.coin_a_symbol || "Token A"}
                      description={`$${formatNumber(
                        selectedVault.token_a_price || 0
                      )}`}
                    />
                  </Col>
                  <Col span={12}>
                    <Card.Meta
                      avatar={
                        <Avatar
                          src={
                            selectedVault.tokenBMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="large"
                        />
                      }
                      title={selectedVault.coin_b_symbol || "Token B"}
                      description={`$${formatNumber(
                        selectedVault.token_b_price || 0
                      )}`}
                    />
                  </Col>
                </Row>
                <Divider />
                <Row gutter={16}>
                  <Col span={12}>
                    <div className="stat-item">
                      <div className="stat-label">TVL</div>
                      <div className="stat-value">
                        ${formatNumber(selectedVault.tvl)}
                      </div>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div className="stat-item">
                      <div className="stat-label">APY</div>
                      <div className="stat-value apy">
                        {selectedVault.apy.toFixed(2)}%
                        {selectedVault.hasBlockVisionAPY && (
                          <CheckCircleOutlined className="verified-badge" />
                        )}
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card>

              <Select
                value={oneSided ? "one" : "both"}
                onChange={(value) => setOneSided(value === "one")}
                style={{ width: "100%", marginBottom: 16 }}
              >
                <Option value="both">Deposit Both Tokens</Option>
                <Option value="one">One-Sided Deposit</Option>
              </Select>

              {oneSided ? (
                <>
                  <Select
                    value={oneSidedCoin}
                    onChange={setOneSidedCoin}
                    style={{ width: "100%", marginBottom: 16 }}
                  >
                    <Option value="A">
                      <Space>
                        <Avatar
                          src={
                            selectedVault.tokenAMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="small"
                        />
                        {selectedVault?.coin_a_symbol || "Token A"}
                      </Space>
                    </Option>
                    <Option value="B">
                      <Space>
                        <Avatar
                          src={
                            selectedVault.tokenBMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="small"
                        />
                        {selectedVault?.coin_b_symbol || "Token B"}
                      </Space>
                    </Option>
                  </Select>

                  <div className="form-group">
                    <label>Amount</label>
                    <div className="input-group">
                      <span className="input-addon">
                        <Avatar
                          src={
                            (oneSidedCoin === "A"
                              ? selectedVault.tokenAMetadata?.logoURI
                              : selectedVault.tokenBMetadata?.logoURI) ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="small"
                        />
                        {oneSidedCoin === "A"
                          ? selectedVault?.coin_a_symbol
                          : selectedVault?.coin_b_symbol}
                      </span>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={
                          oneSidedCoin === "A" ? depositAmountA : depositAmountB
                        }
                        onChange={(e) => {
                          if (oneSidedCoin === "A") {
                            setDepositAmountA(e.target.value);
                          } else {
                            setDepositAmountB(e.target.value);
                          }
                        }}
                        min="0"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>
                      {selectedVault?.coin_a_symbol || "Token A"} Amount
                    </label>
                    <div className="input-group">
                      <span className="input-addon">
                        <Avatar
                          src={
                            selectedVault.tokenAMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="small"
                        />
                        {selectedVault?.coin_a_symbol || "Token A"}
                      </span>
                      <input
                        type="number"
                        placeholder="Amount A"
                        value={depositAmountA}
                        onChange={(e) => setDepositAmountA(e.target.value)}
                        min="0"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>
                      {selectedVault?.coin_b_symbol || "Token B"} Amount
                    </label>
                    <div className="input-group">
                      <span className="input-addon">
                        <Avatar
                          src={
                            selectedVault.tokenBMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="small"
                        />
                        {selectedVault?.coin_b_symbol || "Token B"}
                      </span>
                      <input
                        type="number"
                        placeholder="Amount B"
                        value={depositAmountB}
                        onChange={(e) => setDepositAmountB(e.target.value)}
                        min="0"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Slippage Tolerance: {slippage}%</label>
                <div className="select-wrapper">
                  <select
                    value={slippage}
                    onChange={(e) => setSlippage(parseFloat(e.target.value))}
                  >
                    <option value={0.1}>0.1%</option>
                    <option value={0.5}>0.5%</option>
                    <option value={1.0}>1.0%</option>
                    <option value={2.0}>2.0%</option>
                  </select>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {/* Withdraw Modal */}
        {selectedVault && (
          <Modal
            title={`Withdraw from ${selectedVault?.name || "Vault"}`}
            open={isWithdrawModalVisible}
            onCancel={() => setIsWithdrawModalVisible(false)}
            footer={[
              <Button
                key="back"
                onClick={() => setIsWithdrawModalVisible(false)}
              >
                Cancel
              </Button>,
              <Button
                key="submit"
                type="primary"
                loading={loading}
                onClick={handleWithdrawSubmit}
              >
                Withdraw
              </Button>,
            ]}
          >
            <div className="modal-body">
              {/* Vault info card similar to deposit */}
              <Card style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card.Meta
                      avatar={
                        <Avatar
                          src={
                            selectedVault.tokenAMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="large"
                        />
                      }
                      title={selectedVault.coin_a_symbol || "Token A"}
                      description={`$${formatNumber(
                        selectedVault.token_a_price || 0
                      )}`}
                    />
                  </Col>
                  <Col span={12}>
                    <Card.Meta
                      avatar={
                        <Avatar
                          src={
                            selectedVault.tokenBMetadata?.logoURI ||
                            DEFAULT_TOKEN_ICON
                          }
                          size="large"
                        />
                      }
                      title={selectedVault.coin_b_symbol || "Token B"}
                      description={`$${formatNumber(
                        selectedVault.token_b_price || 0
                      )}`}
                    />
                  </Col>
                </Row>
              </Card>

              <div className="form-group">
                <label>LP Token Amount to Withdraw</label>
                <div className="input-group">
                  <input
                    type="number"
                    placeholder="Amount to withdraw"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    min="0"
                  />
                  <button
                    className="max-button"
                    onClick={() => {
                      const balance = userVaultBalances.find(
                        (b) => b.vault_id === selectedVault.id
                      )?.lp_token_balance;
                      if (balance) {
                        setWithdrawAmount(balance.toString());
                      }
                    }}
                  >
                    MAX
                  </button>
                </div>
                {selectedVault && (
                  <div className="balance-info">
                    Your Balance:{" "}
                    {userVaultBalances.find(
                      (b) => b.vault_id === selectedVault.id
                    )?.lp_token_balance || 0}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Withdrawal Method</label>
                <div className="select-wrapper">
                  <select
                    value={oneSided ? "one" : "both"}
                    onChange={(e) => setOneSided(e.target.value === "one")}
                  >
                    <option value="both">Receive Both Tokens</option>
                    <option value="one">Receive Single Token</option>
                  </select>
                </div>
              </div>

              {oneSided && (
                <div className="form-group">
                  <label>Receive Token</label>
                  <div className="select-wrapper">
                    <select
                      value={oneSidedCoin}
                      onChange={(e) => setOneSidedCoin(e.target.value)}
                    >
                      <option value="A">
                        {selectedVault?.coin_a_symbol || "Token A"}
                      </option>
                      <option value="B">
                        {selectedVault?.coin_b_symbol || "Token B"}
                      </option>
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Slippage Tolerance: {slippage}%</label>
                <div className="select-wrapper">
                  <select
                    value={slippage}
                    onChange={(e) => setSlippage(parseFloat(e.target.value))}
                  >
                    <option value={0.1}>0.1%</option>
                    <option value={0.5}>0.5%</option>
                    <option value={1.0}>1.0%</option>
                    <option value={2.0}>2.0%</option>
                  </select>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
};

export { VaultSection };
export default VaultSection;
