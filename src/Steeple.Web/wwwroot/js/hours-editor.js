// Hours & blackouts editor behaviours (CSP forbids inline scripts).
//  - Window/blackout rows are cloned from <template> tags and re-indexed so MVC list
//    binding sees contiguous indices (Days[i].Windows[j].*, Blackouts[k].*).
//  - "Copy to…" duplicates one day's windows onto the checked days (replace, not append).
//  - Presets fill common shapes; they replace all existing windows after a confirm.
(function () {
    "use strict";

    var editor = document.querySelector("[data-hours-editor]");
    if (!editor) {
        return;
    }

    var windowTemplate = document.querySelector("[data-window-template]");
    var blackoutTemplate = document.querySelector("[data-blackout-template]");

    var PRESETS = {
        "weekday-evenings": { days: ["monday", "tuesday", "wednesday", "thursday", "friday"], start: "18:00", end: "21:00" },
        "weekend-days": { days: ["saturday", "sunday"], start: "09:00", end: "17:00" },
        "open-daily": { days: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], start: "08:00", end: "21:00" }
    };

    function dayRows() {
        return Array.prototype.slice.call(editor.querySelectorAll("[data-day-row]"));
    }

    function reindexDay(dayRow) {
        var d = dayRow.getAttribute("data-day-index");
        dayRow.querySelectorAll("[data-window-row]").forEach(function (row, j) {
            row.querySelectorAll("input").forEach(function (input) {
                input.name = input.name
                    .replace(/Days\[\d+|Days\[__DAY__/, "Days[" + d)
                    .replace(/Windows\[\d+|Windows\[__IDX__/, "Windows[" + j);
            });
        });
        var note = dayRow.querySelector("[data-closed-note]");
        if (note) {
            note.hidden = dayRow.querySelectorAll("[data-window-row]").length > 0;
        }
    }

    function reindexBlackouts() {
        editor.querySelectorAll("[data-blackout-row]").forEach(function (row, k) {
            row.querySelectorAll("input").forEach(function (input) {
                input.name = input.name.replace(/Blackouts\[\d+|Blackouts\[__ROW__/, "Blackouts[" + k);
            });
        });
    }

    function addWindow(dayRow, start, end) {
        var clone = windowTemplate.content.firstElementChild.cloneNode(true);
        var inputs = clone.querySelectorAll("input");
        if (start) { inputs[0].value = start; }
        if (end) { inputs[1].value = end; }
        dayRow.querySelector("[data-windows]").appendChild(clone);
        reindexDay(dayRow);
        return clone;
    }

    function clearWindows(dayRow) {
        dayRow.querySelectorAll("[data-window-row]").forEach(function (row) { row.remove(); });
    }

    function windowsOf(dayRow) {
        return Array.prototype.slice.call(dayRow.querySelectorAll("[data-window-row]")).map(function (row) {
            var inputs = row.querySelectorAll("input");
            return { start: inputs[0].value, end: inputs[1].value };
        });
    }

    editor.addEventListener("click", function (event) {
        var target = event.target;

        if (target.matches("[data-add-window]")) {
            addWindow(target.closest("[data-day-row]"), "09:00", "17:00").querySelector("input").focus();
            return;
        }

        if (target.matches("[data-remove-row]")) {
            var windowRow = target.closest("[data-window-row]");
            var blackoutRow = target.closest("[data-blackout-row]");
            var dayRow = target.closest("[data-day-row]");
            (windowRow || blackoutRow).remove();
            if (windowRow && dayRow) { reindexDay(dayRow); } else { reindexBlackouts(); }
            return;
        }

        if (target.matches("[data-add-blackout]")) {
            var clone = blackoutTemplate.content.firstElementChild.cloneNode(true);
            editor.querySelector("[data-blackouts]").appendChild(clone);
            reindexBlackouts();
            clone.querySelector("input").focus();
            return;
        }

        if (target.matches("[data-copy-apply]")) {
            var popover = target.closest("[data-copy-popover]");
            var sourceRow = target.closest("[data-day-row]");
            var source = windowsOf(sourceRow);
            var picked = Array.prototype.slice
                .call(popover.querySelectorAll("input[type=checkbox]:checked"))
                .map(function (box) { return box.value; });
            dayRows().forEach(function (row) {
                if (picked.indexOf(row.getAttribute("data-day-token")) === -1) { return; }
                clearWindows(row);
                source.forEach(function (win) { addWindow(row, win.start, win.end); });
                reindexDay(row);
            });
            popover.querySelectorAll("input[type=checkbox]").forEach(function (box) { box.checked = false; });
            popover.removeAttribute("open");
            return;
        }

        if (target.matches("[data-preset]")) {
            var preset = PRESETS[target.getAttribute("data-preset")];
            if (!preset) { return; }
            var hasAny = editor.querySelectorAll("[data-window-row]").length > 0;
            if (hasAny && !window.confirm("Replace the current hours with this preset?")) { return; }
            dayRows().forEach(function (row) {
                clearWindows(row);
                if (preset.days.indexOf(row.getAttribute("data-day-token")) !== -1) {
                    addWindow(row, preset.start, preset.end);
                }
                reindexDay(row);
            });
        }
    });
})();
