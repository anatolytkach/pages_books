import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const runAllSuites = process.argv.includes("--all");

function collectNodeTests(dirPath) {
  const entries = [];
  for (const name of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...collectNodeTests(fullPath));
      continue;
    }
    if (name.endsWith(".test.mjs")) {
      entries.push(fullPath);
    }
  }
  return entries;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  return Number(result.status ?? 0);
}

function resolvePythonCommand() {
  if (process.env.PYTHON_BIN) {
    const parts = String(process.env.PYTHON_BIN).trim().split(/\s+/);
    return { command: parts[0], args: parts.slice(1) };
  }
  const candidates = process.platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, "--version"], {
      cwd: repoRoot,
      stdio: "ignore",
      shell: false,
    });
    if (!probe.error && Number(probe.status ?? 1) === 0) {
      return candidate;
    }
  }
  throw new Error("Unable to find a Python interpreter. Set PYTHON_BIN to override.");
}

const nodeTests = collectNodeTests(path.join(repoRoot, "tests"))
  .filter((filePath) => /[\\/]tests[\\/](integration|unit)[\\/].+\.test\.mjs$/i.test(filePath))
  .filter((filePath) => runAllSuites || !/[\\/]tests[\\/]unit[\\/]publisher-tasks\.unit\.test\.mjs$/i.test(filePath))
  .sort();

const nodeStatus = run(process.execPath, ["--test", ...nodeTests]);
if (nodeStatus !== 0) process.exit(nodeStatus);

const python = resolvePythonCommand();
const pythonStatus = run(
  python.command,
  [...python.args, path.join("tests", "unit", "test_validate_docx.py")],
  {
    env: {
      ...process.env,
      PYTHONPATH: process.env.PYTHONPATH
        ? `${repoRoot}${path.delimiter}${process.env.PYTHONPATH}`
        : repoRoot,
    },
  },
);

process.exit(pythonStatus);
