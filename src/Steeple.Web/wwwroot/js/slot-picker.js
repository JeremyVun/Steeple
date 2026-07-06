// Guest slot picker (DESIGN_SYSTEM §8.10-8.13). Enhances the apply form: the calendar is a
// multi-select — picked dates derive the canonical native inputs (Frequency/StartDate/EndDate/
// DaysOfWeek/StartTime/EndTime), which stay the posted source of truth. One date = a one-off
// (with an optional "Repeats weekly" toggle below the calendar); several dates = a weekday
// pattern across their date range (the wire's recurringWeekly), and the calendar paints every
// date the request would cover so nothing is implied invisibly. HTMX loads the fragments and
// runs the debounced availability check. CSP forbids inline scripts, so everything lives here.
// Never re-derives availability (§8.13).
(function () {
    "use strict";

    var form = document.getElementById("apply-form");
    if (!form || form.getAttribute("data-picker-enabled") !== "true") {
        return;
    }

    // With JS running, the calendar + windows drive the schedule; the native frequency/date/day
    // fields collapse to the no-JS fallback (§8.9). The submit guard below re-reveals them if a
    // value is missing, so browser validation never targets a hidden field.
    form.classList.add("is-picker-active");

    var picker = form.querySelector("[data-apply-picker]");
    var startDate = form.querySelector("[data-start-date]");
    var endDate = form.querySelector("[data-end-date]");
    var startTime = form.querySelector("[data-start-time]");
    var endTime = form.querySelector("[data-end-time]");
    var repeatBlock = form.querySelector("[data-repeat-block]");
    var repeatToggle = form.querySelector("[data-repeat-toggle]");
    var untilBlock = form.querySelector("[data-until-block]");
    var untilInput = form.querySelector("[data-until-date]");
    var summaryEl = form.querySelector("[data-schedule-summary]");
    var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    var DAY_LABELS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

    // The explicit selection: wire dates (yyyy-MM-dd), kept sorted.
    var selectedDates = [];

    // Writing a value programmatically must fire change so the HTMX availability check re-runs.
    function setNative(input, value) {
        if (!input || input.value === value) { return; }
        input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function toMin(s) { var p = s.split(":"); return (+p[0]) * 60 + (+p[1]); }
    function fromMin(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
    function fmt12(s) { var p = s.split(":"), h = +p[0], ap = h < 12 ? "AM" : "PM", hr = h % 12 || 12; return hr + ":" + p[1] + " " + ap; }
    function toDate(s) { return new Date(s + "T00:00:00"); }
    function wireDate(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day; }
    function fmtShort(s) { return toDate(s).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }

    function repeatOn() { return repeatToggle && repeatToggle.checked && selectedDates.length === 1; }
    function isWeekly() { return selectedDates.length > 1 || repeatOn(); }

    function selectOne(el, groupSelector, scope) {
        (scope || form).querySelectorAll(groupSelector).forEach(function (b) { b.classList.remove("is-selected"); });
        el.classList.add("is-selected");
    }

    // ----- Derive the canonical schedule from the selection ----------------------------------------
    function setFrequency(weekly) {
        var radio = form.querySelector('[data-freq-radio][value="' + (weekly ? "recurringWeekly" : "oneOff") + '"]');
        if (radio && !radio.checked) {
            radio.checked = true;
            radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    function setWeekdayChips(weekdays) {
        form.querySelectorAll("[data-weekday]").forEach(function (chip) {
            var want = weekdays.indexOf(chip.getAttribute("data-weekday")) !== -1;
            if (chip.checked !== want) {
                chip.checked = want;
                chip.dispatchEvent(new Event("change", { bubbles: true }));
            }
        });
    }

    function selectionWeekdays() {
        var days = [];
        selectedDates.forEach(function (s) {
            var t = DAYS[toDate(s).getDay()];
            if (days.indexOf(t) === -1) { days.push(t); }
        });
        return days;
    }

    // Every date the request covers: the weekday pattern expanded across [first, last/until].
    function seriesDates() {
        if (selectedDates.length === 0) { return []; }
        if (!isWeekly()) { return selectedDates.slice(); }
        var last = repeatOn() && untilInput && untilInput.value ? untilInput.value : selectedDates[selectedDates.length - 1];
        var weekdays = selectionWeekdays();
        var out = [], d = toDate(selectedDates[0]), end = toDate(last), guard = 0;
        while (d <= end && guard++ < 400) {
            if (weekdays.indexOf(DAYS[d.getDay()]) !== -1) { out.push(wireDate(d)); }
            d.setDate(d.getDate() + 1);
        }
        return out;
    }

    function deriveSchedule() {
        selectedDates.sort();

        // The repeat toggle only makes sense for a single picked date; a multi-date pick
        // already *is* the recurrence pattern.
        if (repeatBlock) {
            repeatBlock.hidden = selectedDates.length !== 1;
            if (selectedDates.length !== 1 && repeatToggle) { repeatToggle.checked = false; }
        }
        if (untilBlock) { untilBlock.hidden = !repeatOn(); }

        var weekly = isWeekly();
        setFrequency(weekly);
        setNative(startDate, selectedDates[0] || "");
        if (weekly) {
            var series = seriesDates();
            setNative(endDate, series.length ? series[series.length - 1] : "");
            setWeekdayChips(selectionWeekdays());
        } else {
            setNative(endDate, "");
            setWeekdayChips([]);
        }

        paintCalendar();
        updateSummary();
    }

    // ----- Calendar painting (multi-select + derived series) ---------------------------------------
    function paintCalendar() {
        var series = seriesDates();
        form.querySelectorAll("[data-avail-day]").forEach(function (cell) {
            var d = cell.getAttribute("data-date");
            var picked = selectedDates.indexOf(d) !== -1;
            var inSeries = !picked && series.indexOf(d) !== -1;
            cell.classList.toggle("is-selected", picked);
            cell.classList.toggle("is-derived", inSeries);
            cell.setAttribute("aria-pressed", picked ? "true" : "false");
        });
    }

    function updateSummary() {
        if (!summaryEl) { return; }
        var series = seriesDates();
        if (series.length === 0) { summaryEl.hidden = true; summaryEl.textContent = ""; return; }
        var text;
        var explicitOnly = !repeatOn() && series.length === selectedDates.length;
        if (series.length === 1) {
            text = toDate(series[0]).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
        } else if (explicitOnly) {
            // The request covers exactly the tapped dates — say the dates, not a weekly pattern.
            var span = (toDate(series[series.length - 1]) - toDate(series[0])) / 86400000;
            var consecutive = span === series.length - 1;
            var dates = consecutive
                ? fmtShort(series[0]) + " – " + fmtShort(series[series.length - 1])
                : series.slice(0, -1).map(fmtShort).join(", ") + " & " + fmtShort(series[series.length - 1]);
            text = dates + " · " + series.length + " days, same time each day";
        } else {
            var dayNames = selectionWeekdays()
                .slice().sort(function (a, b) { return DAYS.indexOf(a) - DAYS.indexOf(b); })
                .map(function (t) { return DAY_LABELS[DAYS.indexOf(t)]; });
            var sessions = series.length === 1 ? "1 session" : series.length + " sessions";
            text = dayNames.join(" & ") + " · " + fmtShort(series[0]) + " – " + fmtShort(series[series.length - 1])
                + " · " + sessions + (series.length > 1 ? ", same time each day" : "");
        }
        summaryEl.textContent = "Asking for: " + text;
        summaryEl.hidden = false;
    }

    // ----- Day windows (free times for the last-tapped date) ---------------------------------------
    function loadDayWindows(dateStr) {
        var target = document.getElementById("apply-day-windows");
        if (!picker || !target || !window.htmx) { return; }
        window.htmx.ajax("GET", picker.getAttribute("data-day-url") + "?date=" + dateStr, { target: target, swap: "innerHTML" });
    }

    function resetDayWindows() {
        var target = document.getElementById("apply-day-windows");
        if (target) {
            target.innerHTML = '<p class="apply-day-hint">Pick a date on the calendar to see its open times.</p>';
        }
        activeWindow = null;
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
        var dateLabel = label ? toDate(label).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "";
        readout.textContent = dateLabel + " · " + fmt12(startTime.value) + "–" + fmt12(endTime.value) + " · " + dur;
    }

    // ----- Delegated interactions (fragments arrive via HTMX, so bind on the form) ------------------
    form.addEventListener("click", function (e) {
        var day = e.target.closest("[data-avail-day]");
        if (day) {
            var d = day.getAttribute("data-date");
            var i = selectedDates.indexOf(d);
            if (i === -1) {
                selectedDates.push(d);
                loadDayWindows(d);
            } else {
                selectedDates.splice(i, 1);
                // Keep the free-times panel on a date that's still part of the request.
                if (selectedDates.length > 0) {
                    loadDayWindows(selectedDates[selectedDates.length - 1]);
                } else {
                    resetDayWindows();
                }
            }
            deriveSchedule();
            return;
        }

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
            if (days > 0 && untilInput) {
                var base = selectedDates.length ? toDate(selectedDates[0]) : new Date();
                base.setDate(base.getDate() + days);
                untilInput.value = wireDate(base);
                deriveSchedule();
            } else if (untilInput) { untilInput.focus(); }
            return;
        }
    });

    form.addEventListener("change", function (e) {
        if (e.target.matches("[data-range-start]")) { setNative(startTime, e.target.value); updateReadout(); }
        else if (e.target.matches("[data-range-end]")) { setNative(endTime, e.target.value); updateReadout(); }
        else if (untilInput && e.target === untilInput) { deriveSchedule(); }
    });

    if (repeatToggle) {
        repeatToggle.addEventListener("change", function () {
            if (repeatToggle.checked && untilInput && !untilInput.value && selectedDates.length === 1) {
                // Seed a sensible default series length (the 8-weeks preset).
                var base = toDate(selectedDates[0]);
                base.setDate(base.getDate() + 56);
                untilInput.value = wireDate(base);
                var preset = form.querySelector('[data-until="56"]');
                if (preset) { selectOne(preset, "[data-until]", preset.closest("[role=group]")); }
            }
            deriveSchedule();
        });
    }

    // Month nav swaps in a fresh grid with no selection state — repaint from JS state.
    form.addEventListener("htmx:afterSwap", function (e) {
        if (e.target.closest && (e.target.closest("[data-apply-picker]") || e.target.matches("[data-apply-picker]"))) {
            paintCalendar();
        }
    });

    // ----- Submit guard: incomplete schedule → reveal the native fields and let validation run -----
    form.addEventListener("submit", function (e) {
        var incomplete = [startDate, startTime, endTime].some(function (f) { return f && !f.value; })
            || (isWeekly() && endDate && !endDate.value);
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

    // ----- Seed from a restored draft / When-carry prefill ------------------------------------------
    (function init() {
        var weeklyRadio = form.querySelector('[data-freq-radio][value="recurringWeekly"]');
        // A weekly draft/prefill (When-carry or restored stash) arms the repeat toggle so the
        // first tapped date stays a weekly series rather than silently collapsing to a one-off.
        if (weeklyRadio && weeklyRadio.checked && repeatToggle) {
            repeatToggle.checked = true;
            if (untilInput && endDate && endDate.value) { untilInput.value = endDate.value; }
        }
        if (startDate && startDate.value) {
            selectedDates = [startDate.value];
            deriveSchedule();
        }
    })();
})();
