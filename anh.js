/* TNOCR – Đổi định dạng ảnh (JPG, PNG, WEBP) và nén ảnh tới chất lượng hoặc dung lượng tuỳ chọn. */
(function () {
  "use strict";
  var root = document.getElementById("tab-anh");
  if (!root || !window.TN) return;
  var el = TN.el, fmt = TN.fmt;
  var files = [], busy = false, cancel = false;

  var status = el("span", { role: "status" }); status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }
  var meter = TN.meter(), list = el("div", { class: "files" }), out = el("div", { class: "files" });

  var fsel = el("select", {}, [el("option", { value: "image/jpeg", text: "JPG (nhẹ, ảnh chụp)" }), el("option", { value: "image/png", text: "PNG (giữ nền trong suốt, chữ sắc nét)" }), el("option", { value: "image/webp", text: "WEBP (rất nhẹ)" })]);
  var rsel = el("select", {}, [["0", "Giữ nguyên kích thước"], ["4096", "Cạnh dài tối đa 4096 px"], ["2560", "Cạnh dài tối đa 2560 px"], ["1920", "Cạnh dài tối đa 1920 px (Full HD)"], ["1280", "Cạnh dài tối đa 1280 px"], ["800", "Cạnh dài tối đa 800 px"]].map(function (o) { return el("option", { value: o[0], text: o[1] }); }));
  var m1 = el("input", { type: "radio", name: "anh-mode", checked: "" }), m2 = el("input", { type: "radio", name: "anh-mode" });
  var q = el("input", { type: "range", min: "40", max: "100", step: "1", value: "85" }), qv = el("span", { text: "85%" });
  q.addEventListener("input", function () { qv.textContent = q.value + "%"; });
  var size = el("input", { type: "number", min: "1", value: "300", style: "width:110px" }), unit = el("select", {}, [el("option", { value: "1024", text: "KB" }), el("option", { value: "1048576", text: "MB" })]);
  var bgsel = el("select", {}, [el("option", { value: "#ffffff", text: "Nền trắng" }), el("option", { value: "#000000", text: "Nền đen" })]);
  var go = el("button", { type: "button", text: "Chuyển đổi" }); go.disabled = true;
  var stop = el("button", { type: "button", class: "ghost", text: "Dừng" }); stop.hidden = true;
  var zipBtn = el("button", { type: "button", class: "ghost", text: "Lưu tất cả (zip)" }); zipBtn.hidden = true;

  root.appendChild(el("p", { class: "privacy", text: "Ảnh được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  root.appendChild(el("section", {}, [el("h2", { text: "Chọn ảnh" }), TN.drop("image/*", true, "Bấm để chọn ảnh, hoặc kéo thả vào đây", "JPG, PNG, WEBP, GIF, BMP, TIFF… Chọn được nhiều ảnh một lúc.", add), list]));
  root.appendChild(el("section", {}, [el("h2", { text: "Chuyển sang" }),
    el("label", { class: "field" }, [el("span", { text: "Định dạng" }), fsel, el("span")]),
    el("label", { class: "field" }, [el("span", { text: "Kích thước" }), rsel, el("span")]),
    el("label", { class: "check" }, [m1, el("span", { text: "Nén theo chất lượng" })]),
    el("label", { class: "field" }, [el("span", {}, [document.createTextNode("Chất lượng: "), qv]), q, el("small", { text: "Áp dụng cho JPG và WEBP. 85% là mức cân bằng tốt; PNG luôn giữ nguyên chất lượng." })]),
    el("label", { class: "check" }, [m2, el("span", { text: "Nén tới dung lượng mong muốn (mỗi ảnh)" }, [el("small", { text: "Công cụ giảm dần chất lượng, nếu chưa đủ thì thu nhỏ ảnh, để vừa mức này." })])]),
    el("div", { class: "inline" }, [el("label", { class: "field" }, [el("span", { text: "Dung lượng" }), size]), el("label", { class: "field" }, [el("span", { text: "Đơn vị" }), unit])]),
    el("label", { class: "field" }, [el("span", { text: "Khi đổi ảnh trong suốt sang JPG" }), bgsel, el("span")])]));
  root.appendChild(el("section", {}, [el("div", { class: "bar" }, [go, stop, zipBtn, status]), meter.node, out]));
  root.appendChild(el("section", { class: "note" }, [el("p", { text: "Ảnh HEIC của iPhone chỉ mở được nếu trình duyệt hỗ trợ (Safari thì được). Safari chưa lưu được WEBP; nếu gặp, công cụ sẽ báo." })]));

  function add(fl) {
    var a = Array.prototype.filter.call(fl, TN.isImg); if (!a.length) { say("Chỉ nhận tệp ảnh.", true); return; }
    files = files.concat(a); go.disabled = false; say(""); render();
  }
  function render() {
    list.textContent = "";
    files.forEach(function (f, i) {
      var b = el("button", { type: "button", class: "ghost", text: "Bỏ" }); b.style.padding = "4px 10px"; b.addEventListener("click", function () { files.splice(i, 1); go.disabled = !files.length; render(); });
      list.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), el("span", { class: "meta", text: fmt(f.size) }), b]));
    });
  }
  var EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

  async function convert(f, type, maxSide, byTarget, quality, goal, bg) {
    var bmp = await createImageBitmap(f, { imageOrientation: "from-image" }), w = bmp.width, h = bmp.height, k = maxSide ? Math.min(1, maxSide / Math.max(w, h)) : 1;
    function enc(scale, qq) {
      var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
      var g = c.getContext("2d"); g.imageSmoothingQuality = "high"; if (type === "image/jpeg") { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); } g.drawImage(bmp, 0, 0, c.width, c.height);
      return TN.blob(c, type, qq).then(function (b) { if (!b) throw new Error("Trình duyệt không lưu được định dạng này."); if (b.type !== type) throw new Error("Trình duyệt này chưa hỗ trợ lưu " + EXT[type].slice(1).toUpperCase() + "."); return { blob: b, w: c.width, h: c.height }; });
    }
    var res;
    if (!byTarget) res = await enc(k, quality);
    else {
      var scale = k, best = null, lossy = type !== "image/png";
      for (var guard = 0; guard < 14; guard++) {
        if (lossy) {
          var r1 = await enc(scale, 0.95);
          if (r1.blob.size <= goal) { best = r1; break; }
          var lo = 0.3, hi = 0.95, found = null;
          for (var it = 0; it < 6; it++) { var mid = (lo + hi) / 2, r = await enc(scale, mid); if (r.blob.size <= goal) { found = r; lo = mid; } else hi = mid; }
          if (found) { best = found; break; }
        } else { var r2 = await enc(scale, undefined); if (r2.blob.size <= goal) { best = r2; break; } }
        scale *= 0.85; if (Math.max(w, h) * scale < 120) break;
      }
      res = best || await enc(Math.max(120 / Math.max(w, h), scale), 0.3); res.missed = !best;
    }
    bmp.close && bmp.close(); return res;
  }

  go.addEventListener("click", async function () {
    busy = true; cancel = false; go.disabled = true; stop.hidden = false; zipBtn.hidden = true; out.textContent = ""; var results = [];
    var type = fsel.value, byTarget = m2.checked, goal = Math.round(+size.value * +unit.value), t0 = Date.now();
    if (byTarget && !(goal > 0)) { say("Cô nhập dung lượng lớn hơn 0.", true); busy = false; go.disabled = false; stop.hidden = true; return; }
    try {
      for (var i = 0; i < files.length; i++) {
        if (cancel) break; var f = files[i]; say("Đang xử lý " + f.name + " (" + (i + 1) + "/" + files.length + ")..."); meter.set(i / files.length); await TN.tick();
        try {
          var r = await convert(f, type, +rsel.value, byTarget, +q.value / 100, goal, bgsel.value), name = TN.stem(f.name) + (byTarget || type !== "image/png" ? "_nen" : "") + EXT[type];
          results.push({ name: name, blob: r.blob });
          var b = el("button", { type: "button", class: "ghost", text: "Lưu" }); b.addEventListener("click", (function (bl, nm) { return function () { TN.save(bl, nm); }; })(r.blob, name));
          var note = r.missed ? "Chưa đạt dung lượng mong muốn dù đã nén tối đa" : r.blob.size >= f.size ? "Lớn hơn ảnh gốc" : "giảm " + Math.round((1 - r.blob.size / f.size) * 100) + "%";
          out.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: name }), el("span", { class: "meta", text: fmt(f.size) + " → " + fmt(r.blob.size) + " · " + r.w + "×" + r.h + " · " + note }), b]));
        } catch (e) { out.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), el("span", { class: "meta", style: "color:var(--bad-ink)", text: "Lỗi: " + (e && e.message || "không đọc được ảnh") })])); }
      }
      meter.set(null); say(cancel ? "Đã dừng." : "Xong sau " + Math.round((Date.now() - t0) / 1000) + " giây.");
      if (results.length > 1) { zipBtn.hidden = false; zipBtn.onclick = async function () { var fs = []; for (var j = 0; j < results.length; j++) fs.push({ name: results[j].name, data: new Uint8Array(await results[j].blob.arrayBuffer()) }); TN.save(TN.zip(fs), "tnocr_anh.zip"); }; }
    } finally { busy = false; go.disabled = !files.length; stop.hidden = true; }
  });
  stop.addEventListener("click", function () { cancel = true; say("Đang dừng..."); });
  m2.addEventListener("change", function () { }); 
})();
