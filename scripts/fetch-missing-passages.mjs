// Resume script: fills in whatever refs are still missing from passages-web.json
// (bible-api.com free tier rate-limits hard — this paces requests much slower
// and backs off longer on 429 than the original fetch-passages.mjs run did).
import { readFileSync, writeFileSync } from "fs";

const ALL_REFS = ["John 1","Mark 1","Luke 1","Matthew 1","John 3","Mark 2","Luke 2",
  "Matthew 5","John 4","Mark 4","Luke 6","Matthew 6","John 6","Mark 6",
  "Luke 10","Matthew 11","John 8","Mark 8","Luke 15","Matthew 14","John 11",
  "Genesis 1","Genesis 12","Exodus 3","Exodus 20","Psalm 1","Isaiah 40",
  "Isaiah 53","John 19","John 20","Acts 2","Romans 8",
  "1 Corinthians 13","Galatians 5","Ephesians 2","Philippians 4","Hebrews 11",
  "James 1","Revelation 21",
  "Psalm 8","Proverbs 1","Proverbs 2","Psalm 19","Proverbs 3",
  "Psalm 23","Proverbs 4","Psalm 27","Proverbs 5","Psalm 34","Proverbs 6",
  "Psalm 37","Proverbs 7","Psalm 42","Proverbs 8","Psalm 46","Proverbs 9",
  "Psalm 51","Proverbs 10","Psalm 63","Proverbs 11","Psalm 84","Proverbs 12",
  "Psalm 90","Proverbs 13","Psalm 91","Proverbs 14","Psalm 100","Proverbs 15",
  "Psalm 103","Proverbs 16","Psalm 119:1-32","Proverbs 17","Psalm 121","Proverbs 18",
  "Psalm 130","Proverbs 19","Psalm 139","Proverbs 20","Psalm 145","Proverbs 21"];
const refs = Array.from(new Set(ALL_REFS));

const path = new URL("../passages-web.json", import.meta.url);
let out = {};
try { out = JSON.parse(readFileSync(path, "utf8")); } catch (e) {}

const missing = refs.filter(r => !out[r]);
console.error("Missing " + missing.length + " of " + refs.length + " passages...");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const failures = [];
for (const ref of missing) {
  const url = "https://bible-api.com/" + encodeURIComponent(ref) + "?translation=web";
  let ok = false;
  for (let attempt = 0; attempt < 6 && !ok; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data.verses || !data.verses.length) throw new Error("no verses");
      out[ref] = data.verses.map(v => [v.verse, v.text.replace(/\s+/g, " ").trim()]);
      ok = true;
      console.error("OK  " + ref + " (" + out[ref].length + " verses)");
    } catch (e) {
      console.error("retry " + ref + ": " + e.message);
      await sleep(1500);
    }
  }
  if (!ok) failures.push(ref);
  await sleep(1200); // slow and polite — the free API rate-limits aggressively
}

writeFileSync(path, JSON.stringify(out, null, 0));
console.error("Wrote " + Object.keys(out).length + " of " + refs.length + " total passages to passages-web.json");
if (failures.length) {
  console.error("STILL FAILED: " + failures.join(", "));
  process.exitCode = 1;
}
