#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const MAC_SYSTEM_FONT_DIRS = [
  "/System/Library/Fonts",
  "/System/Library/Fonts/Supplemental",
  "/Library/Fonts"
];

function getWindowsDir() {
  return String(process.env.WINDIR || "C:\\Windows").trim() || "C:\\Windows";
}

function systemFontDirs() {
  const dirs = [];
  if (process.platform === "win32") {
    dirs.push(path.join(getWindowsDir(), "Fonts"));
    const localAppData = String(process.env.LOCALAPPDATA || "").trim();
    if (localAppData) dirs.push(path.join(localAppData, "Microsoft", "Windows", "Fonts"));
    return dirs;
  }
  return MAC_SYSTEM_FONT_DIRS;
}

function policyFontFiles() {
  if (process.platform === "win32") {
    const fontsDir = path.join(getWindowsDir(), "Fonts");
    return {
      "Arial": {
        regular: path.join(fontsDir, "arial.ttf"),
        italic: path.join(fontsDir, "ariali.ttf"),
        bold: path.join(fontsDir, "arialbd.ttf"),
        boldItalic: path.join(fontsDir, "arialbi.ttf")
      },
      "Times New Roman": {
        regular: path.join(fontsDir, "times.ttf"),
        italic: path.join(fontsDir, "timesi.ttf"),
        bold: path.join(fontsDir, "timesbd.ttf"),
        boldItalic: path.join(fontsDir, "timesbi.ttf")
      },
      "Georgia": {
        regular: path.join(fontsDir, "georgia.ttf"),
        italic: path.join(fontsDir, "georgiai.ttf"),
        bold: path.join(fontsDir, "georgiab.ttf"),
        boldItalic: path.join(fontsDir, "georgiaz.ttf")
      }
    };
  }
  return {
    "Arial": {
      regular: "/System/Library/Fonts/Supplemental/Arial.ttf",
      italic: "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
      bold: "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
      boldItalic: "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"
    },
    "Times New Roman": {
      regular: "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
      italic: "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
      bold: "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
      boldItalic: "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf"
    },
    "Georgia": {
      regular: "/System/Library/Fonts/Supplemental/Georgia.ttf",
      italic: "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
      bold: "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
      boldItalic: "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"
    }
  };
}

function fileExists(filePath) {
  return !!filePath && fs.existsSync(filePath);
}

function isFontFile(fileName) {
  return /\.(ttf|otf)$/i.test(fileName);
}

function walkFonts(rootDir, found = []) {
  if (!rootDir || !fs.existsSync(rootDir)) return found;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFonts(abs, found);
      continue;
    }
    if (entry.isFile() && isFontFile(entry.name)) {
      found.push(abs);
    }
  }
  return found;
}

function normalizeFamilyName(name) {
  return String(name || "")
    .replace(/\.(ttf|otf)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function guessStyleFromFile(filePath) {
  const lower = path.basename(filePath).toLowerCase();
  if (lower.includes("bold italic") || lower.includes("bolditalic")) return "boldItalic";
  if (lower.includes("italic")) return "italic";
  if (lower.includes("bold")) return "bold";
  return "regular";
}

function detectEmbeddedFonts(book) {
  const rootDir = book && book.rootDir;
  const discovered = walkFonts(rootDir);
  const byFamily = new Map();
  for (const filePath of discovered) {
    const familyName = normalizeFamilyName(path.basename(filePath));
    const style = guessStyleFromFile(filePath);
    if (!byFamily.has(familyName)) byFamily.set(familyName, {});
    byFamily.get(familyName)[style] = filePath;
  }
  return {
    files: discovered,
    byFamily
  };
}

function detectPolicyFonts() {
  const resolved = new Map();
  for (const [familyName, styles] of Object.entries(policyFontFiles())) {
    const styleFiles = {};
    for (const [style, filePath] of Object.entries(styles)) {
      if (fileExists(filePath)) styleFiles[style] = filePath;
    }
    if (Object.keys(styleFiles).length) {
      resolved.set(normalizeFamilyName(familyName), {
        familyName,
        styles: styleFiles
      });
    }
  }
  return resolved;
}

function detectSystemFonts() {
  const discovered = [];
  for (const dir of systemFontDirs()) {
    if (fs.existsSync(dir)) walkFonts(dir, discovered);
  }
  return discovered;
}

function extractFontAssets(book) {
  return {
    embedded: detectEmbeddedFonts(book),
    policy: detectPolicyFonts(),
    systemFiles: detectSystemFonts()
  };
}

module.exports = {
  extractFontAssets,
  normalizeFamilyName,
  guessStyleFromFile
};
