import type { Fetcher } from "@cloudflare/workers-types";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { loadAllCodeSystems, loadCodeSystem, summarize } from "../lib/loader.js";
import type { CodeSystemConcept } from "../schemas/codesystem.js";
import {
  CodeSystemSchema,
  CodeSystemSummarySchema,
  ErrorSchema,
  LookupResultSchema,
} from "../schemas/codesystem.js";

type Bindings = {
  ASSETS: Fetcher;
};

const codesystem = new OpenAPIHono<{ Bindings: Bindings }>();

function localizeConcepts(concepts: CodeSystemConcept[], lang?: string, defaultLang = "en"): CodeSystemConcept[] {
  if (!lang) return concepts;
  return concepts.map((c) => {
    const d = c.designation?.find((d) => d.language === lang);
    if (!d) return c;
    const hasDefault = c.designation?.some((d) => d.language === defaultLang);
    const designation = hasDefault
      ? c.designation
      : [{ language: defaultLang, value: c.display }, ...(c.designation ?? [])];
    return { ...c, display: d.value, designation };
  });
}

// GET / — list all code systems
const listRoute = createRoute({
  method: "get",
  path: "/list",
  summary: "List all code systems",
  description: "Returns a summary of every available code system.",
  responses: {
    200: {
      description: "Array of code system summaries",
      content: {
        "application/json": {
          schema: z.array(CodeSystemSummarySchema),
        },
      },
    },
  },
});

codesystem.openapi(listRoute, async (c) => {
  const systems = await loadAllCodeSystems(c.env.ASSETS);
  return c.json(systems.map(summarize), 200);
});

// GET /$search?q=X — full-text search across all systems
const searchRoute = createRoute({
  method: "get",
  path: "/$search",
  summary: "Search across all code systems",
  description: "Full-text search for concepts by code or display across all code systems.",
  request: {
    query: z.object({
      q: z.string().openapi({ description: "Search query", example: "shingle" }),
      lang: z
        .string()
        .optional()
        .openapi({ description: "Language code for localized display", example: "es" }),
    }),
  },
  responses: {
    200: {
      description: "Matching concepts",
      content: {
        "application/json": {
          schema: z.array(LookupResultSchema),
        },
      },
    },
    400: {
      description: "Missing query parameter",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

codesystem.openapi(searchRoute, async (c) => {
  const { q, lang } = c.req.valid("query");
  const query = q.toLowerCase();

  const systems = await loadAllCodeSystems(c.env.ASSETS);
  const results: Array<{
    system: string;
    code: string;
    display: string;
    definition: string;
    designation?: Array<{ language: string; value: string }>;
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
        const localized = localizeConcepts([concept], lang)[0];
        results.push({
          system: cs.url,
          code: localized.code,
          display: localized.display,
          definition: localized.definition ?? "",
          designation: localized.designation,
        });
      }
    }
  }

  return c.json(results, 200);
});

// GET /:id/$lookup?code=X — single concept lookup
const lookupRoute = createRoute({
  method: "get",
  path: "/{id}/$lookup",
  summary: "Look up a concept",
  description: "Look up a single concept by code within a specific code system.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Code system ID", example: "roof-type" }),
    }),
    query: z.object({
      code: z.string().openapi({ description: "Concept code to look up", example: "metal" }),
      lang: z
        .string()
        .optional()
        .openapi({ description: "Language code for localized display", example: "es" }),
    }),
  },
  responses: {
    200: {
      description: "The matching concept",
      content: {
        "application/json": {
          schema: LookupResultSchema,
        },
      },
    },
    400: {
      description: "Missing query parameter",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: "Code system or concept not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

codesystem.openapi(lookupRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { code, lang } = c.req.valid("query");

  const cs = await loadCodeSystem(c.env.ASSETS, id);
  if (!cs) {
    return c.json({ error: `CodeSystem '${id}' not found` }, 404);
  }

  const concept = cs.concept.find((concept) => concept.code === code);
  if (!concept) {
    return c.json({ error: `Code '${code}' not found in CodeSystem '${id}'` }, 404);
  }

  const localized = localizeConcepts([concept], lang)[0];

  return c.json(
    {
      system: cs.url,
      code: localized.code,
      display: localized.display,
      definition: localized.definition ?? "",
      designation: localized.designation,
    },
    200,
  );
});

// GET /:id — full code system
const getRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "Get a code system",
  description: "Returns the full code system resource including all concepts.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Code system ID", example: "roof-type" }),
    }),
    query: z.object({
      lang: z
        .string()
        .optional()
        .openapi({ description: "Language code for localized display", example: "es" }),
    }),
  },
  responses: {
    200: {
      description: "The full code system",
      content: {
        "application/json": {
          schema: CodeSystemSchema,
        },
      },
    },
    404: {
      description: "Code system not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

codesystem.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { lang } = c.req.valid("query");
  const cs = await loadCodeSystem(c.env.ASSETS, id);

  if (!cs) {
    return c.json({ error: `CodeSystem '${id}' not found` }, 404);
  }

  if (lang) {
    return c.json({ ...cs, concept: localizeConcepts(cs.concept, lang) }, 200);
  }

  return c.json(cs, 200);
});

export { codesystem };
