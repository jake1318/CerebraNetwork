// src/components/RepaymentModal.tsx
// Last Updated: 2025-07-20 01:15:13 UTC by jake1318

import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import scallopService from "../scallop/ScallopService";
import { scallop } from "../scallop/ScallopService"; // Import scallop directly to set signer
import scallopBorrowService from "../scallop/ScallopBorrowService";
import { getObligationId } from "../scallop/ScallopCollateralService";
import {
  repayUnlockedObligation,
  repayMaximumDebt,
  unlockAndRepay,
  unlockObligation,
  isObligationLocked,
} from "../scallop/ScallopIncentiveService";
import "../styles/BorrowingActionModal.scss";
import * as blockvisionService from "../services/blockvisionService"; // Import the blockvision service

// Simple utility functions
const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const truncateAddress = (address: string): string => {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Info icon component
const InfoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
);

// Lock icon component
const LockIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0110 0v4"></path>
  </svg>
);

// Constants for coin configuration - using raw asset names
const COINS = {
  SUI: {
    symbol: "SUI",
    name: "sui",
    decimals: 9,
    icon: "/icons/sui-icon.svg",
    coinTypes: ["0x2::sui::SUI"],
  },
  USDC: {
    symbol: "USDC",
    name: "usdc", // Use raw "usdc", SDK handles wrapping
    decimals: 6,
    icon: "/icons/usdc-icon.svg",
    coinTypes: [
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      "0xc3f8927de33d3deb52c282a836082a413bc73c6ee0bd4d7ec7e3b6b4c28e9abf::coin::COIN",
    ],
  },
  USDT: {
    symbol: "USDT",
    name: "usdt", // Use raw "usdt", SDK handles wrapping
    decimals: 6,
    icon: "/icons/usdt-icon.svg",
    coinTypes: [
      "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
      "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT",
    ],
  },
};

// Modified function to get total balance across all coin types with the same symbol
function getTotalCoinBalance(coins: any[], coinConfig: any): number {
  if (!coins || !coinConfig || !coinConfig.coinTypes) return 0;

  let totalBalance = 0;

  // Check each possible coin type for the symbol and sum their balances
  for (const coinType of coinConfig.coinTypes) {
    const matchingCoins = coins.filter((coin) => coin.coinType === coinType);

    for (const coin of matchingCoins) {
      if (coin && coin.balance) {
        // Apply correct decimals (from coin.decimals if available, otherwise from coinConfig)
        const decimals = coin.decimals || coinConfig.decimals;
        totalBalance += Number(coin.balance) / Math.pow(10, decimals);
      }
    }
  }

  return totalBalance;
}

// Safe amounts for repaying
const SAFE_REPAY_AMOUNTS = {
  USDC: 0.1, // 0.1 USDC
  SUI: 0.01, // 0.01 SUI
  USDT: 0.1, // 0.1 USDT
};

interface RepaymentModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  defaultRepayAmount?: string;
  obligationId?: string;
  asset?: any; // Added asset prop for the asset to repay
}

const RepaymentModal: React.FC<RepaymentModalProps> = ({
  onClose,
  onSuccess,
  defaultRepayAmount = "",
  obligationId: propObligationId,
  asset: propAsset = null, // Default to null if not provided
}) => {
  const wallet = useWallet();

  // State
  const [repayAmount, setRepayAmount] = useState<string>(defaultRepayAmount);
  const [selectedAsset, setSelectedAsset] = useState<string>(
    propAsset?.symbol || "USDC"
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionResult, setTransactionResult] = useState<any>(null);
  const [currentDebt, setCurrentDebt] = useState<number | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false);
  const [obligationId, setObligationId] = useState<string | null>(
    propObligationId || null
  );
  const [isObligationLockedState, setIsObligationLocked] =
    useState<boolean>(false);
  const [healthFactor, setHealthFactor] = useState<number | null>(null);
  const [borrowedAssets, setBorrowedAssets] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [accountCoins, setAccountCoins] = useState<any[]>([]); // Store all account coins from blockvision
  const [obligationDetails, setObligationDetails] = useState<any>(null);
  const [repayMaximum, setRepayMaximum] = useState<boolean>(false);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [verifyingTransaction, setVerifyingTransaction] =
    useState<boolean>(false);

  // Initialize with the prop asset if provided
  useEffect(() => {
    if (propAsset) {
      console.log("Using provided asset:", propAsset);
      setSelectedAsset(propAsset.symbol);
    }
  }, [propAsset]);

  // Fetch obligation ID and user portfolio data when component mounts
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      setIsInitialLoading(true);
      Promise.all([fetchObligationIdIfNeeded(), fetchWalletCoins()]).finally(
        () => {
          setIsInitialLoading(false);
        }
      );
    }
  }, [wallet.connected, wallet.address, selectedAsset]);

  // Fetch all wallet coins using blockvision service
  const fetchWalletCoins = async () => {
    if (!wallet.address) return;

    try {
      console.log(`Fetching wallet coins for address: ${wallet.address}`);
      const coins = await blockvisionService.getAccountCoins(wallet.address);
      setAccountCoins(coins);
      console.log("Account coins:", coins);

      // Update the wallet balance for the selected asset
      updateSelectedAssetBalance(coins);
    } catch (err) {
      console.error("Error fetching account coins:", err);
    }
  };

  // Update wallet balance when selected asset changes or when coins are fetched
  const updateSelectedAssetBalance = (coins: any[] = accountCoins) => {
    if (!coins.length) return;

    const coinConfig = COINS[selectedAsset as keyof typeof COINS];
    if (!coinConfig) {
      console.error(`Unknown coin type: ${selectedAsset}`);
      setWalletBalance(0);
      return;
    }

    // Use new function to get total balance across all possible coin types
    const balance = getTotalCoinBalance(coins, coinConfig);

    console.log(`Updated wallet balance for ${selectedAsset}: ${balance}`);
    setWalletBalance(balance);
  };

  // Update wallet balance when selected asset changes
  useEffect(() => {
    updateSelectedAssetBalance();
  }, [selectedAsset, accountCoins]);

  // Check if obligation is locked using loaded obligation data to avoid API calls
  const checkObligationLockedStatus = async (oblId: string) => {
    if (!wallet.address || !oblId) return false;

    try {
      // If we already have obligation details loaded, use that data
      if (obligationDetails && obligationDetails.obligationId === oblId) {
        const isLocked = obligationDetails.isLocked === true;
        setIsObligationLocked(isLocked);
        return isLocked;
      }

      // Otherwise fetch obligation details
      const { success, obligation } =
        await scallopBorrowService.getObligationDetails(oblId, wallet.address);
      if (success && obligation) {
        const isLocked = obligation.isLocked === true;
        setIsObligationLocked(isLocked);
        return isLocked;
      }

      return false;
    } catch (err) {
      console.error("Error checking obligation lock status:", err);
      return false;
    }
  };

  // Only fetch obligation ID if it wasn't provided in props
  const fetchObligationIdIfNeeded = async () => {
    // Skip if we already have the obligation ID from props
    if (propObligationId) {
      console.log("Using obligation ID from props:", propObligationId);
      setObligationId(propObligationId);

      // Check if obligation is locked and fetch its details
      await fetchUserPortfolioData(propObligationId);
      // Use the loaded data to check lock status
      await checkObligationLockedStatus(propObligationId);
      return;
    }

    try {
      if (!wallet.address) return;

      const id = await getObligationId(wallet.address);
      setObligationId(id);

      console.log("Fetched obligation ID:", id);

      // Check if obligation is locked and fetch its details
      if (id) {
        await fetchUserPortfolioData(id);
        await checkObligationLockedStatus(id);
      }
    } catch (err) {
      console.error("Error fetching obligation ID:", err);
    }
  };

  // Fetch user portfolio data to get current debt
  const fetchUserPortfolioData = async (specificObligationId?: string) => {
    try {
      if (!wallet.address) return;

      // If we have an obligation ID, use it to fetch debt for that specific obligation
      if (specificObligationId || obligationId) {
        const targetObligationId = specificObligationId || obligationId;

        // Get data for the specific obligation
        console.log(
          "Fetching data for specific obligation:",
          targetObligationId
        );

        // Use scallopBorrowService.getObligationDetails
        const { success, obligation: obligationData } =
          await scallopBorrowService.getObligationDetails(
            targetObligationId!,
            wallet.address
          );

        console.log("Obligation-specific data:", obligationData);

        // Store the obligation details for later use
        setObligationDetails(obligationData);

        if (obligationData && obligationData.borrows) {
          // Format borrowed assets to match the expected structure
          const formattedBorrows = obligationData.borrows.map((borrow) => ({
            symbol: borrow.symbol,
            amount: borrow.amount,
            valueUSD: borrow.usd,
            apy: borrow.interestRate || 0,
          }));

          setBorrowedAssets(formattedBorrows);

          // Set default selected asset to the prop asset if available
          if (propAsset) {
            const matchingDebt = formattedBorrows.find(
              (asset) =>
                asset.symbol.toLowerCase() === propAsset.symbol.toLowerCase()
            );
            if (matchingDebt) {
              setSelectedAsset(propAsset.symbol);
              setCurrentDebt(matchingDebt.amount);
            }
          }
          // Otherwise, set to first borrowed asset if available and no prop asset was provided
          else if (formattedBorrows.length > 0) {
            if (!formattedBorrows.find((a) => a.symbol === selectedAsset)) {
              setSelectedAsset(formattedBorrows[0].symbol);
              setCurrentDebt(formattedBorrows[0].amount);
            } else {
              const debt = formattedBorrows.find(
                (asset) => asset.symbol === selectedAsset
              );
              setCurrentDebt(debt ? debt.amount : 0);
            }
          }

          // Calculate health factor from collateral and borrows
          if (
            obligationData.totalCollateralUSD > 0 &&
            obligationData.totalBorrowUSD > 0
          ) {
            const calculatedHealthFactor =
              (obligationData.totalCollateralUSD * 0.8) /
              obligationData.totalBorrowUSD;
            setHealthFactor(Math.min(calculatedHealthFactor, 999));
          } else {
            setHealthFactor(999);
          }

          // Update lock status from obligation data
          setIsObligationLocked(obligationData.isLocked || false);

          return; // Skip the general portfolio fetch below
        }
      }

      // Fallback to using general user positions if we don't have obligation-specific data
      const userPositions = await scallopService.fetchUserPositions(
        wallet.address
      );
      console.log("User positions:", userPositions);

      // Store borrowed assets
      setBorrowedAssets(userPositions.borrowedAssets || []);

      // Calculate total collateral value in USD
      const totalCollateralUSD = userPositions.collateralAssets.reduce(
        (sum, asset) => sum + asset.valueUSD,
        0
      );

      // Calculate total borrowed value in USD
      const totalBorrowedUSD = userPositions.borrowedAssets.reduce(
        (sum, asset) => sum + asset.valueUSD,
        0
      );

      // Calculate health factor
      let calculatedHealthFactor =
        totalBorrowedUSD > 0
          ? (totalCollateralUSD * 0.8) / totalBorrowedUSD
          : 999;

      calculatedHealthFactor = Math.min(calculatedHealthFactor, 999);
      setHealthFactor(calculatedHealthFactor);

      // If there's a prop asset, try to find it in the borrowed assets
      if (propAsset) {
        const debt = userPositions.borrowedAssets.find(
          (asset) =>
            asset.symbol.toLowerCase() === propAsset.symbol.toLowerCase()
        );
        if (debt) {
          setSelectedAsset(propAsset.symbol);
          setCurrentDebt(debt.amount);
        }
      } else {
        // Find current debt for the selected asset
        const debt = userPositions.borrowedAssets.find(
          (asset) => asset.symbol === selectedAsset
        );

        // Set default selected asset to the first borrowed asset if available
        if (
          userPositions.borrowedAssets &&
          userPositions.borrowedAssets.length > 0 &&
          !userPositions.borrowedAssets.find((a) => a.symbol === selectedAsset)
        ) {
          setSelectedAsset(userPositions.borrowedAssets[0].symbol);
          setCurrentDebt(userPositions.borrowedAssets[0].amount);
        } else {
          setCurrentDebt(debt ? debt.amount : 0);
        }
      }

      console.log(`Current debt for ${selectedAsset}: ${currentDebt || 0}`);
    } catch (err) {
      console.error("Error fetching portfolio data:", err);
    }
  };

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and a single decimal point
    if (value === "" || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setRepayAmount(value);
      setRepayMaximum(false); // Setting a specific amount disables "repay maximum"
      setError(null); // Clear any previous error
    }
  };

  // Handle asset selection
  const handleAssetChange = (asset: string) => {
    setSelectedAsset(asset);
    setRepayAmount(""); // Reset amount when asset changes
    setRepayMaximum(false); // Reset repay maximum flag

    // Update current debt based on selected asset
    const debt = borrowedAssets.find((a) => a.symbol === asset);
    setCurrentDebt(debt ? debt.amount : 0);

    // Update wallet balance for the new asset
    updateSelectedAssetBalance();
  };

  // Use safe amount
  const handleUseSafeAmount = () => {
    const safeAmount =
      SAFE_REPAY_AMOUNTS[selectedAsset as keyof typeof SAFE_REPAY_AMOUNTS] ??
      SAFE_REPAY_AMOUNTS.USDC;
    setRepayAmount(safeAmount.toString());
    setRepayMaximum(false);
  };

  // Set maximum amount (repay full debt)
  const handleUseMaxAmount = () => {
    if (currentDebt !== null) {
      // Instead of setting a specific amount, just enable "repay maximum" flag
      // and show the full debt amount in the input for user feedback
      setRepayAmount(currentDebt.toString());
      setRepayMaximum(true);
    }
  };

  // Validate form before submission
  const validateForm = (): boolean => {
    if (!wallet.connected) {
      setError("Please connect your wallet first");
      return false;
    }

    if (!repayMaximum && (!repayAmount || parseFloat(repayAmount) <= 0)) {
      setError("Please enter a valid repayment amount");
      return false;
    }

    if (!repayMaximum) {
      const amount = parseFloat(repayAmount);

      if (currentDebt !== null && amount > currentDebt) {
        setError(
          `You only have ${currentDebt.toFixed(
            6
          )} ${selectedAsset} debt to repay`
        );
        return false;
      }

      if (walletBalance !== null && amount > walletBalance) {
        setError(
          `You don't have enough ${selectedAsset} in your wallet. Balance: ${walletBalance.toFixed(
            6
          )}`
        );
        return false;
      }
    } else {
      // When repaying maximum, check if user has any balance to repay with
      if (walletBalance !== null && walletBalance <= 0) {
        setError(
          `You don't have any ${selectedAsset} in your wallet to repay with`
        );
        return false;
      }
    }

    if (!obligationId) {
      setError("No debt to repay");
      return false;
    }

    return true;
  };

  // Verify if a transaction was actually successful by checking if the debt was reduced
  const verifyTransactionSuccess = async (
    txDigest: string
  ): Promise<boolean> => {
    try {
      setVerifyingTransaction(true);
      setProcessingSteps((prev) => [
        ...prev,
        "Verifying transaction outcome...",
      ]);

      // Wait a short time for the transaction to be fully processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Fetch the updated obligation details
      const { obligation } = await scallopBorrowService.getObligationDetails(
        obligationId!,
        wallet.address!
      );

      // Check if the obligation was unlocked (if it was previously locked)
      if (isObligationLockedState && !obligation.isLocked) {
        console.log("Verification successful: Obligation was unlocked");
        setProcessingSteps((prev) => [
          ...prev,
          "Verified: Obligation was successfully unlocked",
        ]);
        return true;
      }

      // Find debt for the selected asset
      const assetDebt = obligation.borrows.find(
        (borrow: any) =>
          borrow.symbol.toLowerCase() === selectedAsset.toLowerCase()
      );

      // If the debt for this asset is now gone or reduced, the transaction was successful
      const previousDebt = currentDebt || 0;
      const currentAssetDebt = assetDebt ? assetDebt.amount : 0;

      console.log(
        `Verification check: Previous debt: ${previousDebt}, Current debt: ${currentAssetDebt}`
      );

      if (currentAssetDebt < previousDebt || currentAssetDebt === 0) {
        console.log("Verification successful: Debt was reduced");
        setProcessingSteps((prev) => [
          ...prev,
          `Verified: Debt was reduced from ${previousDebt} to ${currentAssetDebt}`,
        ]);
        return true;
      }

      // If the debt was not reduced, something may have gone wrong
      setProcessingSteps((prev) => [
        ...prev,
        "Verification inconclusive: Debt doesn't appear to be reduced",
      ]);
      return false;
    } catch (err) {
      console.error("Error verifying transaction:", err);
      setProcessingSteps((prev) => [
        ...prev,
        "Verification failed: Could not confirm outcome",
      ]);
      return false;
    } finally {
      setVerifyingTransaction(false);
    }
  };

  // Improved transaction status detection
  const detectTransactionSuccess = async (result: any): Promise<boolean> => {
    // Method 1: Check if the transaction has a digest (all executed transactions have this)
    if (result.digest) {
      console.log("Transaction has a digest, likely executed:", result.digest);

      // Method 2: Check effects.status if available
      if (result.effects?.status?.status === "success") {
        console.log("Transaction effects.status indicates success");
        return true;
      }

      // Method 3: Check for absence of error in effects
      if (result.effects && !result.effects.status?.error) {
        console.log("Transaction has no error in effects, likely succeeded");
        return true;
      }

      // Method 4: Check for MoveCall events related to repay
      const events = result.events || [];
      const hasRepayEvent = events.some(
        (event: any) =>
          (event.type && event.type.toLowerCase().includes("repay")) ||
          (event.parsedJson &&
            (event.parsedJson.repayment_amount !== undefined ||
              event.parsedJson.debt_amount !== undefined))
      );

      if (hasRepayEvent) {
        console.log("Transaction has repay-related events, confirming success");
        return true;
      }

      // Method 5: If transaction has digest but no obvious success/failure indicators,
      // verify the actual outcome by checking if the debt was reduced
      console.log("Transaction status unclear, verifying outcome on-chain");
      return await verifyTransactionSuccess(result.digest);
    }

    return false;
  };

  // Handle repayment using atomic transaction builder
  const handleAtomicRepayment = async () => {
    if (!validateForm() || !wallet.connected || !obligationId) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setProcessingSteps(["Preparing transaction..."]);

    try {
      const coinCfg = COINS[selectedAsset as keyof typeof COINS];
      if (!coinCfg) {
        throw new Error(`Unknown coin: ${selectedAsset}`);
      }

      // Convert symbol to lowercase for the API
      const asset = coinCfg.name.toLowerCase() as "usdc" | "sui" | "usdt";

      console.log(
        `[handleAtomicRepayment] Processing for ${selectedAsset} on obligation ${obligationId}`
      );

      // Initialize Scallop SDK builder
      setProcessingSteps((prev) => [
        ...prev,
        "Initializing transaction builder...",
      ]);

      const scallopBuilder = await scallop.createScallopBuilder();
      const txBlock = scallopBuilder.createTxBlock();
      const sender = wallet.address!;
      txBlock.setSender(sender);

      // Add steps to the transaction:
      // 1. If locked, add unstake operation to unlock the obligation
      if (isObligationLockedState) {
        setProcessingSteps((prev) => [
          ...prev,
          "Adding unlock operation to transaction...",
        ]);
        // Pass undefined as the obligation key since SDK will look it up
        await txBlock.unstakeObligationQuick(obligationId, undefined);
      }

      // 2. Add repayment operation
      setProcessingSteps((prev) => [
        ...prev,
        "Adding repay operation to transaction...",
      ]);
      if (repayMaximum && currentDebt !== null) {
        // For maximum repayment, use the current debt value plus a small buffer
        const amt = currentDebt * 1.01; // 1% buffer for accrued interest
        const baseUnits = BigInt(
          Math.floor(amt * Math.pow(10, coinCfg.decimals))
        );
        await txBlock.repayQuick(baseUnits, asset, obligationId);
      } else {
        // For specific amount repayment
        const amt = parseFloat(repayAmount);
        const baseUnits = BigInt(
          Math.floor(amt * Math.pow(10, coinCfg.decimals))
        );
        await txBlock.repayQuick(baseUnits, asset, obligationId);
      }

      // Execute the transaction
      setProcessingSteps((prev) => [
        ...prev,
        "Signing and sending transaction...",
      ]);

      // Use wallet to sign and execute the transaction with options to see effects
      const result = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: txBlock,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      console.log("Transaction result:", result);
      setProcessingSteps((prev) => [
        ...prev,
        "Transaction submitted to blockchain...",
      ]);

      // Check if the transaction succeeded using our improved detection logic
      const success = await detectTransactionSuccess(result);

      if (success) {
        setProcessingSteps((prev) => [
          ...prev,
          "Transaction completed successfully!",
        ]);

        // Transaction succeeded
        const successMessage = `Successfully ${
          isObligationLockedState ? "unlocked obligation and " : ""
        }repaid ${repayMaximum ? "maximum" : repayAmount} ${selectedAsset}`;

        setTransactionResult({
          success: true,
          message: successMessage,
          txHash: result.digest,
          txLink: `https://suivision.xyz/txblock/${result.digest}`,
          steps: [...processingSteps, "Transaction completed successfully!"],
        });

        // Update obligation lock status if it was locked
        if (isObligationLockedState) {
          setIsObligationLocked(false);
        }

        // If a success callback was provided, call it
        if (onSuccess) {
          onSuccess();
        }

        // Refresh data after a short delay
        setTimeout(() => {
          fetchUserPortfolioData(obligationId);
          fetchWalletCoins();
        }, 2000);
      } else {
        // Transaction failed
        const errorCode = result.effects?.status?.error || "Unknown error";

        setProcessingSteps((prev) => [
          ...prev,
          `Transaction failed: ${errorCode}`,
        ]);

        // Check for error 770 specifically
        if (errorCode.includes("770") || errorCode.includes("locked")) {
          setError(
            `Transaction failed with error 770: Obligation is locked in a borrow incentive program. Please try again with the "Unlock & Repay" option.`
          );
        } else {
          setError(`Transaction failed: ${errorCode}`);
        }

        setTransactionResult({
          success: false,
          message: "Transaction Failed",
          txHash: result.digest,
          txLink: `https://suivision.xyz/txblock/${result.digest}`,
          error: errorCode,
          steps: processingSteps,
        });
      }
    } catch (err: any) {
      console.error("Error in atomic repayment transaction:", err);

      // Add error to steps
      setProcessingSteps((prev) => [
        ...prev,
        `Error: ${err.message || "Unknown error"}`,
      ]);

      // Provide more user-friendly error messages
      let errorMessage = err.message || String(err);

      if (errorMessage.includes("No obligation found for sender")) {
        errorMessage =
          "Could not find the obligation for your wallet. Please ensure you're using the correct wallet that owns this obligation.";
      } else if (errorMessage.includes("Insufficient balance")) {
        errorMessage = `You don't have enough ${selectedAsset} in your wallet to complete this transaction.`;
      } else if (
        errorMessage.includes("obligation locked") ||
        errorMessage.includes("770")
      ) {
        errorMessage = `This obligation is locked in a borrow incentive program and the unlock operation failed. Please try again using the "Unlock & Repay" option.`;
      } else if (errorMessage.includes("User rejected")) {
        errorMessage = "Transaction was cancelled by the user.";
      }

      setTransactionResult({
        success: false,
        message: `Error Processing Transaction`,
        error: errorMessage,
        steps: processingSteps,
      });

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form submission - using the right unlock+repay method based on obligation state
  const handleSubmit = async () => {
    return handleAtomicRepayment();
  };

  // Debug info and verification
  const handleVerifyCoinTypes = () => {
    console.log("Coin configuration:", COINS);
    console.table({
      "USDC name": COINS.USDC.name,
      "USDT name": COINS.USDT.name,
      "SUI name": COINS.SUI.name,
    });

    // Log the coin types we have in our account data
    const coinTypes = accountCoins.map((coin) => coin.coinType);
    console.log("Known wallet coin types from blockvision:", coinTypes);

    // Check if any match our expected USDC types
    const matchingUsdcTypes = coinTypes.filter((type) =>
      COINS.USDC.coinTypes.includes(type)
    );
    console.log("Matching USDC coin types:", matchingUsdcTypes);

    // Log SDK information
    console.log("Wallet connected:", wallet.connected);
    console.log("Wallet address:", wallet.address);
    console.log("Obligation ID:", obligationId);
    console.log("Obligation Locked:", isObligationLockedState);
    console.log("Obligation Details:", obligationDetails);

    // Log import verifications
    console.log(
      "repayUnlockedObligation imported properly:",
      typeof repayUnlockedObligation === "function"
    );
    console.log(
      "unlockAndRepay imported properly:",
      typeof unlockAndRepay === "function"
    );
    console.log(
      "isObligationLocked imported properly:",
      typeof isObligationLocked === "function"
    );

    // Check scallop SDK methods
    console.log(
      "Scallop createScallopBuilder available:",
      typeof scallop.createScallopBuilder === "function"
    );
  };

  // Navigate to Obligations tab
  const goToObligationsTab = () => {
    // Close this modal
    onClose();

    // Set a flag in localStorage to indicate we want to navigate to the obligations tab
    localStorage.setItem("navigateToObligations", "true");
    localStorage.setItem("scrollToObligationId", obligationId || "");
  };

  // Don't render if not open
  if (!onClose) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container borrowing-modal">
        <div className="modal-header">
          <h2>Repay Debt</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {isLoading || verifyingTransaction ? (
            <div className="loading-container">
              <span className="loader"></span>
              <p>Processing Repayment</p>
              <div className="processing-steps">
                {processingSteps.map((step, index) => (
                  <div key={index} className="processing-step">
                    {index === processingSteps.length - 1 ? (
                      <span className="current-step">➤ {step}</span>
                    ) : (
                      <span className="completed-step">✓ {step}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="small-text">
                This may take a moment while we process your transaction.
                {isObligationLockedState && (
                  <span className="unlock-notice">
                    The obligation will be unlocked first, then repaid.
                  </span>
                )}
              </p>
            </div>
          ) : isInitialLoading ? (
            <div className="loading-container">
              <span className="loader"></span>
              <p>Loading your debt information...</p>
            </div>
          ) : transactionResult ? (
            <div
              className={`result-container ${
                transactionResult.success ? "success" : "error"
              }`}
            >
              <h3>
                {transactionResult.success
                  ? "Transaction Successful"
                  : "Transaction Failed"}
              </h3>
              <p>{transactionResult.message}</p>

              {transactionResult.txHash && (
                <div className="tx-details">
                  <p>
                    Transaction Hash:{" "}
                    <span className="tx-hash">
                      {transactionResult.txHash.slice(0, 8)}...
                      {transactionResult.txHash.slice(-5)}
                    </span>
                  </p>
                  {transactionResult.txLink && (
                    <a
                      href={transactionResult.txLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                    >
                      View Transaction
                    </a>
                  )}
                </div>
              )}

              {transactionResult.error && (
                <div className="error-details">
                  <p className="error-message">
                    Error: {transactionResult.error}
                  </p>

                  {/* Show steps that were executed for error debugging */}
                  {transactionResult.steps &&
                    transactionResult.steps.length > 0 && (
                      <div className="executed-steps">
                        <p>
                          <strong>Steps Executed:</strong>
                        </p>
                        <ol>
                          {transactionResult.steps.map(
                            (step: string, i: number) => (
                              <li key={i}>{step}</li>
                            )
                          )}
                        </ol>
                      </div>
                    )}
                </div>
              )}

              <div className="action-buttons">
                {!transactionResult.success && isObligationLockedState && (
                  <button className="navigate-btn" onClick={goToObligationsTab}>
                    Go to Obligations Tab
                  </button>
                )}
                <button
                  className="primary-btn"
                  onClick={
                    transactionResult.success
                      ? onClose
                      : () => setTransactionResult(null)
                  }
                >
                  {transactionResult.success ? "Close" : "Try Again"}
                </button>
              </div>
            </div>
          ) : borrowedAssets.length === 0 ? (
            <div className="no-debt-container">
              <p>
                You don't have any outstanding debt to repay in this obligation.
              </p>
              <button className="primary-btn" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <>
              {isObligationLockedState && (
                <div className="locked-obligation-warning">
                  <LockIcon />
                  <div className="warning-text">
                    <strong>
                      This obligation is locked in a borrow incentive program
                      (Error 770)
                    </strong>
                    <p>
                      When an obligation is locked in the borrow incentive
                      program, you must unlock it before repaying. The repay
                      button below will handle this automatically by:
                    </p>
                    <ol>
                      <li>
                        First unlocking the obligation from the incentive
                        program
                      </li>
                      <li>Then repaying the selected debt amount</li>
                      <li>
                        Both operations will happen in a single transaction
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              <div className="section-title">
                <h3>Select Asset to Repay</h3>
              </div>

              <div className="asset-selector">
                <div className="asset-options">
                  {borrowedAssets.map((asset, idx) => (
                    <div
                      key={`borrowed-${asset.symbol}-${idx}`}
                      className={`asset-option ${
                        selectedAsset === asset.symbol ? "selected" : ""
                      }`}
                      onClick={() => handleAssetChange(asset.symbol)}
                    >
                      <img
                        src={
                          COINS[asset.symbol as keyof typeof COINS]?.icon ||
                          "/icons/default-coin.svg"
                        }
                        alt={asset.symbol}
                      />
                      {asset.symbol}
                    </div>
                  ))}

                  {/* Only show fallback if we explicitly know there are no borrowed assets */}
                  {borrowedAssets.length === 0 && !isInitialLoading && (
                    <>
                      <div
                        className={`asset-option ${
                          selectedAsset === "SUI" ? "selected" : ""
                        }`}
                        onClick={() => handleAssetChange("SUI")}
                      >
                        <img src="/icons/sui-icon.svg" alt="SUI" />
                        SUI
                      </div>
                      <div
                        className={`asset-option ${
                          selectedAsset === "USDC" ? "selected" : ""
                        }`}
                        onClick={() => handleAssetChange("USDC")}
                      >
                        <img src="/icons/usdc-icon.svg" alt="USDC" />
                        USDC
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="amount-section">
                <div className="label">Amount to Repay</div>
                <div className="input-container">
                  <input
                    type="text"
                    value={repayAmount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    className={`amount-input ${
                      repayMaximum ? "max-amount" : ""
                    }`}
                  />
                  <div className="button-group">
                    <button
                      className="safe-amount-btn"
                      onClick={handleUseSafeAmount}
                    >
                      Use Safe Amount
                    </button>
                    {currentDebt !== null && currentDebt > 0 && (
                      <button
                        className={`max-btn ${repayMaximum ? "active" : ""}`}
                        onClick={handleUseMaxAmount}
                      >
                        Max
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {repayMaximum && (
                <div className="max-repayment-notice">
                  <InfoIcon />
                  <span>
                    You will repay the maximum possible amount up to your full
                    debt of{" "}
                    {currentDebt !== null ? formatNumber(currentDebt, 6) : "0"}{" "}
                    {selectedAsset}
                  </span>
                </div>
              )}

              {/* Add obligation ID display if provided */}
              {obligationId && (
                <div className="obligation-info">
                  <div className="info-row">
                    <InfoIcon />
                    <span>
                      Obligation: {obligationId.slice(0, 8)}...
                      {obligationId.slice(-6)}
                      {isObligationLockedState && (
                        <span className="locked-indicator">
                          {" "}
                          🔒 Locked in Incentive Program
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="info-section">
                <div className="info-row">
                  <InfoIcon />
                  <span>
                    Current {selectedAsset} debt:{" "}
                    {currentDebt !== null
                      ? formatNumber(currentDebt, 6)
                      : "Loading..."}{" "}
                    {selectedAsset}
                  </span>
                </div>
                <div className="info-row">
                  <InfoIcon />
                  <span>
                    Wallet balance:{" "}
                    {walletBalance !== null
                      ? formatNumber(walletBalance, 6)
                      : "Loading..."}{" "}
                    {selectedAsset}
                  </span>
                </div>
                <div className="info-row">
                  <InfoIcon />
                  <span>
                    Current health factor:
                    <span
                      className={`health-factor ${
                        healthFactor !== null && healthFactor < 1.2
                          ? "warning"
                          : healthFactor !== null && healthFactor < 1.5
                          ? "caution"
                          : "good"
                      }`}
                    >
                      {healthFactor !== null
                        ? healthFactor > 99
                          ? "∞"
                          : formatNumber(healthFactor, 2)
                        : "Loading..."}
                    </span>
                  </span>
                </div>
              </div>

              <div className="wallet-status">
                <div className="status-indicator">
                  <span className="status-dot"></span>
                  Connected ({truncateAddress(wallet.address || "")})
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                className={`repay-btn ${
                  isObligationLockedState ? "unlock-repay-btn" : ""
                }`}
                onClick={handleSubmit}
                disabled={
                  !wallet.connected ||
                  isLoading ||
                  (!repayMaximum && repayAmount === "") ||
                  !currentDebt ||
                  currentDebt <= 0
                }
              >
                {isObligationLockedState
                  ? `Unlock & Repay ${
                      repayMaximum ? "Maximum" : repayAmount
                    } ${selectedAsset}`
                  : `Repay ${
                      repayMaximum ? "Maximum" : repayAmount
                    } ${selectedAsset}`}
              </button>

              <div className="debug-controls">
                <button
                  className="debug-btn"
                  onClick={() => setShowDebugInfo(!showDebugInfo)}
                >
                  {showDebugInfo ? "Hide Debug Info" : "Show Debug Info"}
                </button>
                <button
                  className="debug-btn verify-btn"
                  onClick={handleVerifyCoinTypes}
                >
                  Verify Implementation
                </button>
              </div>

              {showDebugInfo && (
                <div className="debug-info">
                  <p>Obligation ID: {obligationId || "None"}</p>
                  <p>Prop Obligation ID: {propObligationId || "None"}</p>
                  <p>
                    Obligation Locked: {isObligationLockedState ? "Yes" : "No"}
                  </p>
                  <p>Repay Maximum: {repayMaximum ? "Yes" : "No"}</p>
                  <p>
                    Current Debt:{" "}
                    {currentDebt !== null ? currentDebt.toFixed(6) : "N/A"}{" "}
                    {selectedAsset}
                  </p>
                  <p>
                    Wallet Balance (Combined):{" "}
                    {walletBalance !== null ? walletBalance.toFixed(6) : "N/A"}{" "}
                    {selectedAsset}
                  </p>
                  <h4>Asset Configuration:</h4>
                  <div className="asset-config">
                    <p>Selected Asset: {selectedAsset}</p>
                    <p>
                      Asset Name in SDK:{" "}
                      {COINS[selectedAsset as keyof typeof COINS]?.name}
                    </p>
                    <p>
                      Asset Decimals:{" "}
                      {COINS[selectedAsset as keyof typeof COINS]?.decimals}
                    </p>
                    <p>
                      Implementation: Using atomic transaction builder with
                      improved success detection
                    </p>
                  </div>
                  <h4>Transaction Implementation:</h4>
                  <div className="implementation-details">
                    <p>Atomic Transaction Flow for Locked Obligations:</p>
                    <pre>{`// Create transaction builder
const scallopBuilder = await scallop.createScallopBuilder();
const txBlock = scallopBuilder.createTxBlock();
txBlock.setSender(sender);

// 1. If obligation is locked, add unlock operation first
if (isObligationLockedState) {
  await txBlock.unstakeObligationQuick(obligationId, undefined);
}

// 2. Add repayment operation
await txBlock.repayQuick(amount, asset, obligationId);

// Execute the transaction
await wallet.signAndExecuteTransactionBlock({ 
  transactionBlock: txBlock,
  options: {
    showEffects: true,
    showEvents: true,
    showObjectChanges: true
  }
});`}</pre>
                    <p>Improved Transaction Success Detection:</p>
                    <pre>{`// Multiple methods to determine transaction success
const success = 
  // Method 1: Check effects.status if available
  (result.effects?.status?.status === "success") || 
  // Method 2: Check for absence of explicit errors
  !(result.effects?.status?.error) ||
  // Method 3: Check for repay events
  result.events?.some(event => 
    event.type?.includes('repay')
  );

// Method 4: If still unclear, verify by checking debt reduction
if (result.digest && !success) {
  const verified = await verifyTransactionSuccess(result.digest);
  if (verified) success = true;
}`}</pre>
                    <p>Updated: 2025-07-20 01:15:13 UTC</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <p className="disclaimer">
            {isObligationLockedState
              ? "When repaying a locked obligation, the system will first unlock it from the borrow incentive program, then repay your debt, all in one transaction."
              : "Repaying your debt will reduce your interest costs and improve your position's health factor."}
          </p>
        </div>
      </div>
    </div>
  );
};

export default RepaymentModal;
