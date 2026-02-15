/**
 * convert-terminologies.ts
 *
 * Reads source terminology data (top-level JSON arrays and code-list JSON objects)
 * and converts them into BIND CodeSystem JSON files with locale support.
 *
 * Usage:  npx tsx scripts/convert-terminologies.ts
 *
 * Idempotent — safe to re-run. Existing hand-curated code systems are preserved;
 * only new concepts that don't already exist are appended.
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SOURCE_ROOT = join(
  homedir(),
  "Downloads",
  "CSIO_XML_Standards_Release_1.49",
  "bind-opps",
  "terminology",
);
const SOURCE_CODE_LISTS = join(SOURCE_ROOT, "code-lists");

const PROJECT_ROOT = join(import.meta.dirname, "..");
const CODESYSTEMS_DIR = join(PROJECT_ROOT, "codesystems");
const MAPPING_DIR = join(PROJECT_ROOT, ".mapping");
const MAPPING_FILE = join(MAPPING_DIR, "source-mapping.json");
const GITIGNORE_PATH = join(PROJECT_ROOT, ".gitignore");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in a top-level source file (simple array format). */
interface TopLevelEntry {
  code: string;
  display?: string;
}

/** A single code inside a code-list source file. */
interface CodeListCode {
  code: string;
  display: string;
  owner?: string;
  display_fr?: string;
  sub_code_list?: string;
  revision?: string;
  deprecated?: boolean;
}

/** The shape of a code-list source file. */
interface CodeListFile {
  code_list_name: string;
  relationship?: string;
  total_codes?: number;
  acord_codes?: number;
  csio_codes?: number;
  unknown_codes?: number;
  used_by?: string[];
  codes: CodeListCode[];
}

/** A BIND CodeSystem concept with optional French designation. */
interface BindConcept {
  code: string;
  display: string;
  definition: string;
  designation?: Array<{ language: string; value: string }>;
}

/** A BIND CodeSystem resource. */
interface BindCodeSystem {
  resourceType: "CodeSystem";
  id: string;
  url: string;
  name: string;
  title: string;
  status: "draft" | "active" | "retired" | "unknown";
  language?: string;
  description: string;
  concept: BindConcept[];
}

/** One entry in our private source-mapping. */
interface MappingEntry {
  bindCode: string;
  sourceCode: string;
  sourceFile: string;
  codeSystemId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert PascalCase / camelCase to kebab-case. */
function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/** Convert a kebab-case id to PascalCase name. */
function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/** Convert a kebab-case id to a human-friendly title. */
function toTitle(kebab: string): string {
  return kebab
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/**
 * Generate a kebab-case slug from a display string.
 * Used when the original code is purely numeric.
 */
function displayToSlug(display: string): string {
  return display
    .replace(/&amp;/g, "and")
    .replace(/&/g, "and")
    .replace(/['']/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Strip external prefixes from codes (e.g. "csio:AUTO" → "AUTO", "csio:csio:X" → "X"). */
function stripPrefix(code: string): string {
  let result = code;
  // Repeatedly strip known prefixes
  while (result.startsWith("csio:") || result.startsWith("acord:")) {
    result = result.replace(/^(?:csio|acord):/, "");
  }
  return result;
}

/** True when a string is purely numeric (including codes like "501"). */
function isNumericOnly(code: string): boolean {
  return /^\d+$/.test(code);
}

/** Clean display text: remove "DEPRECATED" prefix. */
function cleanDisplay(display: string): string {
  return display
    .replace(/^DEPRECATED\s*/i, "")
    .replace(/^DÉSUET\s*/i, "")
    .trim();
}

/** Generate a short definition from the display text. */
function generateDefinition(display: string, codeSystemTitle: string): string {
  const clean = cleanDisplay(display);
  return `${clean} — ${codeSystemTitle.toLowerCase()} code.`;
}

/**
 * Derive a BIND-native code from a source code.
 * - Strip external prefixes
 * - If numeric-only, derive a kebab-case slug from the display text
 */
function deriveBINDCode(
  sourceCode: string,
  display: string | undefined,
): string {
  const stripped = stripPrefix(sourceCode);

  if (isNumericOnly(stripped) && display) {
    const slug = displayToSlug(cleanDisplay(display));
    return slug || stripped; // fallback to numeric if slug is empty
  }

  return stripped;
}

// ---------------------------------------------------------------------------
// Mapping between source filenames and BIND code-system IDs
// ---------------------------------------------------------------------------

/**
 * Maps top-level source filenames (without extension) to the BIND code-system
 * id. If there is no special override the id is the filename itself.
 */
const TOP_LEVEL_ID_MAP: Record<string, string> = {
  "lines-of-business": "line-of-business",
  "construction-types": "construction-type",
  "loss-cause-codes": "loss-cause",
  "coverage-options": "coverage-option",
  "commodity-codes": "commodity-code",
  "conviction-codes": "conviction-code",
  "driving-record-codes": "driving-record-code",
  "exposure-types": "exposure-type",
  "occupancy-types": "occupancy-type",
  "occupation-classes": "occupation-class",
  "policy-status-codes": "policy-status",
  "policy-types": "policy-type",
  "premium-base-codes": "premium-base",
  "producer-roles": "producer-role",
  "protection-devices": "protection-device",
  "risk-types": "risk-type",
  "role-types": "role-type",
  "sub-risk-types": "sub-risk-type",
  "underwriting-questions": "underwriting-question",
  "vehicle-body-types": "vehicle-body-type",
  "vehicle-special-use": "vehicle-special-use",
  coverages: "coverage",
  "claims-party-roles": "claims-party-role",
  "insured-principal-roles": "insured-principal-role",
  "electrical-protection": "electrical-protection",
  "mercantile-business-types": "mercantile-business-type",
  "nature-of-business": "nature-of-business",
};

/**
 * Maps code-list `code_list_name` values to BIND code-system ids.
 * Provides association between code-list files and top-level code systems.
 */
const CODE_LIST_TO_TOP_LEVEL: Record<string, string> = {
  LineOfBusiness: "line-of-business",
  LineOfBusinessSubCode: "line-of-business-sub-code",
  BroadLineBusiness: "broad-line-business",
  ConstructionType: "construction-type",
  CauseOfLoss: "cause-of-loss",
  RoofMaterialType: "roof-material-type",
  RoofGeometryType: "roof-geometry-type",
  RoofCoverAttachment: "roof-cover-attachment",
  RoofDeckAttachment: "roof-deck-attachment",
  RoofDeckMaterial: "roof-deck-material",
  RoofWallAttachment: "roof-wall-attachment",
  VehicleBodyType: "vehicle-body-type",
};

// Files to skip (they're metadata, not code lists)
const SKIP_FILES = new Set([
  "code-list-summary.json",
  "acord-csio-unified.json",
]);

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/** All mapping entries accumulated during the run. */
const mappings: MappingEntry[] = [];

/**
 * Read and parse all top-level source files. Returns a map of
 * codeSystemId → array of top-level entries.
 */
async function readTopLevelFiles(): Promise<Map<string, TopLevelEntry[]>> {
  const result = new Map<string, TopLevelEntry[]>();
  const files = (await readdir(SOURCE_ROOT)).filter(
    (f) => f.endsWith(".json") && !SKIP_FILES.has(f),
  );

  for (const file of files) {
    const stem = file.replace(/\.json$/, "");
    const id = TOP_LEVEL_ID_MAP[stem] ?? stem;

    const raw = await readFile(join(SOURCE_ROOT, file), "utf-8");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`  WARN  Skipping ${file}: invalid JSON`);
      continue;
    }

    // Top-level files are arrays
    if (!Array.isArray(data)) {
      continue;
    }

    result.set(id, data as TopLevelEntry[]);
  }

  return result;
}

/**
 * Read and parse all code-list files. Returns a map of
 * codeSystemId → CodeListFile.
 */
async function readCodeListFiles(): Promise<Map<string, CodeListFile>> {
  const result = new Map<string, CodeListFile>();
  const files = (await readdir(SOURCE_CODE_LISTS)).filter((f) =>
    f.endsWith(".json"),
  );

  for (const file of files) {
    const raw = await readFile(join(SOURCE_CODE_LISTS, file), "utf-8");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`  WARN  Skipping code-list ${file}: invalid JSON`);
      continue;
    }

    const cl = data as CodeListFile;
    if (!cl.code_list_name || !Array.isArray(cl.codes)) {
      continue;
    }

    const id =
      CODE_LIST_TO_TOP_LEVEL[cl.code_list_name] ??
      toKebabCase(cl.code_list_name);
    result.set(id, cl);
  }

  return result;
}

/**
 * Load an existing BIND code system from disk, or return null if it does
 * not exist.
 */
async function loadExistingCodeSystem(
  id: string,
): Promise<BindCodeSystem | null> {
  const path = join(CODESYSTEMS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;

  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as BindCodeSystem;
}

/**
 * Build a CodeSystem from a code-list file, enriched with matching
 * top-level entries when available.
 */
function buildFromCodeList(
  id: string,
  cl: CodeListFile,
  topLevelEntries: TopLevelEntry[] | undefined,
  existingCS: BindCodeSystem | null,
): BindCodeSystem {
  const title = toTitle(id);
  const name = toPascalCase(id);

  // Collect existing codes to avoid duplicates
  const existingCodes = new Set<string>();
  if (existingCS) {
    for (const c of existingCS.concept) {
      existingCodes.add(c.code);
    }
  }

  // Build a lookup from stripped source code → top-level entry for enrichment
  const topLevelLookup = new Map<string, TopLevelEntry>();
  if (topLevelEntries) {
    for (const entry of topLevelEntries) {
      const stripped = stripPrefix(entry.code);
      topLevelLookup.set(stripped, entry);
    }
  }

  // De-duplicate codes from the code-list itself.
  // Prefer non-deprecated versions if there are duplicates.
  const seenCodes = new Map<string, CodeListCode>();
  for (const code of cl.codes) {
    const bindCode = deriveBINDCode(code.code, code.display);
    const existing = seenCodes.get(bindCode);
    if (!existing) {
      seenCodes.set(bindCode, code);
    } else if (
      existing.deprecated &&
      !code.deprecated &&
      !code.display.startsWith("DEPRECATED")
    ) {
      seenCodes.set(bindCode, code);
    }
  }

  const newConcepts: BindConcept[] = [];
  const newBindCodes = new Set<string>();

  for (const [bindCode, code] of seenCodes) {
    // Skip deprecated entries
    if (code.deprecated || code.display.startsWith("DEPRECATED")) {
      // Still record the mapping
      mappings.push({
        bindCode,
        sourceCode: code.code,
        sourceFile: `code-lists/${toKebabCase(cl.code_list_name)}.json`,
        codeSystemId: id,
      });
      continue;
    }

    // Skip if already exists in the code system
    if (existingCodes.has(bindCode) || newBindCodes.has(bindCode)) {
      mappings.push({
        bindCode,
        sourceCode: code.code,
        sourceFile: `code-lists/${toKebabCase(cl.code_list_name)}.json`,
        codeSystemId: id,
      });
      continue;
    }

    const display = cleanDisplay(code.display);
    const definition = generateDefinition(code.display, title);

    const concept: BindConcept = {
      code: bindCode,
      display,
      definition,
    };

    // Add French designation if available
    if (code.display_fr) {
      const frClean = cleanDisplay(code.display_fr);
      if (frClean) {
        concept.designation = [{ language: "fr-CA", value: frClean }];
      }
    }

    newConcepts.push(concept);
    newBindCodes.add(bindCode);

    mappings.push({
      bindCode,
      sourceCode: code.code,
      sourceFile: `code-lists/${toKebabCase(cl.code_list_name)}.json`,
      codeSystemId: id,
    });
  }

  if (existingCS) {
    // Merge: keep existing concepts, append new ones
    return {
      ...existingCS,
      language: existingCS.language ?? "en",
      concept: [...existingCS.concept, ...newConcepts],
    };
  }

  return {
    resourceType: "CodeSystem",
    id,
    url: `https://bind.codes/${id}`,
    name,
    title,
    status: "draft",
    language: "en",
    description: `${title} codes for insurance operations.`,
    concept: newConcepts,
  };
}

/**
 * Build a CodeSystem from a top-level file only (no matching code-list).
 */
function buildFromTopLevel(
  id: string,
  entries: TopLevelEntry[],
  existingCS: BindCodeSystem | null,
): BindCodeSystem {
  const title = toTitle(id);
  const name = toPascalCase(id);

  const existingCodes = new Set<string>();
  if (existingCS) {
    for (const c of existingCS.concept) {
      existingCodes.add(c.code);
    }
  }

  // De-duplicate: prefer entries that have a display, prefer non-deprecated
  const seenCodes = new Map<string, TopLevelEntry>();
  for (const entry of entries) {
    const bindCode = deriveBINDCode(entry.code, entry.display);
    const existing = seenCodes.get(bindCode);
    if (!existing) {
      seenCodes.set(bindCode, entry);
    } else if (
      existing.display?.startsWith("DEPRECATED") &&
      entry.display &&
      !entry.display.startsWith("DEPRECATED")
    ) {
      seenCodes.set(bindCode, entry);
    }
  }

  const newConcepts: BindConcept[] = [];
  const newBindCodes = new Set<string>();

  for (const [bindCode, entry] of seenCodes) {
    // Skip deprecated
    if (entry.display?.startsWith("DEPRECATED")) {
      mappings.push({
        bindCode,
        sourceCode: entry.code,
        sourceFile: `${id}.json`,
        codeSystemId: id,
      });
      continue;
    }

    // Skip if no display
    if (!entry.display) {
      continue;
    }

    // Skip if already exists
    if (existingCodes.has(bindCode) || newBindCodes.has(bindCode)) {
      mappings.push({
        bindCode,
        sourceCode: entry.code,
        sourceFile: `${id}.json`,
        codeSystemId: id,
      });
      continue;
    }

    const display = cleanDisplay(entry.display);
    const definition = generateDefinition(entry.display, title);

    const concept: BindConcept = {
      code: bindCode,
      display,
      definition,
    };

    newConcepts.push(concept);
    newBindCodes.add(bindCode);

    mappings.push({
      bindCode,
      sourceCode: entry.code,
      sourceFile: `${id}.json`,
      codeSystemId: id,
    });
  }

  if (existingCS) {
    return {
      ...existingCS,
      language: existingCS.language ?? "en",
      concept: [...existingCS.concept, ...newConcepts],
    };
  }

  return {
    resourceType: "CodeSystem",
    id,
    url: `https://bind.codes/${id}`,
    name,
    title,
    status: "draft",
    language: "en",
    description: `${title} codes for insurance operations.`,
    concept: newConcepts,
  };
}

/**
 * Enrich a code system that was built from a top-level file with French
 * translations from a matching code-list file.
 */
function enrichWithCodeList(
  cs: BindCodeSystem,
  cl: CodeListFile,
): BindCodeSystem {
  // Build lookup: stripped source code → code-list entry
  const lookup = new Map<string, CodeListCode>();
  for (const code of cl.codes) {
    lookup.set(code.code, code);
  }

  // Also build lookup by display text (lowercased) for fuzzy matching
  const displayLookup = new Map<string, CodeListCode>();
  for (const code of cl.codes) {
    if (code.display) {
      displayLookup.set(cleanDisplay(code.display).toLowerCase(), code);
    }
  }

  for (const concept of cs.concept) {
    if (concept.designation && concept.designation.length > 0) continue;

    // Try exact code match
    let clCode = lookup.get(concept.code);

    // Try display text match
    if (!clCode) {
      clCode = displayLookup.get(concept.display.toLowerCase());
    }

    if (clCode?.display_fr) {
      const frClean = cleanDisplay(clCode.display_fr);
      if (frClean) {
        concept.designation = [{ language: "fr-CA", value: frClean }];
      }
    }
  }

  return cs;
}

// ---------------------------------------------------------------------------
// Gitignore handling
// ---------------------------------------------------------------------------

async function ensureMappingInGitignore(): Promise<void> {
  let content = "";
  if (existsSync(GITIGNORE_PATH)) {
    content = await readFile(GITIGNORE_PATH, "utf-8");
  }

  if (!content.includes(".mapping/")) {
    const separator = content.endsWith("\n") ? "" : "\n";
    await appendFile(
      GITIGNORE_PATH,
      `${separator}\n# Private source mapping (generated)\n.mapping/\n`,
    );
    console.log("  Added .mapping/ to .gitignore");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== BIND Terminology Converter ===\n");

  // 1. Read all source data
  console.log("Reading top-level source files...");
  const topLevelMap = await readTopLevelFiles();
  console.log(`  Found ${topLevelMap.size} top-level files\n`);

  console.log("Reading code-list source files...");
  const codeListMap = await readCodeListFiles();
  console.log(`  Found ${codeListMap.size} code-list files\n`);

  // Collect all code-system IDs we need to process
  const allIds = new Set<string>();
  for (const id of topLevelMap.keys()) allIds.add(id);
  for (const id of codeListMap.keys()) allIds.add(id);

  console.log(`Processing ${allIds.size} unique code systems...\n`);

  let created = 0;
  let merged = 0;
  let skipped = 0;

  for (const id of [...allIds].sort()) {
    const topLevel = topLevelMap.get(id);
    const codeList = codeListMap.get(id);
    const existingCS = await loadExistingCodeSystem(id);

    let cs: BindCodeSystem;

    if (codeList) {
      // Build primarily from code-list (has French translations, richer data)
      cs = buildFromCodeList(id, codeList, topLevel, existingCS);

      // If there was also a top-level file with entries NOT in the code-list,
      // we add those as well
      if (topLevel) {
        const topLevelOnlyCS = buildFromTopLevel(id, topLevel, cs);
        cs = topLevelOnlyCS;
      }
    } else if (topLevel) {
      // Build from top-level only
      cs = buildFromTopLevel(id, topLevel, existingCS);

      // Try to find a matching code-list for enrichment (by id match)
      // e.g., "line-of-business" might match code-list "LineOfBusiness"
      for (const [clId, cl] of codeListMap) {
        if (clId === id) {
          cs = enrichWithCodeList(cs, cl);
          break;
        }
      }
    } else {
      continue;
    }

    // Skip if the code system has no concepts
    if (cs.concept.length === 0) {
      console.log(`  SKIP  ${id} (no non-deprecated concepts)`);
      skipped++;
      continue;
    }

    // Write the code system
    const outPath = join(CODESYSTEMS_DIR, `${id}.json`);
    await writeFile(outPath, JSON.stringify(cs, null, 2) + "\n", "utf-8");

    if (existingCS) {
      const newCount = cs.concept.length - existingCS.concept.length;
      console.log(
        `  MERGE ${id}.json (${existingCS.concept.length} existing + ${newCount} new = ${cs.concept.length} total)`,
      );
      merged++;
    } else {
      console.log(`  NEW   ${id}.json (${cs.concept.length} concepts)`);
      created++;
    }
  }

  // 2. Write the mapping file
  if (!existsSync(MAPPING_DIR)) {
    mkdirSync(MAPPING_DIR, { recursive: true });
  }

  const sortedMappings = mappings.sort((a, b) => {
    const cmp = a.codeSystemId.localeCompare(b.codeSystemId);
    if (cmp !== 0) return cmp;
    return a.bindCode.localeCompare(b.bindCode);
  });

  await writeFile(
    MAPPING_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        description:
          "Maps BIND codes to their original source codes. This file is private and excluded from version control.",
        totalMappings: sortedMappings.length,
        mappings: sortedMappings,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  console.log(
    `\nWrote ${sortedMappings.length} mappings to .mapping/source-mapping.json`,
  );

  // 3. Ensure .mapping/ is in .gitignore
  await ensureMappingInGitignore();

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`  Created:  ${created}`);
  console.log(`  Merged:   ${merged}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Total:    ${created + merged} code system files\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
