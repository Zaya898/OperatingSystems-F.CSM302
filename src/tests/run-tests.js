// Ажиллуулах: node tests/run-tests.js
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const root = path.join(__dirname, "..");
const { parseNumbers, mergeSources } = require(path.join(root, "input-utils.js"));
const workerCode = fs.readFileSync(path.join(root, "workers-code.js"), "utf8");

// Worker-ийг Node дээр дуурайна: self.postMessage-ийг барьж, "done" мессежийг буцаана
function runWorker(fnName, msg) {
  return new Promise((resolve, reject) => {
    const self = { postMessage: m => { if (m.type === "done") resolve(m); else if (m.type === "error") reject(new Error(m.msg)); } };
    vm.runInContext(`${workerCode};(${fnName})();`, vm.createContext({ self, setTimeout, performance }));
    self.onmessage({ data: msg });
  });
}
async function sortAll(values) {
  const half = Math.floor(values.length / 2);
  const [a, b] = await Promise.all([
    runWorker("sortWorkerMain", { type: "sort", runId: 1, workerId: 0, values: values.slice(0, half), delay: 0 }),
    runWorker("sortWorkerMain", { type: "sort", runId: 1, workerId: 1, values: values.slice(half), delay: 0 }),
  ]);
  const m = await runWorker("mergeWorkerMain", { type: "merge", runId: 1, left: a.values, right: b.values, delay: 0, paused: false });
  // vm-ийн өөр realm-ээс ирсэн массивыг энгийн массив болгоно (deepStrictEqual-д хэрэгтэй)
  return { merged: Array.from(m.values), left: Array.from(a.values), right: Array.from(b.values) };
}

const rnd = n => Array.from({ length: n }, () => Math.floor(Math.random() * 2001) - 1000);
const sortCases = {
  "Номын жишээ": [7, 12, 19, 3, 18, 4, 2, 6, 15, 8], "Сондгой хэмжээ": [5, 1, 4, 2, 9, 3, 8], "2 элемент": [2, 1],
  "Давхардсан": [3, 3, 1, 1, 2, 2, 3, 1], "Сөрөг": [-5, 3, -1, 0], "Бүгд ижил": [7, 7, 7, 7], "Эрэмбэлэгдсэн": [1, 2, 3, 4, 5],
  "Урвуу": [9, 7, 5, 3, 1], "8,3,1 (хуваалт 1+2)": [8, 3, 1], "Санамсаргүй 200": rnd(200),
};
const parseOk = { "1, 2, 3": [1, 2, 3], "-5; 3 -1\n0": [-5, 3, -1, 0], "\u22125, 3, \u22121, 0": [-5, 3, -1, 0], "+3, 007": [3, 7] };
const parseBad = ["", "   ", "7", "1, abc, 3", "2.5, 1", "1e3, 2", "0x10, 1", "1,,2", "1, 2,", ",1, 2", "9007199254740993, 1", Array(201).fill(1).join(",")];

let pass = 0, fail = 0;
const log = (ok, name) => { ok ? pass++ : fail++; console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); };
(async () => {
  for (const [name, vals] of Object.entries(sortCases)) {
    try {
      const { merged, left, right } = await sortAll(vals);
      assert.deepStrictEqual(merged, vals.slice().sort((x, y) => x - y));
      const src = mergeSources(left, right);                       // гарал үүслийн тооцоо зөв эсэх
      assert.strictEqual(src.filter(s => s === 0).length, left.length);
      assert.strictEqual(src.length, vals.length);
      log(true, `Эрэмбэлэлт + нэгтгэл: ${name} (n=${vals.length})`);
    } catch (e) { log(false, `Эрэмбэлэлт + нэгтгэл: ${name} — ${e.message}`); }
  }
  for (const [txt, exp] of Object.entries(parseOk)) {
    try { assert.deepStrictEqual(parseNumbers(txt), exp); log(true, `Зөв оролт: ${JSON.stringify(txt)}`); }
    catch (e) { log(false, `Зөв оролт: ${JSON.stringify(txt)} — ${e.message}`); }
  }
  for (const txt of parseBad) {
    const label = JSON.stringify(txt.length > 30 ? txt.slice(0, 20) + "…" : txt);
    try { parseNumbers(txt); log(false, `Буруу оролт татгалзах: ${label}`); } catch { log(true, `Буруу оролт татгалзах: ${label}`); }
  }
  // Алхамчилсан горим: «алхам» өгөхгүй бол worker урагшлахгүй, өгөх бүрт яг нэг үйлдэл хийнэ
  try {
    const events = [];
    const self = { postMessage: m => events.push(m) };
    vm.runInContext(`${workerCode};(sortWorkerMain)();`, vm.createContext({ self, setTimeout, performance }));
    self.onmessage({ data: { type: "sort", runId: 1, workerId: 0, values: [3, 1, 2], delay: 0, stepMode: true } });
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(80);
    const idle = events.filter(e => e.type === "step" || e.type === "done").length;
    self.onmessage({ data: { type: "step" } });
    await wait(80);
    const afterOne = events.filter(e => e.type === "step").length;
    for (let i = 0; i < 50 && !events.some(e => e.type === "done"); i++) { self.onmessage({ data: { type: "step" } }); await wait(25); }
    const done = events.find(e => e.type === "done");
    assert.strictEqual(idle, 0);
    assert.strictEqual(afterOne, 1);
    assert.deepStrictEqual(Array.from(done.values), [1, 2, 3]);
    log(true, "Алхамчилсан горим: алхамгүй үед зогсоно, 1 алхам = 1 үйлдэл, эцэст нь зөв үр дүн");
  } catch (e) { log(false, `Алхамчилсан горим — ${e.message}`); }
  console.log(`\nДҮН: ${pass}/${pass + fail} амжилттай`);
  process.exit(fail ? 1 : 0);
})();
