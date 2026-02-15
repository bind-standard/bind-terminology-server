import type { Fetcher } from "@cloudflare/workers-types";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { z } from "zod";
import { loadAllCodeSystems, loadCodeSystem, summarize } from "../lib/loader.js";

type Bindings = {
  ASSETS: Fetcher;
};

function createMcpServer(assets: Fetcher): McpServer {
  const server = new McpServer({
    name: "bind-terminology-server",
    version: "0.1.0",
  });

  // Tool: list all code systems
  server.registerTool("list-code-systems", {
    title: "List Code Systems",
    description: "Returns a summary of every available code system including id, url, name, title, status, and concept count.",
  }, async () => {
    const systems = await loadAllCodeSystems(assets);
    const summaries = systems.map(summarize);
    return {
      content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }],
    };
  });

  // Tool: get a full code system by ID
  server.registerTool("get-code-system", {
    title: "Get Code System",
    description: "Returns the full code system resource including all concepts. Optionally localize display values to a given language.",
    inputSchema: {
      id: z.string().describe("Code system ID, e.g. 'roof-type'"),
      lang: z.string().optional().describe("BCP-47 language code for localized display, e.g. 'fr-CA'"),
    },
  }, async ({ id, lang }) => {
    const cs = await loadCodeSystem(assets, id);
    if (!cs) {
      return { content: [{ type: "text", text: `CodeSystem '${id}' not found.` }], isError: true };
    }
    if (lang) {
      const localized = {
        ...cs,
        concept: cs.concept.map((c) => {
          const d = c.designation?.find((d) => d.language === lang);
          if (!d) return c;
          const hasDefault = c.designation?.some((d) => d.language === "en");
          const designation = hasDefault
            ? c.designation
            : [{ language: "en", value: c.display }, ...(c.designation ?? [])];
          return { ...c, display: d.value, designation };
        }),
      };
      return { content: [{ type: "text", text: JSON.stringify(localized, null, 2) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(cs, null, 2) }] };
  });

  // Tool: look up a single concept by code
  server.registerTool("lookup-code", {
    title: "Lookup Code",
    description: "Look up a single concept by code within a specific code system.",
    inputSchema: {
      id: z.string().describe("Code system ID, e.g. 'roof-type'"),
      code: z.string().describe("Concept code to look up, e.g. 'metal'"),
      lang: z.string().optional().describe("BCP-47 language code for localized display"),
    },
  }, async ({ id, code, lang }) => {
    const cs = await loadCodeSystem(assets, id);
    if (!cs) {
      return { content: [{ type: "text", text: `CodeSystem '${id}' not found.` }], isError: true };
    }
    const concept = cs.concept.find((c) => c.code === code);
    if (!concept) {
      return { content: [{ type: "text", text: `Code '${code}' not found in CodeSystem '${id}'.` }], isError: true };
    }
    const d = lang ? concept.designation?.find((d) => d.language === lang) : undefined;
    const display = d ? d.value : concept.display;
    const hasDefault = concept.designation?.some((d) => d.language === "en");
    const designation = d && !hasDefault
      ? [{ language: "en", value: concept.display }, ...(concept.designation ?? [])]
      : concept.designation;
    const result = {
      system: cs.url,
      code: concept.code,
      display,
      definition: concept.definition ?? "",
      designation,
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  // Tool: search across all code systems
  server.registerTool("search", {
    title: "Search Code Systems",
    description: "Full-text search for concepts by code, display, or designation across all code systems.",
    inputSchema: {
      q: z.string().describe("Search query, e.g. 'shingle'"),
      lang: z.string().optional().describe("BCP-47 language code for localized display"),
    },
  }, async ({ q, lang }) => {
    const query = q.toLowerCase();
    const systems = await loadAllCodeSystems(assets);
    const results: Array<{
      system: string;
      code: string;
      display: string;
      definition: string;
    }> = [];

    for (const cs of systems) {
      for (const concept of cs.concept) {
        const designationMatch = concept.designation?.some((d) =>
          d.value.toLowerCase().includes(query),
        );
        if (
          concept.code.toLowerCase().includes(query) ||
          concept.display.toLowerCase().includes(query) ||
          designationMatch
        ) {
          const match = lang ? concept.designation?.find((d) => d.language === lang) : undefined;
          const display = match ? match.value : concept.display;
          results.push({
            system: cs.url,
            code: concept.code,
            display,
            definition: concept.definition ?? "",
          });
        }
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  // Resource: individual code system by ID
  server.registerResource(
    "code-system",
    new ResourceTemplate("codesystem://{id}", {
      list: async () => {
        const systems = await loadAllCodeSystems(assets);
        return {
          resources: systems.map((cs) => ({
            uri: `codesystem://${cs.id}`,
            name: cs.title,
            description: cs.description,
            mimeType: "application/json" as const,
          })),
        };
      },
    }),
    {
      title: "Code System",
      description: "A BIND terminology code system with all its concepts.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const cs = await loadCodeSystem(assets, id as string);
      if (!cs) {
        return { contents: [{ uri: uri.href, text: `CodeSystem '${id}' not found.` }] };
      }
      return { contents: [{ uri: uri.href, text: JSON.stringify(cs, null, 2) }] };
    },
  );

  return server;
}

const mcp = new Hono<{ Bindings: Bindings }>();

mcp.all("/", async (c) => {
  const mcpServer = createMcpServer(c.env.ASSETS);
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

export { mcp };
