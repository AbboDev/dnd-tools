import fs from "fs-extra";
import * as glob from "glob";
import {Command} from "commander";

const program = new Command();

program
  .version('0.0.1', '-v, --version')
  .usage('[OPTIONS]...')
  .option('-o, --output <value>', 'Output file', 'homebrew')
  .parse(process.argv);

const args = program.opts();

const SRC_DIR = "./src";
const OUTPUT_DIR = "./builds";
const OUTPUT_FILE = `${OUTPUT_DIR}/${args.output}.json`;

const CATEGORIES = ["item", "baseitem", "spell", "bestiary"];

async function build() {
  const output = {
    _meta: {
      sources: await fs.readJson(`${SRC_DIR}/_meta/sources.json`),
    },
  };

  for (const category of CATEGORIES) {
    const files = glob.sync(`${SRC_DIR}/${category}/**/*.json`);

    let merged = [];

    for (const file of files) {
      const data = await fs.readJson(file);

      merged.push(...Array.isArray(data) ? data : [data]);
    }

    if (merged.length) {
      const key = category === "bestiary" ? "monster" : category;
      output[key] = merged;
    }
  }

  await fs.outputJson(OUTPUT_FILE, output, { spaces: 2 });
  console.log(`✅ Build completed! Output: ${OUTPUT_FILE}`);
}

build();
