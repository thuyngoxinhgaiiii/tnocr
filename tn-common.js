/* TNOCR – tiện ích dùng chung cho các tab. */
(function () {
  "use strict";
  var TN = window.TN = window.TN || {};
  TN.el = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  };
  TN.stem = function (n) { return n.replace(/\.[^.]+$/, ""); };
  TN.fmt = function (b) { return b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; };
  TN.save = function (blob, name) { if (window.TNSave) window.TNSave(blob, name); };
  TN.load = function (src) { // nạp script theo yêu cầu, chỉ một lần
    TN._s = TN._s || {};
    if (!TN._s[src]) TN._s[src] = new Promise(function (ok, bad) {
      var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error("Không tải được " + src)); };
      document.head.appendChild(s);
    });
    return TN._s[src];
  };
  TN.field = function (id, label, hint, value, type) {
    var i = TN.el("input", { type: type || "text", id: id, value: value == null ? "" : value });
    return TN.el("label", { class: "field" }, [TN.el("span", { text: label }), i, hint ? TN.el("small", { text: hint }) : TN.el("span")]);
  };
  TN.drop = function (accept, multiple, title, sub, onFiles) {
    var input = TN.el("input", { type: "file", accept: accept });
    input.multiple = !!multiple;
    var lab = TN.el("label", { class: "drop" }, [input, TN.el("strong", { text: title }), TN.el("span", { text: sub })]);
    input.addEventListener("change", function (e) { onFiles(e.target.files); e.target.value = ""; });
    ["dragenter", "dragover"].forEach(function (n) { lab.addEventListener(n, function (e) { e.preventDefault(); lab.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (n) { lab.addEventListener(n, function (e) { e.preventDefault(); lab.classList.remove("over"); }); });
    lab.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) onFiles(e.dataTransfer.files); });
    return lab;
  };
  TN.meter = function () {
    var i = TN.el("i"), m = TN.el("div", { class: "meter" }, [i]);
    m.hidden = true;
    return { node: m, set: function (p) { m.hidden = p == null; if (p != null) i.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + "%"; } };
  };

  /* ghi tệp .zip không nén (dùng cho .docx và tải nhiều tệp) */
  var CRC = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return function (u8) { var x = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) x = t[(x ^ u8[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  })();
  TN.zip = function (files, mime) { // files: [{name, data: Uint8Array}]
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
    return new Blob(parts.concat(central, [e.buffer]), { type: mime || "application/zip" });
  };
  var css = document.createElement("style");
  css.textContent =
    ".rowfile{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--bg)}" +
    ".rowfile .fname{flex:1 1 200px;font-weight:700;overflow-wrap:anywhere;min-width:0}" +
    ".field{display:flex;flex-direction:column;gap:6px;margin:10px 0}" +
    ".field input[type=text],.field input[type=number]{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);max-width:100%}" +
    ".field small{color:var(--muted);font-size:14px}" +
    ".inline{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}.inline .field{margin:10px 0}" +
    ".result{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--paper)}" +
    ".sub{display:flex;flex-wrap:wrap;gap:8px}.sub button{background:var(--bg);color:var(--accent-ink);border-color:var(--line);font-weight:400}.sub button[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent);font-weight:700}";
  document.head.appendChild(css);
})();
