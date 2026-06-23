#!/usr/bin/env node

import fs from "fs-extra";
import * as glob from "glob";
import semver from "semver";
import path from "path";
import { Command, Option } from "commander";
import { compareBuilds } from "../src/helpers/compareBuilds.js";
import {
  filterNodeByVisibility,
  hasVisibility,
  VISIBILITIES,
} from "../src/helpers/visibility.js";

const program = new Command();

program
  .version("0.0.1", "-v, --version")
  .usage("[OPTIONS]...")
  .argument("<campaigns...>", "Campaigns source to build")
  .addOption(
    new Option("-e, --edition <edition>", "Edition for output")
      .choices(["classic", "one"])
      .default("classic", "for classic"),
  )
  .addOption(
    new Option("--status <status>", "Status for output")
      .choices(["ready", "wip", "invalid", "deprecated"])
      .default("wip", "for wip"),
  )
  .option("--update", "Updates the version of the campaign")
  .parse(process.argv);

const args = program.opts();

const SRC_BASE = "./src";
const OUTPUT_DIR = "./builds";

const CATEGORIES = {
  item: "item",
  bestiary: "monster",
  spell: "spell",
  baseitem: "baseitem",
};

async function build(campaign) {
  const campaignPath = `${SRC_BASE}/campaigns/${campaign}`;
  const meta = await fs.readJson(`${campaignPath}/_meta.json`);

  const dateAdded = Math.floor(new Date(meta.dateReleased).getTime() / 1000);
  const dateLastModified = Math.floor(new Date().getTime() / 1000);

  // 1. Read all files into memory once
  const categoryFiles = {};
  for (const [folder, finalKey] of Object.entries(CATEGORIES)) {
    const allFiles = [
      ...glob.sync(`${SRC_BASE}/shared/${folder}/**/*.json`),
      ...glob.sync(`${campaignPath}/${folder}/**/*.json`),
    ];
    const files = allFiles.filter((file) => {
      const name = path.basename(file);
      return !name.includes(".disabled.");
    });

    categoryFiles[finalKey] = [];
    for (const file of files) {
      const fileData = await fs.readJson(file);
      const arrayData = Array.isArray(fileData) ? fileData : [fileData];
      categoryFiles[finalKey].push({
        filename: path.basename(file),
        entries: arrayData,
      });
    }
  }

  // 2. Load and construct adventure data if the folder exists once
  const adventurePath = `${campaignPath}/adventure`;
  const adventureFilesData = [];
  if (await fs.pathExists(adventurePath)) {
    const adventureFiles = glob.sync(`${adventurePath}/**/*.json`).sort();
    for (const file of adventureFiles) {
      const section = await fs.readJson(file);
      adventureFilesData.push({
        filename: path.basename(file),
        data: section,
      });
    }
  }

  const outputs = {};

  // 3. Construct all outputs in memory
  for (const visibility of VISIBILITIES) {
    const output = {
      _meta: {
        sources: [],
        edition: args.edition,
        status: args.status,
        dateAdded,
        dateLastModified,
      },
    };

    // Filter and merge from memory
    for (const [finalKey, files] of Object.entries(categoryFiles)) {
      const merged = [];
      for (const file of files) {
        if (!hasVisibility(file.filename, visibility)) continue;

        const filtered = file.entries.filter((entry) => {
          if (!entry._visibility) return true;
          return entry._visibility.includes(visibility);
        });

        merged.push(
          ...filtered.map((entry) => {
            const { _visibility, source, ...cleanEntry } = entry;
            return {
              source: source === "-SHARED" ? meta.json : source,
              ...cleanEntry,
            };
          }),
        );
      }

      if (merged.length) {
        output[finalKey] = merged;
      }
    }

    // Process and filter adventure sections
    const activeAdventureSections = [];
    for (const file of adventureFilesData) {
      if (!hasVisibility(file.filename, visibility)) continue;

      const filteredSection = filterNodeByVisibility(file.data, visibility);
      activeAdventureSections.push(filteredSection);
    }

    if (activeAdventureSections.length) {
      output.adventureData = [
        {
          id: meta.json,
          source: meta.json,
          data: activeAdventureSections,
        },
      ];

      output.adventure = [
        {
          id: meta.json,
          name: meta.full,
          source: meta.json,
          group: "homebrew",
          level: {
            start: 1,
            end: 20,
          },
          published: meta.dateReleased || "2026-01-01",
          author: (meta.authors || []).join(", "),
          storyline: "None",
          contents: activeAdventureSections.map((section) => ({
            name: section.name,
            headers: (section.entries || [])
              .filter(
                (entry) => entry.type === "section" || entry.type === "entries",
              )
              .map((entry) => entry.name),
          })),
        },
      ];
    }

    outputs[visibility] = output;
  }

  // 4. Calculate synchronized semver bump across both visibilities
  const BUMP_LEVELS = { patch: 1, minor: 2, major: 3 };
  let maxBump = null;

  if (args.update) {
    for (const visibility of VISIBILITIES) {
      const outputFileName = `${OUTPUT_DIR}/${campaign}.${visibility}.json`;
      if (await fs.pathExists(outputFileName)) {
        const oldBuild = await fs.readJson(outputFileName);
        const bump = compareBuilds(oldBuild, outputs[visibility]);
        if (bump) {
          if (!maxBump || BUMP_LEVELS[bump] > BUMP_LEVELS[maxBump]) {
            maxBump = bump;
          }
        }
      }
    }
  }

  // 5. Update campaign metadata version if needed
  if (maxBump) {
    const newVersion = semver.inc(meta.version, maxBump);
    meta.version = newVersion;
    await fs.outputJson(`${campaignPath}/_meta.json`, meta, { spaces: 2 });
  }

  // 6. Set final metadata in outputs and save files to disk
  for (const visibility of VISIBILITIES) {
    const outputFileName = `${OUTPUT_DIR}/${campaign}.${visibility}.json`;
    let full = meta.full;
    if (visibility === "player") {
      full = full + " (Player's Edition)";
    }

    outputs[visibility]._meta.sources.push({
      ...meta,
      full,
    });

    await fs.outputJson(outputFileName, outputs[visibility], { spaces: 2 });
    console.log(`✅ Build completed! Output: ${outputFileName}`);
  }
}

for (const campaign of program.args) {
  await build(campaign);
}
