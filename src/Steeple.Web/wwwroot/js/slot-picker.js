// Guest slot picker (DESIGN_SYSTEM §8.10-8.13). Enhances the apply form: the calendar, free-window
// chips and range controls write into the canonical native inputs (StartDate/EndDate/StartTime/
// EndTime/DaysOfWeek). HTMX loads the fragments and runs the debounced availability check; this file
// only wires selection into those real inputs and drives keyboard/roving-tabindex on the grid.
// CSP forbids inline scripts, so everything lives here. Never re-derives availability (§8.13).
(function () {
    "use strict";

    var form = document.getElementById("apply-form");
    if (!form || form.getAttribute("data-picker-enabled") !== "true") {
        return;
    }

    // With JS running, the calendar + windows drive the schedule; the native date/time fields
    // collapse to the no-JS fallback (§8.9). The submit guard below re-reveals them if a value
    // is missing, so browser validation never targets a hidden field.
    form.classList.add("is-picker-active");

    var startDate = form.querySelector("[data-start-date]");
    var endDate = form.querySelector("[data-end-date]");
    var startTime = form.querySelector("[data-start-time]");
    var endTime = form.querySelector("[data-end-time]");
    var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    // Writing a value programmatically must fire change so the HTMX availability check re-runs.
    function setNative(input, value) {
        if (!input) { return; }
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function toMin(s) { var p = s.split(":"); return (+p[0]) * 60 + (+p[1]); }
    function fromMin(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
    function fmt12(s) { var p = s.split(":"), h = +p[0], ap = h < 12 ? "AM" : "PM", hr = h % 12 || 12; return hr + ":" + p[1] + " " + ap; }
    function wireDate(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day; }
    function isWeekly() { var r = form.querySelector("[data-freq-radio]:checked"); return r && r.value === "recurringWeekly"; }

    function selectOne(el, groupSelector, scope) {
        (scope || form).querySelectorAll(groupSelector).forEach(function (b) { b.classList.remove("is-selected"); });
        el.classList.add("is-selected");
    }

    // ----- Calendar: day tap seeds StartDate + pre-checks the weekday chip (weekly, §8.12) ----------
    function markSelectedDay(btn) {
        form.querySelectorAll("[data-avail-day]").forEach(function (d) {
            d.classList.remove("is-selected");
            d.setAttribute("aria-pressed", "false");
            d.setAttribute("tabindex", "-1");
        });
        btn.classList.add("is-selected");
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("tabindex", "0");
    }

    function precheckWeekday(dateStr) {
        if (!isWeekly()) { return; }
        var anyChecked = form.querySelector("[data-weekday]:checked");
        if (anyChecked) { return; }
        var token = DAYS[new Date(dateStr + "T00:00:00").getDay()];
        var chip = form.querySelector('[data-weekday="' + token + '"]');
        if (chip) { chip.checked = true; chip.dispatchEvent(new Event("change", { bubbles: true })); }
    }

    // ----- Range controls (constrained to the chosen free window) -----------------------------------
    var activeWindow = null; // {start, end} wire HH:mm

    function currentDuration() {
        var pill = form.querySelector("[data-duration].is-selected");
        return pill ? parseInt(pill.getAttribute("data-duration"), 10) : 120;
    }

    function constrainSelects() {
        if (!activeWindow) { return; }
        var lo = toMin(activeWindow.start), hi = toMin(activeWindow.end);
        form.querySelectorAll("[data-range-start] option").forEach(function (o) { o.disabled = toMin(o.value) < lo || toMin(o.value) >= hi; });
        form.querySelectorAll("[data-range-end] option").forEach(function (o) { o.disabled = toMin(o.value) <= lo || toMin(o.value) > hi; });
    }

    function applyDuration(mins) {
        if (!activeWindow) { return; }
        var startSel = form.querySelector("[data-range-start]"), endSel = form.querySelector("[data-range-end]");
        var start = startSel.value && toMin(startSel.value) >= toMin(activeWindow.start) ? startSel.value : activeWindow.start;
        var endM = mins > 0 ? toMin(start) + mins : (endSel.value ? toMin(endSel.value) : toMin(start) + 120);
        if (endM > toMin(activeWindow.end)) { endM = toMin(activeWindow.end); }
        startSel.value = start;
        endSel.value = fromMin(endM);
        setNative(startTime, start);
        setNative(endTime, fromMin(endM));
        updateReadout();
    }

    function updateReadout() {
        var readout = form.querySelector("[data-range-readout]");
        var windows = form.querySelector("[data-day-windows]");
        if (!readout || !startTime.value || !endTime.value) { return; }
        var mins = toMin(endTime.value) - toMin(startTime.value);
        var hours = mins / 60;
        var dur = (hours === 1 ? "1 hour" : (Number.isInteger(hours) ? hours + " hours" : hours.toFixed(1) + " hours"));
        var label = windows ? windows.getAttribute("data-date") : "";
        var dateLabel = label ? new Date(label + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "";
        readout.textContent = dateLabel + " · " + fmt12(startTime.value) + "–" + fmt12(endTime.value) + " · " + dur;
    }

    // ----- Delegated interactions (fragments arrive via HTMX, so bind on the form) ------------------
    form.addEventListener("click", function (e) {
        var day = e.target.closest("[data-avail-day]");
        if (day) { setNative(startDate, day.getAttribute("data-date")); markSelectedDay(day); precheckWeekday(day.getAttribute("data-date")); return; }

        var win = e.target.closest("[data-window]");
        if (win) {
            activeWindow = { start: win.getAttribute("data-start"), end: win.getAttribute("data-end") };
            selectOne(win, "[data-window]", win.closest("[data-day-windows]"));
            var range = form.querySelector("[data-range]");
            if (range) { range.hidden = false; }
            constrainSelects();
            applyDuration(currentDuration());
            return;
        }

        var dur = e.target.closest("[data-duration]");
        if (dur) { selectOne(dur, "[data-duration]", dur.closest("[role=group]")); var m = parseInt(dur.getAttribute("data-duration"), 10); if (m > 0) { applyDuration(m); } return; }

        var until = e.target.closest("[data-until]");
        if (until) {
            selectOne(until, "[data-until]", until.closest("[role=group]"));
            var days = parseInt(until.getAttribute("data-until"), 10);
            if (days > 0) {
                var base = startDate.value ? new Date(startDate.value + "T00:00:00") : new Date();
                base.setDate(base.getDate() + days);
                setNative(endDate, wireDate(base));
            } else { endDate.focus(); }
            return;
        }
    });

    form.addEventListener("change", function (e) {
        if (e.target.matches("[data-range-start]")) { setNative(startTime, e.target.value); updateReadout(); }
        else if (e.target.matches("[data-range-end]")) { setNative(endTime, e.target.value); updateReadout(); }
    });

    // Switching to weekly after a date is already picked: seed that day's weekday chip (§8.12).
    form.querySelectorAll("[data-freq-radio]").forEach(function (radio) {
        radio.addEventListener("change", function () {
            if (isWeekly() && startDate && startDate.value) { precheckWeekday(startDate.value); }
        });
    });

    // ----- Submit guard: incomplete schedule → reveal the native fields and let validation run -----
    form.addEventListener("submit", function (e) {
        var incomplete = [startDate, startTime, endTime].some(function (f) { return f && !f.value; });
        if (incomplete) {
            form.classList.remove("is-picker-active");
            e.preventDefault();
            form.reportValidity();
        }
    });

    // ----- Roving tabindex + arrow keys on the calendar grid (§8.10) --------------------------------
    form.addEventListener("keydown", function (e) {
        var cell = e.target.closest ? e.target.closest("[data-avail-day]") : null;
        if (!cell) { return; }
        var cells = Array.prototype.slice.call(form.querySelectorAll("[data-avail-day]"));
        var i = cells.indexOf(cell), next = i;
        switch (e.key) {
            case "ArrowRight": next = i + 1; break;
            case "ArrowLeft": next = i - 1; break;
            case "ArrowDown": next = i + 7; break;
            case "ArrowUp": next = i - 7; break;
            case "Home": next = 0; break;
            case "End": next = cells.length - 1; break;
            default: return;
        }
        e.preventDefault();
        if (next < 0 || next >= cells.length) { return; }
        cells.forEach(function (c) { c.setAttribute("tabindex", "-1"); });
        cells[next].setAttribute("tabindex", "0");
        cells[next].focus();
    });
})();
