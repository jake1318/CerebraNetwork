declare module "@7kprotocol/sdk-ts" {
  import { SuiClient } from "@mysten/sui/client";
  import { Transaction } from "@mysten/sui/transactions";

  export function setSuiClient(client: SuiClient): void;
  export function getSuiClient(): SuiClient;

  export interface QuoteParams {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    sources?: string[];
  }

  export interface QuoteResponse {
    protocol: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    outAmount: string;
    data: any;
    price: number;
    priceImpact: number;
    gasFee?: number;
  }

  export interface BuildTxParams {
    quoteResponse: QuoteResponse;
    accountAddress: string;
    slippage: number;
    commission: {
      partner: string;
      commissionBps: number;
    };
    extendTx?: {
      tx: Transaction;
      coinIn?: any;
    };
  }

  export interface BuildTxResult {
    tx: Transaction;
    coinOut?: string;
  }

  export function getQuote(params: QuoteParams): Promise<QuoteResponse>;
  export function buildTx(params: BuildTxParams): Promise<BuildTxResult>;
  export function estimateGasFee(params: BuildTxParams): Promise<number>;
  export function getTokenPrice(address: string): Promise<number>;
  export function getTokenPrices(
    addresses: string[]
  ): Promise<{ [key: string]: number }>;
  export function getSuiPrice(): Promise<number>;
  export function getSwapHistory(params: {
    owner: string;
    offset: number;
    limit: number;
    tokenPair?: string;
  }): Promise<any>;
}
