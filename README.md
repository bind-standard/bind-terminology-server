# BIND Terminology Server

Terminology server for the [BIND Standard](https://bind-standard.org) — the open data model for insurance interoperability.

**Live:** [bind.codes](https://bind.codes)

## What This Is

The [BIND Standard](https://bind-standard.org) models insurance data using `CodeableConcept` fields bound to terminology URIs. This server hosts the canonical code systems behind those URIs — 280+ insurance vocabularies covering lines of business, construction types, loss causes, coverage options, vehicle classifications, and more.

Each code system is a JSON file following a simplified [FHIR CodeSystem](https://www.hl7.org/fhir/codesystem.html) shape. Git is the authoring and review workflow — no database.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List all code systems (summary) |
| `GET` | `/:id` | Full code system with all concepts |
| `GET` | `/:id/$lookup?code=X` | Single concept lookup by code |
| `GET` | `/$search?q=X` | Full-text search across all systems |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Interactive API documentation (Scalar) |

All endpoints accept an optional `?lang=` parameter (BCP-47 tag, e.g. `fr-CA`) to localize concept display values.

### Examples

```bash
# List all code systems
curl https://bind.codes/

# Get a full code system
curl https://bind.codes/roof-type

# Look up a single code
curl https://bind.codes/roof-type/\$lookup?code=metal

# Search across all code systems
curl https://bind.codes/\$search?q=shingle

# Get French-Canadian display values
curl https://bind.codes/construction-type?lang=fr-CA
```

## MCP (Model Context Protocol)

The server exposes an MCP endpoint for AI agents and LLM tool-use at `POST /mcp` using [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http).

Add it to your MCP client config:

```json
{
  "mcpServers": {
    "bind-terminology": {
      "type": "streamable-http",
      "url": "https://bind.codes/mcp"
    }
  }
}
```

Available tools: `list-code-systems`, `get-code-system`, `lookup-code`, `search`.

## Code System Shape

Each file in `codesystems/` follows this structure:

```json
{
  "resourceType": "CodeSystem",
  "id": "roof-type",
  "url": "https://bind.codes/roof-type",
  "name": "RoofType",
  "title": "Roof Type",
  "status": "draft",
  "language": "en",
  "description": "Roof material types for property insurance underwriting.",
  "concept": [
    {
      "code": "asphalt-shingle",
      "display": "Asphalt Shingle",
      "definition": "Standard asphalt/composite shingle roofing.",
      "designation": [
        { "language": "fr-CA", "value": "Bardeau d'asphalte" }
      ]
    }
  ]
}
```

Translations use the FHIR `designation` pattern — an array of `{ language, value }` entries on each concept.

## Stack

- [Hono](https://hono.dev) + [Zod OpenAPI](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) for the REST API
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) + [@hono/mcp](https://github.com/honojs/middleware/tree/main/packages/mcp) for the MCP endpoint
- [Cloudflare Workers](https://workers.cloudflare.com) for hosting
- [Scalar](https://scalar.com) for interactive API docs

## Development

```bash
pnpm install
pnpm run dev        # starts wrangler dev server on localhost:8787
pnpm run validate   # validate all code system JSON files
pnpm run typecheck  # TypeScript type checking
pnpm run check      # Biome lint + format check
```

## Adding a Code System

1. Create a new JSON file in `codesystems/` following the shape above
2. Add the filename to `codesystems/_manifest.json`
3. Run `pnpm run validate` to check the file
4. Open a PR

## Contributing

We welcome contributions from everyone. See [CONTRIBUTING.md](CONTRIBUTING.md) for details, or open a pull request directly.

For questions or ideas, reach out at **contact@bind-standard.org**.

## License

The BIND terminology data is released under the [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) license — dedicated to the public domain. You are free to use, modify, and build upon it without restriction.
