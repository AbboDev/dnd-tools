import fs from "fs-extra";
import * as glob from "glob";
import semver from "semver";
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
        return entry._visibility.includes(visibility);
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

  if (args.update) {
    const oldBuild = await fs.readJson(OUTPUT_FILE);

    if (oldBuild) {
      const versionBump = compareBuilds(oldBuild, output);

      output._meta.sources[0].version = semver.inc(output._meta.sources[0].version, versionBump);

      await fs.outputJson(`${campaignPath}/_meta.json`, output._meta.sources[0], { spaces: 2 });
    }
  }

  await fs.outputJson(OUTPUT_FILE, output, { spaces: 2 });
  console.log(`✅ Build completed! Output: ${OUTPUT_FILE}`);
}

build();
