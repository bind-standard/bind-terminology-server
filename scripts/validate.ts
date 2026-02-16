import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const CODESYSTEMS_DIR = join(import.meta.dirname, "..", "codesystems");

const REQUIRED_FIELDS = [
  "resourceType",
  "id",
  "url",
  "name",
  "title",
  "status",
  "description",
  "concept",
] as const;

const VALID_STATUSES = ["draft", "active", "retired", "unknown"];

const URL_PATTERN = /^https:\/\/bind\.codes\/[a-z][a-z0-9-]*$/;

interface Concept {
  code: string;
  display: string;
  definition?: string;
}

let errors = 0;

function fail(file: string, message: string): void {
  console.error(`  FAIL  ${file}: ${message}`);
  errors++;
}

function pass(file: string): void {
  console.log(`  OK    ${file}`);
}

async function main(): Promise<void> {
  const entries = await readdir(CODESYSTEMS_DIR);
  const jsonFiles = entries.filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();

  if (jsonFiles.length === 0) {
    console.error("No .json files found in codesystems/");
    process.exit(1);
  }

  console.log(`Validating ${jsonFiles.length} code system(s)...\n`);

  for (const file of jsonFiles) {
    const raw = await readFile(join(CODESYSTEMS_DIR, file), "utf-8");

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      fail(file, "Invalid JSON");
      continue;
    }

    let fileOk = true;

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (data[field] === undefined || data[field] === null) {
        fail(file, `Missing required field: ${field}`);
        fileOk = false;
      }
    }

    if (!fileOk) continue;

    // resourceType must be "CodeSystem"
    if (data.resourceType !== "CodeSystem") {
      fail(file, `resourceType must be "CodeSystem", got "${data.resourceType}"`);
      fileOk = false;
    }

    // id must match filename (without .json)
    const expectedId = file.replace(/\.json$/, "");
    if (data.id !== expectedId) {
      fail(file, `id "${data.id}" does not match filename (expected "${expectedId}")`);
      fileOk = false;
    }

    // url must match pattern
    if (!URL_PATTERN.test(data.url)) {
      fail(file, `url "${data.url}" does not match expected pattern`);
      fileOk = false;
    }

    // url must end with the id
    if (!data.url.endsWith(`/${data.id}`)) {
      fail(file, `url must end with "/${data.id}"`);
      fileOk = false;
    }

    // status must be valid
    if (!VALID_STATUSES.includes(data.status)) {
      fail(file, `Invalid status "${data.status}" (expected one of: ${VALID_STATUSES.join(", ")})`);
      fileOk = false;
    }

    // concept must be a non-empty array
    if (!Array.isArray(data.concept) || data.concept.length === 0) {
      fail(file, "concept must be a non-empty array");
      fileOk = false;
      continue;
    }

    // Validate each concept and check for unique codes
    const codes = new Set<string>();
    for (const concept of data.concept as Concept[]) {
      if (!concept.code || typeof concept.code !== "string") {
        fail(file, "Each concept must have a non-empty string 'code'");
        fileOk = false;
      }
      if (!concept.display || typeof concept.display !== "string") {
        fail(file, `Concept "${concept.code}": missing or empty 'display'`);
        fileOk = false;
      }
      if (codes.has(concept.code)) {
        fail(file, `Duplicate code: "${concept.code}"`);
        fileOk = false;
      }
      codes.add(concept.code);
    }

    if (fileOk) {
      pass(file);
    }
  }

  console.log();
  if (errors > 0) {
    console.error(`Validation failed with ${errors} error(s).`);
    process.exit(1);
  }
  console.log("All code systems valid.");
}

main();
