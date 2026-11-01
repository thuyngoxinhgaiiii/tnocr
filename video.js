/* TNOCR – Nén video tới dung lượng tùy chọn (ffmpeg chạy trong trình duyệt, tải lần đầu ~10 MB). */
(function () {
  "use strict";
  var root = document.getElementById("tab-video");
  if (!root || !window.TN) return;
  var TN = window.TN, el = TN.el, fmt = TN.fmt;
  var BASE = new URL(".", document.baseURI).href;
  var file = null, duration = 0, ff = null, busy = false, cancelled = false, urls = null;

  var status = el("span", { role: "status" }); status.style.cssText = "color:var(--muted);font-size:15px";
  function say(t, bad) { status.textContent = t; status.style.color = bad ? "var(--bad-ink)" : "var(--muted)"; }
  var meter = TN.meter();
  var list = el("div", { class: "files" }), out = el("div", {});
  var go = el("button", { type: "button", text: "Nén video" }); go.disabled = true;
  var stop = el("button", { type: "button", class: "ghost", text: "Dừng" }); stop.hidden = true;
  var size = TN.field("v-size", "Dung lượng mong muốn", "Kết quả sẽ xấp xỉ hoặc nhỏ hơn mức này.", "50", "number");
  var unit = el("select", { id: "v-unit" }, [el("option", { value: "1048576", text: "MB" }), el("option", { value: "1073741824", text: "GB" })]);
  var res = el("select", { id: "v-res" }, [el("option", { value: "0", text: "Giữ độ phân giải gốc" }), el("option", { value: "1080", text: "Tối đa 1080p" }), el("option", { value: "720", text: "Tối đa 720p (khuyên dùng khi nén mạnh)" }), el("option", { value: "480", text: "Tối đa 480p" })]);
  res.value = "720";
  var speed = el("select", { id: "v-speed" }, [el("option", { value: "ultrafast", text: "Nhanh nhất (chất lượng kém hơn một chút)" }), el("option", { value: "veryfast", text: "Cân bằng" }), el("option", { value: "medium", text: "Chậm, đẹp nhất" })]);
  speed.value = "veryfast";

  root.appendChild(el("p", { class: "privacy", text: "Video được xử lý ngay trong trình duyệt của cô, không gửi đi đâu cả." }));
  root.appendChild(el("section", {}, [el("h2", { text: "Chọn video" }),
    TN.drop("video/*,.mp4,.mov,.m4v,.mkv,.webm,.avi", false, "Bấm để chọn một video, hoặc kéo thả vào đây", "MP4, MOV, MKV, WEBM, AVI. Kết quả là MP4.", pick), list]));
  root.appendChild(el("section", {}, [el("h2", { text: "Tuỳ chọn" }),
    el("div", { class: "inline" }, [size, el("label", { class: "field" }, [el("span", { text: "Đơn vị" }), unit, el("span")])]),
    el("label", { class: "field" }, [el("span", { text: "Độ phân giải" }), res, el("small", { text: "Hạ độ phân giải giúp hình vẫn nét khi nén xuống dung lượng thấp." })]),
    el("label", { class: "field" }, [el("span", { text: "Tốc độ nén" }), speed, el("small", { text: "Càng chậm thì cùng dung lượng hình càng đẹp." })])]));
  root.appendChild(el("section", {}, [el("div", { class: "bar" }, [go, stop, status]), meter.node, out]));
  root.appendChild(el("section", { class: "note" }, [
    el("p", { text: "Lần đầu bấm Nén video, trang tải bộ xử lý khoảng 10 MB rồi nhớ lại cho các lần sau." }),
    el("p", { text: "Video chạy trong trình duyệt nên chậm hơn phần mềm cài trên máy: video dài vài chục phút có thể mất nhiều phút, và nên để máy cắm điện, không đóng tab. Video trên khoảng 1 GB có thể làm trình duyệt hết bộ nhớ." }),
    el("p", { text: "Dung lượng kết quả là ước tính theo độ dài video nên có thể lệch vài phần trăm. Nếu dung lượng chọn quá thấp so với độ dài, hình sẽ bị vỡ." })]));

  function pick(fl) {
    var f = fl[0]; if (!f) return;
    file = f; duration = 0; out.textContent = ""; say("Đang đọc thông tin video..."); go.disabled = true;
    list.textContent = ""; var meta = el("span", { class: "meta", text: fmt(f.size) });
    list.appendChild(el("div", { class: "rowfile" }, [el("span", { class: "fname", text: f.name }), meta]));
    var v = document.createElement("video"), u = URL.createObjectURL(f); v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = function () {
      duration = v.duration; meta.textContent = fmt(f.size) + " · " + fmtT(duration) + (v.videoWidth ? " · " + v.videoWidth + "×" + v.videoHeight : "");
      v.videoHeightSaved = v.videoHeight; file._h = v.videoHeight; URL.revokeObjectURL(u); go.disabled = !(duration > 0 && isFinite(duration)); say(go.disabled ? "Không đọc được độ dài video." : "", go.disabled);
    };
    v.onerror = function () { URL.revokeObjectURL(u); duration = 0; say("Trình duyệt không đọc được định dạng này để lấy độ dài. Cô thử chuyển sang MP4 trước.", true); };
    v.src = u;
  }
  function fmtT(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s % 60).padStart(2, "0"); }

  function fetchBuf(url, label) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Không tải được " + label + " (" + r.status + ")");
      var total = +r.headers.get("content-length") || 0, got = 0, chunks = [], rd = r.body.getReader();
      function rdn() { return rd.read().then(function (x) { if (x.done) return new Blob(chunks); chunks.push(x.value); got += x.value.length; if (total) { meter.set(got / total * 0.3); say("Đang tải bộ xử lý video... " + Math.round(got / total * 100) + "%"); } return rdn(); }); }
      return rdn();
    });
  }
  function loadFF() {
    if (ff) return Promise.resolve(ff);
    say("Đang tải bộ xử lý video (lần đầu ~10 MB)...");
    return TN.load("ffmpeg.js").then(function () {
      return Promise.all([fetchBuf(BASE + "ffmpeg-core.wasm.bin", "ffmpeg-core.wasm.bin"), fetch(BASE + "ffmpeg-core.js").then(function (r) { return r.blob(); })]);
    }).then(function (p) {
      var ds = new DecompressionStream("gzip");
      return new Response(p[0].stream().pipeThrough(ds)).blob().then(function (wasm) {
        urls = { wasm: URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })), core: URL.createObjectURL(new Blob([p[1]], { type: "text/javascript" })) };
        var f = new FFmpegWASM.FFmpeg();
        return f.load({ coreURL: urls.core, wasmURL: urls.wasm }).then(function () { ff = f; return f; });
      });
    });
  }

  go.addEventListener("click", function () {
    var goalBytes = Math.round(parseFloat(size.querySelector("input").value) * parseFloat(unit.value));
    if (!file || !(goalBytes > 0)) { say("Cô nhập dung lượng mong muốn lớn hơn 0.", true); return; }
    if (goalBytes >= file.size) { say("Video gốc (" + fmt(file.size) + ") đã nhỏ hơn hoặc bằng mức cô chọn, không cần nén.", true); return; }
    if (file.size > 1.5 * 1073741824) { say("Video lớn hơn 1,5 GB, trình duyệt khó xử lý. Cô cắt nhỏ trước hoặc dùng phần mềm trên máy.", true); return; }
    busy = true; cancelled = false; go.disabled = true; stop.hidden = false; out.textContent = ""; meter.set(0); var t0 = Date.now();
    var audioK = 64, totalK = goalBytes * 0.94 * 8 / duration / 1000, videoK = Math.floor(totalK - audioK);
    if (videoK < 60) { audioK = 32; videoK = Math.floor(totalK - audioK); }
    if (videoK < 30) { say("Dung lượng chọn quá nhỏ so với độ dài video (" + fmtT(duration) + "). Hãy tăng lên ít nhất " + fmt(Math.ceil((90 * 1000 / 8) * duration)) + ".", true); busy = false; go.disabled = false; stop.hidden = true; return; }
    var h = +res.value, vf = h ? "scale=-2:'min(" + h + ",ih)'" : null;
    var ext = (file.name.match(/\.[A-Za-z0-9]+$/) || [".mp4"])[0].toLowerCase(), inName = "in" + ext;
    var f2;
    loadFF().then(function (f) {
      f2 = f;
      f.on("progress", function (e) { if (e && isFinite(e.progress)) { var p = Math.max(0, Math.min(1, e.progress)); meter.set(0.3 + p * 0.7); var el_ = (Date.now() - t0) / 1000; say("Đang nén video... " + Math.round(p * 100) + "%" + (p > 0.03 ? " (còn khoảng " + fmtT(el_ / p * (1 - p)) + ")" : "")); } });
      say("Đang nạp video vào bộ nhớ...");
      return file.arrayBuffer().then(function (b) { return f.writeFile(inName, new Uint8Array(b)); });
    }).then(function () {
      var args = ["-i", inName, "-map", "0:v:0", "-map", "0:a:0?"];
      if (vf) args.push("-vf", vf);
      args.push("-c:v", "libx264", "-preset", speed.value, "-b:v", videoK + "k", "-maxrate", Math.round(videoK * 1.4) + "k", "-bufsize", videoK * 2 + "k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", audioK + "k", "-ac", "2", "-movflags", "+faststart", "-y", "out.mp4");
      meter.set(0.3); say("Đang nén video...");
      return f2.exec(args);
    }).then(function (code) {
      if (cancelled) throw new Error("__cancel");
      if (code !== 0) throw new Error("ffmpeg báo lỗi (mã " + code + "). Định dạng video này có thể chưa được hỗ trợ.");
      return f2.readFile("out.mp4");
    }).then(function (data) {
      f2.deleteFile(inName).catch(function () {}); f2.deleteFile("out.mp4").catch(function () {});
      meter.set(null);
      var blob = new Blob([data], { type: "video/mp4" }), name = TN.stem(file.name) + "_nen.mp4";
      say("Xong sau " + fmtT((Date.now() - t0) / 1000) + ".");
      var b = el("button", { type: "button", text: "Lưu " + name }); b.addEventListener("click", function () { TN.save(blob, name); });
      var over = blob.size > goalBytes * 1.05;
      out.appendChild(el("div", { class: "result" }, [
        el("p", { text: fmt(file.size) + "  →  " + fmt(blob.size) + "  (mục tiêu " + fmt(goalBytes) + ")" }),
        el("p", { class: "meta", text: (over ? "Kết quả lớn hơn mục tiêu một chút; cô có thể chạy lại với dung lượng thấp hơn khoảng " + Math.round((1 - goalBytes / blob.size) * 100) + "%. " : "") + "Hình: " + videoK + " kbps, tiếng: " + audioK + " kbps." }), b]));
    }).catch(function (e) {
      meter.set(null);
      if (e && e.message === "__cancel") { say("Đã dừng."); ff = null; }
      else say("Không nén được: " + (e && e.message || "lỗi") + " Nếu lỗi do thiếu bộ nhớ, cô thử video nhỏ hơn hoặc đóng bớt tab khác.", true);
    }).then(function () { busy = false; go.disabled = !(duration > 0); stop.hidden = true; });
  });
  stop.addEventListener("click", function () { cancelled = true; say("Đang dừng..."); if (ff) { try { ff.terminate(); } catch (e) {} ff = null; } });
})();
