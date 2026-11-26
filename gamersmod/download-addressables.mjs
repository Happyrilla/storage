import fs from "node:fs/promises";
import path from "node:path";

const remoteBase = "https://storage.yandexcloud.net/itsjasonstudiobasebacket/GamersMod/Adressables/1.0";
const catalogPath = "StreamingAssets/aa/catalog.bin";
const outDir = "StreamingAssets/aa/bundles-local00";
const concurrency = 8;

const catalog = await fs.readFile(catalogPath, "latin1");
const names = [...new Set(catalog.match(/[A-Za-z0-9_.-]+\.bundle/g) || [])]
  .filter((name) => !/^[0-9a-f]{32}\.bundle$/i.test(name))
  .sort();
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile("addressables-list.txt", names.join("\n") + "\n");

let cursor = 0;
let completed = 0;
let downloaded = 0;
const failures = [];

async function exists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.size > 0;
  } catch {
    return false;
  }
}

async function worker() {
  while (cursor < names.length) {
    const name = names[cursor++];
    const dest = path.join(outDir, name);
    if (await exists(dest)) {
      completed++;
      continue;
    }

    const url = `${remoteBase}/${encodeURIComponent(name)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(dest, bytes);
      downloaded += bytes.length;
    } catch (error) {
      failures.push({ name, error: error.message });
    } finally {
      completed++;
      if (completed % 25 === 0 || completed === names.length) {
        console.log(`${completed}/${names.length} complete`);
      }
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
await fs.writeFile("addressables-download-report.json", JSON.stringify({
  remoteBase,
  total: names.length,
  failures,
  downloadedBytes: downloaded,
}, null, 2));

if (failures.length) {
  console.error(`${failures.length} download failures`);
  process.exitCode = 1;
} else {
  console.log(`Downloaded ${names.length} bundles, ${downloaded} bytes new.`);
}
