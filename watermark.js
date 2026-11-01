/* TNOCR – Xoá watermark. Hai cách: (1) trên bản scan/ảnh: xoá theo độ sáng, màu hoặc vùng; (2) trong PDF số: gỡ chú thích, chữ, ảnh lặp, lớp (layer). */
(function () {
  "use strict";
  var root = document.getElementById("tab-wm");
  if (!root || !window.TN || !TN.img || !window.PDFLib) return;
  var el = TN.el, fmt = TN.fmt, IMG = TN.img, P = PDFLib;
  var mode = "scan";
  var status = el("span", { role: "status" }); status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }
  var meter = TN.meter(), body = el("div", { class: "tabpanel" });

  var subs = el("div", { class: "sub", role: "group", "aria-label": "Cách xoá watermark" });
  [["scan", "Bản scan / ảnh"], ["pdf", "PDF số (chữ, ảnh, lớp)"]].forEach(function (m) {
    var b = el("button", { type: "button", "data-m": m[0], text: m[1] }); b.addEventListener("click", function () { mode = m[0]; draw(); }); subs.appendChild(b);
  });
  root.appendChild(el("p", { class: "privacy", text: "Tệp được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  root.appendChild(el("section", {}, [el("h2", { text: "Chọn cách làm" }), subs]));
  root.appendChild(body);
  root.appendChild(el("section", { class: "note" }, [el("p", { text: "Chỉ dùng cho tài liệu của chính cô hoặc tài liệu cô được phép chỉnh sửa. Công cụ không thể khôi phục chi tiết bị watermark che hẳn (ví dụ chữ bị dấu đè kín); trường hợp đó kết quả có thể còn vệt." })]));

  /* ====================== Cách 1: bản scan / ảnh ====================== */
  function drawScan() {
    body.textContent = "";
    var file = null, orig = null, proc = null, rects = [], picked = null, tool = "none", showOrig = false, drag = null;
    var cv = el("canvas", { class: "wmcv" }), list = el("div", { class: "files" }), out = el("div", {}), rlist = el("div", { class: "chips" });
    var thr = el("input", { type: "range", min: "150", max: "254", step: "1", value: "254" }), thrOn = el("input", { type: "checkbox" });
    var tol = el("input", { type: "range", min: "10", max: "110", step: "1", value: "45" });
    var sw = el("span", { class: "swatch", title: "Màu đã chọn" }); sw.style.cssText = "display:inline-block;width:28px;height:28px;border:1px solid var(--line);border-radius:6px;background:transparent";
    var bPick = el("button", { type: "button", class: "ghost", text: "Chấm chọn màu watermark trên ảnh" }), bRect = el("button", { type: "button", class: "ghost", text: "Vẽ vùng cần xoá" }), bView = el("button", { type: "button", class: "ghost", text: "Xem bản gốc" });
    var bAll = el("button", { type: "button", text: "Xử lý tất cả và lưu" }); bAll.disabled = true;
    var fmtSel = el("select", {}, [el("option", { value: "pdf", text: "Một tệp PDF" }), el("option", { value: "png", text: "Ảnh PNG (zip nếu nhiều trang)" })]);
    var dpi = el("select", {}, [el("option", { value: "150", text: "150 dpi" }), el("option", { value: "200", text: "200 dpi" }), el("option", { value: "300", text: "300 dpi" })]); dpi.value = "200";
    var PDPI = 110;

    function applyTo(c) {
      if (thrOn.checked) IMG.whiten(c, +thr.value);
      if (picked) IMG.removeColor(c, picked, +tol.value);
      rects.forEach(function (r) { IMG.eraseRect(c, r); });
    }
    function redraw() {
      if (!orig) return;
      var src = showOrig ? orig : proc; cv.width = src.width; cv.height = src.height;
      var g = cv.getContext("2d"); g.drawImage(src, 0, 0);
      g.lineWidth = Math.max(2, cv.width / 300); g.strokeStyle = "#E07A2F"; g.fillStyle = "rgba(224,122,47,.18)";
      rects.concat(drag ? [drag] : []).forEach(function (r) { g.fillRect(r[0] * cv.width, r[1] * cv.height, r[2] * cv.width, r[3] * cv.height); g.strokeRect(r[0] * cv.width, r[1] * cv.height, r[2] * cv.width, r[3] * cv.height); });
      bView.textContent = showOrig ? "Xem bản đã xử lý" : "Xem bản gốc";
    }
    function refresh() { if (!orig) return; proc = IMG.clone(orig); applyTo(proc); redraw(); }
    function listRects() {
      rlist.textContent = "";
      rects.forEach(function (r, i) {
        var b = el("button", { type: "button", class: "ghost", text: "Vùng " + (i + 1) + "  ✕" }); b.style.padding = "4px 10px";
        b.addEventListener("click", function () { rects.splice(i, 1); listRects(); refresh(); }); rlist.appendChild(b);
      });
    }
    function setTool(t) { tool = tool === t ? "none" : t; bPick.style.background = tool === "pick" ? "var(--accent-soft)" : ""; bRect.style.background = tool === "rect" ? "var(--accent-soft)" : ""; cv.style.cursor = tool === "none" ? "default" : "crosshair"; cv.style.touchAction = tool === "rect" ? "none" : "auto"; if (tool !== "none") { showOrig = true; redraw(); } }
    function pos(e) { var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
    bPick.addEventListener("click", function () { setTool("pick"); if (tool === "pick") say("Cô bấm vào đúng một chỗ có màu watermark trên ảnh."); });
    bRect.addEventListener("click", function () { setTool("rect"); if (tool === "rect") say("Cô giữ chuột và kéo để khoanh vùng cần xoá."); });
    bView.addEventListener("click", function () { showOrig = !showOrig; redraw(); });
    cv.addEventListener("pointerdown", function (e) {
      if (!orig) return; var p = pos(e);
      if (tool === "pick") { picked = IMG.pixel(orig, p[0] * orig.width, p[1] * orig.height); sw.style.background = "rgb(" + picked.join(",") + ")"; showOrig = false; setTool("pick"); refresh(); say("Đã chọn màu. Kéo thanh \"Độ rộng màu\" để xoá nhiều hay ít sắc độ gần màu đó."); }
      else if (tool === "rect") { drag = [p[0], p[1], 0, 0]; drag._s = p; cv.setPointerCapture(e.pointerId); }
    });
    cv.addEventListener("pointermove", function (e) { if (!drag) return; var p = pos(e), s = drag._s; drag = [Math.min(s[0], p[0]), Math.min(s[1], p[1]), Math.abs(p[0] - s[0]), Math.abs(p[1] - s[1])]; drag._s = s; redraw(); });
    cv.addEventListener("pointerup", function () { if (!drag) return; if (drag[2] > 0.005 && drag[3] > 0.005) { rects.push(drag.slice(0, 4)); listRects(); } drag = null; showOrig = false; setTool("rect"); refresh(); });
    [thr, tol].forEach(function (i) { i.addEventListener("input", refresh); }); thrOn.addEventListener("change", refresh);

    var drop = TN.drop("application/pdf,image/*,.pdf", false, "Bấm để chọn PDF hoặc ảnh, hoặc kéo thả vào đây", "Công cụ lấy trang đầu để cô thử, rồi áp dụng cho mọi trang.", function (fl) {
      var f = Array.prototype.find.call(fl, function (x) { return TN.isPdf(x) || TN.isImg(x); }); if (!f) { say("Chỉ nhận PDF hoặc ảnh.", true); return; }
      file = f; rects = []; picked = null; sw.style.background = "transparent"; listRects(); out.textContent = ""; say("Đang mở trang đầu...");
      list.textContent = ""; list.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), el("span", { class: "meta", text: fmt(f.size) })]));
      TN.eachPage(f, PDPI, function (c) { orig = c; }, 1).then(function () { bAll.disabled = false; showOrig = false; refresh(); say("Cô chọn cách xoá bên dưới và xem kết quả ngay trên ảnh."); }, function (e) { say("Không mở được tệp: " + (e && e.message || ""), true); });
    });

    body.appendChild(el("section", {}, [el("h2", { text: "Chọn tệp" }), drop, list]));
    body.appendChild(el("section", {}, [el("h2", { text: "Xem trước (trang đầu)" }), el("div", { class: "wmwrap" }, [cv]), el("div", { class: "bar", style: "margin-top:8px" }, [bView])]));
    body.appendChild(el("section", {}, [el("h2", { text: "Cách xoá" }),
      el("label", { class: "check" }, [thrOn, el("span", { text: "Xoá watermark xám nhạt: làm trắng mọi điểm sáng hơn mức" }, [el("small", { text: "Hợp với dấu chìm xám nhạt trên nền trắng. Kéo sang trái để xoá mạnh hơn; chữ đậm vẫn giữ." })])]),
      el("label", { class: "field" }, [el("span", { text: "Mức sáng" }), thr, el("span")]),
      el("div", { class: "inline" }, [bPick, sw]),
      el("label", { class: "field" }, [el("span", { text: "Độ rộng màu" }), tol, el("small", { text: "Nhỏ: chỉ xoá đúng màu đã chọn. Lớn: xoá cả các sắc độ gần đó." })]),
      el("div", { class: "bar" }, [bRect]), rlist])); 
    body.appendChild(el("section", {}, [el("div", { class: "inline" }, [el("label", { class: "field" }, [el("span", { text: "Độ phân giải" }), dpi, el("span")]), el("label", { class: "field" }, [el("span", { text: "Kết quả" }), fmtSel, el("span")])]),
      el("div", { class: "bar" }, [bAll, status]), meter.node, out]));

    bAll.addEventListener("click", function () {
      if (!file) return; bAll.disabled = true; out.textContent = ""; var d = +dpi.value, asPdf = fmtSel.value === "pdf", pages = [], t0 = Date.now(), outs = [];
      TN.eachPage(file, d, function (c, n, tot) {
        say("Đang xử lý trang " + n + "/" + tot + "..."); meter.set(n / tot);
        return TN.tick().then(function () { applyTo(c); var png = true; return TN.blob(c, "image/png").then(function (b) { var it = { blob: b, png: png, wPt: c.width * 72 / d, hPt: c.height * 72 / d, name: TN.stem(file.name) + (tot > 1 ? "_" + String(n).padStart(3, "0") : "") + "_xoawm.png" }; if (asPdf) pages.push(it); else outs.push(it); }); });
      }).then(function () {
        if (asPdf) return TN.pdfFromImages(pages).then(function (b) { return [{ blob: b, name: TN.stem(file.name) + "_xoawm.pdf" }]; });
        return outs;
      }).then(function (rs) {
        meter.set(null); say("Xong sau " + Math.round((Date.now() - t0) / 1000) + " giây.");
        function show(blob, name) { var b = el("button", { type: "button", text: "Lưu " + name }); b.addEventListener("click", function () { TN.save(blob, name); }); out.appendChild(el("div", { class: "result" }, [el("p", { text: name + " · " + fmt(blob.size) }), b])); }
        if (rs.length === 1) show(rs[0].blob, rs[0].name);
        else return Promise.all(rs.map(function (r) { return r.blob.arrayBuffer().then(function (b) { return { name: r.name, data: new Uint8Array(b) }; }); })).then(function (fs) { show(TN.zip(fs), TN.stem(file.name) + "_xoawm.zip"); });
      }).catch(function (e) { meter.set(null); say("Không xử lý được: " + (e && e.message || "lỗi"), true); }).then(function () { bAll.disabled = false; });
    });
  }

  /* ====================== Cách 2: PDF số ====================== */
  function latin(u8) { var s = "", i; for (i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; }
  function unlatin(s) { var u = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function streamsOf(doc, page) {
    var ctx = doc.context, c = page.node.get(P.PDFName.of("Contents")), res = [];
    function one(ref) { var o = ctx.lookup(ref); if (o instanceof P.PDFArray) o.asArray().forEach(one); else if (o && o.contents !== undefined) res.push({ ref: ref, obj: o }); }
    one(c); return res;
  }
  function decoded(o) { try { return P.decodePDFRawStream(o).decode(); } catch (e) { return null; } }
  function strText(block) { // gom mọi chuỗi trong khối chữ BT..ET để dò từ khoá
    var t = "", m, re = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g;
    while ((m = re.exec(block))) {
      var s = m[0];
      if (s[0] === "(") t += s.slice(1, -1).replace(/\\([nrtbf()\\])/g, function (_, c) { return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[c] || c; }).replace(/\\([0-7]{1,3})/g, function (_, o) { return String.fromCharCode(parseInt(o, 8)); });
      else { var h = s.slice(1, -1).replace(/\s/g, ""); for (var i = 0; i + 1 < h.length; i += 2) t += String.fromCharCode(parseInt(h.substr(i, 2), 16)); }
    }
    return t.replace(/\u0000/g, "");
  }
  function drawPdf() {
    body.textContent = "";
    var file = null, doc = null, bytes = null, out = el("div", {}), info = el("div", {}), cands = [];
    var kw = el("input", { type: "text", id: "wm-kw", placeholder: "Ví dụ: CONFIDENTIAL, BẢN QUYỀN" });
    var annW = el("input", { type: "checkbox" }), annS = el("input", { type: "checkbox" }), layers = [];
    var go = el("button", { type: "button", text: "Gỡ watermark và lưu" }); go.disabled = true;
    var drop = TN.drop("application/pdf,.pdf", false, "Bấm để chọn PDF, hoặc kéo thả vào đây", "Dùng cho PDF tạo từ máy (không phải ảnh scan).", function (fl) {
      var f = Array.prototype.find.call(fl, TN.isPdf); if (!f) { say("Chỉ nhận PDF.", true); return; }
      file = f; out.textContent = ""; say("Đang phân tích..."); go.disabled = true;
      f.arrayBuffer().then(function (b) { bytes = b; return P.PDFDocument.load(b, { ignoreEncryption: true }); }).then(function (d) { doc = d; analyze(); go.disabled = false; })
        .catch(function (e) { say("Không đọc được PDF: " + (e && e.message || ""), true); });
    });
    function analyze() {
      var ctx = doc.context, pages = doc.getPages(), n = pages.length, annCnt = {}, imgMap = {};
      info.textContent = "";
      pages.forEach(function (pg, pi) {
        var an = pg.node.get(P.PDFName.of("Annots")); an = an && ctx.lookup(an);
        if (an instanceof P.PDFArray) an.asArray().forEach(function (r) { var a = ctx.lookup(r); var st = a && a.get && a.get(P.PDFName.of("Subtype")); if (st) annCnt[st.toString()] = (annCnt[st.toString()] || 0) + 1; });
        var res = pg.node.Resources && pg.node.Resources(), xo = res && res.get(P.PDFName.of("XObject")); xo = xo && ctx.lookup(xo);
        if (xo instanceof P.PDFDict) xo.entries().forEach(function (e) {
          var o = ctx.lookup(e[1]); if (!o || !o.dict) return; var st = o.dict.get(P.PDFName.of("Subtype")); if (!st || st.toString() !== "/Image") return;
          var key = e[1].toString(), w = o.dict.get(P.PDFName.of("Width")), h = o.dict.get(P.PDFName.of("Height"));
          var r = imgMap[key] = imgMap[key] || { key: key, pages: 0, w: w ? w.asNumber() : 0, h: h ? h.asNumber() : 0, names: {} }; r.pages++; r.names[pi] = r.names[pi] || []; r.names[pi].push(e[0].toString());
        });
      });
      cands = Object.keys(imgMap).map(function (k) { return imgMap[k]; }).sort(function (a, b) { return b.pages - a.pages || b.w * b.h - a.w * a.h; }).slice(0, 12);
      var oc = doc.catalog.get(P.PDFName.of("OCProperties")); oc = oc && ctx.lookup(oc); layers = [];
      if (oc && oc.get) { var arr = oc.get(P.PDFName.of("OCGs")); arr = arr && ctx.lookup(arr); if (arr instanceof P.PDFArray) arr.asArray().forEach(function (r) { var g = ctx.lookup(r), nm = g && g.get && g.get(P.PDFName.of("Name")); layers.push({ ref: r, name: nm && nm.decodeText ? nm.decodeText() : "(không tên)", on: /water|mark|draft|logo|bản quyền|stamp/i.test(nm && nm.decodeText ? nm.decodeText() : "") }); }); }
      info.appendChild(el("p", { class: "meta", text: n + " trang. Chú thích trong tệp: " + (Object.keys(annCnt).length ? Object.keys(annCnt).map(function (k) { return k.replace("/", "") + " ×" + annCnt[k]; }).join(", ") : "không có") + "." }));
      annW.checked = !!(annCnt["/Watermark"]); annS.checked = false;
      info.appendChild(el("label", { class: "check" }, [annW, el("span", { text: "Gỡ chú thích loại Watermark" })]));
      info.appendChild(el("label", { class: "check" }, [annS, el("span", { text: "Gỡ cả các con dấu/chú thích Stamp" }, [el("small", { text: "Chỉ chọn khi dấu của cô là loại này." })])]));
      if (layers.length) { info.appendChild(el("p", { class: "meta", text: "Lớp (layer) trong tệp: tick lớp nào cô muốn tắt." })); layers.forEach(function (L) { var i = el("input", { type: "checkbox" }); i.checked = L.on; L.cb = i; info.appendChild(el("label", { class: "check" }, [i, el("span", { text: L.name })])); }); }
      if (cands.length) {
        info.appendChild(el("p", { class: "meta", text: "Ảnh nằm trong PDF (ảnh lặp lại trên nhiều trang thường là logo hoặc watermark). Tick ảnh cần gỡ:" }));
        cands.forEach(function (c) { var i = el("input", { type: "checkbox" }); i.checked = n > 1 && c.pages >= Math.max(2, Math.ceil(n * 0.6)); c.cb = i; info.appendChild(el("label", { class: "check" }, [i, el("span", { text: "Ảnh " + c.w + "×" + c.h + " — xuất hiện ở " + c.pages + "/" + n + " trang" })])); });
      }
      say("Cô chọn mục cần gỡ (và có thể nhập chữ watermark bên dưới) rồi bấm Gỡ.");
    }
    go.addEventListener("click", function () {
      go.disabled = true; out.textContent = ""; say("Đang gỡ...");
      P.PDFDocument.load(bytes, { ignoreEncryption: true }).then(function (d) {
        var ctx = d.context, pages = d.getPages(), word = kw.value.trim().toLowerCase(), removedTxt = 0, removedImg = 0, removedAnn = 0, off = 0;
        var imgSel = {}; cands.forEach(function (c) { if (c.cb && c.cb.checked) imgSel[c.key] = c; });
        pages.forEach(function (pg, pi) {
          var an = pg.node.get(P.PDFName.of("Annots")); an = an && ctx.lookup(an);
          if (an instanceof P.PDFArray) { for (var i = an.size() - 1; i >= 0; i--) { var a = ctx.lookup(an.get(i)), st = a && a.get && a.get(P.PDFName.of("Subtype")); st = st && st.toString(); if ((st === "/Watermark" && annW.checked) || (st === "/Stamp" && annS.checked)) { an.remove(i); removedAnn++; } } }
          var names = []; Object.keys(imgSel).forEach(function (k) { (imgSel[k].names[pi] || []).forEach(function (nm) { names.push(nm); }); });
          if (!word && !names.length) return;
          var sts = streamsOf(d, pg), newRefs = [], changed = false;
          sts.forEach(function (s) {
            var raw = decoded(s.obj); if (!raw) { newRefs.push(s.ref); return; }
            var txt = latin(raw), before = txt;
            if (word) txt = txt.replace(/BT\b[\s\S]*?\bET\b/g, function (blk) { return strText(blk).toLowerCase().indexOf(word) >= 0 ? (removedTxt++, "") : blk; });
            names.forEach(function (nm) { var re = new RegExp("(^|[\\s])" + nm.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&") + "\\s+Do\\b", "g"); txt = txt.replace(re, function (m, p1) { removedImg++; return p1; }); });
            if (txt !== before) { changed = true; newRefs.push(ctx.register(ctx.flateStream(unlatin(txt)))); } else newRefs.push(s.ref);
          });
          if (changed) pg.node.set(P.PDFName.of("Contents"), ctx.obj(newRefs));
        });
        var sel = layers.filter(function (L) { return L.cb && L.cb.checked; });
        if (sel.length) {
          var oc = ctx.lookup(d.catalog.get(P.PDFName.of("OCProperties"))), dd = oc.get(P.PDFName.of("D")); dd = dd ? ctx.lookup(dd) : null;
          if (!dd) { dd = ctx.obj({}); oc.set(P.PDFName.of("D"), dd); }
          var offArr = dd.get(P.PDFName.of("OFF")); offArr = offArr ? ctx.lookup(offArr) : null; if (!(offArr instanceof P.PDFArray)) { offArr = ctx.obj([]); dd.set(P.PDFName.of("OFF"), offArr); }
          sel.forEach(function (L) { offArr.push(L.ref); off++; });
        }
        return d.save({ useObjectStreams: true }).then(function (u8) { return { u8: u8, t: removedTxt, i: removedImg, a: removedAnn, l: off }; });
      }).then(function (r) {
        var blob = new Blob([r.u8], { type: "application/pdf" }), name = TN.stem(file.name) + "_xoawm.pdf";
        var parts = []; if (r.t) parts.push(r.t + " khối chữ"); if (r.i) parts.push(r.i + " lần vẽ ảnh"); if (r.a) parts.push(r.a + " chú thích"); if (r.l) parts.push(r.l + " lớp");
        var b = el("button", { type: "button", text: "Lưu " + name }); b.addEventListener("click", function () { TN.save(blob, name); });
        var cvp = el("canvas"); cvp.style.cssText = "width:100%;max-width:420px;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff;margin-top:8px";
        out.appendChild(el("div", { class: "result" }, [el("p", { text: parts.length ? "Đã gỡ: " + parts.join(", ") + "." : "Không tìm thấy mục nào khớp để gỡ." }),
          el("p", { class: "meta", text: parts.length ? "Cô xem trang đầu bên dưới để kiểm tra trước khi lưu." : "Watermark có thể nằm dính trong ảnh scan; khi đó hãy dùng cách \"Bản scan / ảnh\"." }), b, cvp]));
        say(parts.length ? "Xong." : "Không có gì thay đổi.", !parts.length);
        if (window.pdfjsLib) pdfjsLib.getDocument({ data: r.u8.slice() }).promise.then(function (p) { return p.getPage(1); }).then(function (pg) { var v = pg.getViewport({ scale: 1.4 }); cvp.width = v.width; cvp.height = v.height; return pg.render({ canvasContext: cvp.getContext("2d"), viewport: v }).promise; }).catch(function () {});
      }).catch(function (e) { say("Không xử lý được: " + (e && e.message || "lỗi"), true); }).then(function () { go.disabled = false; });
    });
    body.appendChild(el("section", {}, [el("h2", { text: "Chọn PDF" }), drop, info]));
    body.appendChild(el("section", {}, [el("h2", { text: "Gỡ watermark là chữ" }), el("label", { class: "field" }, [el("span", { text: "Chữ của watermark (có thể bỏ trống)" }), kw, el("small", { text: "Công cụ xoá các khối chữ chứa cụm này. Nếu PDF dùng phông nhúng đặc biệt thì có thể không dò ra." })])]));
    body.appendChild(el("section", {}, [el("div", { class: "bar" }, [go, status]), out]));
  }

  function draw() {
    Array.prototype.forEach.call(subs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === mode ? "true" : "false"); });
    say(""); meter.set(null); if (mode === "scan") drawScan(); else drawPdf();
  }
  var st = document.createElement("style");
  st.textContent = ".wmwrap{max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--paper)}.wmcv{display:block;max-width:100%;height:auto}.wmcv:not([width]){display:none}input[type=range]{width:100%;accent-color:var(--accent)}";
  document.head.appendChild(st);
  draw();
  window.TNWm = { strText: strText };
})();
