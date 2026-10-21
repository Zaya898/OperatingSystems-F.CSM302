// Worker-ийн код. Тусдаа .js файлаас Worker ачаалахад file:// дээр браузер хориглодог тул
// эдгээр функцийг <script>-ээр ачаалж, app.js дотор Blob URL-аар Worker болгон ажиллуулна.
// Функц бүр өөрийн Worker дотор бүтнээрээ ажиллах тул гаднах хувьсагч ашиглаж болохгүй.

function sortWorkerMain() {
  // Web Worker: one worker sorts only its assigned slice.
  // Async steps allow the worker to receive pause/resume/delay messages between operations.
  let paused = false;
  let delay = 0;
  let steps = 0;
  let pauseWaiters = [];

  function waitIfPaused() {
    if (!paused) return Promise.resolve();
    return new Promise(resolve => pauseWaiters.push(resolve));
  }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  // delay > 0: sleep every step. delay = 0 ("instant"): yield only occasionally so messages are still received.
  async function pace() {
    if (delay > 0) await sleep(delay);
    else if (++steps % 25 === 0) await sleep(0);
  }
  function emit(msg) {
    if (delay > 0 || steps % 25 === 0) self.postMessage(msg);
  }

  self.onmessage = async (event) => {
    const message = event.data;
    if (message.type === "pause") { paused = true; return; }
    if (message.type === "resume") {
      paused = false;
      pauseWaiters.splice(0).forEach(resolve => resolve());
      return;
    }
    if (message.type === "delay") { delay = message.delay; return; }
    if (message.type !== "sort") return;

    paused = false;
    delay = message.delay;
    steps = 0;
    const { runId, workerId, values } = message;
    const arr = values.slice();
    self.postMessage({ type: "started", runId, workerId, values: arr });

    // Insertion sort chosen for clear step-by-step visualization.
    for (let i = 1; i < arr.length; i++) {
      let j = i;
      while (j > 0 && arr[j - 1] > arr[j]) {
        await waitIfPaused();
        [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
        j--;
        emit({ type: "step", runId, workerId, values: arr.slice(), active: j });
        await pace();
      }
      await waitIfPaused();
      emit({ type: "step", runId, workerId, values: arr.slice(), active: i });
      await pace();
    }
    self.postMessage({ type: "done", runId, workerId, values: arr });
  };
}

function mergeWorkerMain() {
  // Web Worker: merges two already sorted arrays into one sorted array.
  let paused = false;
  let delay = 0;
  let steps = 0;
  let pauseWaiters = [];
  function waitIfPaused() {
    if (!paused) return Promise.resolve();
    return new Promise(resolve => pauseWaiters.push(resolve));
  }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  async function pace() {
    if (delay > 0) await sleep(delay);
    else if (++steps % 25 === 0) await sleep(0);
  }
  function emit(msg) {
    if (delay > 0 || steps % 25 === 0) self.postMessage(msg);
  }

  self.onmessage = async (event) => {
    const message = event.data;
    if (message.type === "pause") { paused = true; return; }
    if (message.type === "resume") {
      paused = false;
      pauseWaiters.splice(0).forEach(resolve => resolve());
      return;
    }
    if (message.type === "delay") { delay = message.delay; return; }
    if (message.type !== "merge") return;

    // Keep the pause state of the UI (it may already be paused when the merge worker starts).
    paused = !!message.paused;
    delay = message.delay;
    steps = 0;
    const { runId, left, right } = message;
    const result = [];
    let i = 0, j = 0;
    self.postMessage({ type: "started", runId, values: result.slice() });

    while (i < left.length && j < right.length) {
      await waitIfPaused();
      if (left[i] <= right[j]) result.push(left[i++]);
      else result.push(right[j++]);
      emit({ type: "step", runId, values: result.slice(), leftIndex: i, rightIndex: j });
      await pace();
    }
    while (i < left.length) {
      await waitIfPaused();
      result.push(left[i++]);
      emit({ type: "step", runId, values: result.slice(), leftIndex: i, rightIndex: j });
      await pace();
    }
    while (j < right.length) {
      await waitIfPaused();
      result.push(right[j++]);
      emit({ type: "step", runId, values: result.slice(), leftIndex: i, rightIndex: j });
      await pace();
    }
    self.postMessage({ type: "done", runId, values: result });
  };
}
