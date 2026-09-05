import { readdir, readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url).pathname;

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(path));
    else if (extname(entry.name) === ".js") files.push(path);
  }
  return files;
}

for (const file of await collectJavaScript(join(root, "scripts"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

const manifest = JSON.parse(await readFile(join(root, "module.json"), "utf8"));
const languageFiles = await readdir(join(root, "lang"));
for (const file of [
  ...manifest.esmodules,
  ...manifest.styles,
  ...manifest.languages.map(language => language.path),
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
]) {
  await access(join(root, file), constants.F_OK);
}

const flatten = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) => {
  const full = prefix ? `${prefix}.${key}` : key;
  return child && typeof child === "object" && !Array.isArray(child) ? flatten(child, full) : [full];
});
const english = JSON.parse(await readFile(join(root, "lang/en.json"), "utf8"));
if (!english.MEL_STORYBOARD || typeof english.MEL_STORYBOARD !== "object") throw new Error("lang/en.json must use the MEL_STORYBOARD namespace.");
const expected = flatten(english);
for (const file of languageFiles) {
  const current = JSON.parse(await readFile(join(root, "lang", file), "utf8"));
  if (!current.MEL_STORYBOARD || typeof current.MEL_STORYBOARD !== "object") throw new Error(`${file}: missing MEL_STORYBOARD namespace`);
  const actual = flatten(current);
  const missing = expected.filter(key => !actual.includes(key));
  const extra = actual.filter(key => !expected.includes(key));
  if (missing.length || extra.length) throw new Error(`${file}: missing=${missing.join(",")} extra=${extra.join(",")}`);
}

console.log("JavaScript syntax, manifest paths, JSON, and localization keys are valid.");
