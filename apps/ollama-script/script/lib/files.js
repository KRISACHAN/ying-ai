import fs from "node:fs/promises";
import path from "node:path";

export async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => path.join(dir, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
