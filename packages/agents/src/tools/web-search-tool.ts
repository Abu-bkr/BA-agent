import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string, limit: number): Promise<SearchResult[]>;
}

export class MockSearchProvider implements SearchProvider {
  async search(query: string, limit: number): Promise<SearchResult[]> {
    return [
      {
        title: `Mock search result for ${query}`,
        url: "https://example.com/mock-search-result",
        snippet: "This is a mock result. Configure a real SearchProvider when available.",
      },
    ].slice(0, limit);
  }
}

const inputSchema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(10).default(5),
});

export function createWebSearchTool(provider: SearchProvider = new MockSearchProvider()) {
  return new DynamicStructuredTool({
    name: "web_search",
    description: "Search the web through the configured search provider.",
    schema: inputSchema,
    func: async ({ query, limit }) => JSON.stringify(await provider.search(query, limit)),
  });
}

export const webSearchTool = createWebSearchTool();