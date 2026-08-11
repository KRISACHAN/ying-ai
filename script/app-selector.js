import checkbox from "@inquirer/checkbox";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process, { stderr, stdout as output } from "node:process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appsDirectory = join(repositoryRoot, "apps");

async function discoverApps(task) {
  const entries = await readdir(appsDirectory, { withFileTypes: true });
  const apps = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(appsDirectory, entry.name, "package.json");

    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

      if (typeof manifest.name === "string" && typeof manifest.scripts?.[task] === "string") {
        apps.push({
          directory: entry.name,
          name: manifest.name,
        });
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`无法读取 ${manifestPath}: ${error.message}`, { cause: error });
    }
  }

  return apps.sort((left, right) => left.directory.localeCompare(right.directory));
}

async function selectApp(apps, task) {
  return checkbox({
    message: `选择需要执行 pnpm ${task} 的应用`,
    choices: apps.map((app) => ({
      name: `${app.directory} (${app.name})`,
      value: app,
    })),
    required: true,
    loop: false,
    pageSize: apps.length,
  });
}

function executeTask(apps, task) {
  const filters = apps.flatMap((app) => ["--filter", app.name]);
  const command = ["pnpm", ...filters, task].join(" ");

  output.write(`\n> ${command}\n\n`);

  const child = spawn("pnpm", [...filters, task], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });

  return new Promise((resolveTask, rejectTask) => {
    child.once("error", rejectTask);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectTask(new Error(`${task} 被信号 ${signal} 终止`));
        return;
      }

      resolveTask(code ?? 1);
    });
  });
}

export async function runAppScript(task) {
  try {
    const apps = await discoverApps(task);

    if (apps.length === 0) {
      throw new Error(`apps/* 中没有定义 ${task} script 的应用`);
    }

    const selectedApps = await selectApp(apps, task);
    process.exitCode = await executeTask(selectedApps, task);
  } catch (error) {
    if (error.name === "ExitPromptError") {
      output.write("\n已取消。\n");
      return;
    }

    stderr.write(`\n执行失败：${error.message}\n`);
    process.exitCode = 1;
  }
}
