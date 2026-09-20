import { error as logError, log } from "node:console";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const packageRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(packageRoot, "src");

const forbiddenRuntimeImports = [
  "express",
  "fastify",
  "next",
  "node:fs",
  "node:http",
  "node:https",
  "node:net",
  "node:tls",
  "ollama",
  "pg",
  "postgres",
  "react",
  "react-dom",
  "ws",
];

const violations = [];

function isPackageOrSubpath(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function report(filePath, sourceFile, node, message) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const relativePath = path.relative(packageRoot, filePath);
  violations.push(`${relativePath}:${line + 1}:${character + 1} ${message}`);
}

function readModuleSpecifier(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }

  return undefined;
}

function checkImport(filePath, sourceFile, node, specifier) {
  if (specifier.startsWith("@ying-ai/") || specifier.startsWith("@ying-companion/")) {
    report(filePath, sourceFile, node, `must not import sibling workspace package '${specifier}'`);
  }

  const forbiddenImport = forbiddenRuntimeImports.find((packageName) =>
    isPackageOrSubpath(specifier, packageName),
  );

  if (forbiddenImport !== undefined) {
    report(filePath, sourceFile, node, `must not import host/transport dependency '${specifier}'`);
  }

  if (!specifier.startsWith(".")) {
    return;
  }

  const importedPath = path.resolve(path.dirname(filePath), specifier);
  if (importedPath !== sourceRoot && !importedPath.startsWith(`${sourceRoot}${path.sep}`)) {
    report(filePath, sourceFile, node, `relative import '${specifier}' escapes src/`);
    return;
  }

  const sourceArea = path.relative(sourceRoot, filePath).split(path.sep)[0];
  const targetArea = path.relative(sourceRoot, importedPath).split(path.sep)[0];

  if (sourceArea === "abstractions" && targetArea !== "abstractions") {
    report(
      filePath,
      sourceFile,
      node,
      `abstractions/ must not depend on ${targetArea}/ via '${specifier}'`,
    );
  }

  if (sourceArea === "implementations" && ["core", "factories"].includes(targetArea)) {
    report(
      filePath,
      sourceFile,
      node,
      `implementations/ must not depend on ${targetArea}/ via '${specifier}'`,
    );
  }
}

function checkRuntimeGlobal(filePath, sourceFile, node) {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  ) {
    report(
      filePath,
      sourceFile,
      node,
      "must receive configuration from the host instead of process.env",
    );
  }

  if (
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "console"
  ) {
    report(filePath, sourceFile, node, "must emit observability through CoreObserver, not console");
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "fetch"
  ) {
    report(filePath, sourceFile, node, "must keep direct HTTP transport outside ai-core");
  }
}

function inspectSource(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  function visit(node) {
    const specifier = readModuleSpecifier(node);
    if (specifier !== undefined) {
      checkImport(filePath, sourceFile, node, specifier);
    }

    checkRuntimeGlobal(filePath, sourceFile, node);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function verifyPackageDependencies() {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const dependencySections = ["dependencies", "devDependencies", "optionalDependencies"];

  for (const section of dependencySections) {
    for (const dependency of Object.keys(packageJson[section] ?? {})) {
      if (dependency.startsWith("@ying-ai/") || dependency.startsWith("@ying-companion/")) {
        violations.push(
          `package.json ${section} must not depend on sibling package '${dependency}'`,
        );
      }

      const forbiddenDependency = forbiddenRuntimeImports.find((packageName) =>
        isPackageOrSubpath(dependency, packageName),
      );
      if (forbiddenDependency !== undefined) {
        violations.push(`package.json ${section} must not include host dependency '${dependency}'`);
      }
    }
  }
}

async function main() {
  await verifyPackageDependencies();

  const sourceFiles = await collectTypeScriptFiles(sourceRoot);
  for (const filePath of sourceFiles) {
    inspectSource(filePath, await readFile(filePath, "utf8"));
  }

  if (violations.length > 0) {
    throw new Error(`ai-core boundary violations:\n- ${violations.join("\n- ")}`);
  }

  log(`ai-core boundaries verified (${sourceFiles.length} source files)`);
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
