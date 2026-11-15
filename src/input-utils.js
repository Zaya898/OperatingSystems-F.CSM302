// Цэвэр (DOM-гүй) функцууд: браузер болон Node тест хоёулаанд ашиглагдана.

// Оролтын текстийг бүхэл тоонуудын массив болгоно. Алдаа гарвал Error шиднэ.
function parseNumbers(text) {
  // Тусгай хасах тэмдэгтүүдийг (−, –, —) энгийн "-" болгоно (тайлан/Word-оос хуулахад гардаг)
  const raw = String(text).replace(/[\u2212\u2013\u2014]/g, "-").trim();
  if (!raw) throw new Error("Жагсаалт хоосон байна. Хоёр ба түүнээс олон бүхэл тоо оруулна уу.");
  if (/^[,;]|[,;]$|[,;]\s*[,;]/.test(raw)) {
    throw new Error("Хоосон хэсэг байна (жишээ нь “1,,2” эсвэл төгсгөлийн таслал). Тоонуудыг зөв тусгаарлана уу.");
  }
  const values = raw.split(/[,\s;]+/).filter(Boolean).map(token => {
    if (!/^[+-]?\d+$/.test(token)) throw new Error(`“${token}” нь бүхэл тоо биш байна.`);
    const n = Number(token);
    if (!Number.isSafeInteger(n)) throw new Error(`“${token}” нь JavaScript-ийн аюулгүй бүхэл тооны хязгаараас хэтэрсэн байна.`);
    return n;
  });
  if (values.length < 2) throw new Error("Хамгийн багадаа 2 бүхэл тоо оруулна уу.");
  if (values.length > 200) throw new Error("Энэ хувилбар 200 хүртэлх элементийг дэмжинэ.");
  return values;
}

// Merge-ийн үр дүн дэх элемент бүр аль хэсгээс (0 = зүүн/Worker 0, 1 = баруун/Worker 1) ирснийг тооцно.
// Merge worker-тэй ижил дүрэм (left <= right) ашиглана.
function mergeSources(left, right) {
  const s = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) { s.push(0); i++; } else { s.push(1); j++; }
  }
  while (i < left.length) { s.push(0); i++; }
  while (j < right.length) { s.push(1); j++; }
  return s;
}

if (typeof module !== "undefined") module.exports = { parseNumbers, mergeSources };
