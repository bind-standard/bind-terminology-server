import type { Fetcher } from "@cloudflare/workers-types";
import type { CodeSystem, CodeSystemSummary } from "../schemas/codesystem.js";

let manifestCache: string[] | null = null;

async function loadManifest(assets: Fetcher): Promise<string[]> {
  if (manifestCache) return manifestCache;
  try {
    const response = await assets.fetch("https://dummy/_manifest.json");
    if (!response.ok) return [];
    manifestCache = (await response.json()) as string[];
    return manifestCache;
  } catch {
    return [];
  }
}

export async function loadCodeSystem(assets: Fetcher, id: string): Promise<CodeSystem | null> {
  try {
    const response = await assets.fetch(`https://dummy/${id}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && typeof data === "object" && "resourceType" in data && data.resourceType === "CodeSystem") {
      return data as CodeSystem;
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadAllCodeSystems(assets: Fetcher): Promise<CodeSystem[]> {
  const manifest = await loadManifest(assets);
  const results = await Promise.all(
    manifest.map(async (filename) => {
      try {
        const response = await assets.fetch(`https://dummy/${filename}`);
        if (!response.ok) return null;
        return (await response.json()) as CodeSystem;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((cs): cs is CodeSystem => cs !== null);
}

export function summarize(cs: CodeSystem): CodeSystemSummary {
  return {
    id: cs.id,
    url: cs.url,
    name: cs.name,
    title: cs.title,
    status: cs.status,
    count: cs.concept.length,
  };
}
