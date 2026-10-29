/* ============================================================
   HOWL — "THE KILL" knockout hero  (preview only)

   Vanilla port of the Knockout.html hero. The original shipped a
   React class compiled in-browser by @babel/standalone; that needs
   'unsafe-eval' plus a remote unpkg fetch, both of which the site
   CSP refuses. The markup, the sizing maths in renderVals() and the
   keyframes are reproduced unchanged — only the runtime differs.

   It waits for the React app to mount, hides the old hero's visual
   layers (keeping the site navbar), and mounts itself underneath
   that navbar so the navbar sits above the yellow ticker.
   ============================================================ */
(function () {
  "use strict";

  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^/]+$/, "") : "/old-preview/hero/";
  })();

  var OUT = "OUT FRIDAY";
  var E = "cubic-bezier(.2,.8,.2,1)";
  var ANIMATE = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.setAttribute("style", style);
    if (text != null) n.textContent = text;
    return n;
  }
  function an(s) { return ANIMATE ? s : "none"; }
  function inA(d) { return an("kbIn 0.9s " + E + " " + d + "s both"); }

  // ---- mount -------------------------------------------------
  var hero, navHost, root, stage, refs = {};

  function build() {
    root = el("div");
    root.id = "ko-hero";
    stage = el("div");
    stage.id = "ko-stage";
    root.appendChild(stage);
    hero.appendChild(root);
    render();
    window.addEventListener("resize", render);
    startGrain();
    startTC();
    startJumpCuts();
  }

  // ---- the sizing maths, straight from renderVals() ----------
  function vals() {
    var w = stage.clientWidth || window.innerWidth;
    var h = stage.clientHeight || window.innerHeight;
    var m = Math.min(w, h);
    var bar = Math.max(16, m * 0.05);
    var pad = Math.max(20, w * 0.04);
    var wide = w / h > 1.1;
    var sl = Math.max(2, Math.round(m * 0.004));
    var o = Math.max(2, m * 0.007);
    var tfs = wide ? Math.min(w * 0.94 / 2.93, h * 0.5)
                   : Math.min(w * 0.92 / 1.6, h * 0.27);
    var k = 0;
    var lines = (wide ? ["THE KILL"] : ["THE", "KILL"]).map(function (s) {
      return s.split("").map(function (c) {
        return { c: c, an: an("kbSlam 0.65s " + E + " " + (0.35 + (k++) * 0.08) + "s both") };
      });
    });
    var hfs = wide ? Math.min(w * 0.13 / 1.93, h * 0.09)
                   : Math.min(w * 0.34 / 1.93, h * 0.07);
    var ofs = hfs * 0.75;
    var nafs = Math.max(10, hfs * 0.2);
    var avfs = Math.max(10, Math.min(w * 0.014, h * 0.024));
    var cyc = [OUT, "—", "HOWL", "—", "NEW ALBUM", "—", "THE KILL", "—"];
    var n = Math.ceil((Math.ceil(w / bar / 1.4) + 8) / 8) * 8;
    var base = [];
    for (var i = 0; i < n; i++) base.push(cyc[i % 8]);
    return {
      w: w, h: h, lines: lines, tfs: tfs, hfs: hfs, ofs: ofs, nafs: nafs, avfs: avfs,
      bar: bar, pad: pad, top: bar + pad * 0.7, gap: Math.max(10, hfs * 0.2),
      sl: sl, sl2: sl * 2, bfs: bar * 0.66, bgap: bar * 0.4,
      tk: base.concat(base), tkAn: an("kbTick " + (base.length * 0.9) + "s linear infinite"),
      napad: (nafs * 0.35) + "px " + (nafs * 0.5) + "px " + (nafs * 0.35) + "px " + (nafs * 0.8) + "px",
      opad: (ofs * 0.06) + "px " + (ofs * 0.2) + "px",
      apad: (avfs * 0.6) + "px " + (avfs * 1) + "px",
      osh: (o * 2.5) + "px " + (o * 2.5) + "px 0 #0A0A0A",
      aBg: an("kbZoom 12s ease-in-out infinite alternate"),
      aKO: an("kbKO 2s ease-in-out 1.2s infinite"),
      aJolt: an("kbJolt 1s steps(1) 1.5s infinite"),
      aInv: an("kbInv 8s steps(1) 3s infinite"),
      aGrain: an("kbGrain 0.6s steps(5) infinite"),
      aBlink: an("kbBlink 1s steps(1) infinite"),
      a1: inA(0.1), a2: inA(0.3), a3: inA(1.1),
      aStick: an("kbStick 0.7s " + E + " 1.0s both, kbWob 2.4s ease-in-out 2s infinite")
    };
  }

  function render() {
    if (!stage) return;
    var v = vals();
    var keepVideo = refs.video;
    stage.textContent = "";

    var layers = el("div", "position:absolute;inset:0;isolation:isolate;overflow:hidden;");

    // background video
    var bg = el("div", "position:absolute;inset:0;animation:" + v.aBg + ";");
    var vid = keepVideo || document.createElement("video");
    if (!keepVideo) {
      vid.src = BASE + "knockout.mp4";
      vid.autoplay = true; vid.muted = true; vid.loop = true;
      vid.playsInline = true;
      vid.setAttribute("muted", ""); vid.setAttribute("playsinline", "");
      vid.setAttribute("aria-hidden", "true");
    }
    vid.setAttribute("style",
      "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 45%;" +
      "filter:grayscale(1) contrast(1.7) brightness(1.1);display:block;");
    refs.video = vid;
    bg.appendChild(vid);
    layers.appendChild(bg);

    layers.appendChild(el("div", "position:absolute;inset:0;background:#D4FF00;mix-blend-mode:multiply;"));

    // knockout type
    var ko = el("div", "position:absolute;inset:0;background:#0E0E0E;mix-blend-mode:multiply;display:flex;" +
      "flex-direction:column;align-items:center;justify-content:center;animation:" + v.aJolt + ";");
    var inner = el("div", "display:flex;flex-direction:column;align-items:center;animation:" + v.aKO + ";");
    v.lines.forEach(function (chars) {
      var line = el("div", "display:flex;font-family:'HOWL SANS';font-size:" + v.tfs +
        "px;line-height:0.84;color:#fff;white-space:pre;");
      chars.forEach(function (ch) {
        line.appendChild(el("span", "display:block;animation:" + ch.an + ";", ch.c));
      });
      inner.appendChild(line);
    });
    ko.appendChild(inner);
    layers.appendChild(ko);
    stage.appendChild(layers);

    // scanlines
    stage.appendChild(el("div", "position:absolute;inset:0;pointer-events:none;background:" +
      "repeating-linear-gradient(0deg,rgba(0,0,0,0.3) 0 " + v.sl + "px,transparent " + v.sl + "px " + v.sl2 + "px);"));

    // grain
    var gw = el("div", "position:absolute;inset:0;overflow:hidden;pointer-events:none;");
    var grain = el("div", "position:absolute;inset:-20%;opacity:0.16;mix-blend-mode:overlay;animation:" + v.aGrain + ";");
    refs.grain = grain;
    gw.appendChild(grain);
    stage.appendChild(gw);
    paintGrain();

    // invert flash
    stage.appendChild(el("div", "position:absolute;inset:0;background:#fff;mix-blend-mode:difference;" +
      "opacity:0;pointer-events:none;animation:" + v.aInv + ";"));

    // yellow ticker — sits directly under the site navbar
    var barEl = el("div", "position:absolute;left:0;right:0;top:0;height:" + v.bar + "px;background:#D4FF00;" +
      "display:flex;align-items:center;overflow:hidden;white-space:nowrap;font-stretch:62%;font-weight:900;" +
      "font-size:" + v.bfs + "px;line-height:1;color:#0A0A0A;");
    var track = el("div", "flex:none;display:flex;align-items:center;gap:" + v.bgap + "px;padding-right:" +
      v.bgap + "px;animation:" + v.tkAn + ";");
    v.tk.forEach(function (t) { track.appendChild(el("span", "flex:none;", t)); });
    barEl.appendChild(track);
    stage.appendChild(barEl);

    // HOWL / NEW ALBUM / OUT FRIDAY
    var top = el("div", "position:absolute;left:" + v.pad + "px;right:" + v.pad + "px;top:" + v.top +
      "px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:" + v.gap + "px;");
    var left = el("div", "display:flex;align-items:center;gap:" + v.gap + "px;flex-wrap:wrap;");
    // The real brand wordmark, not the display face. The bundled OTF is a
    // lookalike ("COOL FONT Trippy") whose rings are narrower and tighter
    // than the actual HOWL mark, so set the logo from the brand asset.
    // It ships already white — kbIn animates `filter`, so an invert() here
    // would be overridden mid-animation and the mark would go black.
    var mark = document.createElement("img");
    mark.src = BASE + "howl-wordmark.png";
    mark.alt = "HOWL";
    mark.setAttribute("style", "height:" + (v.hfs * 0.86) + "px;width:auto;display:block;" +
      "animation:" + v.a1 + ";");
    left.appendChild(mark);
    left.appendChild(el("div", "font-family:'JetBrains Mono',monospace;font-weight:700;font-size:" + v.nafs +
      "px;letter-spacing:0.3em;color:#0A0A0A;background:#fff;padding:" + v.napad +
      ";white-space:nowrap;line-height:1;animation:" + v.a2 + ";", "NEW ALBUM"));
    top.appendChild(left);
    top.appendChild(el("div", "background:#D4FF00;color:#0A0A0A;font-stretch:62%;font-weight:900;font-size:" +
      v.ofs + "px;line-height:1;padding:" + v.opad + ";white-space:nowrap;transform:rotate(-3deg);box-shadow:" +
      v.osh + ";animation:" + v.aStick + ";", OUT));
    stage.appendChild(top);

    // bottom row
    var bot = el("div", "position:absolute;left:" + v.pad + "px;right:" + v.pad + "px;bottom:" + v.pad +
      "px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:" + v.gap +
      "px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:" + v.avfs +
      "px;letter-spacing:0.22em;line-height:1;");
    var avail = el("div", "color:#fff;background:#0A0A0A;padding:" + v.apad +
      ";white-space:nowrap;animation:" + v.a3 + ";");
    avail.appendChild(document.createTextNode("AVAILABLE ON "));
    avail.appendChild(el("span", "color:#D4FF00;", "ALL PLATFORMS"));
    bot.appendChild(avail);
    var tcWrap = el("div", "display:flex;align-items:center;gap:0.6em;color:rgba(255,255,255,0.75);" +
      "white-space:nowrap;animation:" + v.a3 + ";");
    tcWrap.appendChild(el("span", "width:0.7em;height:0.7em;border-radius:50%;background:#FF2A1F;animation:" + v.aBlink + ";"));
    tcWrap.appendChild(el("span", null, "TC"));
    var tc = el("span", "color:#D4FF00;", "00:00:00:00");
    refs.tc = tc;
    tcWrap.appendChild(tc);
    bot.appendChild(tcWrap);
    stage.appendChild(bot);

    if (refs.video && refs.video.paused) { try { refs.video.play(); } catch (e) {} }
  }

  // ---- grain / timecode / jump cuts ---------------------------
  function paintGrain() {
    var g = refs.grain; if (!g || !ANIMATE) return;
    var n = 160, c = document.createElement("canvas");
    c.width = c.height = n;
    var x = c.getContext("2d"), d = x.createImageData(n, n);
    for (var i = 0; i < d.data.length; i += 4) {
      var y = Math.random() * 255 | 0;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = y; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    g.style.backgroundImage = "url(" + c.toDataURL() + ")";
  }
  function startGrain() { /* painted per render */ }

  function startTC() {
    var t0 = performance.now();
    var p = function (n) { return String(n).padStart(2, "0"); };
    (function f() {
      var e = refs.tc;
      if (e) {
        var s = (performance.now() - t0) / 1000;
        e.textContent = p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" +
          p(Math.floor(s) % 60) + ":" + p(Math.floor(s * 25) % 25);
      }
      requestAnimationFrame(f);
    })();
  }

  function startJumpCuts() {
    if (!ANIMATE) return;
    setInterval(function () {
      var v = refs.video;
      if (v && v.duration && Math.random() < 0.6) v.currentTime = Math.random() * v.duration * 0.92;
    }, 1000);
  }

  // ---- swap the old hero out, keep the navbar ------------------
  function takeOver() {
    hero = document.getElementById("hero");
    if (!hero) return false;
    var nav = hero.querySelector("nav");
    if (!nav) return false;

    var navBar = nav.parentElement;        // the flex row: REC + nav + menu
    var navLayer = navBar.parentElement;   // the z-30 overlay layer
    if (!hero.contains(navLayer)) return false;

    // hide every direct child of #hero except the layer holding the navbar.
    // ParticleField and friends are lazy-mounted after we run, so keep
    // watching rather than doing this once.
    // Anything that belongs to the navigation has to survive. The mobile
    // menu is mounted into #hero only when it is opened, so without this
    // the observer below hides it the moment it appears.
    function keep(c) {
      return c === navLayer ||
        c.id === "ko-hero" ||
        c.id === "mobile-menu" ||
        c.getAttribute("role") === "dialog" ||
        c.hasAttribute("aria-modal") ||
        c.contains(navBar);
    }

    function hideStrays() {
      Array.prototype.forEach.call(hero.children, function (c) {
        if (keep(c)) c.classList.remove("ko-hidden");
        else c.classList.add("ko-hidden");
      });
      // the old hero's background video is hidden but would still be fetched,
      // so drop it rather than pay for ~1.7 MB nobody sees
      var old = hero.querySelector(".ko-hidden video");
      if (old && old.getAttribute("src")) {
        try { old.pause(); } catch (e) {}
        old.removeAttribute("src");
        old.removeAttribute("autoplay");
        try { old.load(); } catch (e) {}
      }
    }
    hideStrays();
    new MutationObserver(hideStrays).observe(hero, { childList: true });

    // inside that layer, keep only the navbar row
    Array.prototype.forEach.call(navLayer.children, function (c) {
      if (c !== navBar) c.style.display = "none";
    });
    navLayer.style.pointerEvents = "auto";
    navBar.classList.add("ko-navbar-host");

    var navH = Math.round(navBar.getBoundingClientRect().height) || 64;
    hero.style.setProperty("--ko-nav", navH + "px");

    build();
    return true;
  }

  var tries = 0;
  (function wait() {
    if (takeOver()) return;
    if (++tries > 120) return;            // ~12s then give up quietly
    setTimeout(wait, 100);
  })();
})();
