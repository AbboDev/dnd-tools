import fs from "fs-extra";
import glob from "glob";
import path from "path";

const SRC_DIR = "./src";
const OUTPUT = "./builds/homebrew.json";

const CATEGORIES = ["item", "baseitem", "spell", "bestiary"];

async function build() {
  const output = {
    _meta: {
      sources: await fs.readJson("./src/_meta/sources.json"),
    },
  };

  for (const category of CATEGORIES) {
    const files = glob.sync(`${SRC_DIR}/${category}/**/*.json`);

    let merged = [];

    for (const file of files) {
      const data = await fs.readJson(file);
      merged.push(...data);
    }

    if (merged.length) {
      const key = category === "bestiary" ? "monster" : category;
      output[key] = merged;
    }
  }

  await fs.outputJson(OUTPUT, output, { spaces: 2 });
  console.log("Build completata.");
}

build();
