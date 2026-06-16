import fs from "fs-extra";
import * as glob from "glob";
import { Command } from "commander";

const program = new Command();

program
  .version('0.0.1', '-v, --version')
  .usage('[OPTIONS]...')
  .requiredOption('-c, --campaign <value>', 'Campaign source to build')
  .option('-V, --visibility <value>', 'Visibility for output', 'dm')
  .option('-o, --output <value>', 'Output file')
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

  const output = {
    _meta: {
      sources: [
        {
          ...meta,
          abbreviation: `${meta.abbreviation}-${visibilityDoc}`,
          full: `${meta.full} (${visibilityDoc})`,
        }
    ] },
  };

  for (const [folder, finalKey] of Object.entries(CATEGORIES)) {
    const files = [
      ...glob.sync(`${SRC_BASE}/shared/${folder}/**/*.json`),
      ...glob.sync(`${campaignPath}/${folder}/**/*.json`)
    ];

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

  await fs.outputJson(OUTPUT_FILE, output, { spaces: 2 });
  console.log(`✅ Build completed! Output: ${OUTPUT_FILE}`);
}

build();
