#!/usr/bin/env node

import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import deepmerge from "deepmerge";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Resolve the brew schema source from the installed 5etools-utils package
const BREW_SRC = path.dirname(require.resolve("5etools-utils/package.json")) + "/schema/brew";
const PATCHES_DIR = path.resolve("schema/patches");
const OUTPUT_DIR = path.resolve("schema/.downloaded");

// Simple JSON Patch (RFC 6902) helper
function applyJsonPatch(obj, ops) {
  const result = JSON.parse(JSON.stringify(obj));

  for (const op of ops) {
    const parts = op.path
      .split("/")
      .filter(Boolean)
      .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));

    let cur = result;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    const last = parts[parts.length - 1];
    if (op.op === "add" || op.op === "replace") cur[last] = op.value;
    else if (op.op === "remove") Array.isArray(cur) ? cur.splice(+last, 1) : delete cur[last];
  }
  return result;
}

async function loadPatches() {
  const patches = [];
  if (!(await fs.pathExists(PATCHES_DIR))) return patches;

  const entries = await fs.readdir(PATCHES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const patchDir = path.join(PATCHES_DIR, entry.name);
    const configPath = path.join(patchDir, "config.json");

    // Load config (glob patterns for which files to apply to)
    if (!(await fs.pathExists(configPath))) {
      continue;
    }

    const config = await fs.readJson(configPath);
    const files = config?.files;
    if (!files || !Array.isArray(files)) {
      console.log(`  [${entry.name}] No files found in config. Skipping...`);
      continue;
    }

    // Load patch implementation (JS or JSON)
    const patchJsPath = path.join(patchDir, "patch.js");
    const patchJsonPath = path.join(patchDir, "patch.json");
    let apply = null;

    if (await fs.pathExists(patchJsPath)) {
      const mod = await import(`file://${patchJsPath.replace(/\\/g, "/")}`);
      if (typeof mod.default === "function") {
        apply = mod.default;
      }
    } else if (await fs.pathExists(patchJsonPath)) {
      const patchContent = await fs.readJson(patchJsonPath);
      apply = (schema) =>
        Array.isArray(patchContent) ? applyJsonPatch(schema, patchContent) : deepmerge(schema, patchContent);
    }

    if (apply) {
      patches.push({ name: entry.name, files, apply });
    }
  }
  return patches;
}

async function run() {
  const patches = await loadPatches();

  // Find all JSON schema files in the brew source
  const allFiles = glob.sync("**/*.json", { cwd: BREW_SRC, posix: true });

  console.log(`Found ${allFiles.length} schema files to copy from 5etools-utils.\n`);

  for (const relativePath of allFiles) {
    const srcPath = path.join(BREW_SRC, relativePath);
    let schema = await fs.readJson(srcPath);

    // Collect applicable patches
    const applicable = patches.filter(({ files }) => {
      return glob.sync(relativePath, { matchBase: false }).length > 0
        || files.some((pattern) => glob.sync(pattern, { cwd: BREW_SRC, posix: true }).includes(relativePath));
    });

    for (const { name, apply } of applicable) {
      console.log(`  [${relativePath}] Applying patch: ${name}`);
      schema = await apply(schema, relativePath);
    }

    const outPath = path.join(OUTPUT_DIR, relativePath);
    await fs.outputJson(outPath, schema, { spaces: 2 });
  }

  console.log(`\nDone! ${allFiles.length} files copied to schema/.downloaded/`);
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
