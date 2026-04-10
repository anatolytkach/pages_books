#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function required(name) {
  const value = getArg(name, "").trim();
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

const record = {
  deployedAt: new Date().toISOString(),
  environment: required("--environment"),
  project: required("--project"),
  pagesBranch: required("--pages-branch"),
  sourceBranch: required("--source-branch"),
  commit: required("--commit"),
  url: required("--url"),
};

const optionalFields = [
  ["--deployment-id", "deploymentId"],
  ["--deployment-url", "deploymentUrl"],
  ["--actor", "actor"],
  ["--notes", "notes"],
];

for (const [flag, key] of optionalFields) {
  const value = getArg(flag, "").trim();
  if (value) record[key] = value;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const historyPath = path.join(repoRoot, "deployments", "history.jsonl");
fs.mkdirSync(path.dirname(historyPath), { recursive: true });
fs.appendFileSync(historyPath, `${JSON.stringify(record)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
