/* TNOCR – Tách nền ảnh: (1) nền đơn sắc/giấy trắng (chữ ký, con dấu, ảnh chụp tài liệu); (2) AI tách người/vật (mô hình u2netp, chạy trong trình duyệt). */
(function () {
  "use strict";
  var root = document.getElementById("tab-bg");
  if (!root || !window.TN || !TN.img) return;
  var el = TN.el, fmt = TN.fmt, IMG = TN.img;
  var BASE = new URL(".", document.baseURI).href;
  var files = [], mode = "plain", busy = false, session = null, ort = null;

  var status = el("span", { role: "status" }); status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }
  var meter = TN.meter(), list = el("div", { class: "files" }), out = el("div", {}), grid = el("div", { class: "cmp bgcmp" });

  var subs = el("div", { class: "sub", role: "group", "aria-label": "Cách tách nền" });
  [["plain", "Nền trắng / đơn sắc"], ["ai", "AI tách người, vật"]].forEach(function (m) {
    var b = el("button", { type: "button", "data-m": m[0], text: m[1] }); b.addEventListener("click", function () { mode = m[0]; refreshUI(); }); subs.appendChild(b);
  });
  var hint = el("p", { class: "meta" });
  var tol = el("input", { type: "range", min: "5", max: "120", step: "1", value: "40" });
  var soft = el("input", { type: "range", min: "0", max: "60", step: "1", value: "20" });
  var inner = el("input", { type: "checkbox", id: "bg-inner" });
  var bgsel = el("select", {}, [el("option", { value: "none", text: "Trong suốt (PNG)" }), el("option", { value: "#ffffff", text: "Nền trắng" }), el("option", { value: "#FCE6D2", text: "Nền cam nhạt" }), el("option", { value: "#E0ECF6", text: "Nền xanh nhạt" })]);
  var plainBox = el("div", {}, [
    el("label", { class: "field" }, [el("span", { text: "Độ rộng màu nền" }), tol, el("small", { text: "Tăng nếu còn sót nền; giảm nếu chủ thể bị mất nét." })]),
    el("label", { class: "field" }, [el("span", { text: "Độ mịn mép" }), soft, el("span")]),
    el("label", { class: "check" }, [inner, el("span", { text: "Xoá cả màu nền nằm bên trong hình" }, [el("small", { text: "Bật cho chữ ký, con dấu, nét chữ (nền lọt giữa các nét cũng được xoá)." })])])]);
  var aiBox = el("div", {}, [el("p", { class: "meta", text: "AI nhận ra chủ thể chính (người, đồ vật, con vật) và bỏ phần còn lại. Lần đầu tải mô hình khoảng 16 MB rồi nhớ lại. Chậm hơn cách nền trắng, kết quả ở mép tóc, vật mảnh có thể chưa hoàn hảo." })]);
  var go = el("button", { type: "button", text: "Tách nền" }); go.disabled = true;
  root.appendChild(el("p", { class: "privacy", text: "Ảnh được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  root.appendChild(el("section", {}, [el("h2", { text: "Chọn cách tách" }), subs, hint]));
  root.appendChild(el("section", {}, [el("h2", { text: "Chọn ảnh" }), TN.drop("image/*", true, "Bấm để chọn ảnh, hoặc kéo thả vào đây", "JPG, PNG, WEBP. Chọn được nhiều ảnh.", add), list]));
  root.appendChild(el("section", {}, [el("h2", { text: "Tuỳ chọn" }), plainBox, aiBox, el("label", { class: "field" }, [el("span", { text: "Nền của ảnh kết quả" }), bgsel, el("span")])]));
  root.appendChild(el("section", {}, [el("div", { class: "bar" }, [go, status]), meter.node, grid, out]));

  function refreshUI() {
    Array.prototype.forEach.call(subs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.m === mode ? "true" : "false"); });
    plainBox.hidden = mode !== "plain"; aiBox.hidden = mode !== "ai";
    hint.textContent = mode === "plain" ? "Dùng cho ảnh có nền một màu (giấy trắng, tường trơn): chữ ký, con dấu, sản phẩm chụp trên nền trơn." : "Dùng cho ảnh chân dung, vật dụng trên nền phức tạp.";
  }
  function add(fl) {
    var a = Array.prototype.filter.call(fl, TN.isImg); if (!a.length) { say("Chỉ nhận ảnh.", true); return; }
    files = files.concat(a); go.disabled = false; out.textContent = ""; say("");
    list.textContent = ""; files.forEach(function (f, i) {
      var b = el("button", { type: "button", class: "ghost", text: "Bỏ" }); b.style.padding = "4px 10px"; b.addEventListener("click", function () { files.splice(i, 1); go.disabled = !files.length; add([]); });
      list.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), el("span", { class: "meta", text: fmt(f.size) }), b]));
    });
  }

  /* ---- nền đơn sắc: tìm màu nền từ viền, tô loang từ mép vào; điểm càng giống nền càng trong suốt ---- */
  function plain(c, tolV, softV, inside) {
    var w = c.width, h = c.height, g = c.getContext("2d", { willReadFrequently: true }), d = g.getImageData(0, 0, w, h), px = d.data, N = w * h, i, x, y;
    var rs = [], gs = [], bs = [], st = Math.max(1, Math.floor(Math.max(w, h) / 400));
    function s(x, y) { var p = (y * w + x) * 4; rs.push(px[p]); gs.push(px[p + 1]); bs.push(px[p + 2]); }
    for (x = 0; x < w; x += st) { s(x, 0); s(x, h - 1); } for (y = 0; y < h; y += st) { s(0, y); s(w - 1, y); }
    function med(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    var br = med(rs), bgc = med(gs), bb = med(bs);
    function dist(p) { var dr = px[p] - br, dg = px[p + 1] - bgc, db = px[p + 2] - bb; return Math.sqrt(dr * dr + dg * dg + db * db); }
    var alpha = new Uint8ClampedArray(N).fill(255);
    var hi = tolV + softV;
    function a(dv) { return dv <= tolV ? 0 : dv >= hi ? 255 : Math.round(255 * (dv - tolV) / Math.max(1, softV)); }
    if (inside) { for (i = 0; i < N; i++) alpha[i] = a(dist(i * 4)); }
    else {
      var seen = new Uint8Array(N), q = new Int32Array(N), qh = 0, qt = 0;
      function push(i) { if (!seen[i] && dist(i * 4) <= hi) { seen[i] = 1; q[qt++] = i; } }
      for (x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (qh < qt) { var p = q[qh++], px0 = p % w, py0 = (p / w) | 0; alpha[p] = a(dist(p * 4)); if (px0 > 0) push(p - 1); if (px0 < w - 1) push(p + 1); if (py0 > 0) push(p - w); if (py0 < h - 1) push(p + w); }
    }
    for (i = 0; i < N; i++) { px[i * 4 + 3] = alpha[i]; if (alpha[i] > 0 && alpha[i] < 255) { var f = 255 / alpha[i], k = 1 - alpha[i] / 255; px[i * 4] = Math.max(0, Math.min(255, (px[i * 4] - br * k) * f)); px[i * 4 + 1] = Math.max(0, Math.min(255, (px[i * 4 + 1] - bgc * k) * f)); px[i * 4 + 2] = Math.max(0, Math.min(255, (px[i * 4 + 2] - bb * k) * f)); } }
    g.putImageData(d, 0, 0);
  }

  /* ---- AI: u2netp qua onnxruntime-web ---- */
  function loadAI() {
    if (session) return Promise.resolve();
    say("Đang tải mô hình AI (lần đầu ~16 MB)...");
    return TN.load("ort.min.js").then(function () {
      ort = window.ort; ort.env.wasm.wasmPaths = BASE; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
      return fetch(BASE + "u2netp.onnx.bin").then(function (r) { if (!r.ok) throw new Error("Không tải được mô hình"); return r.arrayBuffer(); });
    }).then(function (buf) { return ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ["wasm"], graphOptimizationLevel: "all" }); }).then(function (s) { session = s; });
  }
  function ai(c) {
    var S = 320, t = document.createElement("canvas"); t.width = t.height = S; var tg = t.getContext("2d", { willReadFrequently: true }); tg.drawImage(c, 0, 0, S, S);
    var p = tg.getImageData(0, 0, S, S).data, f = new Float32Array(3 * S * S), mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225], i, ch;
    for (i = 0; i < S * S; i++) for (ch = 0; ch < 3; ch++) f[ch * S * S + i] = (p[i * 4 + ch] / 255 - mean[ch]) / sd[ch];
    var feeds = {}; feeds[session.inputNames[0]] = new ort.Tensor("float32", f, [1, 3, S, S]);
    return session.run(feeds).then(function (res) {
      var m = res[session.outputNames[0]].data, mn = Infinity, mx = -Infinity; for (i = 0; i < m.length; i++) { if (m[i] < mn) mn = m[i]; if (m[i] > mx) mx = m[i]; }
      var mc = document.createElement("canvas"); mc.width = mc.height = S; var mg = mc.getContext("2d"), md = mg.createImageData(S, S);
      for (i = 0; i < S * S; i++) { var v = Math.round(255 * (m[i] - mn) / Math.max(1e-6, mx - mn)); md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255; md.data[i * 4 + 3] = v; }
      mg.putImageData(md, 0, 0);
      var g = c.getContext("2d"); g.save(); g.globalCompositeOperation = "destination-in"; g.imageSmoothingQuality = "high"; g.drawImage(mc, 0, 0, c.width, c.height); g.restore();
    });
  }
  function finish(c, bg) {
    if (bg === "none") return c; var t = document.createElement("canvas"); t.width = c.width; t.height = c.height; var g = t.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, t.width, t.height); g.drawImage(c, 0, 0); return t;
  }
  function checker(cv) { cv.style.cssText = "width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:repeating-conic-gradient(#d9d2cb 0% 25%,#fff 0% 50%) 50%/16px 16px"; }

  go.addEventListener("click", function () {
    if (busy || !files.length) return; busy = true; go.disabled = true; out.textContent = ""; grid.textContent = ""; var results = [], t0 = Date.now(), m = mode, bg = bgsel.value;
    var chain = Promise.resolve(); if (m === "ai") chain = loadAI();
    files.forEach(function (f, fi) {
      chain = chain.then(function () {
        say("Đang xử lý " + f.name + " (" + (fi + 1) + "/" + files.length + ")..."); meter.set(fi / files.length);
        return TN.eachPage(f, 200, function (c) {
          var big = Math.max(c.width, c.height); if (big > 2400) { var k = 2400 / big, t = document.createElement("canvas"); t.width = Math.round(c.width * k); t.height = Math.round(c.height * k); t.getContext("2d").drawImage(c, 0, 0, t.width, t.height); c = t; }
          return TN.tick().then(function () { return m === "ai" ? ai(c) : plain(c, +tol.value, +soft.value, inner.checked); }).then(function () {
            var r = finish(c, bg); return TN.blob(r, "image/png").then(function (b) { results.push({ blob: b, name: TN.stem(f.name) + "_tachnen.png" }); var cv = IMG.clone(r); checker(cv); grid.appendChild(el("figure", { style: "margin:0;min-width:0" }, [cv, el("figcaption", { class: "meta", text: f.name })])); });
          });
        }, 1);
      });
    });
    chain.then(function () {
      meter.set(null); say("Xong sau " + Math.round((Date.now() - t0) / 1000) + " giây.");
      function show(blob, name, extra) { var b = el("button", { type: "button", text: "Lưu " + name }); b.addEventListener("click", function () { TN.save(blob, name); }); out.appendChild(el("div", { class: "result" }, [el("p", { text: name + " · " + fmt(blob.size) + (extra || "") }), b])); }
      if (results.length === 1) show(results[0].blob, results[0].name);
      else return Promise.all(results.map(function (r) { return r.blob.arrayBuffer().then(function (b) { return { name: r.name, data: new Uint8Array(b) }; }); })).then(function (fs) { show(TN.zip(fs), "tnocr_tachnen.zip", " · " + results.length + " ảnh"); });
    }).catch(function (e) { meter.set(null); say("Không xử lý được: " + (e && e.message || "lỗi") + (m === "ai" ? " Nếu AI không chạy trên máy này, cô dùng cách Nền trắng / đơn sắc." : ""), true); })
      .then(function () { busy = false; go.disabled = !files.length; });
  });

  var css = document.createElement("style");
  css.textContent = ".bgcmp{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.bgcmp:empty{display:none}input[type=range]{width:100%;accent-color:var(--accent)}";
  document.head.appendChild(css);
  refreshUI();
})();
