import fs from "node:fs/promises";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
const products = JSON.parse(
  await fs.readFile(
    new URL("../src/catalog/products.json", import.meta.url),
    "utf8",
  ),
);
products.push(...JSON.parse(await fs.readFile(new URL("../src/catalog/expanded-products.json", import.meta.url),"utf8")));
await fs.mkdir(new URL("../public/products/", import.meta.url), {
  recursive: true,
});
let next = 0,
  fail = 0;
async function worker() {
  while (next < products.length) {
    const p = products[next++];
    const output = new URL(
      "../public/products/" + p.id + ".webp",
      import.meta.url,
    );
    try {
      await fs.access(output);
      continue;
    } catch {}
    try {
      const original = new URL(p.image.url);
      const filename = original.pathname.split("/").at(-1);
      const thumb =
        "https://thumb.wikimedia.org" +
        original.pathname.replace("/commons/", "/commons/thumb/") +
        "/960px-" +
        filename;
      const response = await fetch(thumb, {
        headers: {
          "User-Agent":
            "BlackMarketGame/1.0 (local educational game; Wikimedia Commons attribution retained)",
        },
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      await sharp(bytes)
        .rotate()
        .resize({
          width: 1000,
          height: 800,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 84 })
        .toFile(fileURLToPath(output));
      console.log("Saved", p.id);
    } catch (e) {
      fail++;
      console.error(p.id, e.message);
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
if (fail) process.exitCode = 1;
