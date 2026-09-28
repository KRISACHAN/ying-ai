#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { generateImage } from "./lib/generate.js";
import { DEFAULT_MODEL, PROMPTS_DIR, RESULTS_DIR, ROOT } from "./lib/paths.js";

const { values, positionals } = parseArgs({
  options: {
    image: { type: "string", multiple: true, short: "i" },
    name: { type: "string", short: "o" },
    width: { type: "string", short: "w" },
    height: { type: "string" },
    steps: { type: "string", short: "s" },
    seed: { type: "string" },
    negative: { type: "string", short: "n" },
    model: { type: "string", short: "m" },
    loop: { type: "boolean", short: "l", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`Usage:
  node script/flux-run.js [options] [prompt-file]

Options:
  -i, --image PATH   Reference image (repeatable, max 2)
  -o, --name NAME    Output filename (default: timestamp)
  -l, --loop         Generate again with same options
  -w, --width N      Image width
  --height N         Image height
  -s, --steps N      Denoising steps
  --seed N           Random seed
  -n, --negative S   Negative prompt
  -m, --model M      Ollama model

Default prompt: prompts/image.md
Output: results/<name>.png or results/<timestamp>.png`);
  process.exit(0);
}

const promptFile = positionals[0]
  ? path.isAbsolute(positionals[0])
    ? positionals[0]
    : path.join(ROOT, positionals[0])
  : path.join(PROMPTS_DIR, "image.md");

const imageFiles = values.image ?? [];
if (imageFiles.length > 2) {
  console.error("At most 2 reference images are supported.");
  process.exit(1);
}

const options = {
  promptFile,
  imageFiles,
  outputName: values.name,
  model: values.model ?? DEFAULT_MODEL,
  width: values.width,
  height: values.height,
  steps: values.steps,
  seed: values.seed,
  negative: values.negative,
};

async function runOnce() {
  console.log(`Model:   ${options.model}`);
  console.log(`Prompt:  ${options.promptFile}`);
  console.log(`Output:  ${options.outputName?.trim() || "<timestamp>.png"}`);
  console.log(`Results: ${RESULTS_DIR}`);
  if (imageFiles.length > 0) {
    console.log(`Images:  ${imageFiles.join(", ")}`);
  }
  console.log("");

  const result = await generateImage(options);
  console.log(`Saved: ${result.outPath}`);
}

async function main() {
  do {
    await runOnce();
    if (!values.loop) {
      break;
    }
    console.log("");
    console.log("Loop mode: Ctrl+C to stop, or wait for next run...");
    console.log("");
  } while (values.loop);
}

function formatError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const lines = [error.message];
  if (error.cause instanceof Error) {
    lines.push(`Cause: ${error.cause.message}`);
  }
  return lines.join("\n");
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
