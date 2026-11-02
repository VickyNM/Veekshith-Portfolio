// Reads portfolio.yaml and fills index.html, resume.html and project.html.
// All content is inserted with textContent, so edits to the YAML cannot inject HTML.

const $ = (id) => document.getElementById(id);

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
  return node;
}

function fill(id, text) {
  const node = $(id);
  if (!node) return;
  if (text) node.textContent = text;
  else node.hidden = true;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function showError(message) {
  const box = $("error");
  box.textContent = message;
  box.hidden = false;
}

async function loadData() {
  if (typeof jsyaml === "undefined") {
    throw new Error("Could not load the YAML reader (js-yaml). Check your internet connection and refresh.");
  }
  const response = await fetch("portfolio.yaml", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load portfolio.yaml (" + response.status + ").");
  const text = await response.text();
  try {
    return jsyaml.load(text);
  } catch (err) {
    throw new Error("portfolio.yaml has a formatting error: " + err.message);
  }
}

// Colours come from portfolio.yaml (`theme` for light, optional `theme_dark` for dark). If a mode has no block,
// the stylesheet's own colours for that mode are used.
const THEME_VARS = { primary: "--primary", accent: "--accent", chip: "--chip", ink: "--ink", background: "--background", soft: "--soft", muted: "--muted", rule: "--rule" };
let themeColours = {};

function activeMode() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen) return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function paintTheme() {
  const root = document.documentElement.style;
  Object.values(THEME_VARS).forEach((v) => root.removeProperty(v));
  const colours = activeMode() === "dark" ? themeColours.dark : themeColours.light;
  if (!colours) return;
  for (const key of Object.keys(THEME_VARS)) {
    if (colours[key]) root.setProperty(THEME_VARS[key], colours[key]);
  }
}

function applyTheme(light, dark) {
  themeColours = { light, dark };
  paintTheme();
}

function setupThemeToggle() {
  const links = document.querySelector(".nav-links");
  if (!links) return;
  const button = make("button", "theme-toggle");
  button.type = "button";
  const label = () => {
    const dark = activeMode() === "dark";
    button.textContent = dark ? "Light mode" : "Dark mode";
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  };
  button.addEventListener("click", () => {
    const next = activeMode() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked: the choice just won't be remembered */ }
    paintTheme();
    label();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!document.documentElement.dataset.theme) { paintTheme(); label(); }
  });
  label();
  links.appendChild(button);
}

// ---------- Media: image / GIF, video file, or YouTube link ----------

function youtubeId(src) {
  const match = String(src).match(/^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// Loads a looping clip shortly before it scrolls into view, plays it while visible, pauses it when it leaves.
let loopObserver;
function watchLoopVideo(video) {
  if (!loopObserver) {
    loopObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          if (!v.src) v.src = v.dataset.src;
          v.play().catch(() => { /* autoplay blocked: poster stays visible */ });
        } else if (v.src) {
          v.pause();
        }
      });
    }, { rootMargin: "200px 0px" });
  }
  loopObserver.observe(video);
}

function mediaNode(item) {
  const entry = typeof item === "string" ? { src: item } : item;
  if (!entry || !entry.src) return null;
  const figure = make("figure", "media" + (entry.tall ? " tall" : ""));
  const id = youtubeId(entry.src);
  let node;
  if (id) {
    node = document.createElement("iframe");
    node.src = "https://www.youtube-nocookie.com/embed/" + id;
    node.title = entry.caption || "Video";
    node.loading = "lazy";
    node.allowFullscreen = true;
    node.className = "media-frame";
  } else if (/\.(mp4|webm|mov)(\?.*)?$/i.test(entry.src)) {
    node = document.createElement("video");
    node.playsInline = true;
    if (entry.poster) node.poster = entry.poster;
    if (entry.caption) node.setAttribute("aria-label", entry.caption);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (entry.loop && !reduceMotion) {
      // GIF-style clip: silent, looping, and only downloaded and played while it is on screen
      node.loop = true;
      node.muted = true;
      node.preload = "none";
      node.dataset.src = entry.src;
      watchLoopVideo(node);
    } else {
      node.src = entry.src;
      node.preload = "metadata";
      node.controls = true;
    }
  } else {
    node = document.createElement("img");
    node.src = entry.src;
    node.alt = entry.alt || entry.caption || "";
    node.loading = "lazy";
    if (!entry.tall) {
      node.className = "zoomable";
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", "Enlarge image" + (entry.caption ? ": " + entry.caption : ""));
    }
  }
  if (entry.tall) {
    // Very long images (full level layouts) scroll inside a fixed-height box instead of stretching the page
    const box = make("div", "scroll-box");
    box.tabIndex = 0;
    box.setAttribute("aria-label", entry.caption || "Scrollable image");
    box.appendChild(node);
    figure.appendChild(box);
  } else {
    figure.appendChild(node);
  }
  if (entry.caption) figure.appendChild(make("figcaption", "", entry.caption));
  return figure;
}

// ---------- Click to enlarge ----------

let lightbox;

function openLightbox(img) {
  if (!lightbox) {
    lightbox = document.createElement("dialog");
    lightbox.className = "lightbox";
    const big = document.createElement("img");
    const caption = make("p", "lightbox-caption");
    const close = make("button", "lightbox-close", "Close");
    close.type = "button";
    close.addEventListener("click", () => lightbox.close());
    lightbox.addEventListener("click", (e) => {
      if (e.target !== big) lightbox.close();
    });
    lightbox.append(close, big, caption);
    document.body.appendChild(lightbox);
  }
  const big = lightbox.querySelector("img");
  big.src = img.src;
  big.alt = img.alt;
  lightbox.querySelector(".lightbox-caption").textContent = img.alt;
  lightbox.showModal();
}

document.addEventListener("click", (e) => {
  if (e.target.matches && e.target.matches("img.zoomable")) openLightbox(e.target);
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("img.zoomable")) {
    e.preventDefault();
    openLightbox(e.target);
  }
});

// ---------- In-page navigation (sticky, highlights the section being read) ----------

function buildSubnav() {
  const nav = $("subnav");
  if (!nav) return;
  const sections = [...document.querySelectorAll("main section[data-nav]")].filter((s) => !s.hidden);
  if (sections.length < 3) return;
  const links = new Map();
  sections.forEach((s) => {
    const a = make("a", "", s.dataset.nav);
    a.href = "#" + s.id;
    nav.appendChild(a);
    links.set(s, a);
  });
  nav.hidden = false;

  const setActive = () => {
    let current = sections[0];
    sections.forEach((s) => {
      if (s.getBoundingClientRect().top <= 220) current = s;
    });
    links.forEach((a, s) => (s === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  };
  window.addEventListener("scroll", setActive, { passive: true });
  setActive();
}

function appendMedia(container, items) {
  list(items).forEach((item) => {
    const node = mediaNode(item);
    if (node) container.appendChild(node);
  });
}

// ---------- Cards ----------

// Projects marked `draft: true` in portfolio.yaml stay hidden; add ?drafts=1 to the address to preview them.
function visibleProjects(data) {
  const showDrafts = new URLSearchParams(location.search).has("drafts");
  return list(data.projects).filter((p) => showDrafts || !p.draft);
}

function projectLink(project) {
  return "project.html?id=" + encodeURIComponent(project.id);
}

function projectCard(project, compact) {
  const card = make("a", compact ? "card card-compact" : "card");
  card.href = projectLink(project);

  const art = make("div", "card-art");
  if (project.image) {
    const img = document.createElement("img");
    img.src = project.image;
    img.alt = project.title + " cover";
    img.loading = "lazy";
    art.appendChild(img);
  } else {
    art.appendChild(make("span", "card-art-title", project.title));
  }
  const badges = make("div", "badges badges-art");
  [project.engine, project.platform].filter(Boolean).forEach((b) => badges.appendChild(make("span", "badge", b)));
  if (badges.children.length) art.appendChild(badges);
  card.appendChild(art);

  const body = make("div", "card-body");
  body.appendChild(make("h3", "", project.title));
  const sub = [project.role_title, project.level_type || project.genre, project.year].filter(Boolean).join("  ·  ");
  if (sub) body.appendChild(make("p", "card-sub", sub));
  const disciplines = list(project.disciplines);
  if (disciplines.length) {
    const tags = make("div", "tags");
    disciplines.forEach((d) => tags.appendChild(make("span", "tag", d)));
    body.appendChild(tags);
  }
  const blurb = project.card_summary || project.summary;
  if (blurb && !compact) body.appendChild(make("p", "", blurb));
  card.appendChild(body);
  return card;
}

function bullets(container, items) {
  items.forEach((text) => container.appendChild(make("li", "", text)));
}

// Number tiles (scale facts, KPIs). Hides the container when there is nothing to show.
function tiles(container, items) {
  const rows = list(items);
  rows.forEach((t) => {
    const box = make("div", "stat");
    box.appendChild(make("strong", "", t.value));
    box.appendChild(make("span", "", t.label));
    if (t.note) box.appendChild(make("em", "", t.note));
    container.appendChild(box);
  });
  container.hidden = rows.length === 0;
}

// Table from {title, intro, columns[], rows[][], caption, media[]}; cells containing an arrow are highlighted as changes.
function tableBlock(spec) {
  const block = make("div", "data-block");
  if (spec.title) block.appendChild(make("h3", "", spec.title));
  if (spec.intro) block.appendChild(make("p", "", spec.intro));
  const columns = list(spec.columns);
  if (columns.length) {
    const wrap = make("div", "table-wrap");
    // Wide tables stack into one card per row on phones instead of scrolling sideways
    const table = make("table", columns.length > 3 ? "data-table stack" : "data-table");
    const head = make("tr");
    columns.forEach((c) => head.appendChild(make("th", "", c)));
    table.appendChild(make("thead")).appendChild(head);
    const body = make("tbody");
    list(spec.rows).forEach((row) => {
      const tr = make("tr");
      list(row).forEach((cell, i) => {
        const text = String(cell);
        const td = make("td", i === 0 ? "row-head" : "");
        td.dataset.label = columns[i] || "";
        const change = text.match(/^(.*?):?\s*([\d.,$%]+)\s*→\s*([\d.,$%]+)\s*$/);
        if (change && i > 0) {
          // "Name: 40 → 20" becomes name, old value (red, struck through), arrow, new value (green, bold)
          td.classList.add("changed");
          td.appendChild(make("span", "cell-name", change[1]));
          const values = make("span", "cell-values");
          values.appendChild(make("s", "val-old", change[2]));
          values.appendChild(make("span", "val-arrow", "→"));
          values.appendChild(make("strong", "val-new", change[3]));
          td.appendChild(values);
        } else {
          td.textContent = text;
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    block.appendChild(wrap);
    // On phones a long stacked table starts with the first 5 rows; this button reveals the rest
    const rowCount = list(spec.rows).length;
    if (columns.length > 3 && rowCount > 5) {
      wrap.classList.add("collapsed");
      const more = make("button", "show-more", "Show levels 6 to " + rowCount);
      more.type = "button";
      more.addEventListener("click", () => {
        const open = wrap.classList.toggle("collapsed");
        more.textContent = open ? "Show levels 6 to " + rowCount : "Show fewer levels";
      });
      block.appendChild(more);
    }
  }
  if (spec.caption) block.appendChild(make("p", "note", spec.caption));
  const proof = proofBlock(spec);
  if (proof) block.appendChild(proof);
  return block;
}

// Supporting images; tucked behind a toggle when media_label is set so the table or chart stays the focus.
function proofBlock(spec) {
  const pics = make("div", "step-media");
  appendMedia(pics, spec.media);
  if (!pics.children.length) return null;
  if (!spec.media_label) return pics;
  const details = make("details", "proof");
  details.appendChild(make("summary", "", spec.media_label));
  details.appendChild(pics);
  return details;
}

// Range chart: a band between a min and a max value per level, with numbered markers and a hover readout.
function chartBlock(spec) {
  const lows = list(spec.min).map(Number);
  const highs = list(spec.max).map(Number);
  const n = Math.min(lows.length, highs.length);
  const block = make("div", "data-block");
  if (spec.title) block.appendChild(make("h3", "", spec.title));
  if (spec.intro) block.appendChild(make("p", "", spec.intro));
  if (n < 2) return block;

  const NS = "http://www.w3.org/2000/svg";
  // Sized to the screen so nothing is cut off or needs sideways scrolling on a phone
  const narrow = window.innerWidth < 640;
  const W = Math.max(300, Math.min(760, window.innerWidth - 56));
  const H = narrow ? 290 : 330, L = narrow ? 36 : 52, R = narrow ? 40 : 56, T = 26, B = 44;
  const pw = W - L - R, ph = H - T - B;
  const yMax = Math.ceil(Math.max(...highs) / 10) * 10;
  const x = (i) => L + (i / (n - 1)) * pw;
  const y = (v) => T + ph - (v / yMax) * ph;
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const wrap = make("div", "chart-wrap");
  const svg = el("svg", {
    viewBox: "0 0 " + W + " " + H,
    class: "chart",
    role: "img",
    "aria-label": (spec.title || "Chart") + ": " + (spec.y_label || "value") + " rises from " + lows[0] + " to " + highs[0] +
      " at level 1 to " + lows[n - 1] + " to " + highs[n - 1] + " at level " + n + ".",
  });

  // Recessive grid and axis labels
  for (let v = 0; v <= yMax; v += 10) {
    svg.appendChild(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "chart-grid" }));
    svg.appendChild(el("text", { x: L - 8, y: y(v) + 4, class: "chart-tick", "text-anchor": "end" }, v));
  }
  [1, ...Array.from({ length: Math.floor(n / 20) }, (_, k) => (k + 1) * 20)].forEach((lvl) => {
    svg.appendChild(el("text", { x: x(lvl - 1), y: H - B + 20, class: "chart-tick", "text-anchor": "middle" }, lvl));
  });
  svg.appendChild(el("text", { x: L + pw / 2, y: H - 6, class: "chart-axis", "text-anchor": "middle" }, spec.x_label || "Level"));
  svg.appendChild(el("text", { x: L, y: 14, class: "chart-axis" }, spec.y_label || ""));

  // Band between min and max, then the two edges
  const top = highs.slice(0, n).map((v, i) => x(i) + "," + y(v));
  const bottom = lows.slice(0, n).map((v, i) => x(i) + "," + y(v)).reverse();
  svg.appendChild(el("polygon", { points: top.concat(bottom).join(" "), class: "chart-band" }));
  svg.appendChild(el("polyline", { points: top.join(" "), class: "chart-line" }));
  svg.appendChild(el("polyline", { points: lows.slice(0, n).map((v, i) => x(i) + "," + y(v)).join(" "), class: "chart-line chart-line-low" }));
  svg.appendChild(el("text", { x: x(n - 1) + 8, y: y(highs[n - 1]) + 4, class: "chart-label" }, "Max"));
  svg.appendChild(el("text", { x: x(n - 1) + 8, y: y(lows[n - 1]) + 4, class: "chart-label" }, "Min"));

  // Numbered markers (feature unlocks)
  const markers = list(spec.markers);
  markers.forEach((m, k) => {
    const i = Number(m.level) - 1;
    if (!(i >= 0 && i < n)) return;
    // Alternate heights so neighbouring markers never overlap; a short stem links each one to the line
    const cy = y(highs[i]) - 16 - (k % 2) * 20;
    svg.appendChild(el("line", { x1: x(i), x2: x(i), y1: y(highs[i]), y2: cy, class: "chart-stem" }));
    svg.appendChild(el("circle", { cx: x(i), cy, r: 9, class: "chart-marker" }));
    svg.appendChild(el("text", { x: x(i), y: cy + 4, class: "chart-marker-text", "text-anchor": "middle" }, k + 1));
  });

  // Hover readout
  const cursor = el("line", { y1: T, y2: T + ph, class: "chart-cursor", visibility: "hidden" });
  const dot = el("circle", { r: 4, class: "chart-dot", visibility: "hidden" });
  svg.append(cursor, dot);
  const tip = make("div", "chart-tip");
  tip.hidden = true;
  const hit = el("rect", { x: L, y: T, width: pw, height: ph, fill: "transparent", style: "touch-action: pan-y" });
  const move = (event) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / pw) * (n - 1))));
    cursor.setAttribute("x1", x(i));
    cursor.setAttribute("x2", x(i));
    dot.setAttribute("cx", x(i));
    dot.setAttribute("cy", y(highs[i]));
    cursor.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");
    const unlock = markers.find((m) => Number(m.level) === i + 1);
    tip.replaceChildren(make("strong", "", "Level " + (i + 1)), make("span", "", (spec.y_label || "Value") + ": " + lows[i] + " to " + highs[i]));
    if (unlock) tip.appendChild(make("span", "", (spec.marker_note || "Unlocks") + ": " + unlock.label));
    tip.hidden = false;
    const left = (x(i) / W) * 100;
    tip.style.left = left + "%";
    tip.classList.toggle("flip", left > 70);
  };
  // Pointer events cover mouse hover and touch (tap or drag across the chart)
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;
    tip.hidden = true;
    cursor.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
  });
  svg.appendChild(hit);

  wrap.append(svg, tip);
  block.appendChild(wrap);

  if (markers.length) {
    const key = make("ol", "chart-key");
    markers.forEach((m) => key.appendChild(make("li", "", m.label + " (level " + m.level + ")")));
    block.appendChild(key);
  }
  if (spec.caption) block.appendChild(make("p", "note", spec.caption));

  // Table view of the same numbers
  const details = make("details", "proof");
  details.appendChild(make("summary", "", "View the numbers as a table"));
  const tw = make("div", "table-wrap");
  const table = make("table", "data-table");
  const head = make("tr");
  ["Level", "Min " + (spec.y_label || "value").toLowerCase(), "Max " + (spec.y_label || "value").toLowerCase()].forEach((c) => head.appendChild(make("th", "", c)));
  table.appendChild(make("thead")).appendChild(head);
  const body = make("tbody");
  for (let i = 0; i < n; i++) {
    const tr = make("tr");
    [i + 1, lows[i], highs[i]].forEach((v, k) => tr.appendChild(make("td", k === 0 ? "row-head" : "", v)));
    body.appendChild(tr);
  }
  table.appendChild(body);
  tw.appendChild(table);
  details.appendChild(tw);
  block.appendChild(details);

  const proof = proofBlock(spec);
  if (proof) block.appendChild(proof);
  return block;
}

// ---------- Shared bits ----------

function renderCommon(data) {
  const site = data.site || {};
  document.title = site.title || site.name || "Portfolio";
  fill("brand", site.name);
  if ($("copy")) $("copy").textContent = "© " + new Date().getFullYear() + " " + (site.name || "");
  if ($("updated")) {
    if (site.updated) $("updated").textContent = " · Last updated " + site.updated;
    else $("updated").hidden = true;
  }

  fill("footer-sub", [site.location, site.email].filter(Boolean).join("  ·  "));
  const contact = $("contact-links");
  if (contact) {
    if (site.email) {
      const mail = make("a", "btn btn-light", "Email me");
      mail.href = "mailto:" + site.email;
      contact.appendChild(mail);
    }
    if (site.website && site.website.url) {
      const web = make("a", "btn btn-ghost", site.website.label || site.website.url);
      web.href = site.website.url;
      web.target = "_blank";
      web.rel = "noopener";
      contact.appendChild(web);
    }
    list(site.socials).forEach((s) => {
      const a = make("a", "btn btn-ghost", s.label);
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener";
      contact.appendChild(a);
    });
  }

  const link = $("resume-link");
  if (link && site.resume_pdf) {
    link.href = site.resume_pdf;
    link.download = "";
    link.hidden = false;
  }
}

function renderHero(data) {
  const site = data.site || {};
  fill("headline", site.headline);
  fill("name", site.name);
  fill("focus", site.focus);
  fill("tagline", site.tagline);
}

// ---------- Home ----------

function renderHome(data) {
  renderHero(data);
  fill("summary", data.about && data.about.summary);

  const stats = list(data.about && data.about.stats);
  stats.forEach((s) => {
    const box = make("div", "stat");
    box.appendChild(make("strong", "", s.value));
    box.appendChild(make("span", "", s.label));
    $("stats").appendChild(box);
  });
  if (!stats.length) $("stats").hidden = true;

  const projects = visibleProjects(data);
  const selected = projects.filter((p) => p.featured);
  const rest = projects.filter((p) => !p.featured);
  selected.forEach((p) => $("project-grid").appendChild(projectCard(p, false)));
  rest.forEach((p) => $("more-grid").appendChild(projectCard(p, true)));
  if (!rest.length) $("more-work").hidden = true;

  list(data.expertise).forEach((area) => {
    const box = make("div", "area");
    box.appendChild(make("h3", "", area.name));
    if (area.text) box.appendChild(make("p", "", area.text));
    $("expertise-list").appendChild(box);
  });
}

// ---------- Resume ----------

function timelineItem(head, dates, extra) {
  const item = make("article", "job");
  const top = make("div", "job-head");
  top.appendChild(head);
  top.appendChild(make("span", "dates", dates));
  item.appendChild(top);
  extra.forEach((node) => item.appendChild(node));
  return item;
}

function renderResume(data) {
  renderHero(data);
  fill("summary", data.about && data.about.summary);

  const shipped = list(data.projects).filter((p) => p.category === "Shipped");
  shipped.forEach((p) => {
    const li = make("li");
    if (p.draft) {
      li.appendChild(document.createTextNode(p.title));
    } else {
      const a = make("a", "", p.title);
      a.href = projectLink(p);
      li.appendChild(a);
    }
    const meta = [p.platform, p.year].filter(Boolean).join(" | ");
    if (meta) li.appendChild(make("span", "shipped-meta", " (" + meta + ")"));
    $("shipped-list").appendChild(li);
  });
  if (!shipped.length) $("shipped-list").parentElement.hidden = true;

  list(data.experience).forEach((job) => {
    const title = make("h3", "", job.company);
    if (job.role) {
      title.appendChild(document.createTextNode(" "));
      title.appendChild(make("span", "", "· " + job.role));
    }
    const ul = make("ul", "bullets");
    bullets(ul, list(job.highlights));
    $("experience-list").appendChild(timelineItem(title, job.dates, ul.children.length ? [ul] : []));
  });

  list(data.education).forEach((ed) => {
    const notes = [ed.institution, ed.note].filter(Boolean).map((t) => make("p", "note", t));
    $("education-list").appendChild(timelineItem(make("h3", "", ed.degree), ed.dates, notes));
  });

  list(data.expertise).forEach((area) => $("expertise-names").appendChild(make("li", "", area.name)));

  list(data.tools).forEach((group) => {
    const box = make("div", "tool-group");
    box.appendChild(make("h3", "", group.group));
    const chips = make("div", "chips");
    list(group.items).forEach((t) => chips.appendChild(make("span", "chip", t)));
    box.appendChild(chips);
    $("tools-list").appendChild(box);
  });

  list(data.languages).forEach((l) => $("languages-list").appendChild(make("span", "chip", l)));
}

// ---------- Project walkthrough ----------

function show(id, visible) {
  const node = $(id);
  if (node) node.hidden = !visible;
}

function renderProject(data) {
  const projects = visibleProjects(data);
  const id = new URLSearchParams(location.search).get("id");
  const index = projects.findIndex((p) => p.id === id);
  const project = projects[index];
  if (!project) {
    showError("Project not found. Go back to the work list and choose one.");
    fill("p-title", "Project not found");
    show("p-overview", false);
    show("p-sibling-section", false);
    return;
  }

  document.title = project.title + " | " + ((data.site && data.site.name) || "Portfolio");
  fill("p-title", project.title);
  fill("p-meta", [project.category, project.genre, project.year].filter(Boolean).join("  ·  "));
  // When the summary strip already opens with the game pitch, the repeated one-liner is hidden
  if (list(project.tldr).length) $("p-summary").hidden = true;
  else fill("p-summary", project.summary);

  const badges = $("p-badges");
  [project.engine, project.platform].filter(Boolean).forEach((b) => badges.appendChild(make("span", "badge", b)));
  list(project.disciplines).forEach((d) => badges.appendChild(make("span", "badge badge-soft", d)));
  if (!badges.children.length) badges.hidden = true;

  // Ten-second summary: [{label, text}]
  const glance = list(project.tldr);
  glance.forEach((item) => {
    const box = make("div", "tldr-item");
    box.appendChild(make("h2", "", item.label));
    box.appendChild(make("p", "", item.text));
    $("p-tldr").appendChild(box);
  });
  show("p-tldr-section", glance.length > 0);
  tiles($("p-scale"), project.scale);

  if (project.image) {
    const node = mediaNode({ src: project.image, caption: "", alt: project.title + " cover art" });
    if (node) $("p-cover").appendChild(node);
  }

  // At-a-glance facts
  // Engine, platform and year already show in the header, so only extra facts appear here.
  // The summary strip's "My role" already covers the role, so the capsule shows only on pages without one.
  const facts = [
    ["Role", list(project.tldr).length ? "" : project.role_title],
    ["Team", project.team],
    ["Duration", project.duration],
  ].filter((f) => f[1]);
  facts.forEach(([label, value]) => {
    const box = make("div", "fact");
    box.appendChild(make("dt", "", label));
    box.appendChild(make("dd", "", value));
    $("p-facts").appendChild(box);
  });
  if (!facts.length) $("p-facts").hidden = true;

  // Overview: context, objectives, role
  if (project.context) {
    $("p-context").textContent = project.context;
    show("p-context-box", true);
  }
  const objectives = list(project.objectives);
  const role = list(project.role);
  if (objectives.length) {
    bullets($("p-objectives"), objectives);
    show("p-objectives-box", true);
  }
  if (role.length) {
    bullets($("p-role"), role);
    show("p-role-box", true);
  }

  // Level map
  if (project.level_map && project.level_map.src) {
    appendMedia($("p-map"), [project.level_map]);
    show("p-map-section", true);
  }

  // GIFs / video
  const media = list(project.media);
  if (media.length) {
    appendMedia($("p-media"), media);
    show("p-media-section", true);
  }

  // Beats, decisions
  const beats = list(project.beats);
  beats.forEach((beat) => {
    const li = make("li", "step");
    const text = make("div", "step-text");
    text.appendChild(make("h3", "", beat.title));
    if (beat.text) text.appendChild(make("p", "", beat.text));
    li.appendChild(text);
    const pics = make("div", "step-media");
    appendMedia(pics, beat.media);
    if (pics.children.length) li.appendChild(pics);
    $("p-beats").appendChild(li);
  });
  show("p-beats-section", beats.length > 0);

  const decisions = list(project.decisions);
  decisions.forEach((d) => {
    const box = make("article", "decision");
    const head = make("div", "system-head");
    head.appendChild(make("h3", "", d.title));
    if (d.ownership) head.appendChild(make("span", "badge badge-soft", d.ownership));
    box.appendChild(head);
    if (d.text) box.appendChild(make("p", "", d.text));
    const pics = make("div", "step-media");
    appendMedia(pics, d.media);
    if (pics.children.length) box.appendChild(pics);
    $("p-decisions").appendChild(box);
  });
  show("p-decisions-section", decisions.length > 0);

  // Game design systems: [{title, ownership, text, points[], media[]}]
  const systems = list(project.systems);
  systems.forEach((s) => {
    const box = make("article", "system");
    const head = make("div", "system-head");
    head.appendChild(make("h3", "", s.title));
    if (s.ownership) head.appendChild(make("span", "badge badge-soft", s.ownership));
    box.appendChild(head);
    if (s.text) box.appendChild(make("p", "", s.text));
    const points = list(s.points);
    if (points.length) {
      const ul = make("ul", "bullets");
      bullets(ul, points);
      box.appendChild(ul);
    }
    const proof = proofBlock({ media: s.media, media_label: s.media_label });
    if (proof) box.appendChild(proof);
    $("p-systems").appendChild(box);
  });
  show("p-systems-section", systems.length > 0);

  // Problem -> change -> outcome
  const iterations = list(project.iterations);
  iterations.forEach((it) => {
    const box = make("article", "iteration");
    const words = make("div", "iteration-text");
    [["Problem", it.problem], ["What I changed", it.change], ["Outcome", it.outcome]].forEach(([label, text]) => {
      if (!text) return;
      const col = make("div", "iteration-col");
      col.appendChild(make("h4", "", label));
      col.appendChild(make("p", "", text));
      words.appendChild(col);
    });
    box.appendChild(words);
    // With a clip or image, the text stacks on the left and the media sits beside it
    const pics = make("div", "iteration-media");
    appendMedia(pics, it.media);
    if (pics.children.length) {
      box.classList.add("has-media");
      box.appendChild(pics);
    }
    $("p-iterations").appendChild(box);
  });
  show("p-iterations-section", iterations.length > 0);

  // Charts (e.g. difficulty curve)
  const charts = list(project.charts);
  charts.forEach((c) => $("p-charts").appendChild(chartBlock(c)));
  show("p-charts-section", charts.length > 0);

  // Data tables (e.g. balancing values)
  const tables = list(project.tables);
  tables.forEach((t) => $("p-tables").appendChild(tableBlock(t)));
  show("p-tables-section", tables.length > 0);

  // Before / after
  const pairs = list(project.before_after);
  pairs.forEach((pair) => {
    const box = make("article", "ba");
    if (pair.label) box.appendChild(make("h3", "", pair.label));
    const row = make("div", "ba-row");
    [["Before", pair.before], ["After", pair.after]].forEach(([label, src]) => {
      if (!src) return;
      const node = mediaNode({ src, caption: label });
      if (node) row.appendChild(node);
    });
    box.appendChild(row);
    if (pair.caption) box.appendChild(make("p", "note", pair.caption));
    $("p-ba").appendChild(box);
  });
  show("p-ba-section", pairs.length > 0);

  // Results
  const results = list(project.results);
  bullets($("p-results"), results);
  tiles($("p-kpis"), project.kpis);
  show("p-results-section", results.length > 0 || list(project.kpis).length > 0);

  // Tools and why
  const tools = list(project.tools);
  tools.forEach((t) => {
    $("p-tools").appendChild(make("dt", "", t.name));
    $("p-tools").appendChild(make("dd", "", t.why));
  });
  show("p-tools-section", tools.length > 0);

  // Links
  // Links (store page, playable build) sit in the header so they are the first thing a visitor can act on
  const links = list(project.links);
  links.forEach((l) => {
    const a = make("a", "btn btn-light", l.label);
    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener";
    $("p-hero-links").appendChild(a);
  });
  $("p-hero-links").hidden = links.length === 0;

  // Previous / next, in the order of the presentation
  const pager = $("p-pager");
  [["Previous", projects[index - 1]], ["Next", projects[index + 1]]].forEach(([label, p], i) => {
    if (!p) return;
    const a = make("a", "pager-link" + (i ? " pager-next" : ""));
    a.href = projectLink(p);
    a.appendChild(make("span", "", label));
    a.appendChild(make("strong", "", p.title));
    pager.appendChild(a);
  });
  if (!pager.children.length) show("p-sibling-section", false);

  buildSubnav();
}

(async function init() {
  try {
    const data = await loadData();
    applyTheme(data.theme, data.theme_dark);
    setupThemeToggle();
    renderCommon(data);
    const page = document.body.dataset.page;
    if (page === "project") renderProject(data);
    else if (page === "resume") renderResume(data);
    else renderHome(data);
  } catch (err) {
    showError(err.message);
  }
})();
