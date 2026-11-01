/* TNOCR – Làm nét và dọn bản scan: làm đều nền, khử nhiễu, làm nét chữ, đen trắng, tự chỉnh nghiêng. */
(function () {
  "use strict";
  var root = document.getElementById("tab-lamnet");
  if (!root || !window.TN || !TN.img) return;
  var el = TN.el, fmt = TN.fmt, IMG = TN.img;
  var files = [], busy = false, cancel = false;

  var status = el("span", { role: "status" }); status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }
  var meter = TN.meter(), list = el("div", { class: "files" }), out = el("div", {}), prevBox = el("div", { class: "cmp" });

  function chk(id, label, hint, on) {
    var i = el("input", { type: "checkbox", id: id }); i.checked = !!on;
    return el("label", { class: "check" }, [i, el("span", { text: label }, hint ? [el("small", { text: hint })] : [])]);
  }
  var preset = el("select", { id: "l-preset" }, [
    el("option", { value: "old", text: "Tài liệu cũ, mờ, ố vàng (khuyên dùng)" }),
    el("option", { value: "text", text: "Chỉ làm nét chữ, giữ màu" }),
    el("option", { value: "bw", text: "Đen trắng sắc nét (nhẹ nhất)" }),
    el("option", { value: "custom", text: "Tự chọn bên dưới" })]);
  var cFlat = chk("l-flat", "Làm đều nền, khử ố vàng và bóng đổ", "", 1), cDen = chk("l-den", "Khử nhiễu hạt", "", 1), cSharp = chk("l-sharp", "Làm nét chữ", "", 1),
      cBw = chk("l-bw", "Chuyển đen trắng", "Chữ rõ nhất, tệp nhỏ nhất; mất màu.", 0), cSkew = chk("l-skew", "Tự chỉnh trang bị nghiêng", "", 1);
  var amt = el("input", { type: "range", id: "l-amt", min: "0.3", max: "2.5", step: "0.1", value: "1.2" });
  var dpi = el("select", { id: "l-dpi" }, [el("option", { value: "150", text: "150 dpi (nhanh)" }), el("option", { value: "200", text: "200 dpi (chuẩn)" }), el("option", { value: "300", text: "300 dpi (nét, chậm)" })]); dpi.value = "200";
  var fmtSel = el("select", { id: "l-fmt" }, [el("option", { value: "pdf", text: "Một tệp PDF" }), el("option", { value: "png", text: "Ảnh PNG từng trang (zip nếu nhiều)" })]);
  var cos = [cFlat, cDen, cSharp, cBw, cSkew];
  var PRE = { old: [1, 1, 1, 0, 1], text: [0, 1, 1, 0, 1], bw: [1, 0, 1, 1, 1] };
  preset.addEventListener("change", function () { var p = PRE[preset.value]; if (p) cos.forEach(function (c, i) { c.querySelector("input").checked = !!p[i]; }); });
  cos.forEach(function (c) { c.querySelector("input").addEventListener("change", function () { preset.value = "custom"; }); });
  var go = el("button", { type: "button", text: "Xử lý tất cả và lưu" }); go.disabled = true;
  var pv = el("button", { type: "button", class: "ghost", text: "Xem thử trang đầu" }); pv.disabled = true;
  var stop = el("button", { type: "button", class: "ghost", text: "Dừng" }); stop.hidden = true;

  root.appendChild(el("p", { class: "privacy", text: "Tệp được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  root.appendChild(el("section", {}, [el("h2", { text: "Chọn bản scan" }),
    TN.drop("application/pdf,image/*,.pdf", true, "Bấm để chọn PDF hoặc ảnh, hoặc kéo thả vào đây", "Chọn được nhiều tệp một lúc.", add), list]));
  root.appendChild(el("section", {}, [el("h2", { text: "Cách xử lý" }),
    el("label", { class: "field" }, [el("span", { text: "Mẫu có sẵn" }), preset, el("span")]), cFlat, cDen, cSharp,
    el("label", { class: "field" }, [el("span", { text: "Độ nét chữ" }), amt, el("span")]), cBw, cSkew,
    el("div", { class: "inline" }, [el("label", { class: "field" }, [el("span", { text: "Độ phân giải trang PDF" }), dpi, el("span")]), el("label", { class: "field" }, [el("span", { text: "Kết quả" }), fmtSel, el("span")])])]));
  root.appendChild(el("section", {}, [el("div", { class: "bar" }, [pv, go, stop, status]), meter.node, prevBox, out]));
  root.appendChild(el("section", { class: "note" }, [el("p", { text: "Nên bấm \"Xem thử trang đầu\" trước để chọn mẫu phù hợp. Đen trắng rất hợp bản in chữ; ảnh chụp màu, hình vẽ thì nên giữ màu. Tệp kết quả là ảnh, nếu cần tìm kiếm chữ thì đưa sang tab OCR." })]));

  function add(fl) {
    var a = Array.prototype.filter.call(fl, function (f) { return TN.isPdf(f) || TN.isImg(f); });
    if (!a.length) { say("Chỉ nhận PDF hoặc ảnh.", true); return; }
    files = files.concat(a); out.textContent = ""; say(""); go.disabled = pv.disabled = false; render();
  }
  function render() {
    list.textContent = "";
    files.forEach(function (f, i) {
      var b = el("button", { type: "button", class: "ghost", text: "Bỏ" }); b.style.padding = "4px 10px";
      b.addEventListener("click", function () { files.splice(i, 1); go.disabled = pv.disabled = !files.length; render(); });
      list.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), el("span", { class: "meta", text: fmt(f.size) }), b]));
    });
  }
  function opts() { return { flat: cFlat.querySelector("input").checked, den: cDen.querySelector("input").checked, sharp: cSharp.querySelector("input").checked, bw: cBw.querySelector("input").checked, skew: cSkew.querySelector("input").checked, amt: +amt.value }; }

  function process(c, o, dpiV) {
    var k = dpiV / 200;
    return TN.tick().then(function () {
      if (o.skew) { var a = IMG.skewAngle(c); if (a) IMG.rotate(c, a, "#fff"); }
      if (o.flat) IMG.flatten(c, 1);
      if (o.den || o.sharp) IMG.denoiseSharpen(c, o.den, o.sharp ? o.amt : 0, Math.max(1, Math.round(1.2 * k)));
      if (o.bw) IMG.binarize(c, Math.round(25 * k), 0.2);
    });
  }

  pv.addEventListener("click", function () {
    if (!files.length || busy) return; say("Đang tạo bản xem thử..."); var o = opts(), d = +dpi.value;
    TN.eachPage(files[0], Math.min(d, 150), function (c) {
      var orig = IMG.clone(c); return process(c, o, Math.min(d, 150)).then(function () {
        prevBox.textContent = "";
        [["Gốc", orig], ["Sau khi xử lý", c]].forEach(function (p) { p[1].style.cssText = "width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff"; prevBox.appendChild(el("figure", { style: "margin:0;min-width:0" }, [p[1], el("figcaption", { class: "meta", text: p[0] })])); });
        say("Cô so sánh hai bản rồi chỉnh lại nếu cần.");
      });
    }, 1).catch(function (e) { say("Không xem thử được: " + (e && e.message || "lỗi"), true); });
  });

  go.addEventListener("click", function () {
    busy = true; cancel = false; go.disabled = pv.disabled = true; stop.hidden = false; out.textContent = ""; prevBox.textContent = "";
    var o = opts(), d = +dpi.value, asPdf = fmtSel.value === "pdf", results = [], total = 0, done = 0, t0 = Date.now();
    var chain = Promise.resolve();
    files.forEach(function (f, fi) {
      chain = chain.then(function () {
        var pages = [];
        return TN.eachPage(f, d, function (c, n, tot) {
          if (cancel) return false; say("Đang xử lý " + f.name + " — trang " + n + "/" + tot + "...");
          meter.set(((fi + (n - 1) / tot) / files.length));
          return process(c, o, d).then(function () {
            var png = o.bw || !asPdf; return TN.blob(c, png ? "image/png" : "image/jpeg", 0.88).then(function (b) {
              var it = { blob: b, png: png, wPt: c.width * 72 / d, hPt: c.height * 72 / d, name: TN.stem(f.name) + (tot > 1 ? "_" + String(n).padStart(3, "0") : "") + "_net.png" };
              if (asPdf) pages.push(it); else results.push(it);
            });
          });
        }).then(function () { if (cancel) return; if (asPdf) return TN.pdfFromImages(pages).then(function (b) { results.push({ blob: b, name: TN.stem(f.name) + "_net.pdf" }); }); });
      });
    });
    chain.then(function () {
      meter.set(null); if (cancel) { say("Đã dừng."); return; }
      say("Xong sau " + Math.round((Date.now() - t0) / 1000) + " giây.");
      var one = results.length === 1 ? results[0] : null, blob, name;
      if (one) { blob = one.blob; name = one.name; }
      else { return Promise.all(results.map(function (r) { return r.blob.arrayBuffer().then(function (b) { return { name: r.name, data: new Uint8Array(b) }; }); })).then(function (fs) { show(TN.zip(fs), "tnocr_net.zip", results.length + " tệp"); }); }
      show(blob, name, "");
    }).catch(function (e) { meter.set(null); say("Không xử lý được: " + (e && e.message || "lỗi"), true); })
      .then(function () { busy = false; go.disabled = pv.disabled = !files.length; stop.hidden = true; });
    function show(blob, name, extra) {
      var b = el("button", { type: "button", text: "Lưu " + name }); b.addEventListener("click", function () { TN.save(blob, name); });
      out.appendChild(el("div", { class: "result" }, [el("p", { text: name + " · " + fmt(blob.size) + (extra ? " · " + extra : "") }), b]));
    }
  });
  stop.addEventListener("click", function () { cancel = true; say("Đang dừng..."); });

  var st = document.createElement("style");
  st.textContent = ".cmp{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.cmp:empty{display:none}input[type=range]{width:100%;accent-color:var(--accent)}";
  document.head.appendChild(st);
})();
