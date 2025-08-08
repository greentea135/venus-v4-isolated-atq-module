import fetch from "node-fetch";
import { ContractTag, ITagService } from "atq-types";

// Define the subgraph URLs
const SUBGRAPH_URLS: Record<string, { decentralized: string }> = {
  // Ethereum Mainnet subgraph, https://docs-v4.venus.io/services/subgraphs
  "1": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/deployments/id/QmdRAV4dGT7nwNFnBCBJv323vxxiZrFPHNs6fArtroQb91",
  },
  // Optimism subgraph, https://docs-v4.venus.io/services/subgraphs
  "10": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/deployments/id/QmZCPnpJBSYuFgWhLAEyTkYmi4T9oi5yBrwykdyYqms17C",
  },
  // BSC subgraph, https://docs-v4.venus.io/services/subgraphs
  "56": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/deployments/id/QmfVBgxV6GYf48UZAeri8dcJQ3a18GfYxL5djMbyWN1yVP",
  },
  // Unichain subgraph, https://docs-v4.venus.io/services/subgraphs
  "130": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/deployments/id/QmQR91TB5GnZs45VJxhMJym376AX3g9J5GASwpNc6tS9bU",
  },
  // ZKsync subgraph, https://docs-v4.venus.io/services/subgraphs
  "324": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/deployments/id/Qmd3cebP8qSVrRHsgeukW2DkMo1AZocjkgibmToWkrpg93",
  },
  // Base subgraph, https://docs-v4.venus.io/services/subgraphs
  "8453": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/deployments/id/QmbU1et6jS3dWHb6nYYwktHZAeEe5BcWvFBLvMDYiXgXGH",
  },
  // Arbitrum subgraph, https://docs-v4.venus.io/services/subgraphs
  "42161": {
    decentralized:
      "https://gateway.thegraph.com/api/[api-key]/deployments/id/QmR65M75fibRfgkTmM5nSCBchJcJDUPwMt8a3BLMffw736",
  },
};

// Define the Market interface (updated schema)
interface Market {
  id: string;
  name: string;
  symbol: string;
  accrualBlockNumber: number;
}

// GraphQL response structure
interface GraphQLData {
  markets: Market[];
}

interface GraphQLResponse {
  data?: GraphQLData;
  errors?: { message: string }[];
}

// Headers
const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

// Updated query to use accrualBlockNumber
const GET_MARKETS_QUERY = `
query GetMarkets($lastBlock: Int) {
  markets(
    first: 1000,
    orderBy: accrualBlockNumber,
    orderDirection: asc,
    where: { accrualBlockNumber_gt: $lastBlock }
  ) {
    id
    name
    symbol
    accrualBlockNumber
  }
}
`;

// Error type guard
function isError(e: unknown): e is Error {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as Error).message === "string"
  );
}

// Invalid value check
function containsInvalidValue(text: string): boolean {
  const containsHtml = /<[^>]*>/.test(text);
  const isEmpty = text.trim() === "";
  return isEmpty || containsHtml;
}

// Truncate string
function truncateString(text: string, maxLength: number) {
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "...";
  }
  return text;
}

// Fetch data from GraphQL
async function fetchData(
  subgraphUrl: string,
  lastBlock: number
): Promise<Market[]> {
  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: GET_MARKETS_QUERY,
      variables: { lastBlock },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = (await response.json()) as GraphQLResponse;

  if (result.errors) {
    result.errors.forEach((error) => {
      console.error(`GraphQL error: ${error.message}`);
    });
    throw new Error("GraphQL errors occurred: see logs for details.");
  }

  if (!result.data || !result.data.markets) {
    throw new Error("No markets data found.");
  }

  return result.data.markets;
}

// Prepare URL with API key
function prepareUrl(chainId: string, apiKey: string): string {
  const urls = SUBGRAPH_URLS[chainId];
  if (!urls || isNaN(Number(chainId))) {
    const supportedChainIds = Object.keys(SUBGRAPH_URLS).join(", ");
    throw new Error(
      `Unsupported or invalid Chain ID provided: ${chainId}. Only the following values are accepted: ${supportedChainIds}`
    );
  }
  return urls.decentralized.replace("[api-key]", encodeURIComponent(apiKey));
}

// Transform market data to ContractTag[]
function transformMarketsToTags(chainId: string, markets: Market[]): ContractTag[] {
  const validMarkets: Market[] = [];
  const rejected: string[] = [];

  markets.forEach((market) => {
    const nameInvalid = containsInvalidValue(market.name);
    const symbolInvalid = containsInvalidValue(market.symbol);

    if (nameInvalid || symbolInvalid) {
      if (nameInvalid) {
        rejected.push(`Market: ${market.id} rejected due to invalid name - Name: ${market.name}`);
      }
      if (symbolInvalid) {
        rejected.push(`Market: ${market.id} rejected due to invalid symbol - Symbol: ${market.symbol}`);
      }
    } else {
      validMarkets.push(market);
    }
  });

  if (rejected.length > 0) {
    console.log("Rejected markets:", rejected);
  }

  return validMarkets.map((market) => {
    const truncatedSymbol = truncateString(market.symbol, 44);

    return {
      "Contract Address": `eip155:${chainId}:${market.id}`,
      "Public Name Tag": `${truncatedSymbol} Token`,
      "Project Name": "Venus v4",
      "UI/Website Link": "https://venus.io/",
      "Public Note": `Venus v4's official ${market.name} token (Isolated)`,
    };
  });
}

// Main logic class
class TagService implements ITagService {
  returnTags = async (
    chainId: string,
    apiKey: string
  ): Promise<ContractTag[]> => {
    let allTags: ContractTag[] = [];
    let lastBlock: number = 0;
    let isMore = true;

    const url = prepareUrl(chainId, apiKey);

    while (isMore) {
      try {
        const markets = await fetchData(url, lastBlock);
        const tags = transformMarketsToTags(chainId, markets);
        allTags.push(...tags);

        isMore = markets.length === 1000;
        if (isMore) {
          lastBlock = Math.max(...markets.map((m) => m.accrualBlockNumber));
        }
      } catch (error) {
        if (isError(error)) {
          console.error(`An error occurred: ${error.message}`);
          throw new Error(`Failed fetching data: ${error}`);
        } else {
          console.error("An unknown error occurred.");
          throw new Error("An unknown error occurred during fetch operation.");
        }
      }
    }

    return allTags;
  };
}

// Create and export the returnTags method
const tagService = new TagService();
export const returnTags = tagService.returnTags;

