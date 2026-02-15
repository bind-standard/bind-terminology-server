import type { Fetcher } from "@cloudflare/workers-types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { codesystem } from "./routes/codesystem.js";
import { mcp } from "./routes/mcp.js";

type Bindings = {
  ASSETS: Fetcher;
};

const app = new OpenAPIHono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.doc("/api/spec", {
  openapi: "3.0.0",
  info: {
    title: "BIND Terminology Server",
    version: "0.1.0",
    description: [
      "Terminology server for the [BIND Standard](https://bind-standard.org) — the open data model for insurance interoperability.",
      "",
      "BIND defines typed resources like Policy, Claim, Coverage, and Submission using `CodeableConcept` fields bound to terminology URIs. This server hosts the canonical code systems behind those URIs, providing lookup, search, and listing across 280+ insurance vocabularies with French-Canadian (fr-CA) locale support.",
      "",
      "## MCP (Model Context Protocol)",
      "",
      "This server also exposes an MCP endpoint for AI agents and LLM tool-use at `POST /mcp` using [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http).",
      "",
      "Available MCP tools: `list-code-systems`, `get-code-system`, `lookup-code`, `search`.",
      "",
      "```json",
      '{',
      '  "mcpServers": {',
      '    "bind-terminology": {',
      '      "type": "streamable-http",',
      '      "url": "https://bind.codes/mcp"',
      '    }',
      '  }',
      '}',
      "```",
    ].join("\n"),
  },
});

app.route("/mcp", mcp);


app.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>BIND Terminology Server — API Docs</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/spec"
      data-configuration='${JSON.stringify({
        metaData: {
          title: "BIND Terminology Server",
          description: "Code systems for the BIND insurance standard",
          ogTitle: "BIND Terminology Server — API Docs",
        },
        favicon: "https://bind-standard.org/favicon.ico",
      })}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
  return c.html(html);
});

app.route("/", codesystem);

export default app;
