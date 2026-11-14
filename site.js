/* LaLeLu – kleine Interaktionsschicht. Keine Abhängigkeiten, kein Tracking.
   Ohne dieses Skript bleibt jede Seite vollständig lesbar und bedienbar.

   SPRACHE: Das Skript enthält keine eigenen Texte. Eine Sprachseite braucht keine JS-Änderung, sie setzt nur
   <html lang="xx"> (Uhrzeit-Format über Intl, z. B. "en", "pt-BR", "ru") und diese data-Attribute im HTML:
     .sleeper input[name=sound]   data-name   Klangname, ersetzt {s}            (z. B. "Weißes Rauschen")
     .sleep-out output            data-at     Uhrzeit-Muster mit {t}            (z. B. "{t} Uhr", "at {t}")
     .sleep-out output            data-endless  Anzeige bei "ohne Ende"
     .sleep-out p                 data-timer  Satz mit {s} und {m} (Minuten)
     .sleep-out p                 data-endless Satz mit {s}
     .talk-hint                   data-live   Text, solange die Sprechtaste gehalten wird
   Die Ruhetexte (Standardanzeige) stehen als normaler Inhalt im HTML. Beschriftungen (aria-label, aria-live)
   liegen ebenfalls komplett im HTML. */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.remove("no-js");
  doc.classList.add("js");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var sda = !!(window.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));
  if (!sda) doc.classList.add("no-sda");

  /* ---------- Feder ----------
     Apple-Parameter: Dämpfungsgrad (1 = kein Überschwingen) und Antwortzeit in Sekunden.
     Jede Feder startet vom aktuellen Wert und behält ihre Geschwindigkeit, wenn das Ziel wechselt –
     dadurch ist jede Bewegung jederzeit unterbrechbar und umkehrbar. */
  function Spring(value, opts) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.set(opts || {});
    this.onUpdate = null;
    this.onRest = null;
    this.raf = 0;
    this.last = 0;
  }
  Spring.prototype.set = function (o) {
    var response = o.response || 0.4;
    var damping = o.damping == null ? 1 : o.damping;
    this.k = Math.pow((2 * Math.PI) / response, 2);
    this.c = (4 * Math.PI * damping) / response;
    this.eps = o.eps || 0.01;
  };
  Spring.prototype.to = function (target, velocity) {
    this.target = target;
    if (velocity != null) this.velocity = velocity;
    if (reduce.matches) {
      this.value = target;
      this.velocity = 0;
      this.emit();
      this.rest();
      return;
    }
    if (!this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.tick.bind(this));
    }
  };
  Spring.prototype.jump = function (v) {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.value = this.target = v;
    this.velocity = 0;
    this.emit();
  };
  Spring.prototype.tick = function (t) {
    var dt = this.last ? Math.min((t - this.last) / 1000, 0.064) : 1 / 60;
    this.last = t;
    var steps = Math.ceil(dt / (1 / 240));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) {
      var a = -this.k * (this.value - this.target) - this.c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    var span = Math.max(Math.abs(this.target), 1);
    if (Math.abs(this.value - this.target) < this.eps * span && Math.abs(this.velocity) < this.eps * span * 10) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
      this.emit();
      this.rest();
      return;
    }
    this.emit();
    this.raf = requestAnimationFrame(this.tick.bind(this));
  };
  Spring.prototype.emit = function () { if (this.onUpdate) this.onUpdate(this.value); };
  Spring.prototype.rest = function () { if (this.onRest) this.onRest(this.value); };

  /* ---------- Druck-Rückmeldung sofort beim Antippen (pointerdown), nicht erst beim Loslassen ---------- */
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".btn,.pill-btn");
    if (!b) return;
    b.classList.add("is-pressed");
    var up = function () {
      b.classList.remove("is-pressed");
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, { passive: true });

  /* ---------- Einblenden beim Scrollen (Rückfall, wenn CSS-Scroll-Zeitleisten fehlen) ---------- */
  if (!sda && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    document.querySelectorAll(".rv,.duo").forEach(function (el) { io.observe(el); });
  } else if (!sda) {
    document.querySelectorAll(".rv,.duo").forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Nachtsicht-Bühne (Rückfall): Schritt aus dem Scroll-Fortschritt ---------- */
  var night = document.querySelector(".night");
  if (night && !sda) {
    var ticking = false;
    var update = function () {
      ticking = false;
      var r = night.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      var p = total > 0 ? Math.min(Math.max(-r.top / total, 0), 1) : 1;
      night.setAttribute("data-step", p < 0.34 ? "0" : p < 0.7 ? "1" : "2");
    };
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- FAQ: Akkordeon mit Feder, jederzeit umkehrbar ---------- */
  var faq = document.querySelectorAll(".faq details");
  var items = [];
  faq.forEach(function (d) {
    var sum = d.querySelector("summary");
    var body = d.querySelector(".faq-a");
    if (!sum || !body) return;
    d.removeAttribute("name"); // Exklusivität übernimmt das Skript, damit auch das Schließen federt
    var s = new Spring(d.open ? 1 : 0, { response: 0.42, damping: 1, eps: 0.002 });
    var item = { d: d, body: body, s: s, h: 0 };
    s.onUpdate = function (v) {
      body.style.height = Math.max(0, v * item.h) + "px";
      body.style.opacity = Math.min(1, Math.max(0, v * 1.4 - 0.2));
    };
    s.onRest = function (v) {
      if (v === 0) { d.open = false; body.style.height = ""; body.style.opacity = ""; }
      else { body.style.height = "auto"; body.style.opacity = ""; }
    };
    item.toggle = function (open) {
      if (open) {
        if (!d.open) { d.open = true; }
        body.style.height = "auto";
        item.h = body.scrollHeight;
        body.style.height = s.value * item.h + "px";
      } else {
        item.h = body.scrollHeight || item.h;
      }
      s.to(open ? 1 : 0);
      if (open) { sum.setAttribute("aria-expanded", "true"); } else { sum.setAttribute("aria-expanded", "false"); }
    };
    sum.addEventListener("click", function (e) {
      e.preventDefault();
      var opening = s.target === 0;
      if (opening) items.forEach(function (o) { if (o !== item && o.s.target === 1) o.toggle(false); });
      item.toggle(opening);
    });
    items.push(item);
  });

  /* ---------- Einschlaf-Timer: wann blendet der Klang aus? ---------- */
  var sleeper = document.querySelector(".sleeper");
  if (sleeper) {
    var out = sleeper.querySelector("output");
    var outNote = sleeper.querySelector(".sleep-out p");
    var lang = doc.lang || "de";
    var seg = sleeper.querySelector(".seg");
    var thumb = seg && seg.querySelector(".seg-thumb");
    var segInputs = seg ? Array.prototype.slice.call(seg.querySelectorAll("input")) : [];
    var thumbSpring = new Spring(0, { response: 0.35, damping: 1, eps: 0.001 });
    thumbSpring.onUpdate = function (v) { if (thumb) thumb.style.transform = "translateX(" + v * 100 + "%)"; };
    var render = function () {
      var t = sleeper.querySelector('input[name="timer"]:checked');
      var snd = sleeper.querySelector('input[name="sound"]:checked');
      var min = t ? parseInt(t.value, 10) : 30;
      var name = snd ? snd.getAttribute("data-name") : "";
      if (!out) return;
      if (min > 0) {
        var end = new Date(Date.now() + min * 60000);
        var hm;
        try { hm = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(end); }
        catch (err) { hm = end.toTimeString().slice(0, 5); }
        out.textContent = (out.getAttribute("data-at") || "{t}").replace("{t}", hm);
        outNote.textContent = (outNote.getAttribute("data-timer") || "").replace("{s}", name).replace("{m}", min);
      } else {
        out.textContent = out.getAttribute("data-endless") || "∞";
        outNote.textContent = (outNote.getAttribute("data-endless") || "").replace("{s}", name);
      }
    };
    var moveThumb = function (jump) {
      var i = segInputs.findIndex(function (x) { return x.checked; });
      if (i < 0) return;
      if (jump) thumbSpring.jump(i); else thumbSpring.to(i);
    };
    if (seg) { seg.classList.add("is-ready"); moveThumb(true); }
    sleeper.addEventListener("change", function (e) {
      if (e.target.name === "timer") moveThumb(false);
      render();
    });
    render();
    setInterval(render, 30000);
  }

  /* ---------- Gegensprechen: gedrückt halten ---------- */
  var talk = document.querySelector(".talk-btn");
  if (talk) {
    var hint = document.querySelector(".talk-hint");
    var idle = hint ? hint.textContent : "";
    var live = hint ? hint.getAttribute("data-live") : "";
    var rings = Array.prototype.slice.call(talk.querySelectorAll(".ring"));
    var ringTimer = 0, ringIdx = 0;
    var pulse = function () {
      var r = rings[ringIdx++ % rings.length];
      if (!r) return;
      if (reduce.matches) { r.style.transition = "opacity 300ms ease"; r.style.transform = "scale(1.25)"; r.style.opacity = ".9"; return; }
      var sp = new Spring(0, { response: 1.1, damping: 1, eps: 0.004 });
      sp.onUpdate = function (v) { r.style.transform = "scale(" + (1 + v * 1.6) + ")"; r.style.opacity = String(Math.max(0, 0.9 * (1 - v))); };
      sp.to(1);
    };
    var down = false;
    var start = function (e) {
      if (down) return;
      down = true;
      if (e && e.pointerId != null && talk.setPointerCapture) talk.setPointerCapture(e.pointerId);
      talk.setAttribute("aria-pressed", "true");
      if (hint) hint.textContent = live;
      pulse();
      ringTimer = setInterval(pulse, 520);
    };
    var stop = function () {
      if (!down) return;
      down = false;
      clearInterval(ringTimer);
      talk.setAttribute("aria-pressed", "false");
      if (hint) hint.textContent = idle;
      if (reduce.matches) rings.forEach(function (r) { r.style.opacity = "0"; r.style.transform = ""; });
    };
    talk.addEventListener("pointerdown", function (e) { e.preventDefault(); start(e); });
    talk.addEventListener("pointerup", stop);
    talk.addEventListener("pointercancel", stop);
    talk.addEventListener("lostpointercapture", stop);
    talk.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } });
    talk.addEventListener("keyup", function (e) { if (e.key === " " || e.key === "Enter") stop(); });
    talk.addEventListener("blur", stop);
    talk.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  /* ---------- Push-Mitteilung fällt herein, sobald der Sperrbildschirm sichtbar wird ---------- */
  var banner = document.querySelector(".banner");
  if (banner && "IntersectionObserver" in window && !reduce.matches) {
    var bs = new Spring(1, { response: 0.5, damping: 0.82, eps: 0.001 });
    bs.onUpdate = function (v) {
      banner.style.transform = "translateY(" + (-v * 140) + "%) scale(" + (1 - v * 0.08) + ")";
      banner.style.opacity = String(Math.max(0, 1 - v * 1.3));
    };
    bs.emit();
    var bio = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        if (x.isIntersecting) { setTimeout(function () { bs.to(0); }, 350); }
        else if (x.boundingClientRect.top > 0) { bs.to(1); }
      });
    }, { threshold: 0.6 });
    bio.observe(banner.closest(".iphone"));
  }
})();
