/* TNOCR – Word ↔ PDF.
   Word → PDF: đọc .docx, hiển thị rồi dùng chức năng "In → Lưu thành PDF" của trình duyệt (giữ chữ Hán đúng phông trên máy cô).
   PDF → Word: lấy chữ trong PDF (PDF scan thì tự OCR) và ghi ra tệp .docx sửa được. */
(function () {
  "use strict";
  var root = document.getElementById("tab-word");
  if (!root || !window.TN) return;
  var TN = window.TN, el = TN.el, fmt = TN.fmt;
  var BASE = new URL(".", document.baseURI).href;
  var mode = "w2p", docxFile = null, pdfFile = null, html = "", busy = false, cancel = false;

  var status = el("span", { role: "status" }); status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }
  var meter = TN.meter();

  var subs = el("div", { class: "sub", role: "group", "aria-label": "Chuyển đổi" });
  [["w2p", "Word → PDF"], ["p2w", "PDF → Word"]].forEach(function (m) {
    var b = el("button", { type: "button", "data-m": m[0], text: m[1] });
    b.addEventListener("click", function () { mode = m[0]; draw(); }); subs.appendChild(b);
  });
  var body = el("div", { class: "tabpanel" });
  root.appendChild(el("p", { class: "privacy", text: "Tệp được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  root.appendChild(el("section", {}, [el("h2", { text: "Chuyển đổi" }), subs]));
  root.appendChild(body);

  /* ================= Word → PDF ================= */
  var PRINT_CSS = "@page{size:A4;margin:20mm}html{-webkit-print-color-adjust:exact}body{font-family:'Times New Roman','Liberation Serif',SimSun,'Songti SC','Noto Serif CJK SC',serif;font-size:12pt;line-height:1.5;color:#000;margin:0}" +
    "h1{font-size:20pt}h2{font-size:16pt}h3{font-size:14pt}p{margin:0 0 8pt}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;margin:6pt 0}td,th{border:1px solid #444;padding:4pt;vertical-align:top}";
  function drawW2P() {
    body.textContent = "";
    var prev = el("div", { class: "result", hidden: "" });
    var go = el("button", { type: "button", text: "Mở hộp thoại in, lưu thành PDF" }); go.disabled = true;
    var drop = TN.drop(".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", false, "Bấm để chọn tệp Word (.docx), hoặc kéo thả vào đây", "Chỉ nhận .docx. Tệp .doc cũ cô hãy mở bằng Word/WPS rồi lưu thành .docx.", function (fl) {
      var f = Array.prototype.find.call(fl, function (x) { return /\.docx$/i.test(x.name); });
      if (!f) { say("Chỉ nhận tệp .docx.", true); return; }
      docxFile = f; go.disabled = true; say("Đang đọc tệp Word...");
      Promise.all([TN.load("mammoth.browser.min.js"), f.arrayBuffer()]).then(function (r) {
        return mammoth.convertToHtml({ arrayBuffer: r[1] });
      }).then(function (res) {
        html = res.value; prev.hidden = false; prev.textContent = "";
        prev.appendChild(el("p", { class: "meta", text: f.name + " (" + fmt(f.size) + ") — đã đọc xong, sẵn sàng chuyển." }));
        if (res.messages && res.messages.length) prev.appendChild(el("p", { class: "meta", text: "Lưu ý: một số định dạng đặc biệt có thể không giữ được (" + res.messages.length + " mục)." }));
        go.disabled = false; say("");
      }).catch(function (e) { say("Không đọc được tệp: " + (e && e.message || "lỗi"), true); });
    });
    go.addEventListener("click", function () {
      var fr = document.createElement("iframe");
      fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(fr);
      var d = fr.contentWindow.document; d.open();
      d.write("<!doctype html><html><head><meta charset='utf-8'><title>" + TN.stem(docxFile.name).replace(/[<&]/g, "") + "</title><style>" + PRINT_CSS + "</style></head><body>" + html + "</body></html>");
      d.close();
      setTimeout(function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); say("Trong hộp thoại in, chọn \"Lưu dưới dạng PDF\" (Mac: góc dưới trái, menu PDF → Lưu dưới dạng PDF)."); } catch (e) { say("Trình duyệt không cho mở hộp thoại in ở đây. Cô thử mở trang trực tiếp bằng Safari/Chrome.", true); }
        setTimeout(function () { fr.remove(); }, 60000); }, 500);
    });
    body.appendChild(el("section", {}, [el("h2", { text: "Chọn tệp Word" }), drop, prev]));
    body.appendChild(el("section", {}, [el("div", { class: "bar" }, [go, status])]));
    body.appendChild(el("section", { class: "note" }, [
      el("p", { text: "Cách này giữ chữ Hán và chữ Việt đúng phông trên máy cô, PDF kết quả tìm kiếm được. Công cụ giữ tiêu đề, in đậm/nghiêng, danh sách, bảng và ảnh; bố cục phức tạp (nhiều cột, khung chữ, đầu trang/chân trang) có thể khác bản gốc." }),
      el("p", { text: "Muốn giống hệt bản gốc, cách chắc nhất là mở tệp bằng Word hoặc WPS rồi chọn Lưu thành PDF." })]));
  }

  /* ================= PDF → Word ================= */
  var CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;
  function lineText(items) {
    items.sort(function (a, b) { return a.x - b.x; });
    var s = "", end = null;
    items.forEach(function (it) {
      if (end !== null) {
        var gap = it.x - end, last = s.slice(-1), first = it.str.charAt(0);
        if (gap > it.fs * 0.2 && !CJK.test(last) && !CJK.test(first) && last !== " " && first !== " ") s += " ";
      }
      s += it.str; end = it.x + it.w;
    });
    return s;
  }
  function pageParas(tc) {
    var its = tc.items.filter(function (i) { return i.str && i.str.trim() !== "" || i.str === " "; }).map(function (i) {
      return { str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, fs: Math.abs(i.transform[3]) || i.height || 10 };
    });
    its.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    its.forEach(function (it) {
      var L = lines[lines.length - 1];
      if (L && Math.abs(L.y - it.y) < it.fs * 0.5) L.items.push(it);
      else lines.push({ y: it.y, fs: it.fs, items: [it] });
    });
    lines.forEach(function (L) {
      L.text = lineText(L.items).replace(/\s+$/, "");
      var xs = L.items.map(function (i) { return i.x; }), xe = L.items.map(function (i) { return i.x + i.w; });
      L.x0 = Math.min.apply(null, xs); L.x1 = Math.max.apply(null, xe);
    });
    lines = lines.filter(function (L) { return L.text.trim(); });
    if (!lines.length) return [];
    var maxW = Math.max.apply(null, lines.map(function (L) { return L.x1 - L.x0; }));
    var paras = [], cur = "";
    lines.forEach(function (L, i) {
      var P = lines[i - 1], newPara = !P || (P.y - L.y) > Math.max(P.fs, L.fs) * 1.7 || (P.x1 - P.x0) < maxW * 0.75;
      if (i && !newPara) { cur += (CJK.test(cur.slice(-1)) || CJK.test(L.text.charAt(0)) ? "" : " ") + L.text; }
      else { if (cur) paras.push(cur); cur = L.text; }
    });
    if (cur) paras.push(cur);
    return paras.map(cleanCjk);
  }
  var CJKR = "\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF\\u3000-\\u303F";
  var CJKGAP = new RegExp("([" + CJKR + "])[ \\t]+(?=[" + CJKR + "])", "g");
  function cleanCjk(t) { return t.replace(CJKGAP, "$1"); }
  function esc(t) { return t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function buildDocx(pages) { // pages: [[para, ...], ...]
    var enc = new TextEncoder(), body = "", first = true;
    var rpr = "<w:rPr><w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\" w:cs=\"Times New Roman\" w:eastAsia=\"SimSun\"/><w:sz w:val=\"26\"/></w:rPr>";
    pages.forEach(function (paras, pi) {
      if (!paras.length) paras = [""];
      paras.forEach(function (t, i) {
        var ppr = "<w:pPr>" + (i === 0 && pi > 0 ? "<w:pageBreakBefore/>" : "") + "<w:spacing w:after=\"120\" w:line=\"360\" w:lineRule=\"auto\"/></w:pPr>";
        body += "<w:p>" + ppr + "<w:r>" + rpr + "<w:t xml:space=\"preserve\">" + esc(t) + "</w:t></w:r></w:p>";
      });
    });
    var doc = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" + body +
      "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>";
    var ct = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>";
    var rels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>";
    var drels = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>";
    return TN.zip([{ name: "[Content_Types].xml", data: enc.encode(ct) }, { name: "_rels/.rels", data: enc.encode(rels) },
      { name: "word/document.xml", data: enc.encode(doc) }, { name: "word/_rels/document.xml.rels", data: enc.encode(drels) }],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }

  function drawP2W() {
    body.textContent = "";
    var list = el("div", { class: "files" }), out = el("div", {});
    var go = el("button", { type: "button", text: "Chuyển sang Word" }); go.disabled = true;
    var stop = el("button", { type: "button", class: "ghost", text: "Dừng" }); stop.hidden = true;
    var chips = el("div", { class: "chips", role: "group", "aria-label": "Ngôn ngữ cho trang scan" });
    [["chi_sim", "简体 Hán giản thể", 1, "zh"], ["chi_tra", "繁體 Hán phồn thể", 0, "zh"], ["vie", "Tiếng Việt", 1], ["eng", "Tiếng Anh", 1]].forEach(function (l) {
      var i = el("input", { type: "checkbox", id: "w-l-" + l[0], value: l[0] }); i.checked = !!l[2];
      chips.appendChild(el("span", { class: "chip" }, [i, el("label", { for: "w-l-" + l[0], class: l[3] || "", text: l[1] })]));
    });
    var drop = TN.drop("application/pdf,.pdf", false, "Bấm để chọn một PDF, hoặc kéo thả vào đây", "PDF có chữ thì lấy chữ trực tiếp; PDF scan sẽ tự nhận dạng (OCR).", function (fl) {
      var f = Array.prototype.find.call(fl, function (x) { return /\.pdf$/i.test(x.name); });
      if (!f) { say("Chỉ nhận tệp PDF.", true); return; }
      pdfFile = f; out.textContent = ""; say(""); go.disabled = false; list.textContent = "";
      list.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), el("span", { class: "meta", text: fmt(f.size) })]));
    });
    go.addEventListener("click", function () {
      if (!window.pdfjsLib) { say("Thiếu thư viện đọc PDF.", true); return; }
      busy = true; cancel = false; go.disabled = true; stop.hidden = false; out.textContent = ""; say("Đang đọc PDF...");
      var worker = null, ocrPages = 0, pages = [], total = 0;
      function langs() { var a = []; chips.querySelectorAll("input:checked").forEach(function (i) { a.push(i.value); }); return a.length ? a : ["eng"]; }
      function getWorker() {
        if (worker) return Promise.resolve(worker);
        say("Đang nạp dữ liệu nhận dạng (lần đầu có thể mất vài chục giây)...");
        return Tesseract.createWorker(langs(), 1, { workerPath: BASE + "worker.min.js", corePath: BASE, langPath: BASE, gzip: true }).then(function (w) { worker = w; return w; });
      }
      function ocrPage(pg) {
        var v = pg.getViewport({ scale: 200 / 72 }), c = document.createElement("canvas");
        c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        return pg.render({ canvasContext: g, viewport: v }).promise.then(getWorker).then(function (w) { return w.recognize(c); }).then(function (r) {
          var t = cleanCjk(r.data.text || ""), out = [];
          t.split(/\n\s*\n/).forEach(function (blk) {
            var cur = "";
            blk.split("\n").forEach(function (ln) {
              ln = ln.trim(); if (!ln) return;
              cur = cur ? cur + (CJK.test(cur.slice(-1)) || CJK.test(ln.charAt(0)) ? "" : " ") + ln : ln;
              if (/[。！？；：.!?;:”"）)]$/.test(ln)) { out.push(cur); cur = ""; }
            });
            if (cur) out.push(cur);
          });
          return out;
        });
      }
      pdfFile.arrayBuffer().then(function (buf) { return pdfjsLib.getDocument({ data: buf }).promise; }).then(function (pdf) {
        total = pdf.numPages; var p = 1;
        function nx() {
          if (p > total) return;
          if (cancel) throw new Error("__cancel");
          meter.set((p - 1) / total); say("Đang xử lý trang " + p + "/" + total + "...");
          return pdf.getPage(p++).then(function (pg) {
            return pg.getTextContent().then(function (tc) {
              var paras = pageParas(tc), chars = paras.join("").length;
              if (chars >= 5) { pages.push(paras); return; }
              ocrPages++; return ocrPage(pg).then(function (pp) { pages.push(pp); });
            });
          }).then(nx);
        }
        return nx();
      }).then(function () {
        meter.set(null);
        var chars = pages.reduce(function (s, pp) { return s + pp.join("").length; }, 0);
        if (!chars) { say("Không lấy được chữ nào từ tệp này.", true); return; }
        var blob = buildDocx(pages), name = TN.stem(pdfFile.name) + ".docx";
        say("Xong.");
        var b = el("button", { type: "button", text: "Lưu " + name }); b.addEventListener("click", function () { TN.save(blob, name); });
        out.appendChild(el("div", { class: "result" }, [
          el("p", { text: total + " trang · " + chars + " ký tự · " + fmt(blob.size) }),
          el("p", { class: "meta", text: ocrPages ? ocrPages + " trang là ảnh nên đã nhận dạng bằng OCR; cô nên đọc soát lại." : "Lấy chữ trực tiếp từ PDF." }), b]));
      }).catch(function (e) {
        meter.set(null); var c = e && e.message === "__cancel"; say(c ? "Đã dừng." : "Không chuyển được: " + (e && e.message || "lỗi"), !c);
      }).then(function () {
        busy = false; go.disabled = !pdfFile; stop.hidden = true;
        if (worker) { worker.terminate(); worker = null; }
      });
    });
    stop.addEventListener("click", function () { cancel = true; say("Đang dừng..."); });
    body.appendChild(el("section", {}, [el("h2", { text: "Chọn PDF" }), drop, list]));
    body.appendChild(el("section", {}, [el("h2", { text: "Ngôn ngữ (chỉ dùng cho trang scan)" }), chips]));
    body.appendChild(el("section", {}, [el("div", { class: "bar" }, [go, stop, status]), meter.node, out]));
    body.appendChild(el("section", { class: "note" }, [
      el("p", { text: "Tệp Word tạo ra chỉ giữ chữ và ngắt đoạn, không giữ hình, bảng và bố cục như PDF gốc. Cần giữ nguyên bố cục thì nên mở PDF bằng Word hoặc WPS." })]));
  }

  function draw() {
    Array.prototype.forEach.call(subs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === mode ? "true" : "false"); });
    say(""); meter.set(null);
    if (mode === "w2p") drawW2P(); else drawP2W();
  }
  draw();
  window.TNWord = { buildDocx: buildDocx, pageParas: pageParas };
})();
