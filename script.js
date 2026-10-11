(function () {
  "use strict";

  const DB = (typeof DRUG_DATABASE_IRC !== "undefined") ? DRUG_DATABASE_IRC : [];
  const INTERACTIONS_DB = (typeof DRUG_INTERACTIONS !== "undefined") ? DRUG_INTERACTIONS : {};

  const ENGLISH_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const ACCESS_LABEL = {
    otc: "بدون نسخه",
    hospital: "بیمارستانی",
    rx: "نسخه‌دار",
  };

  const el = {
    themeToggle: document.getElementById("theme-toggle"),
    searchBox: document.getElementById("search-box"),
    clearBtn: document.getElementById("clear-search"),
    filterRow: document.getElementById("filter-row"),
    alphaRail: document.getElementById("alpha-rail"),
    drugList: document.getElementById("drug-list"),
    emptyState: document.getElementById("empty-state"),
    drugCount: document.getElementById("drug-count"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modal: document.getElementById("drug-modal"),
    modalContent: document.getElementById("modal-content"),
    modalClose: document.getElementById("modal-close"),
  };

  let state = {
    query: "",
    accessFilter: "all",
    activeLetter: null,
  };
  const selectedDrugs = new Map();

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("pharmacy-theme"); } catch (e) {}
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    applyTheme(theme);
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      el.themeToggle.setAttribute("aria-pressed", "true");
    } else {
      document.documentElement.removeAttribute("data-theme");
      el.themeToggle.setAttribute("aria-pressed", "false");
    }
    try { localStorage.setItem("pharmacy-theme", theme); } catch (e) {}
  }

  el.themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    applyTheme(isDark ? "light" : "dark");
  });

  const aboutBtn = document.getElementById("about-btn");
  const aboutDialog = document.getElementById("about-dialog");
  const aboutCloseBtn = document.getElementById("about-close-btn");
  aboutBtn.addEventListener("click", () => {
    const countEl = document.getElementById("about-drug-count");
    countEl.textContent = `${toPersianDigits(DB.length)} داروی رسمی · ${toPersianDigits(DB.filter((d) => d.fa && d.fa.name).length)} مورد دارای نام فارسی`;
    aboutDialog.showModal();
  });
  aboutCloseBtn.addEventListener("click", () => aboutDialog.close());
  aboutDialog.addEventListener("click", (e) => {
    if (e.target === aboutDialog) aboutDialog.close();
  });

  const selectionBar = document.getElementById("selection-bar");
  const selectionCount = document.getElementById("selection-count");
  const selectionClearBtn = document.getElementById("selection-clear-btn");
  const selectionInvoiceBtn = document.getElementById("selection-invoice-btn");

  function updateSelectionBar() {
    const n = selectedDrugs.size;
    if (n === 0) {
      selectionBar.hidden = true;
      return;
    }
    selectionBar.hidden = false;
    selectionCount.textContent = `${toPersianDigits(n)} \u062f\u0627\u0631\u0648\u06cc \u0627\u0646\u062a\u062e\u0627\u0628\u200c\u0634\u062f\u0647`;
  }

  selectionClearBtn.addEventListener("click", () => {
    selectedDrugs.clear();
    document.querySelectorAll(".drug-card-check input").forEach((cb) => { cb.checked = false; });
    updateSelectionBar();
  });

  selectionInvoiceBtn.addEventListener("click", () => {
    const items = Array.from(selectedDrugs.values()).map((d) => ({
      name: (d.fa && d.fa.name) ? `${d.fa.name} (${d.name_en})${d.strength ? " " + d.strength : ""}` : `${d.name_en}${d.strength ? " " + d.strength : ""}`,
    }));
    try {
      localStorage.setItem("pharmacy_invoice_selection", JSON.stringify(items));
    } catch (e) {}
    window.open("invoice.html", "_blank");
  });

  function normalize(str) {
    return (str || "")
      .toString()
      .toLowerCase()
      .replace(/[\u064B-\u0652]/g, "")
      .replace(/[\u200c\u200f\u200e]/g, "")
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\s+/g, "")
      .trim();
  }

  function matchesQuery(d, q) {
    if (!q) return true;
    const faParts = d.fa ? [d.fa.name, d.fa.generic, d.fa.category, ...(d.fa.aliases || [])] : [];
    const intlParts = d.intl ? [d.intl.ingredient] : [];
    const classParts = d.pharm_class ? [d.pharm_class.fa, d.pharm_class.en] : [];
    const atcParts = d.atc_fa ? [d.atc_fa.group_fa, d.atc_fa.subgroup_fa] : [];
    const hay = [
      d.name_en, d.molecule_en, d.atc, d.form_en, d.form_fa, d.route_en, d.route_fa, String(d.index_code || ""),
      ...faParts, ...intlParts, ...classParts, ...atcParts
    ].map(normalize).join(" | ");
    return hay.includes(normalize(q));
  }

  function matchesAccessFilter(d) {
    if (state.accessFilter === "all") return true;
    return d.access === state.accessFilter;
  }

  function firstLetter(name) {
    const n = (name || "").trim().toUpperCase();
    const ch = n.charAt(0);
    return /[A-Z]/.test(ch) ? ch : "#";
  }

  const SEVERITY_FA = { M: "شدید", O: "متوسط", N: "خفیف", U: "نامشخص" };
  const SEVERITY_ORDER = { M: 0, O: 1, N: 2, U: 3 };

  const INTERACTION_STOPLIST = new Set([
    "ACID","SODIUM","POTASSIUM","HYDROCHLORIDE","SULFATE","OXIDE","CHLORIDE",
    "PHOSPHATE","CALCIUM","MAGNESIUM","WATER","INJECTION","SOLUTION","TABLET","CAPSULE",
    "ACETATE","MALEATE","CITRATE","BROMIDE","NITRATE","CARBONATE","DIHYDRATE","ANHYDROUS",
    "MONOHYDRATE","TRIHYDRATE","HUMAN","COMPOUND","EXTRA","FORTE","MESYLATE","BESYLATE",
    "BESILATE","SUCCINATE","TARTRATE","FUMARATE","VALERATE","PROPIONATE","DIPROPIONATE",
    "HYDROBROMIDE","PALMITATE","STEARATE","BENZOATE","GLUCONATE","LACTATE","OIL","EXTRACT",
    "POWDER","CREAM","GEL","LOTION","SPRAY","OINTMENT","SYRUP","DROPS","IRON","ZINC","AND",
    "MESILATE","DECANOATE","ENANTHATE","HYDRATE","BASE","FREE","XR","ER","HCL","HBR","DL",
    "MG","MCG","UG","ML","G","IU","MEQ","MMOL","KG","L","DOSE","PUFF","UNIT","UNITS","W",
  ]);

  function interactionCoreName(s) {
    if (!s) return "";
    let n = s.toUpperCase().replace(/\(.*?\)/g, " ").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    let words = n.split(" ").filter((w) => w && !/^\d/.test(w) && !INTERACTION_STOPLIST.has(w));
    words = words.filter((w) => !/^\d+[A-Z]{0,3}$/.test(w));
    return words.join(" ");
  }

  function findDrugInteractions(d) {
    const mol = d.molecule_en || "";
    const parts = mol.split("/").filter((p) => p.trim());
    const keys = parts.length ? parts.map(interactionCoreName) : [interactionCoreName(mol)];
    const merged = new Map();
    let total = 0;
    keys.forEach((key) => {
      const entry = INTERACTIONS_DB[key];
      if (!entry) return;
      total += entry.total;
      entry.items.forEach((it) => {
        if (!merged.has(it.p)) merged.set(it.p, it.l);
      });
    });
    const items = Array.from(merged, ([p, l]) => ({ p, l }));
    items.sort((a, b) => (SEVERITY_ORDER[a.l] ?? 9) - (SEVERITY_ORDER[b.l] ?? 9));
    return { total, items };
  }

  function renderFilterChips() {
    const chips = [
      { key: "all", label: "همه" },
      { key: "otc", label: "بدون نسخه" },
      { key: "rx", label: "نسخه‌دار" },
      { key: "hospital", label: "بیمارستانی" },
    ];
    el.filterRow.innerHTML = "";
    chips.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip" + (state.accessFilter === c.key ? " active" : "");
      btn.textContent = c.label;
      btn.addEventListener("click", () => {
        state.accessFilter = c.key;
        renderFilterChips();
        renderList();
      });
      el.filterRow.appendChild(btn);
    });
  }

  function renderAlphaRail(availableLetters, activeLetter) {
    el.alphaRail.innerHTML = "";
    const allLetters = ENGLISH_ALPHABET.concat(["#"]);
    allLetters.forEach((letter) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "alpha-btn";
      btn.textContent = letter;
      const has = availableLetters.has(letter);
      if (!has) {
        btn.classList.add("disabled");
      } else {
        if (letter === activeLetter) btn.classList.add("active");
        btn.addEventListener("click", () => {
          state.activeLetter = letter;
          renderList();
          const zone = document.querySelector(".results-zone");
          if (zone) zone.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      el.alphaRail.appendChild(btn);
    });
  }

  const BATCH_SIZE = 150;
  let renderPlan = [];
  let renderCursor = 0;
  let sentinelEl = null;
  let io = null;

  function ensureObserver() {
    if (io) return io;
    io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) renderNextBatch();
      });
    }, { root: null, rootMargin: "600px 0px", threshold: 0 });
    return io;
  }

  function renderNextBatch() {
    if (sentinelEl) { io.unobserve(sentinelEl); sentinelEl.remove(); sentinelEl = null; }
    const end = Math.min(renderCursor + BATCH_SIZE, renderPlan.length);
    const frag = document.createDocumentFragment();
    for (let i = renderCursor; i < end; i++) {
      frag.appendChild(renderCard(renderPlan[i]));
    }
    el.drugList.appendChild(frag);
    renderCursor = end;
    if (renderCursor < renderPlan.length) {
      sentinelEl = document.createElement("div");
      sentinelEl.className = "render-sentinel";
      sentinelEl.setAttribute("aria-hidden", "true");
      el.drugList.appendChild(sentinelEl);
      ensureObserver().observe(sentinelEl);
    }
  }

  function renderList() {
    if (sentinelEl) { sentinelEl = null; }
    if (io) io.disconnect();
    el.drugList.innerHTML = "";

    const isSearching = !!state.query.trim();
    el.drugList.classList.toggle("flat-list", isSearching);

    const accessFiltered = DB.filter(matchesAccessFilter);

    let listToRender;
    let heading;

    if (isSearching) {
      renderAlphaRail(new Set(), null);
      listToRender = accessFiltered
        .filter((d) => matchesQuery(d, state.query))
        .sort((a, b) => a.name_en.localeCompare(b.name_en, "en"));
      heading = listToRender.length ? `\u0646\u062a\u0627\u06cc\u062c \u062c\u0633\u062a\u062c\u0648 \u2014 ${toPersianDigits(listToRender.length)} \u062f\u0627\u0631\u0648` : "";
    } else {
      const availableLetters = new Set(accessFiltered.map((d) => firstLetter(d.name_en)));
      const order = ENGLISH_ALPHABET.concat(["#"]);
      if (!state.activeLetter || !availableLetters.has(state.activeLetter)) {
        state.activeLetter = order.find((l) => availableLetters.has(l)) || null;
      }
      renderAlphaRail(availableLetters, state.activeLetter);
      listToRender = accessFiltered
        .filter((d) => firstLetter(d.name_en) === state.activeLetter)
        .sort((a, b) => a.name_en.localeCompare(b.name_en, "en"));
      heading = state.activeLetter ? `${state.activeLetter} \u2014 ${toPersianDigits(listToRender.length)} \u062f\u0627\u0631\u0648` : "";
    }

    if (!listToRender.length) {
      el.emptyState.hidden = false;
      renderPlan = [];
      renderCursor = 0;
      return;
    }
    el.emptyState.hidden = true;

    if (heading) {
      const headingEl = document.createElement("div");
      headingEl.className = "letter-heading";
      headingEl.textContent = heading;
      el.drugList.appendChild(headingEl);
    }

    renderPlan = listToRender;
    renderCursor = 0;
    renderNextBatch();
  }


  function renderCard(d) {
    const wrap = document.createElement("div");
    wrap.className = "drug-card";

    const checkboxWrap = document.createElement("label");
    checkboxWrap.className = "drug-card-check";
    checkboxWrap.addEventListener("click", (e) => e.stopPropagation());
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedDrugs.has(d.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedDrugs.set(d.id, d);
      else selectedDrugs.delete(d.id);
      updateSelectionBar();
    });
    checkboxWrap.appendChild(checkbox);

    const body = document.createElement("button");
    body.type = "button";
    body.className = "drug-card-body";
    const hasFa = d.fa && d.fa.name;
    const strength = d.strength ? ` <span class="en strength">${escapeHtml(d.strength)}</span>` : "";
    const titleHtml = hasFa
      ? `${escapeHtml(d.fa.name)} <span class="en">${escapeHtml(d.name_en)}</span>`
      : `<span class="en">${escapeHtml(d.name_en)}</span>`;
    body.innerHTML = `
      <div class="drug-card-main">
        <p class="drug-card-name">${titleHtml}${strength}</p>
        <p class="drug-card-sub">${escapeHtml(d.form_fa || "")}</p>
      </div>
      <span class="badge ${d.access}">${ACCESS_LABEL[d.access] || "—"}</span>
    `;
    body.addEventListener("click", () => openModal(d));

    wrap.appendChild(checkboxWrap);
    wrap.appendChild(body);
    return wrap;
  }

  function toPersianDigits(n) {
    const map = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
    return String(n).replace(/[0-9]/g, (d) => map[+d]);
  }

  function escapeHtml(str) {
    return (str || "").toString()
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function row(label, value, isLtr) {
    if (!value) return "";
    return `
      <div class="modal-section">
        <h3>${escapeHtml(label)}</h3>
        <p${isLtr ? ' style="direction:ltr;unicode-bidi:isolate;text-align:left"' : ""}>${escapeHtml(value)}</p>
      </div>`;
  }

  function openModal(d) {
    const accessNote = d.access === "hospital"
      ? "این دارو صرفاً در بیمارستان تجویز و مصرف می‌شود."
      : d.access === "otc"
        ? "بدون نسخه قابل تهیه است؛ با این حال مصرف خودسرانه توصیه نمی‌شود."
        : "این دارو نیازمند نسخه پزشک است.";

    const fa = d.fa;
    const intl = d.intl;
    const pc = d.pharm_class;
    const ic = d.intl_combo;

    const faRows = fa ? [
      fa.category ? `<p><strong>دسته:</strong> ${escapeHtml(fa.category)}</p>` : "",
      fa.uses ? `<p><strong>موارد مصرف:</strong> ${escapeHtml(fa.uses)}</p>` : "",
      fa.side_effects ? `<p><strong>عوارض شایع:</strong> ${escapeHtml(fa.side_effects)}</p>` : "",
      fa.warnings ? `<p><strong>هشدار:</strong> ${escapeHtml(fa.warnings)}</p>` : ""
    ].join("") : "";
    const faBlock = fa && faRows ? `
      <div class="modal-box">
        ${faRows}
        ${fa.partial ? `<p class="modal-small">این دارو ترکیبی چندجزئی است؛ شرح بالا فقط مربوط به یکی از اجزای فعال آن است.</p>` : ""}
      </div>` : "";

    function enBlock(title, uses, warn, note) {
      return `
      <div class="modal-box modal-en">
        <h3>${title}</h3>
        <p>${escapeHtml(uses)}</p>
        ${warn ? `<p><strong>Warning:</strong> ${escapeHtml(warn)}</p>` : ""}
        <p class="modal-small modal-rtl">${note}</p>
      </div>`;
    }
    const intlBlock = intl ? enBlock(
      `خلاصه انگلیسی — ${escapeHtml(intl.ingredient)}`, intl.uses_en, intl.warnings_en,
      `بر اساس ماده مؤثره، نه محصول ایرانی خاص.${intl.partial ? " این دارو ترکیبی است؛ متن فقط مربوط به یک جزء فعال آن است." : ""}`
    ) : "";
    const comboBlock = ic ? enBlock(
      "خلاصه انگلیسی — کل ترکیب", ic.uses_en, ic.warnings_en,
      "بازبینی‌شده برای کل ترکیب (همه اجزا)."
    ) : "";

    const chips = [];
    if (pc) chips.push(`<span class="modal-chip">${escapeHtml(pc.fa || pc.en)}${pc.partial ? " (یکی از اجزا)" : ""}</span>`);
    if (d.atc_fa && d.atc_fa.group_fa) chips.push(`<span class="modal-chip alt">${escapeHtml(d.atc_fa.group_fa)}</span>`);
    if (d.atc_fa && d.atc_fa.subgroup_fa) chips.push(`<span class="modal-chip alt">${escapeHtml(d.atc_fa.subgroup_fa)}</span>`);
    const chipsBlock = chips.length ? `<div class="modal-chips">${chips.join("")}</div>` : "";

    const noDataNote = (!fa && !intl && !pc && !ic);

    const interactionData = findDrugInteractions(d);
    const interactionItems = interactionData.items;
    const majorCount = interactionItems.filter((it) => it.l === "M").length;
    function interactionRow(it) {
      return `<div class="ix-row"><span class="ix-name">${escapeHtml(it.p)}</span><span class="ix-sev ix-${it.l}">${SEVERITY_FA[it.l] || it.l}</span></div>`;
    }
    const interactionsBlock = interactionItems.length ? `
      <details class="modal-details modal-ix">
        <summary>⚠️ تداخل دارویی · ${toPersianDigits(interactionData.total)} مورد${majorCount ? ` · ${toPersianDigits(majorCount)} شدید` : ""}</summary>
        <div class="ix-list">${interactionItems.map(interactionRow).join("")}</div>
        <p class="modal-small">منبع: DDInter. پیش از مصرف هم‌زمان چند دارو با پزشک یا داروساز مشورت کنید.</p>
      </details>` : "";

    const techRows = [
      row("ترکیب دارویی", d.molecule_en, true),
      row("نحوه مصرف", d.route_fa),
      row("کد ATC", d.atc, true),
      row("کد فهرست دارویی", d.index_code != null ? String(d.index_code) : "", true),
      row("تاریخ ورود به فهرست", d.entry_date_j, true)
    ].join("");

    const title = fa && fa.name ? escapeHtml(fa.name) : escapeHtml(d.name_en);
    const subtitle = fa && fa.name ? `<span class="modal-en-name">${escapeHtml(d.name_en)}${d.strength ? " · " + escapeHtml(d.strength) : ""}</span>`
      : (d.strength ? `<span class="modal-en-name">${escapeHtml(d.strength)}</span>` : "");

    el.modalContent.innerHTML = `
      <div class="modal-title-row">
        <h2 id="modal-title"${fa && fa.name ? "" : ' class="ltr"'}>${title}</h2>
        ${subtitle}
      </div>
      <div class="modal-badges">
        <span class="badge ${d.access}">${ACCESS_LABEL[d.access] || "—"}</span>
        ${d.form_fa ? `<span class="badge plain">${escapeHtml(d.form_fa)}</span>` : ""}
        ${d.biologic ? `<span class="badge hospital">بیولوژیک</span>` : ""}
      </div>
      ${chipsBlock}
      ${faBlock}
      ${intlBlock}
      ${comboBlock}
      ${interactionsBlock}
      <details class="modal-details modal-tech">
        <summary>جزئیات فنی</summary>
        <div class="tech-grid">${techRows}</div>
      </details>
      <p class="modal-note">${accessNote}${noDataNote ? " شرح بالینی برای این رکورد در فهرست رسمی موجود نیست؛ به برگه راهنما یا داروساز مراجعه کنید." : ""}</p>
      <div class="modal-footnote">
        منبع: فهرست رسمی دارویی ایران (IRC)${fa ? (fa.src ? " · شرح بالینی: خلاصهٔ فارسی از برچسب رسمی FDA (ممکن است همهٔ موارد مصرف این شکل دارویی را پوشش ندهد)" : " · شرح فارسی: دیتابیس تکمیلی (غیررسمی)") : ""}${(intl || ic) ? " · خلاصه انگلیسی: eg-drugs" : ""}${pc ? " · کلاس دارویی: FDA" : ""}
      </div>
    `;
    el.modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
    el.modalContent.parentElement.scrollTop = 0;
  }

  function closeModal() {
    el.modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === el.modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modalBackdrop.hidden) closeModal();
  });

  let debounceTimer = null;
  el.searchBox.addEventListener("input", (e) => {
    const val = e.target.value;
    el.clearBtn.hidden = !val;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = val;
      renderList();
    }, 60);
  });

  el.clearBtn.addEventListener("click", () => {
    el.searchBox.value = "";
    el.clearBtn.hidden = true;
    state.query = "";
    el.searchBox.focus();
    renderList();
  });

  function init() {
    initTheme();
    el.drugCount.textContent = `${toPersianDigits(DB.length)} دارو`;
    renderFilterChips();
    renderList();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
