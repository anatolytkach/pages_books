#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "protected-fonts");
const CORPUS_REPORT = path.join(ARTIFACTS_DIR, "corpus-report.json");
const FONT_SOURCES = path.join(__dirname, "font-sources.json");
const OUTPUT = path.join(ARTIFACTS_DIR, "font-plan.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function detectDependency(packageName) {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`, { paths: [ROOT] });
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return { name: packageName, version: pkg.version, resolvedFrom: pkgPath };
  } catch (error) {
    return { name: packageName, version: null, resolvedFrom: null, missing: true };
  }
}

function selectSourceForScript(script, sources) {
  return sources.find((entry) => (entry.scripts || []).includes(script)) ||
    sources.find((entry) => (entry.scripts || []).includes("Unknown"));
}

function main() {
  if (!fs.existsSync(CORPUS_REPORT)) {
    throw new Error(`Missing corpus report: ${CORPUS_REPORT}`);
  }

  const corpus = readJson(CORPUS_REPORT);
  const sources = readJson(FONT_SOURCES);
  const scriptCounts = corpus.scripts || {};
  const requiredScripts = Object.entries(scriptCounts)
    .filter(([, count]) => count > 0)
    .map(([script]) => script)
    .sort();

  const fontAssignments = requiredScripts.map((script) => {
    const source = selectSourceForScript(script, sources.sources || []);
    return {
      script,
      usageCount: scriptCounts[script],
      fontSource: source ? source.primaryFamily : "UNMAPPED",
      alternates: source ? source.alternates : [],
      styles: source ? source.styles : {},
      coverageNote: source ? source.coverageNote : "No font source rule found.",
      gaps: source
        ? Object.entries(source.styles || {})
            .filter(([, value]) => value && value.status === "gap")
            .map(([style, value]) => ({ style, note: value.note }))
        : [{ style: "all", note: "No font source mapping available." }]
    };
  });

  const styleNeeds = (corpus.summary && corpus.summary.detectedStyleNeeds) || {};
  const styleGaps = [];
  for (const assignment of fontAssignments) {
    if (styleNeeds.italic && assignment.styles && assignment.styles.italic && assignment.styles.italic.status === "gap") {
      styleGaps.push({ script: assignment.script, style: "italic", note: assignment.styles.italic.note });
    }
    if (styleNeeds.boldItalic && assignment.styles && assignment.styles.boldItalic && assignment.styles.boldItalic.status === "gap") {
      styleGaps.push({ script: assignment.script, style: "boldItalic", note: assignment.styles.boldItalic.note });
    }
    if (styleNeeds.bold && assignment.styles && assignment.styles.bold && assignment.styles.bold.status === "gap") {
      styleGaps.push({ script: assignment.script, style: "bold", note: assignment.styles.bold.note });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    inputReport: path.relative(ROOT, CORPUS_REPORT),
    dependencies: {
      harfbuzzjs: detectDependency("harfbuzzjs"),
      opentypeJs: detectDependency("opentype.js")
    },
    scriptsDetected: requiredScripts,
    styleNeeds,
    fontAssignments,
    gaps: {
      styleGaps,
      unmappedScripts: fontAssignments.filter((item) => item.fontSource === "UNMAPPED").map((item) => item.script)
    }
  };

  writeJson(OUTPUT, payload);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

main();
