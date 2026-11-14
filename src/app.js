const $ = (id) => document.getElementById(id);
const input = $("numbers");
const sizeInput = $("array-size");
const speedInput = $("speed");
const startBtn = $("start-btn");
const pauseBtn = $("pause-btn");
const resetBtn = $("reset-btn");
const randomBtn = $("random-btn");
const stepBtn = $("step-btn");
const stepModeBox = $("step-mode");
const stepBackBtn = $("step-back-btn");
const stepCounter = $("step-counter");

let workers = [];
let runId = 0;
let running = false;
let paused = false;
let finishedWorkers = new Map();
let sortedParts = [null, null];
let startTime = 0;
let originalValues = [];
let mergeStarted = false;
let stepClicks = 0;
// Алхамчилсан горимын түүх: алхам бүрийн өмнөх төлвийн (DOM) хуулбар. Ухрахад эдгээрийг буцааж харуулна.
let history = [], histPos = -1, histBase = 0, liveSnap = null, viewingHistory = false, stepLockUntil = 0;

function setMessage(text, isError = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", isError);
}
function parseInput() { return parseNumbers(input.value); } // input-utils.js
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
  pauseBtn.disabled = !running || stepModeBox.checked;
  stepBtn.disabled = !stepModeBox.checked || !(running || viewingHistory);
  stepBackBtn.disabled = !stepModeBox.checked || !(viewingHistory ? histPos > 0 : history.length > 0);
  speedInput.disabled = stepModeBox.checked; // алхамчилсан горимд хурд хамаарахгүй
  pauseBtn.textContent = paused ? "Үргэлжлүүлэх" : "Түр зогсоох";
  input.disabled = running;
  sizeInput.disabled = running;
}
// Бүх панел ИЖИЛ масштабаар (анхны өгөгдлийн min/max) зурагдана. Өндрийг % -иар тооцдог тул самбарын
// хэмжээнд өөрөө таарна. Сөрөг утга тэг шугамаас доош зурагдана. Олон элементтэй үед баганууд нарийсаж ХУУДАСНД БАГТАНА.
function renderBars(id, values, activeIndex = -1, sorted = false, opts = {}) {
  const container = $(id);
  const hadContent = container.firstChild !== null;           // шинэчлэх үед хэрэглэгчийн гүйлгэсэн байрлалыг хадгална
  const prevLeft = container.scrollLeft, prevTop = container.scrollTop, prevNeg = container.dataset.neg === "1";
  container.replaceChildren();
  if (!values || values.length === 0) return;
  container.dataset.d = values.length > 100 ? "xl" : values.length > 24 ? "l" : "m"; // баганы өргөн: олон байх тусам нарийн
  const all = originalValues.length ? originalValues : values;
  const hi = Math.max(0, ...all), lo = Math.min(0, ...all);
  const span = (hi - lo) || 1;
  container.dataset.neg = lo < 0 ? "1" : "0";
  const zeroY = (-lo / span) * 100;
  // .chart нь гүйлгэгддэг (хэвтээ: олон элемент, босоо: сөрөг утгатай үед)
  const chart = document.createElement("div");
  chart.className = "chart";
  if (lo < 0) chart.dataset.neg = "1";
  values.forEach((value, index) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    const plot = document.createElement("div");
    plot.className = "plot";
    const h = (Math.abs(value) / span) * 100;
    const label = document.createElement("span");
    label.className = "bar-value";
    label.textContent = value;
    label.style.bottom = `calc(${value >= 0 ? zeroY + h : zeroY}% + 3px)`;
    const shape = document.createElement("div");
    let cls = "bar-shape" + (sorted ? " sorted" : "") + (index === activeIndex ? " active" : "");
    if (opts.sources) cls += opts.sources[index] === 0 ? " src0" : " src1";
    if (opts.dimBefore !== undefined && index < opts.dimBefore) cls += " consumed";
    if (opts.mark === index) cls += " next";
    shape.className = cls;
    shape.style.height = `${h}%`;
    shape.style.bottom = `${Math.max(0, value >= 0 ? zeroY : zeroY - h)}%`;
    shape.title = `Индекс ${index}: ${value}`;
    plot.append(label, shape);
    if (lo < 0) {
      const zero = document.createElement("div");
      zero.className = "zero-line";
      zero.style.bottom = `${zeroY}%`;
      plot.append(zero);
    }
    bar.append(plot);
    chart.append(bar);
  });
  container.append(chart);
  if (hadContent && prevNeg === (lo < 0)) {
    container.scrollLeft = prevLeft;
    container.scrollTop = prevTop;
  } else if (lo < 0) {
    // Анх зурахад сөрөг утгын хэмжээнд тохируулж босоо байрлалыг тавина (дээш/доош гүйлгэж болно)
    container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight) * (zeroY / 100);
  }
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
  mergeStarted = true;
  const sources = mergeSources(sortedParts[0], sortedParts[1]); // result бүрийн гарал үүсэл (өнгөөр ялгана)
  $("merge-status").textContent = "Merge worker ажиллаж байна";
  const mergeWorker = makeWorker(mergeWorkerMain, (event) => {
    const m = event.data;
    if (m.runId !== runId) return;
    if (m.type === "started") renderBars("merge-view", m.values);
    if (m.type === "step") {
      $("merge-status").textContent = paused ? "Түр зогссон" : `Нэгтгэж байна… (${m.values.length}/${originalValues.length})`;
      renderBars("merge-view", m.values, m.values.length - 1, false, { sources });
      // Merge worker-ийн илгээсэн leftIndex/rightIndex: ашигласан элемент бүдэг, дараагийн харьцуулах элемент шар
      renderBars("worker0-view", sortedParts[0], -1, true, { dimBefore: m.leftIndex, mark: m.leftIndex });
      renderBars("worker1-view", sortedParts[1], -1, true, { dimBefore: m.rightIndex, mark: m.rightIndex });
    }
    if (m.type === "done") {
      renderBars("merge-view", m.values, -1, true);
      renderBars("worker0-view", sortedParts[0], -1, true);
      renderBars("worker1-view", sortedParts[1], -1, true);
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
  mergeWorker.postMessage({ type: "merge", runId, left: sortedParts[0], right: sortedParts[1], delay: Number(speedInput.value), paused, stepMode: stepModeBox.checked });
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
  mergeStarted = false;
  clearHistory();
  running = true;
  paused = false;
  startTime = performance.now();
  resetViews();
  renderBars("original-view", originalValues);
  $("count-label").textContent = `${values.length} элемент`;
  setMessage(stepModeBox.checked
    ? "Алхамчилсан горим: «Алхам» товчийг дарах бүрт worker бүр нэг үйлдэл хийнэ."
    : "Хоёр sorting worker зэрэг ажиллаж эхэллээ.");
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
  w0.postMessage({ type: "sort", runId: thisRun, workerId: 0, values: left, delay, stepMode: stepModeBox.checked });
  w1.postMessage({ type: "sort", runId: thisRun, workerId: 1, values: right, delay, stepMode: stepModeBox.checked });
}
function togglePause() {
  if (!running) return;
  paused = !paused;
  const type = paused ? "pause" : "resume";
  workers.forEach(worker => worker.postMessage({ type }));
  // Зөвхөн дуусаагүй worker-ийн төлвийг өөрчилнө (дууссан нь "Дууссан ✓" хэвээр)
  [0, 1].forEach(id => {
    if (finishedWorkers.has(id)) return;
    $(`worker${id}-status`).textContent = paused ? "Түр зогссон" : "Эрэмбэлж байна…";
  });
  if (mergeStarted) $("merge-status").textContent = paused ? "Түр зогссон" : "Нэгтгэж байна…";
  setMessage(paused ? "Дүрслэлийн ажиллагааг түр зогсоолоо." : "Ажиллагааг үргэлжлүүлж байна.");
  updateButtons();
}
// ---- Алхамчилсан горим: урагшлах / ухрах ----
const SNAP_HTML = ["original-view", "worker0-view", "worker1-view", "merge-view", "metrics"];
const SNAP_TEXT = ["worker0-status", "worker1-status", "merge-status", "result", "verification"];
const snapshot = () => ({ html: SNAP_HTML.map(id => $(id).innerHTML), text: SNAP_TEXT.map(id => $(id).textContent) });
function restore(s) {
  SNAP_HTML.forEach((id, i) => { $(id).innerHTML = s.html[i]; });
  SNAP_TEXT.forEach((id, i) => { $(id).textContent = s.text[i]; });
}
function clearHistory() {
  history = []; histPos = -1; histBase = 0; liveSnap = null; viewingHistory = false; stepClicks = 0;
  document.body.classList.remove("replay");
  stepCounter.textContent = "Алхам 0 / 0";
}
function updateStepUI() {
  const n = viewingHistory ? histBase + histPos : stepClicks;
  stepCounter.textContent = `Алхам ${n} / ${stepClicks}`;
  document.body.classList.toggle("replay", viewingHistory);
  if (viewingHistory) setMessage(`⏪ Өмнөх төлөв: алхам ${n} / ${stepClicks}. «Урагшлах ▶» дарж үргэлжлүүлнэ.`);
  else if (stepClicks) setMessage(`Алхам ${stepClicks}: worker бүр нэг үйлдэл хийлээ.`);
  updateButtons();
}
// Урагшлах: түүх рүү ухарсан бол түүхээр урагшилна; бодит төлөвт байвал ажиллаж буй worker бүрт 1 "алхам" өгнө
function stepForward() {
  if (!stepModeBox.checked) return;
  if (viewingHistory) {
    histPos++;
    if (histPos >= history.length) { restore(liveSnap); viewingHistory = false; histPos = -1; }
    else restore(history[histPos]);
    return updateStepUI();
  }
  if (!running) return;
  history.push(snapshot());
  if (history.length > 400) { history.shift(); histBase++; }
  stepClicks++;
  stepLockUntil = performance.now() + 120; // worker-ийн хариу ирэх хүртэл ухрахыг түр хориглоно
  workers.forEach(worker => worker.postMessage({ type: "step" }));
  updateStepUI();
}
// Ухрах: өмнөх алхмын төлвийг (хуулбараас) харуулна. Worker-үүд ухрахгүй, зөвхөн дүрслэл буцна.
function stepBack() {
  if (!stepModeBox.checked || performance.now() < stepLockUntil) return;
  if (!viewingHistory) {
    if (history.length === 0) return;
    liveSnap = snapshot();
    viewingHistory = true;
    histPos = history.length - 1;
  } else if (histPos > 0) {
    histPos--;
  } else return;
  restore(history[histPos]);
  updateStepUI();
}
function reset() {
  runId++;
  cleanupWorkers();
  running = false;
  paused = false;
  sortedParts = [null, null];
  finishedWorkers = new Map();
  mergeStarted = false;
  clearHistory();
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
stepBtn.addEventListener("click", stepForward);
stepBackBtn.addEventListener("click", stepBack);
stepModeBox.addEventListener("change", () => {
  if (!stepModeBox.checked && viewingHistory) { // горимыг унтраахад бодит төлөв рүү буцна
    restore(liveSnap); viewingHistory = false; histPos = -1; document.body.classList.remove("replay");
  }
  if (running && stepModeBox.checked && paused) { // Pause-ийг цуцлаад алхамчилсан горимд шилжинэ
    paused = false;
    workers.forEach(worker => worker.postMessage({ type: "resume" }));
  }
  workers.forEach(worker => worker.postMessage({ type: "mode", stepMode: stepModeBox.checked }));
  if (running) setMessage(stepModeBox.checked ? "Алхамчилсан горим идэвхжлээ: «Алхам» товчоор урагшлуулна." : "Автомат горимд буцлаа.");
  updateButtons();
});
document.addEventListener("keydown", (e) => {
  if (!stepModeBox.checked || /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === "ArrowRight") { e.preventDefault(); stepForward(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); stepBack(); }
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
