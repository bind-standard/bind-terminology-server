import { z } from "@hono/zod-openapi";

export const DesignationSchema = z
  .object({
    language: z.string(),
    value: z.string(),
  })
  .openapi("Designation");

export const CodeSystemConceptSchema = z
  .object({
    code: z.string(),
    display: z.string(),
    definition: z.string().optional().default(""),
    designation: z.array(DesignationSchema).optional(),
  })
  .openapi("CodeSystemConcept");

export const CodeSystemSchema = z
  .object({
    resourceType: z.literal("CodeSystem"),
    id: z.string(),
    url: z.string(),
    name: z.string(),
    title: z.string(),
    status: z.string(),
    language: z.string().optional().default("en"),
    description: z.string(),
    concept: z.array(CodeSystemConceptSchema),
  })
  .openapi("CodeSystem");

export const CodeSystemSummarySchema = z
  .object({
    id: z.string(),
    url: z.string(),
    name: z.string(),
    title: z.string(),
    status: z.string(),
    count: z.number().optional(),
  })
  .openapi("CodeSystemSummary");

export const LookupResultSchema = z
  .object({
    system: z.string(),
    code: z.string(),
    display: z.string(),
    definition: z.string(),
    designation: z.array(DesignationSchema).optional(),
  })
  .openapi("LookupResult");

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

export type Designation = z.infer<typeof DesignationSchema>;
export type CodeSystemConcept = z.infer<typeof CodeSystemConceptSchema>;
export type CodeSystem = z.infer<typeof CodeSystemSchema>;
export type CodeSystemSummary = z.infer<typeof CodeSystemSummarySchema>;
export type LookupResult = z.infer<typeof LookupResultSchema>;
