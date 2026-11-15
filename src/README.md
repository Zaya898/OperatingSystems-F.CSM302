# Multithreaded Sorting Application

Browser-based educational implementation of Project 2. Two Web Workers sort two equal halves concurrently; a third Web Worker merges the sorted halves. The UI visualizes sorting and merging steps.

## Requirements
- A modern browser with Web Worker support.
- No server or installation is needed.

## Run
Double-click `index.html` (or open it in Chrome / Edge / Firefox). Workers are created from `workers-code.js` through Blob URLs, so it also works from `file://`.
Optional: `python -m http.server 8000` and open http://localhost:8000

## Features
- User-entered integer list; comma or whitespace separated.
- Random lists of 2–200 elements. Odd sizes are supported (second half is one element larger).
- Two sorting Web Workers using insertion sort.
- A separate merge Web Worker.
- Sorting/merge step visualization, pause/resume, reset, speed can be changed while running ("Шууд" = no animation delay).
- Input validation and post-run verification.

## Important implementation note
Web Workers run separately from the UI thread and are used here to demonstrate concurrent sorting and merging in a browser. They are not a portable interface for controlling native operating-system threads. Confirm with the instructor whether browser Web Workers satisfy the course's intended thread requirement.

## Suggested tests
1. Textbook example: `7, 12, 19, 3, 18, 4, 2, 6, 15, 8`
2. Already sorted: `-5, -1, 0, 4`
3. Reverse order: `9, 7, 5, 3, 1, -2`
4. Duplicates and negatives: `4, -1, 4, 0, -1, 2`
5. Invalid token: `2, hello, 4`
6. Odd-sized input: `1, 2, 3` (supported)
7. Empty input
8. Random arrays of different even sizes

## Project structure
- `index.html` — controls and visualization layout
- `styles.css` — responsive styling
- `app.js` — input validation, orchestration, rendering, and result checks
- `workers-code.js` — code of the sorting worker (`sortWorkerMain`) and the merge worker (`mergeWorkerMain`)

## Current scope
This is the initial working prototype. Before final submission, test in the target browser, refine error handling and pause/reset behavior, record screenshots and measured results, and write the report and manual.

## Оролтын дүрэм
- Тусгаарлагч: таслал, цэг таслал, зай, шинэ мөр. `1,,2` эсвэл төгсгөлийн таслал нь хоосон хэсэгтэй тул алдаа өгнө.
- Word/PDF-ээс хуулсан тусгай хасах тэмдэгт (−) автоматаар энгийн `-` болно. `007` нь `7` гэж уншигдана.

## Дүрслэл
Бүх самбар ижил масштабтай (өндөр нь утгатай пропорциональ, сөрөг утга тэг шугамаас доош). Merge явцад Worker 0/1 самбарт ашиглагдсан элемент бүдэг, дараагийн харьцуулах элемент шар болно; merge самбарт элемент бүр аль worker-оос ирснийг цэнхэр/ягаанаар ялгана.

## Автомат тест
`node tests/run-tests.js` (Node.js 16+). Оролтын задлагч болон `workers-code.js` доторх sorting/merge worker-уудыг Node дээр дуурайлган ажиллуулж 27 шалгалт хийнэ: 10 эрэмбэлэлт+нэгтгэлийн тохиолдол (номын жишээ, сондгой, сөрөг, давхардсан, 200 элемент гэх мэт), 4 зөв оролт, 12 буруу оролт, 1 алхамчилсан горим.

## Алхамчилсан горим (Step)
«Алхамчилсан горим» нүдийг идэвхжүүлээд «Эхлүүлэх» дарна. Дараа нь «Алхам ▶» товч (эсвэл гарны → товч)-ыг дарах бүрт ажиллаж буй worker бүр яг нэг үйлдэл (харьцуулалт/солилт/нэгтгэлийн нэг элемент) хийнэ: эрэмбэлэх үед хоёр sorting worker хоёулаа, нэгтгэх үед merge worker. Горимыг ажиллаж байхад ч асаах/унтраах боломжтой; унтраахад сонгосон хурдаар автоматаар үргэлжилнэ. Алхамчилсан горимд Pause болон хурд хамаарахгүй.
