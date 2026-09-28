import fs from "node:fs/promises";
import path from "node:path";
import { loadReferenceImage } from "./images.js";
import { checkOllama, ollamaGenerateStream } from "./ollama.js";
import { DEFAULT_MODEL, RESULTS_DIR } from "./paths.js";

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

export function resolveOutputName(name) {
  const trimmed = name?.trim();
  if (!trimmed) {
    return `${timestamp()}.png`;
  }

  const safe = trimmed.replace(/[/\\]/g, "-");
  return safe.toLowerCase().endsWith(".png") ? safe : `${safe}.png`;
}

async function loadReferenceImages(imageFiles) {
  const images = [];
  for (const imageFile of imageFiles) {
    images.push(await loadReferenceImage(imageFile));
  }
  return images;
}

function createProgressReporter() {
  let lastLine = "";

  return {
    update({ completed, total }) {
      const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
      lastLine = `Generating: ${percent}% (${completed}/${total})`;
      process.stdout.write(`\r${lastLine}`);
    },
    finish() {
      if (lastLine) {
        process.stdout.write("\n");
      }
    },
    clear() {
      if (lastLine) {
        process.stdout.write("\r\x1b[K");
      }
    },
  };
}

export async function generateImage({
  promptFile,
  imageFiles = [],
  outputName,
  model = DEFAULT_MODEL,
  width,
  height,
  steps,
  seed,
  negative,
}) {
  await checkOllama();

  const prompt = await fs.readFile(promptFile, "utf8");
  const images = await loadReferenceImages(imageFiles);

  const payload = {
    model,
    prompt,
  };

  if (images.length > 0) {
    payload.images = images;
  }

  const options = {};
  if (width) options.width = Number(width);
  if (height) options.height = Number(height);
  if (steps) options.steps = Number(steps);
  if (seed) options.seed = Number(seed);
  if (negative) options.negative = negative;
  if (Object.keys(options).length > 0) {
    payload.options = options;
  }

  const progress = createProgressReporter();
  let data;
  try {
    data = await ollamaGenerateStream(payload, {
      onProgress: (update) => progress.update(update),
    });
    progress.finish();
  } catch (error) {
    progress.clear();
    throw error;
  }

  if (!data.image) {
    throw new Error(`No image returned: ${JSON.stringify(data, null, 2)}`);
  }

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const filename = resolveOutputName(outputName);
  const outPath = path.join(RESULTS_DIR, filename);
  await fs.writeFile(outPath, Buffer.from(data.image, "base64"));

  return {
    outPath,
    filename,
    model,
    promptFile,
    imageFiles,
    chars: prompt.length,
  };
}
