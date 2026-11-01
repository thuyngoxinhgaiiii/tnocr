/* TNOCR – Giai đoạn 1: gộp, tách, xoá, xoay trang PDF. Chạy hoàn toàn trong trình duyệt. */
(function () {
  "use strict";
  var root = document.getElementById("tab-pdf");
  if (!root || !window.PDFLib) return;
  var PDFDocument = PDFLib.PDFDocument, degrees = PDFLib.degrees;

  /* ---------- tiện ích ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function stem(n) { return n.replace(/\.[^.]+$/, ""); }
  function fmt(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function load(file) {
    return file.arrayBuffer().then(function (buf) { return PDFDocument.load(buf, { ignoreEncryption: true }); });
  }
  function save(blob, name) { if (window.TNSave) window.TNSave(blob, name); }
  function pdfBlob(doc) { return doc.save().then(function (u8) { return new Blob([u8], { type: "application/pdf" }); }); }

  /* "1-3, 5, 8-cuối" -> [[0,1,2],[4],[7,...]] (mỗi mục một mảng chỉ số trang, đếm từ 0) */
  function parseRanges(text, n, sep) {
    var parts = text.split(sep).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) throw new Error("Cô chưa nhập số trang.");
    return parts.map(function (p) { return rangeIdx(p, n); });
  }
  function rangeIdx(p, n) {
    // một mục có thể là danh sách "1-3,5" (khi tách theo dấu ;)
    var out = [];
    p.split(",").forEach(function (t) {
      t = t.trim().toLowerCase();
      if (!t) return;
      var m = /^(\d+|đầu|dau|first)?\s*(?:-|–|đến|den|to)\s*(\d+|cuối|cuoi|end|last)?$/.exec(t), a, b;
      if (m) {
        a = (!m[1] || /^(đầu|dau|first)$/.test(m[1])) ? 1 : +m[1];
        b = (!m[2] || /^(cuối|cuoi|end|last)$/.test(m[2])) ? n : +m[2];
      } else if (/^\d+$/.test(t)) { a = b = +t; }
      else if (/^(cuối|cuoi|end|last)$/.test(t)) { a = b = n; }
      else throw new Error("Không hiểu \"" + t + "\". Hãy viết như: 1-3, 5, 8-cuối");
      if (a < 1 || b > n || a > b) throw new Error("Khoảng trang \"" + t + "\" không hợp lệ (tệp có " + n + " trang).");
      for (var i = a; i <= b; i++) out.push(i - 1);
    });
    if (!out.length) throw new Error("Cô chưa nhập số trang.");
    return out;
  }

  /* ---------- ghi tệp .zip (không nén) để tải nhiều PDF cùng lúc ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return function (u8) { var x = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) x = t[(x ^ u8[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  })();
  function makeZip(files) { // files: [{name, data: Uint8Array}]
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = CRC(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true);
      h.setUint16(26, name.length, true);
      parts.push(h.buffer, name, f.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + f.data.length;
    });
    var csize = central.reduce(function (s, b) { return s + (b.byteLength || b.length); }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: "application/zip" });
  }

  /* ---------- giao diện ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".sub{display:flex;flex-wrap:wrap;gap:8px}" +
    ".sub button{background:var(--bg);color:var(--accent-ink);border-color:var(--line);font-weight:400}" +
    ".sub button[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent);font-weight:700}" +
    ".rowfile{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--bg)}" +
    ".rowfile .fname{flex:1 1 200px}.rowfile .tools{display:flex;gap:6px}" +
    ".rowfile button{padding:4px 10px;font-weight:400}" +
    ".field{display:flex;flex-direction:column;gap:6px;margin:10px 0}" +
    ".field input[type=text],.field input[type=number]{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);max-width:100%}" +
    ".field small{color:var(--muted);font-size:14px}";
  document.head.appendChild(css);

  var mode = "merge", mergeList = [], single = null; // single = {file, pages}
  var status = el("span", { id: "pdf-status", role: "status", class: "muted" });
  status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }

  var subs = el("div", { class: "sub", role: "group", "aria-label": "Chức năng PDF" });
  var MODES = [["merge", "Gộp PDF"], ["extract", "Trích trang"], ["split", "Tách thành nhiều tệp"], ["delete", "Xoá trang"], ["rotate", "Xoay trang"]];
  MODES.forEach(function (m) {
    var b = el("button", { type: "button", "data-m": m[0], text: m[1] });
    b.addEventListener("click", function () { mode = m[0]; say(""); render(); });
    subs.appendChild(b);
  });

  var picker = el("input", { type: "file", accept: "application/pdf,.pdf" });
  var dropLabel = el("label", { class: "drop" }, [picker, el("strong", { id: "pdf-drop-t" }), el("span", { id: "pdf-drop-s" })]);
  var body = el("div", {});
  var out = el("div", { class: "actions" });
  root.appendChild(el("p", { class: "privacy", text: "Tệp PDF được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  [el("section", {}, [el("h2", { text: "Chức năng" }), subs]),
   el("section", {}, [el("h2", { id: "pdf-h-file", text: "Chọn tệp" }), dropLabel, el("div", { id: "pdf-list", class: "files", style: "margin-top:12px" })]),
   el("section", { id: "pdf-opts" }),
   el("section", {}, [el("div", { class: "bar" }, [el("button", { id: "pdf-go", type: "button" }), status]), out]),
   el("section", { class: "note" }, [el("p", { text: "PDF có mật khẩu mở tệp thì cần gỡ mật khẩu trước. Tệp rất lớn (vài trăm MB) có thể làm trình duyệt chậm." })])
  ].forEach(function (s) { root.appendChild(s); });

  var list = root.querySelector("#pdf-list"), opts = root.querySelector("#pdf-opts"), go = root.querySelector("#pdf-go");

  function field(id, label, hint, value, type) {
    var i = el("input", { type: type || "text", id: id, value: value || "" });
    return el("label", { class: "field" }, [el("span", { text: label }), i, hint ? el("small", { text: hint }) : el("span")]);
  }

  function render() {
    Array.prototype.forEach.call(subs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === mode ? "true" : "false"); });
    var multi = mode === "merge";
    picker.multiple = multi;
    root.querySelector("#pdf-drop-t").textContent = multi ? "Bấm để chọn nhiều PDF, hoặc kéo thả vào đây" : "Bấm để chọn một PDF, hoặc kéo thả vào đây";
    root.querySelector("#pdf-drop-s").textContent = multi ? "Có thể thêm nhiều lần; sắp xếp thứ tự ở danh sách bên dưới." : "Chọn tệp khác sẽ thay tệp hiện tại.";
    list.textContent = ""; out.textContent = "";
    if (multi) {
      mergeList.forEach(function (it, i) {
        var tools = el("div", { class: "tools" }, [
          btn("↑", "Lên", i > 0, function () { swap(i, i - 1); }),
          btn("↓", "Xuống", i < mergeList.length - 1, function () { swap(i, i + 1); }),
          btn("Bỏ", "Bỏ tệp", true, function () { mergeList.splice(i, 1); render(); })
        ]);
        list.appendChild(el("div", { class: "rowfile" }, [
          el("span", { class: "fname", text: (i + 1) + ". " + it.file.name }),
          el("span", { class: "meta", text: (it.pages ? it.pages + " trang · " : "") + fmt(it.file.size) }), tools]));
      });
      go.textContent = "Gộp và lưu";
      go.disabled = mergeList.length < 2;
      opts.textContent = "";
    } else {
      if (single) list.appendChild(el("div", { class: "rowfile" }, [
        el("span", { class: "fname", text: single.file.name }),
        el("span", { class: "meta", text: (single.pages || "?") + " trang · " + fmt(single.file.size) })]));
      opts.textContent = "";
      if (mode === "extract") {
        opts.appendChild(el("h2", { text: "Trang cần giữ" }));
        opts.appendChild(field("o-range", "Số trang", "Ví dụ: 1-5, 8, 10-cuối. Kết quả là một PDF gồm các trang này theo đúng thứ tự cô gõ.", ""));
        go.textContent = "Trích và lưu";
      } else if (mode === "split") {
        opts.appendChild(el("h2", { text: "Cách tách" }));
        var sel = el("select", { id: "o-how" }, [
          el("option", { value: "n", text: "Mỗi N trang một tệp" }),
          el("option", { value: "ranges", text: "Theo các khoảng trang tự chọn" })]);
        opts.appendChild(el("label", { class: "field" }, [el("span", { text: "Kiểu tách" }), sel]));
        var dyn = el("div", { id: "o-dyn" });
        opts.appendChild(dyn);
        var draw = function () {
          dyn.textContent = "";
          dyn.appendChild(sel.value === "n"
            ? field("o-n", "Số trang mỗi tệp", "Ví dụ 1 để mỗi trang một tệp.", "1", "number")
            : field("o-ranges", "Các khoảng, ngăn cách bằng dấu chấm phẩy", "Ví dụ: 1-3; 4-6; 7-cuối  → ra 3 tệp.", ""));
        };
        sel.addEventListener("change", draw); draw();
        opts.appendChild(el("p", { class: "note", style: "border:0;padding:0", text: "Nhiều tệp sẽ được gói trong một tệp .zip; giải nén ra là có các PDF." }));
        go.textContent = "Tách và lưu";
      } else if (mode === "delete") {
        opts.appendChild(el("h2", { text: "Trang cần xoá" }));
        opts.appendChild(field("o-range", "Số trang", "Ví dụ: 2, 5-7.", ""));
        go.textContent = "Xoá và lưu";
      } else if (mode === "rotate") {
        opts.appendChild(el("h2", { text: "Xoay trang" }));
        opts.appendChild(field("o-range", "Số trang (để trống là tất cả)", "Ví dụ: 1-3, 9.", ""));
        var rs = el("select", { id: "o-deg" }, [
          el("option", { value: "90", text: "Xoay phải 90°" }), el("option", { value: "180", text: "Xoay 180°" }),
          el("option", { value: "270", text: "Xoay trái 90°" })]);
        opts.appendChild(el("label", { class: "field" }, [el("span", { text: "Hướng xoay" }), rs]));
        go.textContent = "Xoay và lưu";
      }
      go.disabled = !single;
    }
  }
  function btn(t, title, enabled, fn) {
    var b = el("button", { type: "button", class: "ghost", title: title, text: t });
    b.disabled = !enabled; b.addEventListener("click", fn); return b;
  }
  function swap(a, b) { var t = mergeList[a]; mergeList[a] = mergeList[b]; mergeList[b] = t; render(); }

  /* ---------- nạp tệp ---------- */
  function addFiles(fl) {
    var pdfs = Array.prototype.filter.call(fl, function (f) { return /\.pdf$/i.test(f.name) || f.type === "application/pdf"; });
    if (!pdfs.length) { say("Chỉ nhận tệp PDF.", true); return; }
    say("");
    if (mode === "merge") {
      pdfs.forEach(function (f) { var it = { file: f, pages: 0 }; mergeList.push(it); count(it); });
    } else {
      single = { file: pdfs[0], pages: 0 }; count(single);
    }
    render();
  }
  function count(it) {
    load(it.file).then(function (d) { it.pages = d.getPageCount(); render(); },
      function () { it.pages = 0; say("Không đọc được \"" + it.file.name + "\" (có thể bị khoá mật khẩu hoặc hỏng).", true); });
  }
  picker.addEventListener("change", function (e) { addFiles(e.target.files); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(function (n) { dropLabel.addEventListener(n, function (e) { e.preventDefault(); dropLabel.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (n) { dropLabel.addEventListener(n, function (e) { e.preventDefault(); dropLabel.classList.remove("over"); }); });
  dropLabel.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });

  /* ---------- thực hiện ---------- */
  function val(id) { var e = root.querySelector("#" + id); return e ? e.value : ""; }
  function done(blob, name, text) {
    say(text + " (" + fmt(blob.size) + ")");
    out.textContent = "";
    var b = el("button", { type: "button", text: "Lưu " + name });
    b.addEventListener("click", function () { save(blob, name); });
    out.appendChild(b);
  }
  function copyPages(src, idx) {
    return PDFDocument.create().then(function (d) {
      return d.copyPages(src, idx).then(function (ps) { ps.forEach(function (p) { d.addPage(p); }); return d; });
    });
  }

  go.addEventListener("click", function () {
    go.disabled = true; say("Đang xử lý..."); out.textContent = "";
    var p;
    try { p = run(); } catch (e) { say(e.message, true); render(); return; }
    p.then(function () { go.disabled = false; }, function (e) {
      say(e && e.message ? e.message : "Có lỗi khi xử lý tệp.", true); go.disabled = false;
    });
  });

  function run() {
    if (mode === "merge") {
      return mergeList.reduce(function (chain, it) {
        return chain.then(function (acc) {
          return load(it.file).then(function (d) {
            return acc.copyPages(d, d.getPageIndices()).then(function (ps) { ps.forEach(function (x) { acc.addPage(x); }); return acc; });
          });
        });
      }, PDFDocument.create()).then(pdfBlob).then(function (b) { done(b, "gop.pdf", "Đã gộp " + mergeList.length + " tệp."); });
    }
    if (!single || !single.pages) throw new Error("Cô chưa chọn tệp PDF hợp lệ.");
    var n = single.pages, base = stem(single.file.name);
    return load(single.file).then(function (src) {
      if (mode === "extract") {
        var idx = parseRanges(val("o-range"), n, ",").reduce(function (a, r) { return a.concat(r); }, []);
        return copyPages(src, idx).then(pdfBlob).then(function (b) { done(b, base + "_trich.pdf", "Đã trích " + idx.length + " trang."); });
      }
      if (mode === "delete") {
        var del = {}; parseRanges(val("o-range"), n, ",").forEach(function (r) { r.forEach(function (i) { del[i] = 1; }); });
        var keep = src.getPageIndices().filter(function (i) { return !del[i]; });
        if (!keep.length) throw new Error("Không thể xoá hết các trang.");
        return copyPages(src, keep).then(pdfBlob).then(function (b) { done(b, base + "_xoa.pdf", "Đã xoá " + (n - keep.length) + " trang, còn " + keep.length + "."); });
      }
      if (mode === "rotate") {
        var deg = +val("o-deg"), txt = val("o-range").trim();
        var sel = txt ? parseRanges(txt, n, ",").reduce(function (a, r) { return a.concat(r); }, []) : src.getPageIndices();
        sel.forEach(function (i) { var pg = src.getPage(i); pg.setRotation(degrees((pg.getRotation().angle + deg) % 360)); });
        return pdfBlob(src).then(function (b) { done(b, base + "_xoay.pdf", "Đã xoay " + sel.length + " trang."); });
      }
      if (mode === "split") {
        var groups;
        if (val("o-how") === "n") {
          var k = Math.floor(+val("o-n"));
          if (!(k >= 1)) throw new Error("Số trang mỗi tệp phải từ 1 trở lên.");
          groups = []; for (var s = 0; s < n; s += k) { var g = []; for (var j = s; j < Math.min(n, s + k); j++) g.push(j); groups.push(g); }
        } else {
          groups = parseRanges(val("o-ranges"), n, ";");
        }
        var pad = String(groups.length).length, files = [];
        return groups.reduce(function (chain, g, gi) {
          return chain.then(function () {
            return copyPages(src, g).then(function (d) { return d.save(); }).then(function (u8) {
              files.push({ name: base + "_" + String(gi + 1).padStart(Math.max(2, pad), "0") + ".pdf", data: u8 });
            });
          });
        }, Promise.resolve()).then(function () {
          if (files.length === 1) done(new Blob([files[0].data], { type: "application/pdf" }), files[0].name, "Tách ra 1 tệp.");
          else done(makeZip(files), base + "_tach.zip", "Tách ra " + files.length + " tệp PDF (gói trong .zip).");
        });
      }
    });
  }

  render();
  window.TNPdfTools = { parseRanges: parseRanges, makeZip: makeZip }; // phục vụ kiểm tra
})();
