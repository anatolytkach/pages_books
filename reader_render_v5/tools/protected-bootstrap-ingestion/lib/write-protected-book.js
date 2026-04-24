import fs from "fs";
import path from "path";

export function writeProtectedBook(outputRoot, manifest) {
  const resolvedRoot = path.resolve(outputRoot);
  fs.mkdirSync(resolvedRoot, { recursive: true });
  fs.writeFileSync(
    path.join(resolvedRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  return resolvedRoot;
}
