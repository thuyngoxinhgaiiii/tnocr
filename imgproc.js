/* TNOCR – xử lý ảnh bằng canvas: làm đều nền, khử nhiễu, làm nét, đen trắng, chỉnh nghiêng, xoá màu/vùng. */
(function () {
  "use strict";
  var IMG = (window.TN = window.TN || {}).img = {};
  function data(c) { return c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height); }
  function put(c, d) { c.getContext("2d").putImageData(d, 0, 0); }
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /* Làm đều nền: ước lượng màu giấy theo từng ô rồi chia, khử ố vàng, bóng đổ; sau đó kéo giãn độ tương phản. */
  IMG.flatten = function (c, strength) {
    var w = c.width, h = c.height, d = data(c), px = d.data, B = Math.max(12, Math.round(Math.min(w, h) / 90));
    var bw = Math.ceil(w / B), bh = Math.ceil(h / B), mx = new Float32Array(bw * bh * 3), x, y, ch, i;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = ((y / B | 0) * bw + (x / B | 0)) * 3; var p = (y * w + x) * 4;
      if (px[p] > mx[i]) mx[i] = px[p]; if (px[p + 1] > mx[i + 1]) mx[i + 1] = px[p + 1]; if (px[p + 2] > mx[i + 2]) mx[i + 2] = px[p + 2];
    }
    var bg = new Float32Array(bw * bh * 3); // làm trơn: lấy giá trị lớn nhất lân cận rồi làm mờ
    for (y = 0; y < bh; y++) for (x = 0; x < bw; x++) for (ch = 0; ch < 3; ch++) {
      var m = 0, s = 0, n = 0;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= bh || xx >= bw) continue;
        var v = mx[(yy * bw + xx) * 3 + ch]; if (v > m) m = v; s += v; n++;
      }
      bg[(y * bw + x) * 3 + ch] = 0.65 * m + 0.35 * s / n;
    }
    var k = strength == null ? 1 : strength, hist = new Uint32Array(256);
    for (y = 0; y < h; y++) {
      var fy = (y + 0.5) / B - 0.5, y0 = Math.max(0, Math.min(bh - 1, Math.floor(fy))), y1 = Math.min(bh - 1, y0 + 1), ty = Math.max(0, Math.min(1, fy - y0));
      for (x = 0; x < w; x++) {
        var fx = (x + 0.5) / B - 0.5, x0 = Math.max(0, Math.min(bw - 1, Math.floor(fx))), x1 = Math.min(bw - 1, x0 + 1), tx = Math.max(0, Math.min(1, fx - x0)), p2 = (y * w + x) * 4;
        for (ch = 0; ch < 3; ch++) {
          var a = bg[(y0 * bw + x0) * 3 + ch] * (1 - tx) + bg[(y0 * bw + x1) * 3 + ch] * tx, b = bg[(y1 * bw + x0) * 3 + ch] * (1 - tx) + bg[(y1 * bw + x1) * 3 + ch] * tx;
          var g = Math.max(110, a * (1 - ty) + b * ty), o = px[p2 + ch] * 255 / g; o = px[p2 + ch] + (o - px[p2 + ch]) * k; px[p2 + ch] = clamp(o);
        }
        hist[(px[p2] * 0.299 + px[p2 + 1] * 0.587 + px[p2 + 2] * 0.114) | 0]++;
      }
    }
    var tot = w * h, acc = 0, black = 0; for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= tot * 0.004) { black = i; break; } }
    var white = 250, lut = new Uint8ClampedArray(256); if (white - black < 40) black = Math.max(0, white - 40);
    for (i = 0; i < 256; i++) lut[i] = 255 * Math.pow(clamp((i - black) / (white - black) * 255) / 255, 1.1);
    for (i = 0; i < px.length; i += 4) { px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]]; }
    put(c, d);
  };

  function boxBlur(src, w, h, r) { // mờ hộp tách rời trên mảng Float32 một kênh
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, s, n = 2 * r + 1;
    for (y = 0; y < h; y++) {
      s = 0; for (x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; }
    }
    for (x = 0; x < w; x++) {
      s = 0; for (y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
    return out;
  }
  function gauss(src, w, h, r) { var a = boxBlur(src, w, h, r); a = boxBlur(a, w, h, r); return boxBlur(a, w, h, r); }

  /* Khử nhiễu nhẹ (trộn với bản mờ) và/hoặc làm nét bằng unsharp mask, tính trên từng kênh màu. */
  IMG.denoiseSharpen = function (c, denoise, amount, radius) {
    if (!denoise && !(amount > 0)) return;
    var w = c.width, h = c.height, d = data(c), px = d.data, N = w * h, ch, i, ch0 = new Float32Array(N);
    for (ch = 0; ch < 3; ch++) {
      for (i = 0; i < N; i++) ch0[i] = px[i * 4 + ch];
      var cur = ch0;
      if (denoise) { var sm = boxBlur(cur, w, h, 1); cur = new Float32Array(N); for (i = 0; i < N; i++) cur[i] = 0.45 * ch0[i] + 0.55 * sm[i]; }
      if (amount > 0) {
        var bl = gauss(cur, w, h, Math.max(1, Math.round(radius || 1)));
        for (i = 0; i < N; i++) px[i * 4 + ch] = clamp(cur[i] + amount * (cur[i] - bl[i]));
      } else for (i = 0; i < N; i++) px[i * 4 + ch] = clamp(cur[i]);
    }
    put(c, d);
  };

  /* Chuyển đen trắng bằng ngưỡng thích nghi Sauvola (giữ nét mảnh, bỏ vết ố). */
  IMG.binarize = function (c, win, k) {
    var w = c.width, h = c.height, d = data(c), px = d.data, N = w * h, g = new Uint8Array(N), i, x, y;
    for (i = 0; i < N; i++) g[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
    var W = w + 1, I = new Float64Array(W * (h + 1)), Q = new Float64Array(W * (h + 1));
    for (y = 1; y <= h; y++) { var rs = 0, rq = 0; for (x = 1; x <= w; x++) { var v = g[(y - 1) * w + x - 1]; rs += v; rq += v * v; I[y * W + x] = I[(y - 1) * W + x] + rs; Q[y * W + x] = Q[(y - 1) * W + x] + rq; } }
    var r = Math.max(7, win >> 1), kk = k == null ? 0.2 : k;
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (y1 - y0) * (x1 - x0);
        var s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0], q = Q[y1 * W + x1] - Q[y0 * W + x1] - Q[y1 * W + x0] + Q[y0 * W + x0];
        var m = s / n, sd = Math.sqrt(Math.max(0, q / n - m * m)), t = m * (1 + kk * (sd / 128 - 1));
        var o = g[y * w + x] > t ? 255 : 0, p = (y * w + x) * 4; px[p] = px[p + 1] = px[p + 2] = o;
      }
    }
    put(c, d);
  };

  /* Đo độ nghiêng (độ) bằng profile hình chiếu của điểm đen; trả 0 nếu không đủ tin cậy. */
  IMG.skewAngle = function (c) {
    var sc = Math.min(1, 900 / Math.max(c.width, c.height)), w = Math.round(c.width * sc), h = Math.round(c.height * sc);
    var t = document.createElement("canvas"); t.width = w; t.height = h; var g = t.getContext("2d", { willReadFrequently: true }); g.drawImage(c, 0, 0, w, h);
    var px = g.getImageData(0, 0, w, h).data, pts = [], i, sum = 0;
    for (i = 0; i < w * h; i++) sum += px[i * 4 + 1]; var mean = sum / (w * h), thr = mean * 0.7;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (px[(y * w + x) * 4 + 1] < thr) pts.push(x, y);
    if (pts.length < 400) return 0;
    var step = pts.length / 2 > 60000 ? Math.ceil(pts.length / 2 / 60000) : 1;
    function score(a) {
      var cs = Math.cos(a), sn = Math.sin(a), hist = new Float32Array(h * 2 + 4), off = h + 2, s = 0;
      for (var j = 0; j < pts.length; j += 2 * step) { var yy = Math.round(pts[j + 1] * cs - pts[j] * sn) + off; if (yy >= 0 && yy < hist.length) hist[yy]++; }
      for (var q = 0; q < hist.length; q++) s += hist[q] * hist[q]; return s;
    }
    var best = 0, bs = -1, a, R = Math.PI / 180;
    for (a = -6; a <= 6.001; a += 0.4) { var sv = score(a * R); if (sv > bs) { bs = sv; best = a; } }
    var b2 = best, bs2 = bs; for (a = best - 0.4; a <= best + 0.401; a += 0.05) { var s2 = score(a * R); if (s2 > bs2) { bs2 = s2; b2 = a; } }
    var s0 = score(0); return (bs2 > s0 * 1.02 && Math.abs(b2) >= 0.15) ? b2 : 0;
  };
  IMG.rotate = function (c, deg, fill) {
    var t = document.createElement("canvas"), w = c.width, h = c.height; t.width = w; t.height = h; var g = t.getContext("2d");
    g.fillStyle = fill || "#fff"; g.fillRect(0, 0, w, h); g.translate(w / 2, h / 2); g.rotate(-deg * Math.PI / 180); g.drawImage(c, -w / 2, -h / 2);
    c.getContext("2d").drawImage(t, 0, 0);
  };

  /* Xoá một màu (kèm các sắc độ gần nó) về màu giấy trắng; mềm dần ở mép để không để lại viền. */
  IMG.removeColor = function (c, rgb, tol) {
    var d = data(c), px = d.data, hi = tol * 1.45, i;
    for (i = 0; i < px.length; i += 4) {
      var dr = px[i] - rgb[0], dg = px[i + 1] - rgb[1], db = px[i + 2] - rgb[2], dist = Math.sqrt(dr * dr * 0.9 + dg * dg * 1.1 + db * db * 0.8);
      if (dist < hi) { var a = dist <= tol ? 1 : 1 - (dist - tol) / (hi - tol); px[i] += (255 - px[i]) * a; px[i + 1] += (255 - px[i + 1]) * a; px[i + 2] += (255 - px[i + 2]) * a; }
    }
    put(c, d);
  };
  /* Làm trắng mọi điểm sáng hơn ngưỡng (hợp với watermark xám nhạt trên nền trắng). */
  IMG.whiten = function (c, thr) {
    var d = data(c), px = d.data, soft = 14, i;
    for (i = 0; i < px.length; i += 4) {
      var l = Math.min(px[i], px[i + 1], px[i + 2]);
      if (l >= thr) { px[i] = px[i + 1] = px[i + 2] = 255; }
      else if (l > thr - soft) { var a = (l - (thr - soft)) / soft; px[i] += (255 - px[i]) * a; px[i + 1] += (255 - px[i + 1]) * a; px[i + 2] += (255 - px[i + 2]) * a; }
    }
    put(c, d);
  };
  /* Xoá một vùng chữ nhật: tô bằng màu trung vị của dải viền quanh vùng đó. rect = [x, y, w, h] tính theo 0..1. */
  IMG.eraseRect = function (c, r) {
    var W = c.width, H = c.height, x = Math.round(r[0] * W), y = Math.round(r[1] * H), w = Math.max(1, Math.round(r[2] * W)), h = Math.max(1, Math.round(r[3] * H));
    var g = c.getContext("2d", { willReadFrequently: true }), m = 4, rs = [], gs = [], bs = [];
    function take(sx, sy, sw, sh) { sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(W - sx, sw); sh = Math.min(H - sy, sh); if (sw <= 0 || sh <= 0) return; var p = g.getImageData(sx, sy, sw, sh).data; for (var i = 0; i < p.length; i += 4 * 3) { rs.push(p[i]); gs.push(p[i + 1]); bs.push(p[i + 2]); } }
    take(x, y - m, w, m); take(x, y + h, w, m); take(x - m, y, m, h); take(x + w, y, m, h);
    function med(a) { if (!a.length) return 255; a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    g.fillStyle = "rgb(" + med(rs) + "," + med(gs) + "," + med(bs) + ")"; g.fillRect(x, y, w, h);
  };

  IMG.pixel = function (c, x, y) { var p = c.getContext("2d", { willReadFrequently: true }).getImageData(Math.max(0, Math.min(c.width - 1, x | 0)), Math.max(0, Math.min(c.height - 1, y | 0)), 1, 1).data; return [p[0], p[1], p[2]]; };
  IMG.clone = function (c) { var t = document.createElement("canvas"); t.width = c.width; t.height = c.height; t.getContext("2d").drawImage(c, 0, 0); return t; };
})();
