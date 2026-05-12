import algosdk from "algosdk";

export const ORA_ASA_ID = Number(process.env.NEXT_PUBLIC_ORA_ASA_ID ?? "1284444444");
export const ORA_APP_ID = Number(process.env.NEXT_PUBLIC_ORA_APP_ID ?? "1284326447");
export const ALGOD_SERVER = process.env.NEXT_PUBLIC_ALGOD_SERVER ?? "https://mainnet-api.algonode.cloud";
export const INDEXER_SERVER = process.env.NEXT_PUBLIC_INDEXER_SERVER ?? "https://mainnet-idx.algonode.cloud";

export const algodClient = new algosdk.Algodv2("", ALGOD_SERVER, "");
export const indexerClient = new algosdk.Indexer("", INDEXER_SERVER, "");
