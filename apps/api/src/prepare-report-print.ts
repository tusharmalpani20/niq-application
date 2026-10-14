import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../");
const webAssets = resolve(root, "apps/web/dist/assets");
const apiAssets = resolve(root, "apps/api/assets");
const names = await readdir(webAssets);
const cssFiles = ["index-", "generated-report-"].map(prefix => {
  const name = names.find(item => item.startsWith(prefix) && item.endsWith(".css"));
  if (!name) throw new Error(`Web build is missing ${prefix} CSS`);
  return name;
});
const pieces = await Promise.all(cssFiles.map(name => readFile(resolve(webAssets, name), "utf8")));
let css = pieces.join("\n");
for (const fileName of new Set(Array.from(css.matchAll(/url\(\/assets\/([^)]*\.woff2)\)/g), match => match[1]!))) {
  const bytes = await readFile(resolve(webAssets, fileName));
  css = css.replaceAll(`url(/assets/${fileName})`, `url(data:font/woff2;base64,${bytes.toString("base64")})`);
}
if (css.includes("url(/assets/")) throw new Error("Report CSS contains unresolved assets");
await mkdir(apiAssets, { recursive: true });
await writeFile(resolve(apiAssets, "report-print.css"), css);
await copyFile(resolve(root, "apps/web/public/report-cover-food.webp"), resolve(apiAssets, "report-cover-food.webp"));
