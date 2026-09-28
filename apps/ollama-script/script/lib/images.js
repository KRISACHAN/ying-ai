import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
const MAX_REFERENCE_EDGE = 1536;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function resizeWithSips(imageFile) {
  const ext = path.extname(imageFile) || ".jpg";
  const tempFile = path.join(os.tmpdir(), `flux-ref-${process.pid}-${Date.now()}${ext}`);

  await execFileAsync("sips", ["-Z", String(MAX_REFERENCE_EDGE), imageFile, "--out", tempFile]);

  return tempFile;
}

export async function loadReferenceImage(imageFile) {
  const stat = await fs.stat(imageFile);
  let sourceFile = imageFile;
  let tempFile;

  if (stat.size > MAX_REFERENCE_BYTES && process.platform === "darwin") {
    console.log(
      `Resizing ${path.basename(imageFile)} (${formatBytes(stat.size)}) ` +
        `to max ${MAX_REFERENCE_EDGE}px edge for faster upload...`,
    );
    tempFile = await resizeWithSips(imageFile);
    sourceFile = tempFile;
  } else if (stat.size > MAX_REFERENCE_BYTES) {
    console.warn(
      `Warning: ${path.basename(imageFile)} is ${formatBytes(stat.size)}. ` +
        `Large reference images slow uploads. Resize to under ${formatBytes(MAX_REFERENCE_BYTES)} if possible.`,
    );
  }

  try {
    const buffer = await fs.readFile(sourceFile);
    return buffer.toString("base64");
  } finally {
    if (tempFile) {
      await fs.unlink(tempFile).catch(() => {});
    }
  }
}
