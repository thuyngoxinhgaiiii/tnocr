/* TNOCR – Nén PDF tới dung lượng tùy chọn. Bước 1: nén lại ảnh JPEG bên trong, giữ nguyên chữ.
   Bước 2 (nếu chưa đủ nhỏ): chuyển trang thành ảnh. */
(function () {
  "use strict";
  var root = document.getElementById("tab-nen");
  if (!root || !window.PDFLib || !window.TN) return;
  var TN = window.TN, el = TN.el, fmt = TN.fmt;
  var PDFDocument = PDFLib.PDFDocument, PDFName = PDFLib.PDFName, PDFRawStream = PDFLib.PDFRawStream, PDFArray = PDFLib.PDFArray, PDFNumber = PDFLib.PDFNumber;
  var file = null, busy = false, cancel = false;

  var LV_IMG = [[1, .92], [1, .85], [1, .78], [1, .7], [.9, .72], [.8, .7], [.7, .66], [.6, .6], [.5, .55], [.45, .5], [.4, .45], [.3, .4]]; // [thu nhỏ, chất lượng JPEG]
  var LV_PAGE = [[150, .8], [130, .72], [110, .65], [96, .6], [80, .55], [72, .5], [60, .45], [50, .4]]; // [dpi, chất lượng JPEG]

  var status = el("span", { role: "status" }); status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }
  var meter = TN.meter();
  var list = el("div", { class: "files" });
  var out = el("div", {});
  var go = el("button", { type: "button", text: "Nén PDF" }); go.disabled = true;
  var stop = el("button", { type: "button", class: "ghost", text: "Dừng" }); stop.hidden = true;
  var size = TN.field("n-size", "Dung lượng mong muốn", "Công cụ chọn mức nén nhẹ nhất mà vẫn đạt dung lượng này.", "2", "number");
  var unit = el("select", { id: "n-unit" }, [el("option", { value: "1048576", text: "MB" }), el("option", { value: "1024", text: "KB" })]);
  var unitBox = el("label", { class: "field" }, [el("span", { text: "Đơn vị" }), unit, el("span")]);

  root.appendChild(el("p", { class: "privacy", text: "Tệp PDF được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  root.appendChild(el("section", {}, [el("h2", { text: "Chọn PDF cần nén" }),
    TN.drop("application/pdf,.pdf", false, "Bấm để chọn một PDF, hoặc kéo thả vào đây", "Tệp scan nhiều ảnh nén được nhiều nhất.", pick), list]));
  root.appendChild(el("section", {}, [el("h2", { text: "Dung lượng sau khi nén" }), el("div", { class: "inline" }, [size, unitBox])]));
  root.appendChild(el("section", {}, [el("div", { class: "bar" }, [go, stop, status]), meter.node, out]));
  root.appendChild(el("section", { class: "note" }, [
    el("p", { text: "Cách làm: trước hết nén lại các ảnh trong PDF và giữ nguyên chữ. Chỉ khi vẫn chưa đủ nhỏ mới chuyển trang thành ảnh (khi đó PDF không còn chọn/tìm kiếm chữ được; cô có thể chạy lại ở tab OCR)." }),
    el("p", { text: "PDF toàn chữ vốn đã nhẹ nên khó nén thêm. Nếu mức cô chọn quá nhỏ, công cụ sẽ báo mức nhỏ nhất đạt được." })]));

  function pick(fl) {
    var f = Array.prototype.find.call(fl, function (x) { return /\.pdf$/i.test(x.name); });
    if (!f) { say("Chỉ nhận tệp PDF.", true); return; }
    file = f; out.textContent = ""; say(""); meter.set(null); go.disabled = false;
    list.textContent = ""; list.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), el("span", { class: "meta", text: fmt(f.size) })]));
  }
  function target() { var v = parseFloat(size.querySelector("input").value); return v > 0 ? Math.round(v * parseFloat(unit.value)) : 0; }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function chk() { if (cancel) throw new Error("__cancel"); }
  function jpegBlob(canvas, q) { return new Promise(function (r) { canvas.toBlob(r, "image/jpeg", q); }); }

  /* ----- Bước 1: nén lại ảnh JPEG trong PDF ----- */
  function collectImages(doc) {
    var res = [], ctx = doc.context;
    ctx.enumerateIndirectObjects().forEach(function (pair) {
      var ref = pair[0], o = pair[1];
      if (!(o instanceof PDFRawStream)) return;
      var d = o.dict;
      var st = d.get(PDFName.of("Subtype")); if (!st || st.toString() !== "/Image") return;
      if (d.get(PDFName.of("ImageMask")) && d.get(PDFName.of("ImageMask")).toString() === "true") return;
      var f = d.get(PDFName.of("Filter")); if (f instanceof PDFArray) { if (f.size() !== 1) return; f = f.lookup(0); }
      if (!f || f.toString() !== "/DCTDecode") return;
      var cs = d.get(PDFName.of("ColorSpace")); if (cs && cs.toString() === "/DeviceCMYK") return;
      if (cs instanceof PDFArray) { try { var p = ctx.lookup(cs.get(1)); if (p && p.dict && p.dict.get(PDFName.of("N")) && p.dict.get(PDFName.of("N")).asNumber() === 4) return; } catch (e) { return; } }
      res.push({ ref: ref, dict: d, bytes: o.contents });
    });
    return res;
  }
  function recompress(img, scale, q) {
    return createImageBitmap(new Blob([img.bytes], { type: "image/jpeg" })).then(function (bmp) {
      var w = Math.max(8, Math.round(bmp.width * scale)), h = Math.max(8, Math.round(bmp.height * scale));
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
      return jpegBlob(c, q).then(function (b) { return b.arrayBuffer().then(function (ab) { return { bytes: new Uint8Array(ab), w: w, h: h }; }); });
    });
  }
  function applyLevel(doc, imgs, lv) {
    var ctx = doc.context, i = 0;
    function step() {
      if (i >= imgs.length) return Promise.resolve();
      var im = imgs[i++]; chk();
      return recompress(im, lv[0], lv[1]).then(function (r) {
        var d = im.dict.clone ? im.dict.clone(ctx) : null;
        if (!d || r.bytes.length >= im.bytes.length) { ctx.assign(im.ref, PDFRawStream.of(im.dict, im.bytes)); return; }
        d.set(PDFName.of("Width"), PDFNumber.of(r.w)); d.set(PDFName.of("Height"), PDFNumber.of(r.h));
        d.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB")); d.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
        d.delete(PDFName.of("Decode")); d.delete(PDFName.of("DecodeParms")); d.set(PDFName.of("Length"), PDFNumber.of(r.bytes.length));
        ctx.assign(im.ref, PDFRawStream.of(d, r.bytes));
      }, function () { ctx.assign(im.ref, PDFRawStream.of(im.dict, im.bytes)); }).then(function () { return (i % 4 === 0) ? tick().then(step) : step(); });
    }
    return step();
  }
  function stageA(buf, goal) {
    return PDFDocument.load(buf, { ignoreEncryption: true }).then(function (doc) {
      var imgs = collectImages(doc);
      function saved() { return doc.save({ useObjectStreams: true }); }
      return saved().then(function (u8) {
        if (u8.length <= goal) return { bytes: u8, how: "Chỉ tối ưu cấu trúc tệp, không đụng tới chất lượng ảnh." };
        if (!imgs.length) return null;
        var best = null, lo = 0, hi = LV_IMG.length - 1;
        function tryLv(i) {
          say("Đang nén ảnh trong PDF (mức " + (i + 1) + "/" + LV_IMG.length + ")...");
          return applyLevel(doc, imgs, LV_IMG[i]).then(saved).then(function (b) { return { bytes: b, lv: i }; });
        }
        return tryLv(hi).then(function (worst) {
          if (worst.bytes.length > goal) { worst.how = "Đã nén ảnh ở mức mạnh nhất nhưng chưa đạt."; worst.miss = true; return worst; }
          best = worst; hi = hi - 1;
          function bis() {
            if (lo > hi) return Promise.resolve(best);
            var mid = (lo + hi) >> 1;
            return tryLv(mid).then(function (r) { if (r.bytes.length <= goal) { best = r; hi = mid - 1; } else lo = mid + 1; return bis(); });
          }
          return bis().then(function (b) { b.how = "Nén lại ảnh trong PDF, giữ nguyên chữ (thu nhỏ ảnh còn " + Math.round(LV_IMG[b.lv][0] * 100) + "%, chất lượng JPEG " + Math.round(LV_IMG[b.lv][1] * 100) + "%)."; return b; });
        });
      });
    });
  }

  /* ----- Bước 2: chuyển trang thành ảnh ----- */
  function stageB(buf, goal) {
    if (!window.pdfjsLib) return Promise.reject(new Error("Thiếu thư viện đọc PDF."));
    return pdfjsLib.getDocument({ data: buf.slice(0) }).promise.then(function (pdf) {
      var n = pdf.numPages;
      function renderPage(num, dpi, q) {
        return pdf.getPage(num).then(function (pg) {
          var v1 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: dpi / 72 });
          var c = document.createElement("canvas"); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
          var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
          return pg.render({ canvasContext: g, viewport: v }).promise.then(function () { return jpegBlob(c, q); })
            .then(function (b) { return b.arrayBuffer(); }).then(function (ab) { pg.cleanup(); return { bytes: new Uint8Array(ab), w: v1.width, h: v1.height }; });
        });
      }
      // ước lượng bằng vài trang mẫu để chọn mức, rồi dựng thật
      var sample = []; for (var k = 0; k < Math.min(n, 5); k++) sample.push(Math.floor(k * n / Math.min(n, 5)) + 1);
      function est(i) {
        var tot = 0, j = 0;
        function nx() { if (j >= sample.length) return Promise.resolve(tot * n / sample.length); chk(); return renderPage(sample[j++], LV_PAGE[i][0], LV_PAGE[i][1]).then(function (r) { tot += r.bytes.length; return nx(); }); }
        return nx();
      }
      var level = LV_PAGE.length - 1, found = false, i = 0;
      function pickLv() {
        if (i >= LV_PAGE.length) return Promise.resolve();
        say("Đang thử mức nén " + (i + 1) + "/" + LV_PAGE.length + "...");
        return est(i).then(function (e) { if (e * 1.03 <= goal) { level = i; found = true; return; } i++; return pickLv(); });
      }
      function build(lv) {
        return PDFDocument.create().then(function (doc) {
          var p = 1;
          function nx() {
            if (p > n) return doc.save({ useObjectStreams: true });
            chk(); meter.set(p / n); say("Đang chuyển trang " + p + "/" + n + " thành ảnh...");
            return renderPage(p++, LV_PAGE[lv][0], LV_PAGE[lv][1]).then(function (r) {
              return doc.embedJpg(r.bytes).then(function (im) { var pg = doc.addPage([r.w, r.h]); pg.drawImage(im, { x: 0, y: 0, width: r.w, height: r.h }); return tick(); });
            }).then(nx);
          }
          return nx();
        });
      }
      function fin(lv) {
        return build(lv).then(function (u8) {
          if (u8.length > goal && lv < LV_PAGE.length - 1) return fin(lv + 1);
          return { bytes: u8, how: "Chuyển trang thành ảnh (" + LV_PAGE[lv][0] + " dpi, chất lượng JPEG " + Math.round(LV_PAGE[lv][1] * 100) + "%). PDF này không còn chọn/tìm kiếm chữ được.", miss: u8.length > goal, text: false };
        });
      }
      return pickLv().then(function () { return fin(level); });
    });
  }

  go.addEventListener("click", function () {
    var goal = target();
    if (!file || !goal) { say("Cô nhập dung lượng mong muốn lớn hơn 0.", true); return; }
    busy = true; cancel = false; go.disabled = true; stop.hidden = false; out.textContent = ""; meter.set(null); say("Đang đọc tệp...");
    var orig = file.size;
    file.arrayBuffer().then(function (buf) {
      if (orig <= goal) return { same: true };
      return stageA(buf, goal).then(function (a) { return (a && !a.miss) ? a : stageB(buf, goal).then(function (b) { b.prevA = a; return b; }); });
    }).then(function (r) {
      meter.set(null);
      if (r.same) { say("Tệp đã nhỏ hơn mức cô chọn (" + fmt(orig) + "), không cần nén."); return; }
      var blob = new Blob([r.bytes], { type: "application/pdf" }), name = TN.stem(file.name) + "_nen.pdf";
      if (blob.size >= orig) { say("Không nén nhỏ hơn được tệp gốc (" + fmt(orig) + "). Cô giữ nguyên bản gốc.", true); return; }
      var ok = blob.size <= goal;
      say(ok ? "Xong." : "Chưa đạt mức yêu cầu; đây là mức nhỏ nhất công cụ làm được.", !ok);
      var b = el("button", { type: "button", text: "Lưu " + name }); b.addEventListener("click", function () { TN.save(blob, name); });
      out.appendChild(el("div", { class: "result" }, [
        el("p", { text: fmt(orig) + "  →  " + fmt(blob.size) + "  (giảm " + Math.round((1 - blob.size / orig) * 100) + "%)" }),
        el("p", { class: "meta", text: r.how }), b]));
    }).catch(function (e) {
      meter.set(null); say(e && e.message === "__cancel" ? "Đã dừng." : "Không nén được tệp này: " + (e && e.message || "lỗi"), !(e && e.message === "__cancel"));
    }).then(function () { busy = false; go.disabled = !file; stop.hidden = true; });
  });
  stop.addEventListener("click", function () { cancel = true; say("Đang dừng..."); });
  window.TNPdfCompress = { LV_IMG: LV_IMG };
})();
