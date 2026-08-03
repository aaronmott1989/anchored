// One-off build script: fetch every unique passage reference used by Anchored's
// reading plans from bible-api.com (World English Bible — public domain, matches
// the translation already quoted elsewhere in the app) and bundle them into a
// static passages-web.json the app fetches once and caches via the SW. Not part
// of the shipped runtime — run manually when a plan's reference list changes.
const GOSPELS = ["John 1","Mark 1","Luke 1","Matthew 1","John 3","Mark 2","Luke 2",
  "Matthew 5","John 4","Mark 4","Luke 6","Matthew 6","John 6","Mark 6",
  "Luke 10","Matthew 11","John 8","Mark 8","Luke 15","Matthew 14","John 11"];

const WHOLE = ["Genesis 1","Genesis 12","Exodus 3","Exodus 20","Psalm 1","Isaiah 40",
  "Isaiah 53","Matthew 5","John 1","Luke 15","John 19","John 20","Acts 2","Romans 8",
  "1 Corinthians 13","Galatians 5","Ephesians 2","Philippians 4","Hebrews 11",
  "James 1","Revelation 21"];

const PSALMS_PROVERBS_COMBO = ["Psalm 1 · Proverbs 1","Psalm 8 · Proverbs 2","Psalm 19 · Proverbs 3",
  "Psalm 23 · Proverbs 4","Psalm 27 · Proverbs 5","Psalm 34 · Proverbs 6",
  "Psalm 37 · Proverbs 7","Psalm 42 · Proverbs 8","Psalm 46 · Proverbs 9",
  "Psalm 51 · Proverbs 10","Psalm 63 · Proverbs 11","Psalm 84 · Proverbs 12",
  "Psalm 90 · Proverbs 13","Psalm 91 · Proverbs 14","Psalm 100 · Proverbs 15",
  "Psalm 103 · Proverbs 16","Psalm 119:1-32 · Proverbs 17","Psalm 121 · Proverbs 18",
  "Psalm 130 · Proverbs 19","Psalm 139 · Proverbs 20","Psalm 145 · Proverbs 21"];

const refs = new Set();
GOSPELS.forEach(r => refs.add(r));
WHOLE.forEach(r => refs.add(r));
PSALMS_PROVERBS_COMBO.forEach(combo => combo.split(" · ").forEach(r => refs.add(r)));

const list = Array.from(refs);
console.error("Fetching " + list.length + " unique passages...");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const out = {};
const failures = [];
for (const ref of list) {
  const url = "https://bible-api.com/" + encodeURIComponent(ref) + "?translation=web";
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data.verses || !data.verses.length) throw new Error("no verses");
      out[ref] = data.verses.map(v => [v.verse, v.text.replace(/\s+/g, " ").trim()]);
      ok = true;
      console.error("OK  " + ref + " (" + out[ref].length + " verses)");
    } catch (e) {
      console.error("retry " + ref + ": " + e.message);
      await sleep(500);
    }
  }
  if (!ok) failures.push(ref);
  await sleep(120); // be polite to the free API
}

if (failures.length) {
  console.error("FAILED: " + failures.join(", "));
  process.exitCode = 1;
}
console.log(JSON.stringify(out, null, 0));
