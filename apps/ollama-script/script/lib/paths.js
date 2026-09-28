import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, "../..");
export const PROMPTS_DIR = path.join(ROOT, "prompts");
export const IMAGES_DIR = path.join(ROOT, "images");
export const RESULTS_DIR = path.join(ROOT, "results");
export const DEFAULT_MODEL = process.env.FLUX_MODEL ?? "x/flux2-klein:9b";
export const OLLAMA_URL = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
