const $ = (id) => document.getElementById(id);
const input = $("numbers");
const sizeInput = $("array-size");
const speedInput = $("speed");
const startBtn = $("start-btn");
const pauseBtn = $("pause-btn");
const resetBtn = $("reset-btn");
const randomBtn = $("random-btn");

let workers = [];
let runId = 0;
let running = false;
let paused = false;
let finishedWorkers = new Map();
let sortedParts = [null, null];
let startTime = 0;
let originalValues = [];

function setMessage(text, isError = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", isError);
}
function parseInput() {
  const raw = input.value.trim();
  if (!raw) throw new Error("Жагсаалт хоосон байна. Хоёр ба түүнээс олон бүхэл тоо оруулна уу.");
  const tokens = raw.split(/[,\s;]+/).filter(Boolean);
  const values = tokens.map(token => {
    if (!/^[+-]?\d+$/.test(token)) throw new Error(`“${token}” нь бүхэл тоо биш байна.`);
    const n = Number(token);
    if (!Number.isSafeInteger(n)) throw new Error(`“${token}” нь JavaScript-ийн аюулгүй бүхэл тооны хязгаараас хэтэрсэн байна.`);
    return n;
  });
  if (values.length < 2) throw new Error("Хамгийн багадаа 2 бүхэл тоо оруулна уу.");
  if (values.length > 200) throw new Error("Энэ хувилбар 200 хүртэлх элементийг дэмжинэ.");
  return values;
}
const workerUrls = new Map();
function workerUrl(fn) {
  // Worker-ийг Blob URL-аар үүсгэнэ: index.html-ийг шууд (file://) нээхэд ч ажиллана.
  if (!workerUrls.has(fn)) {
    workerUrls.set(fn, URL.createObjectURL(new Blob([`(${fn.toString()})()`], { type: "text/javascript" })));
  }
  return workerUrls.get(fn);
}
function makeWorker(fn, onMessage) {
  const worker = new Worker(workerUrl(fn));
  worker.onmessage = onMessage;
  worker.onerror = (e) => {
    setMessage(`Worker алдаа: ${e.message || "ажиллагааны алдаа"}`, true);
    cleanupWorkers();
    running = false;
    updateButtons();
  };
  workers.push(worker);
  return worker;
}
function cleanupWorkers() {
  workers.forEach(w => w.terminate());
  workers = [];
}
function updateButtons() {
  startBtn.disabled = running;
  randomBtn.disabled = running;
  pauseBtn.disabled = !running;
  pauseBtn.textContent = paused ? "Үргэлжлүүлэх" : "Түр зогсоох";
  input.disabled = running;
  sizeInput.disabled = running;
}
function renderBars(id, values, activeIndex = -1, sorted = false) {
  const container = $(id);
  container.replaceChildren();
  if (!values || values.length === 0) return;
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(1, max - min);
  values.forEach((value, index) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    const label = document.createElement("span");
    label.className = "bar-value";
    label.textContent = value;
    const shape = document.createElement("div");
    shape.className = "bar-shape" + (sorted ? " sorted" : "") + (index === activeIndex ? " active" : "");
    shape.style.height = `${Math.max(8, 24 + ((value - min) / span) * 72)}px`;
    shape.title = `Индекс ${index}: ${value}`;
    bar.append(label, shape);
    container.append(bar);
  });
}
function resetViews() {
  renderBars("worker0-view", []);
  renderBars("worker1-view", []);
  renderBars("merge-view", []);
  $("worker0-status").textContent = "Хүлээж байна";
  $("worker1-status").textContent = "Хүлээж байна";
  $("merge-status").textContent = "Хоёр sorting worker дуусахыг хүлээж байна";
  $("result").textContent = "Эрэмбэлэлт дуусаагүй байна.";
  $("verification").textContent = "";
  $("metrics").replaceChildren();
}
function addMetric(label, value) {
  const el = document.createElement("span");
  el.className = "metric";
  el.textContent = `${label}: ${value}`;
  $("metrics").append(el);
}
function handleSortMessage(event) {
  const m = event.data;
  if (m.runId !== runId) return;
  const view = m.workerId === 0 ? "worker0-view" : "worker1-view";
  const status = m.workerId === 0 ? "worker0-status" : "worker1-status";
  if (m.type === "started") {
    $(status).textContent = "Ажиллаж байна";
    renderBars(view, m.values);
  } else if (m.type === "step") {
    $(status).textContent = paused ? "Түр зогссон" : "Эрэмбэлж байна…";
    renderBars(view, m.values, m.active);
  } else if (m.type === "done") {
    sortedParts[m.workerId] = m.values;
    finishedWorkers.set(m.workerId, true);
    $(status).textContent = "Дууссан ✓";
    renderBars(view, m.values, -1, true);
    if (finishedWorkers.size === 2) beginMerge();
  }
}
function beginMerge() {
  if (!running || sortedParts.some(part => !part)) return;
  $("merge-status").textContent = "Merge worker ажиллаж байна";
  const mergeWorker = makeWorker(mergeWorkerMain, (event) => {
    const m = event.data;
    if (m.runId !== runId) return;
    if (m.type === "started") renderBars("merge-view", m.values);
    if (m.type === "step") {
      $("merge-status").textContent = paused ? "Түр зогссон" : `Нэгтгэж байна… (${m.values.length}/${originalValues.length})`;
      renderBars("merge-view", m.values, m.values.length - 1);
    }
    if (m.type === "done") {
      renderBars("merge-view", m.values, -1, true);
      $("merge-status").textContent = "Нэгтгэлт дууссан ✓";
      $("result").textContent = `[${m.values.join(", ")}]`;
      const correctOrder = m.values.every((v, i) => i === 0 || m.values[i - 1] <= v);
      const expected = originalValues.slice().sort((a, b) => a - b);
      const sameElements = m.values.length === expected.length &&
        m.values.every((v, i) => v === expected[i]);
      $("verification").textContent = correctOrder && sameElements
        ? "Шалгалт амжилттай: дараалал зөв бөгөөд бүх оролтын утга хадгалагдсан."
        : "Шалгалт амжилтгүй: үр дүнг дахин шалгана уу.";
      addMetric("Элемент", m.values.length);
      addMetric("Нийт хугацаа (анимацитай)", `${((performance.now() - startTime) / 1000).toFixed(2)} сек`);
      addMetric("Sorting thread", "2");
      addMetric("Merge worker", "1");
      running = false;
      paused = false;
      updateButtons();
      setMessage("Амжилттай дууслаа. Шинэ өгөгдлөөр дахин туршиж болно.");
      cleanupWorkers();
    }
  });
  mergeWorker.postMessage({ type: "merge", runId, left: sortedParts[0], right: sortedParts[1], delay: Number(speedInput.value), paused });
}
function start() {
  let values;
  try { values = parseInput(); }
  catch (error) { setMessage(error.message, true); return; }

  cleanupWorkers();
  runId++;
  const thisRun = runId;
  originalValues = values.slice();
  sortedParts = [null, null];
  finishedWorkers = new Map();
  running = true;
  paused = false;
  startTime = performance.now();
  resetViews();
  renderBars("original-view", originalValues);
  $("count-label").textContent = `${values.length} элемент`;
  setMessage("Хоёр sorting worker зэрэг ажиллаж эхэллээ.");
  updateButtons();

  const half = Math.floor(values.length / 2); // сондгой үед хоёр дахь хэсэг 1 элементээр том
  const left = values.slice(0, half);
  const right = values.slice(half);
  const delay = Number(speedInput.value);
  let w0, w1;
  try {
    w0 = makeWorker(sortWorkerMain, handleSortMessage);
    w1 = makeWorker(sortWorkerMain, handleSortMessage);
  } catch (error) {
    setMessage(`Web Worker үүсгэж чадсангүй: ${error.message}`, true);
    cleanupWorkers();
    running = false;
    updateButtons();
    return;
  }
  w0.postMessage({ type: "sort", runId: thisRun, workerId: 0, values: left, delay });
  w1.postMessage({ type: "sort", runId: thisRun, workerId: 1, values: right, delay });
}
function togglePause() {
  if (!running) return;
  paused = !paused;
  const type = paused ? "pause" : "resume";
  workers.forEach(worker => worker.postMessage({ type }));
  $("worker0-status").textContent = paused ? "Түр зогссон" : (sortedParts[0] ? "Дууссан ✓" : "Эрэмбэлж байна…");
  $("worker1-status").textContent = paused ? "Түр зогссон" : (sortedParts[1] ? "Дууссан ✓" : "Эрэмбэлж байна…");
  if (paused) $("merge-status").textContent = "Түр зогссон";
  setMessage(paused ? "Дүрслэлийн ажиллагааг түр зогсоолоо." : "Ажиллагааг үргэлжлүүлж байна.");
  updateButtons();
}
function reset() {
  runId++;
  cleanupWorkers();
  running = false;
  paused = false;
  sortedParts = [null, null];
  finishedWorkers = new Map();
  try {
    originalValues = parseInput();
    renderBars("original-view", originalValues);
    $("count-label").textContent = `${originalValues.length} элемент`;
    setMessage("Reset хийгдлээ. Өгөгдөл бэлэн байна.");
  } catch {
    originalValues = [];
    renderBars("original-view", []);
    $("count-label").textContent = "0 элемент";
    setMessage("Reset хийгдлээ. Эхлүүлэхийн өмнө зөв өгөгдөл оруулна уу.");
  }
  resetViews();
  updateButtons();
}
randomBtn.addEventListener("click", () => {
  const n = Number(sizeInput.value);
  if (!Number.isInteger(n) || n < 2 || n > 200) {
    setMessage("Санамсаргүй өгөгдлийн хэмжээ 2–200 хоорондох бүхэл тоо байх ёстой.", true);
    return;
  }
  const values = Array.from({length:n}, () => Math.floor(Math.random() * 99) - 20);
  input.value = values.join(", ");
  reset();
});
speedInput.addEventListener("change", () => {
  // Хурдыг ажиллаж байх үед ч солих боломжтой
  workers.forEach(worker => worker.postMessage({ type: "delay", delay: Number(speedInput.value) }));
});
startBtn.addEventListener("click", start);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", reset);
input.addEventListener("input", () => {
  if (!running) {
    try {
      const values = parseInput();
      renderBars("original-view", values);
      $("count-label").textContent = `${values.length} элемент`;
      setMessage("Оролт шинэчлэгдлээ. Эхлүүлэхэд бэлэн.");
    } catch (error) {
      setMessage(error.message, true);
    }
  }
});
reset();
