(function () {
  "use strict";

  var STORAGE_KEY = "pharmacy_invoice_selection";
  var MIN_ROWS = 10;

  var digitMap = { "0": "۰", "1": "۱", "2": "۲", "3": "۳", "4": "۴", "5": "۵", "6": "۶", "7": "۷", "8": "۸", "9": "۹" };
  var reverseDigitMap = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

  function toPersianDigits(input) {
    return String(input).replace(/[0-9]/g, function (d) { return digitMap[d]; });
  }

  function toAsciiDigits(str) {
    return String(str || "").replace(/[۰-۹]/g, function (d) { return reverseDigitMap[d]; });
  }

  function digitsOnly(str) {
    return toAsciiDigits(str).replace(/\D/g, "");
  }

  function parseNumber(str) {
    var ascii = toAsciiDigits(str).replace(/[^\d.]/g, "");
    var n = parseFloat(ascii);
    return isNaN(n) ? 0 : n;
  }

  function formatNumber(n) {
    var rounded = Math.round(n);
    return toPersianDigits(rounded.toLocaleString("en-US"));
  }

  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function loadSelection() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function buildRow(name, hasDrug, editableName) {
    var nameCell = editableName
      ? '<td class="drug-name-cell" contenteditable="true"></td>'
      : '<td class="drug-name-cell">' + escapeHtml(name) + '</td>';
    if (hasDrug) {
      return (
        '<tr>' +
        '<td class="row-num"></td>' +
        nameCell +
        '<td class="qty-cell"><input type="text" inputmode="numeric" class="mini-input qty-input" value="۱"></td>' +
        '<td class="price-cell"><input type="text" inputmode="numeric" class="mini-input price-input" value="۰"></td>' +
        '<td class="row-total-cell">۰</td>' +
        '</tr>'
      );
    }
    return (
      '<tr>' +
      '<td class="row-num"></td>' +
      nameCell +
      '<td class="qty-cell"></td>' +
      '<td class="price-cell"></td>' +
      '<td class="row-total-cell"></td>' +
      '</tr>'
    );
  }

  function renumberRows(tbody) {
    var n = 0;
    tbody.querySelectorAll("tr").forEach(function (row) {
      var nameCell = row.querySelector(".drug-name-cell");
      var numCell = row.querySelector(".row-num");
      if (nameCell && nameCell.textContent.trim()) {
        n++;
        numCell.textContent = toPersianDigits(n);
      } else {
        numCell.textContent = "";
      }
    });
  }

  function recalcRow(row) {
    var nameCell = row.querySelector(".drug-name-cell");
    var qtyInput = row.querySelector(".qty-input");
    var priceInput = row.querySelector(".price-input");
    var totalCell = row.querySelector(".row-total-cell");
    if (!qtyInput || !priceInput || !totalCell) return;
    if (!nameCell.textContent.trim() && !qtyInput.value.trim() && !priceInput.value.trim()) {
      totalCell.textContent = "";
      recalcGrandTotal();
      return;
    }
    var qty = parseNumber(qtyInput.value);
    var price = parseNumber(priceInput.value);
    totalCell.textContent = formatNumber(qty * price);
    recalcGrandTotal();
  }

  function recalcGrandTotal() {
    var sum = 0;
    document.querySelectorAll(".row-total-cell").forEach(function (cell) {
      sum += parseNumber(cell.textContent);
    });
    var el = document.getElementById("grand-total");
    if (el) el.textContent = formatNumber(sum) + " ریال";
  }

  function selectOnFocus(input) {
    input.addEventListener("focus", function () {
      requestAnimationFrame(function () { input.select(); });
    });
  }

  function wireQtyInput(input, row) {
    selectOnFocus(input);
    input.addEventListener("input", function () {
      var digits = digitsOnly(input.value).slice(0, 5);
      input.value = digits ? toPersianDigits(digits) : "";
      recalcRow(row);
    });
  }

  function wirePriceInput(input, row) {
    selectOnFocus(input);
    input.addEventListener("input", function () {
      var digits = digitsOnly(input.value).slice(0, 12);
      input.value = digits ? formatNumber(parseInt(digits, 10)) : "";
      recalcRow(row);
    });
  }

  function activateRow(row) {
    var qtyCell = row.querySelector(".qty-cell");
    var priceCell = row.querySelector(".price-cell");
    var totalCell = row.querySelector(".row-total-cell");
    if (!qtyCell.querySelector(".qty-input")) {
      qtyCell.innerHTML = '<input type="text" inputmode="numeric" class="mini-input qty-input" value="۱">';
      priceCell.innerHTML = '<input type="text" inputmode="numeric" class="mini-input price-input" value="۰">';
      totalCell.textContent = "۰";
      wireQtyInput(qtyCell.querySelector(".qty-input"), row);
      wirePriceInput(priceCell.querySelector(".price-input"), row);
    }
  }

  function wireRow(row) {
    var nameCell = row.querySelector(".drug-name-cell");
    var qtyInput = row.querySelector(".qty-input");
    var priceInput = row.querySelector(".price-input");

    if (qtyInput) wireQtyInput(qtyInput, row);
    if (priceInput) wirePriceInput(priceInput, row);

    if (nameCell && nameCell.hasAttribute("contenteditable")) {
      nameCell.addEventListener("input", function () {
        var tbody = document.getElementById("items-body");
        if (nameCell.textContent.trim()) {
          activateRow(row);
        }
        ensureTrailingBlank(tbody);
        renumberRows(tbody);
        recalcRow(row);
      });
    }
  }

  function addBlankRow(tbody) {
    var holder = document.createElement("tbody");
    holder.innerHTML = buildRow("", false, true);
    var row = holder.firstChild;
    tbody.appendChild(row);
    wireRow(row);
    return row;
  }

  function ensureTrailingBlank(tbody) {
    var rows = tbody.querySelectorAll("tr");
    if (!rows.length) return;
    var last = rows[rows.length - 1];
    var nameCell = last.querySelector(".drug-name-cell");
    if (nameCell && nameCell.textContent.trim()) addBlankRow(tbody);
  }

  function buildItemsTable() {
    var tbody = document.getElementById("items-body");
    var selection = loadSelection();
    var html = "";

    selection.forEach(function (item) {
      html += buildRow(item.name || "", true, false);
    });

    var blanks = Math.max(MIN_ROWS - selection.length, 1);
    for (var i = 0; i < blanks; i++) {
      html += buildRow("", false, true);
    }

    tbody.innerHTML = html;
    renumberRows(tbody);
    tbody.querySelectorAll("tr").forEach(wireRow);
    recalcGrandTotal();
  }

  function wireAgeInput() {
    var input = document.getElementById("patient-age");
    if (!input) return;
    input.addEventListener("input", function () {
      var digits = digitsOnly(input.value).slice(0, 3);
      input.value = digits ? toPersianDigits(digits) : "";
    });
  }

  function wireNationalId() {
    var input = document.getElementById("national-id");
    if (!input) return;
    function validate() {
      var digits = digitsOnly(input.value);
      if (digits.length > 0 && digits.length < 10) {
        input.classList.add("invalid");
      } else {
        input.classList.remove("invalid");
      }
    }
    input.addEventListener("input", function () {
      var digits = digitsOnly(input.value).slice(0, 10);
      input.value = digits ? toPersianDigits(digits) : "";
      validate();
    });
    input.addEventListener("blur", validate);
  }

  function wirePhoneInput() {
    var input = document.getElementById("phone-number");
    if (!input) return;
    input.addEventListener("input", function () {
      var digits = digitsOnly(input.value).slice(0, 11);
      input.value = digits ? toPersianDigits(digits) : "";
    });
  }

  function currentJalali() {
    try {
      var parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
      var out = {};
      parts.forEach(function (p) { if (p.type === "year" || p.type === "month" || p.type === "day") out[p.type] = parseInt(p.value, 10); });
      if (out.year && out.month && out.day) return out;
    } catch (e) {}
    return null;
  }

  function wireDateInputs() {
    var year = document.getElementById("date-year");
    var month = document.getElementById("date-month");
    var day = document.getElementById("date-day");
    var j = currentJalali();
    if (j && year && month && day) {
      year.value = toPersianDigits(j.year);
      month.value = toPersianDigits(j.month < 10 ? "0" + j.month : j.month);
      day.value = toPersianDigits(j.day < 10 ? "0" + j.day : j.day);
    }
    [[year, 4], [month, 2], [day, 2]].forEach(function (pair) {
      var input = pair[0], max = pair[1];
      if (!input) return;
      selectOnFocus(input);
      input.addEventListener("input", function () {
        var digits = digitsOnly(input.value).slice(0, max);
        input.value = digits ? toPersianDigits(digits) : "";
        if (digits.length === max && input.nextEditable) {
          input.nextEditable.focus();
        }
      });
    });
    if (year) year.nextEditable = month;
    if (month) month.nextEditable = day;
  }

  function wireTimeInputs() {
    var timeInput = document.getElementById("time-value");
    var ampmSelect = document.getElementById("time-ampm");
    if (!timeInput || !ampmSelect) return;

    var now = new Date();
    var hours24 = now.getHours();
    var minutes = now.getMinutes();
    var isPM = hours24 >= 12;
    var hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;
    var hh = (hours12 < 10 ? "0" : "") + hours12;
    var mm = (minutes < 10 ? "0" : "") + minutes;
    timeInput.value = toPersianDigits(hh + ":" + mm);
    ampmSelect.value = isPM ? "ب.ظ" : "ق.ظ";

    timeInput.addEventListener("input", function () {
      var digits = digitsOnly(timeInput.value).slice(0, 4);
      var formatted = digits;
      if (digits.length > 2) {
        formatted = digits.slice(0, 2) + ":" + digits.slice(2);
      }
      timeInput.value = toPersianDigits(formatted);
    });
  }

  function fitToScreen() {
    var box = document.getElementById("invoice-container");
    var tools = document.querySelector(".toolbar");
    if (!box) return;
    var avail = document.documentElement.clientWidth - 40;
    var scale = Math.min(1, avail / 800);
    box.style.zoom = scale < 1 ? String(scale) : "";
    if (tools) tools.style.zoom = box.style.zoom;
  }

  function fitToPage() {
    var box = document.getElementById("invoice-container");
    if (!box) return;
    var probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;width:132mm;height:194mm";
    document.body.appendChild(probe);
    var pageH = probe.offsetHeight;
    document.body.removeChild(probe);
    var avail = pageH - 6;
    var zoom = 1;
    box.style.zoom = "";
    for (var i = 0; i < 8; i++) {
      var h = box.getBoundingClientRect().height;
      if (h <= avail) break;
      zoom = zoom * avail / h * 0.99;
      box.style.zoom = String(zoom);
    }
  }

  function init() {
    fitToScreen();
    window.addEventListener("resize", fitToScreen);
    window.addEventListener("beforeprint", fitToPage);
    window.addEventListener("afterprint", fitToScreen);
    buildItemsTable();
    wireAgeInput();
    wireNationalId();
    wirePhoneInput();
    wireDateInputs();
    wireTimeInputs();

    var printBtn = document.getElementById("print-btn");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
