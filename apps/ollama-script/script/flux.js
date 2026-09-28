#!/usr/bin/env node
import { checkbox, confirm, input, select } from "@inquirer/prompts";
import path from "node:path";
import { generateImage } from "./lib/generate.js";
import { listFiles } from "./lib/files.js";
import { DEFAULT_MODEL, IMAGES_DIR, PROMPTS_DIR, RESULTS_DIR } from "./lib/paths.js";

const loop = process.argv.includes("--loop");

async function pickPrompt() {
  const prompts = await listFiles(PROMPTS_DIR);
  if (prompts.length === 0) {
    throw new Error(`No prompt files found in ${PROMPTS_DIR}`);
  }

  return select({
    message: "选择 Prompt",
    choices: prompts.map((file) => ({
      name: path.basename(file),
      value: file,
    })),
  });
}

async function pickReferenceImages() {
  const images = await listFiles(IMAGES_DIR);
  if (images.length === 0) {
    console.log("images/ 目录为空，将使用纯文生图。");
    return [];
  }

  const selected = await checkbox({
    message: "选择参考图（可选，最多 2 张）",
    choices: images.map((file) => ({
      name: path.basename(file),
      value: file,
    })),
    validate: (value) => value.length <= 2 || "最多选择 2 张参考图",
  });

  return selected;
}

async function pickOutputName() {
  return input({
    message: "输出文件名（留空则使用时间戳）",
    default: "",
  });
}

async function runOnce() {
  const promptFile = await pickPrompt();
  const imageFiles = await pickReferenceImages();
  const outputName = await pickOutputName();

  console.log("");
  console.log(`Model:   ${DEFAULT_MODEL}`);
  console.log(`Prompt:  ${promptFile}`);
  console.log(
    `Images:  ${imageFiles.length ? imageFiles.map((f) => path.basename(f)).join(", ") : "(none)"}`,
  );
  console.log(`Output:  ${outputName.trim() || "<timestamp>.png"}`);
  console.log(`Results: ${RESULTS_DIR}`);
  console.log("");

  const result = await generateImage({ promptFile, imageFiles, outputName });
  console.log(`Saved: ${result.outPath}`);
  return result;
}

async function main() {
  console.log("Flux image generation");
  console.log(`Prompts: ${PROMPTS_DIR}`);
  console.log(`Images:  ${IMAGES_DIR}`);

  do {
    await runOnce();

    if (!loop) {
      break;
    }

    const again = await confirm({
      message: "继续生成一张？",
      default: true,
    });

    if (!again) {
      break;
    }

    console.log("");
  } while (loop);
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
