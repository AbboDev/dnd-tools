import fs from "fs-extra";
import * as glob from "glob";
import semver from "semver";
import path from "path";
import { Command, Option } from "commander";
import { compareBuilds } from "./src/helpers/compareBuilds.js";

const program = new Command();

program
  .version('0.0.1', '-v, --version')
  .usage('[OPTIONS]...')
  .requiredOption('-c, --campaign <value>', 'Campaign source to build')
  .option('-o, --output <value>', 'Output file')
  .addOption(new Option('-e, --edition <size>', 'Edition for output').choices(['classic', 'one']).default('classic', 'for classic'))
  .addOption(new Option('-V, --visibility <size>', 'Visibility for output').choices(['dm', 'player']).default('dm', 'for dm'))
  .addOption(new Option('--status <size>', 'Status for output').choices(["ready", "wip", "invalid", "deprecated"]).default('wip', 'for wip'))
  .option('--update', 'Updates the version of the campaign')
  .parse(process.argv);

const args = program.opts();

args.output = args.output || args.campaign;

const SRC_BASE = "./src";
const OUTPUT_DIR = "./builds";
const OUTPUT_FILE = `${OUTPUT_DIR}/${args.output}.${args.visibility}.json`;

const CATEGORIES = {
  item: "item",
  bestiary: "monster",
  spell: "spell",
  baseitem: "baseitem"
};

async function build() {
  const campaignPath = `${SRC_BASE}/campaigns/${args.campaign}`;
  const meta = await fs.readJson(`${campaignPath}/_meta.json`);

  const visibilityDoc = args.visibility.toUpperCase();

  const dateAdded = Math.floor(new Date(meta.dateReleased).getTime() / 1000);
  const dateLastModified = Math.floor(new Date().getTime() / 1000);

  const output = {
    _meta: {
      sources: [
        {
          ...meta,
          abbreviation: `${meta.abbreviation}-${visibilityDoc}`,
          full: `${meta.full} (${visibilityDoc})`,
        }
      ],
      edition: args.edition,
      status: args.status,
      dateAdded,
      dateLastModified,
    }
  };

  for (const [folder, finalKey] of Object.entries(CATEGORIES)) {
    const allFiles = [
      ...glob.sync(`${SRC_BASE}/shared/${folder}/**/*.json`),
      ...glob.sync(`${campaignPath}/${folder}/**/*.json`)
    ];
    const files = allFiles.filter(file => {
      const name = path.basename(file);
      return !name.includes(".disabled.");
    });

    const merged = [];

    for (const file of files) {
      const data = await fs.readJson(file);

      const arrayData = Array.isArray(data) ? data : [data];

      const filtered = arrayData.filter(entry => {
        if (!entry._visibility) return true;
        return entry._visibility.includes(args.visibility);
      });

      merged.push(...filtered.map(e => {
        delete e._visibility;
        return e;
      }));
    }

    if (merged.length) {
      output[finalKey] = merged;
    }
  }

  // Load and construct adventure data if the folder exists
  const adventurePath = `${campaignPath}/adventure`;
  if (await fs.pathExists(adventurePath)) {
    const adventureFiles = glob.sync(`${adventurePath}/**/*.json`).sort();
    const sections = [];
    for (const file of adventureFiles) {
      const section = await fs.readJson(file);
      sections.push(section);
    }

    if (sections.length) {
      output.adventureData = [
        {
          id: meta.json,
          source: meta.json,
          data: sections
        }
      ];

      output.adventure = [
        {
          id: meta.json,
          name: meta.full,
          source: meta.json,
          group: "homebrew",
          level: {
            start: 1,
            end: 20
          },
          published: meta.dateReleased || "2026-01-01",
          author: (meta.authors || []).join(", "),
          storyline: "None",
          contents: sections.map(section => ({
            name: section.name,
            headers: (section.entries || [])
              .filter(entry => entry.type === "section" || entry.type === "entries")
              .map(entry => entry.name)
          }))
        }
      ];
    }
  }

  if (args.update) {
    let oldBuild = null;
    if (await fs.pathExists(OUTPUT_FILE)) {
      oldBuild = await fs.readJson(OUTPUT_FILE);
    }

    if (oldBuild) {
      const versionBump = compareBuilds(oldBuild, output);

      const newVersion = semver.inc(output._meta.sources[0].version, versionBump);
      output._meta.sources[0].version = newVersion;

      await fs.outputJson(`${campaignPath}/_meta.json`, {...meta, version: newVersion}, { spaces: 2 });
    }
  }

  await fs.outputJson(OUTPUT_FILE, output, { spaces: 2 });
  console.log(`✅ Build completed! Output: ${OUTPUT_FILE}`);
}

build();
