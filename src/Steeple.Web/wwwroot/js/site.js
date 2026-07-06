/*
 * Steeple site behaviours — tiny, dependency-free.
 *  - After an HTMX swap of #results, rebuild the Leaflet map from the new #map-data.
 *  - Mobile list/map toggle.
 *  - Copy-link share affordance.
 *  - Detail-page gallery thumbnail swap.
 */
(function () {
    "use strict";

    // Rebuild the map whenever HTMX swaps fresh results (with a new #map-data) in.
    document.body.addEventListener("htmx:afterSwap", function () {
        if (window.SteepleMap && typeof window.SteepleMap.rebuild === "function") {
            window.SteepleMap.rebuild();
        }
        // Announce only the new result count (not the whole re-rendered list) to screen readers.
        var status = document.getElementById("results-status");
        var count = document.querySelector("#results .result-count");
        if (status && count) {
            status.textContent = count.textContent.replace(/\s+/g, " ").trim();
        }
    });

    // Mobile list/map toggle.
    function initToggle() {
        var buttons = document.querySelectorAll(".map-toggle-btn");
        if (!buttons.length) {
            return;
        }
        buttons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var view = btn.getAttribute("data-view");
                buttons.forEach(function (b) {
                    var active = b === btn;
                    b.classList.toggle("is-active", active);
                    b.setAttribute("aria-pressed", active ? "true" : "false");
                });
                document.querySelectorAll("[data-view-pane]").forEach(function (pane) {
                    pane.classList.toggle("is-hidden", pane.getAttribute("data-view-pane") !== view);
                });
                if (view === "map" && window.SteepleMap && window.SteepleMap.invalidate) {
                    window.SteepleMap.invalidate();
                }
            });
        });
    }

    // Copy-link share button(s).
    function initCopyLink() {
        document.querySelectorAll("[data-copy-link]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var url = window.location.href;
                var done = function () {
                    var original = btn.getAttribute("data-original-label") || btn.textContent;
                    btn.setAttribute("data-original-label", original);
                    btn.textContent = btn.getAttribute("data-copied-label") || "Copied";
                    btn.classList.add("is-copied");
                    setTimeout(function () {
                        btn.textContent = original;
                        btn.classList.remove("is-copied");
                    }, 2000);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(done, fallbackCopy);
                } else {
                    fallbackCopy();
                }
                function fallbackCopy() {
                    var input = document.createElement("input");
                    input.value = url;
                    document.body.appendChild(input);
                    input.select();
                    try { document.execCommand("copy"); done(); } catch (e) { /* no-op */ }
                    document.body.removeChild(input);
                }
            });
        });
    }

    // Detail-page gallery: clicking a thumbnail swaps the main image.
    function initGallery() {
        var main = document.getElementById("gallery-main");
        if (!main) {
            return;
        }
        document.querySelectorAll(".gallery-thumb").forEach(function (thumb) {
            thumb.addEventListener("click", function () {
                var full = thumb.getAttribute("data-full");
                if (full) {
                    main.src = full;
                }
                document.querySelectorAll(".gallery-thumb").forEach(function (t) {
                    t.classList.toggle("is-active", t === thumb);
                });
            });
        });
    }

    // Publish the filter bar's height so the sticky map can offset itself to sit just below it
    // (CSS reads --filterbar-h). Re-measures when the bar reflows (e.g. chips wrap on resize).
    function syncFilterBarHeight() {
        var bar = document.querySelector(".filter-bar");
        if (!bar) {
            return;
        }
        var apply = function () {
            document.documentElement.style.setProperty("--filterbar-h", bar.offsetHeight + "px");
        };
        apply();
        if (window.ResizeObserver) {
            new ResizeObserver(apply).observe(bar);
        } else {
            window.addEventListener("resize", apply);
        }
    }

    // Toggle .is-stuck on the filter bar when it pins to the top, so its top corners can square off.
    function initStickyFilter() {
        var sentinel = document.querySelector(".filter-sentinel");
        var bar = document.querySelector(".filter-bar");
        if (!sentinel || !bar || !window.IntersectionObserver) {
            return;
        }
        new IntersectionObserver(function (entries) {
            bar.classList.toggle("is-stuck", !entries[0].isIntersecting);
        }, { threshold: 0 }).observe(sentinel);
    }

    // Discovery "When" control: progressive reveals + mutual exclusion, no availability derived
    // client-side. The fields are real inputs in the HTMX filter form, so toggling them rides the
    // existing hx-get swap + hx-push-url; on load we read the server-rendered state back out of the
    // DOM (values set from the query string) so a shared URL re-hydrates the control.
    function initWhenControl() {
        var control = document.querySelector("[data-when-control]");
        if (!control) {
            return;
        }

        var weekly = control.querySelector("[data-when-weekly]");
        var dateField = control.querySelector("[data-when-date]");
        var dateInput = dateField ? dateField.querySelector("input") : null;
        var weekdays = control.querySelector("[data-when-weekdays]");
        var weekdayInputs = weekdays ? weekdays.querySelectorAll("input") : [];

        // Weekly vs one-off date are mutually exclusive (the API 400s if both are sent), so we
        // disable the inactive side's fields — disabled inputs are left out of the form serialize.
        function applyWeekly() {
            var on = !!(weekly && weekly.checked);
            if (weekdays) { weekdays.hidden = !on; }
            if (dateField) { dateField.hidden = on; }
            if (dateInput) { dateInput.disabled = on; }
            weekdayInputs.forEach(function (i) { i.disabled = !on; });
        }
        if (weekly) {
            weekly.addEventListener("change", applyWeekly);
        }
        applyWeekly();

        // Time band (radio chips) vs an explicit custom range are mutually exclusive too.
        var customToggle = control.querySelector("[data-when-custom-toggle]");
        var custom = control.querySelector("[data-when-custom]");
        var customInputs = custom ? custom.querySelectorAll("input") : [];
        var bandRadios = control.querySelectorAll("[data-when-band]");

        function showCustom(on) {
            if (custom) { custom.hidden = !on; }
            customInputs.forEach(function (i) { i.disabled = !on; });
            if (customToggle) { customToggle.setAttribute("aria-expanded", on ? "true" : "false"); }
        }
        function customHasValue() {
            return Array.prototype.some.call(customInputs, function (i) { return i.value; });
        }
        showCustom(customHasValue());

        if (customToggle) {
            customToggle.addEventListener("click", function () {
                var opening = !!(custom && custom.hidden);
                if (opening) {
                    bandRadios.forEach(function (r) { r.checked = false; });
                }
                showCustom(opening);
            });
        }
        bandRadios.forEach(function (radio) {
            // Runs before the form's bubble-phase HTMX handler, so a chosen band clears the custom
            // range before the request serializes — the two never travel together.
            radio.addEventListener("change", function () {
                if (radio.checked) {
                    customInputs.forEach(function (i) { i.value = ""; });
                    showCustom(false);
                }
            });
        });

        // ---- Popover enhancement -----------------------------------------------------------------
        // With JS, the inline When row collapses into a summarizing trigger pill + anchored panel.
        // The real inputs above stay canonical; the calendar, mode buttons and summary only read
        // from / write into them, so shared URLs and the no-JS form keep working unchanged.
        var form = control.closest("form");
        var trigger = form ? form.querySelector("[data-when-trigger]") : null;
        var panel = control.querySelector("[data-when-panel]");
        var summary = form ? form.querySelector("[data-when-summary]") : null;
        var calMount = control.querySelector("[data-when-calendar]");
        var modeRow = control.querySelector("[data-when-mode]");
        var foot = control.querySelector("[data-when-foot]");
        if (!trigger || !panel || !calMount) {
            return;
        }

        control.classList.add("when-enhanced");
        trigger.hidden = false;
        if (modeRow) { modeRow.hidden = false; }
        if (foot) { foot.hidden = false; }
        calMount.hidden = !!(weekly && weekly.checked);
        panel.hidden = true;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "When do you need the space?");
        panel.setAttribute("tabindex", "-1");

        function fmt12(v) {
            var p = v.split(":"), h = +p[0], ap = h < 12 ? "AM" : "PM", hr = h % 12 || 12;
            return hr + ":" + p[1] + " " + ap;
        }

        function summarize() {
            var parts = [];
            if (weekly && weekly.checked) {
                var days = [];
                weekdayInputs.forEach(function (i) {
                    if (i.checked) {
                        var text = i.nextElementSibling ? i.nextElementSibling.textContent.trim() : i.value;
                        days.push(text.slice(0, 3));
                    }
                });
                parts.push(days.length ? "Weekly · " + days.join(", ") : "Weekly");
            } else if (dateInput && dateInput.value) {
                parts.push(new Date(dateInput.value + "T00:00:00")
                    .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }));
            }
            var band = control.querySelector("[data-when-band]:checked");
            if (band) {
                var chipText = band.nextElementSibling;
                parts.push(chipText ? chipText.textContent.trim() : band.value);
            } else if (customInputs.length && customInputs[0].value && customInputs[1] && customInputs[1].value) {
                parts.push(fmt12(customInputs[0].value) + "–" + fmt12(customInputs[1].value));
            }
            var text = parts.join(" · ") || "Any time";
            if (summary) { summary.textContent = text; }
            trigger.classList.toggle("is-active", text !== "Any time");
        }

        // ---- Mini calendar: a plain date picker writing into the real date input ------------------
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var view = dateInput && dateInput.value ? new Date(dateInput.value + "T00:00:00") : new Date(today);
        var maxMonth = new Date(today.getFullYear(), today.getMonth() + 12, 1);

        function wireDate(d) {
            var m = d.getMonth() + 1, day = d.getDate();
            return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
        }

        function renderCalendar() {
            calMount.textContent = "";
            var y = view.getFullYear(), mo = view.getMonth();
            var selected = dateInput && dateInput.value ? dateInput.value : null;

            var nav = document.createElement("div");
            nav.className = "avail-calendar-nav";
            var heading = document.createElement("h3");
            heading.className = "avail-calendar-heading";
            heading.setAttribute("aria-live", "polite");
            heading.textContent = new Date(y, mo, 1)
                .toLocaleDateString(undefined, { month: "long", year: "numeric" });
            function navBtn(dir, label, enabled) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "avail-nav-btn" + (enabled ? "" : " is-disabled");
                b.textContent = dir < 0 ? "‹" : "›";
                b.setAttribute("aria-label", label);
                b.disabled = !enabled;
                b.addEventListener("click", function () {
                    view = new Date(y, mo + dir, 1);
                    renderCalendar();
                });
                return b;
            }
            nav.appendChild(navBtn(-1, "Previous month", new Date(y, mo, 1) > new Date(today.getFullYear(), today.getMonth(), 1)));
            nav.appendChild(heading);
            nav.appendChild(navBtn(1, "Next month", new Date(y, mo + 1, 1) <= maxMonth));
            calMount.appendChild(nav);

            var head = document.createElement("div");
            head.className = "avail-weekhead";
            ["S", "M", "T", "W", "T", "F", "S"].forEach(function (d) {
                var s = document.createElement("span");
                s.className = "avail-weekday";
                s.textContent = d;
                head.appendChild(s);
            });
            calMount.appendChild(head);

            var grid = document.createElement("div");
            grid.className = "avail-days";
            var firstDow = new Date(y, mo, 1).getDay();
            for (var b = 0; b < firstDow; b++) {
                var blank = document.createElement("span");
                blank.className = "avail-day avail-blank";
                grid.appendChild(blank);
            }
            var daysInMonth = new Date(y, mo + 1, 0).getDate();
            for (var d = 1; d <= daysInMonth; d++) {
                var date = new Date(y, mo, d);
                var wire = wireDate(date);
                var isPast = date < today;
                var accessible = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
                if (isPast) {
                    var span = document.createElement("span");
                    span.className = "avail-day avail-past";
                    span.setAttribute("aria-label", accessible + " — past");
                    var n = document.createElement("span");
                    n.className = "avail-num";
                    n.textContent = d;
                    span.appendChild(n);
                    grid.appendChild(span);
                } else {
                    var btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "avail-day avail-open"
                        + (wire === wireDate(today) ? " is-today" : "")
                        + (wire === selected ? " is-selected" : "");
                    btn.setAttribute("data-date", wire);
                    btn.setAttribute("aria-label", accessible);
                    btn.setAttribute("aria-pressed", wire === selected ? "true" : "false");
                    var num = document.createElement("span");
                    num.className = "avail-num";
                    num.textContent = d;
                    btn.appendChild(num);
                    btn.addEventListener("click", function (e) {
                        var el = e.currentTarget;
                        var value = el.getAttribute("data-date") === (dateInput ? dateInput.value : "")
                            ? "" : el.getAttribute("data-date");
                        if (dateInput) {
                            dateInput.value = value;
                            dateInput.dispatchEvent(new Event("change", { bubbles: true }));
                        }
                        renderCalendar();
                        summarize();
                    });
                    grid.appendChild(btn);
                }
            }
            calMount.appendChild(grid);
        }
        renderCalendar();

        // ---- Mode buttons drive the (now hidden) weekly checkbox -----------------------------------
        var modeBtns = modeRow ? modeRow.querySelectorAll("[data-when-mode-btn]") : [];
        function syncMode() {
            var on = !!(weekly && weekly.checked);
            modeBtns.forEach(function (b) {
                b.classList.toggle("is-selected", (b.getAttribute("data-when-mode-btn") === "weekly") === on);
            });
            calMount.hidden = on;
        }
        modeBtns.forEach(function (b) {
            b.addEventListener("click", function () {
                var wantWeekly = b.getAttribute("data-when-mode-btn") === "weekly";
                if (weekly && weekly.checked !== wantWeekly) {
                    weekly.checked = wantWeekly;
                    weekly.dispatchEvent(new Event("change", { bubbles: true }));
                }
                syncMode();
                summarize();
            });
        });
        syncMode();

        // ---- Open / close ---------------------------------------------------------------------------
        function setOpen(open) {
            panel.hidden = !open;
            trigger.setAttribute("aria-expanded", open ? "true" : "false");
            if (open) { panel.focus({ preventScroll: true }); }
        }
        trigger.addEventListener("click", function () { setOpen(panel.hidden); });
        document.addEventListener("click", function (e) {
            if (panel.hidden) { return; }
            // A calendar click re-renders the grid before this handler runs, detaching the day
            // button — a detached target was inside the panel, never an outside click.
            if (!(e.target instanceof Element) || !e.target.isConnected) { return; }
            if (!control.contains(e.target) && !trigger.contains(e.target)) {
                setOpen(false);
            }
        });
        panel.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                setOpen(false);
                trigger.focus();
            }
        });
        var done = control.querySelector("[data-when-done]");
        if (done) {
            done.addEventListener("click", function () {
                setOpen(false);
                trigger.focus();
            });
        }

        // ---- Clear: reset every When field, then fire one change so HTMX refreshes ----------------
        var clearBtn = control.querySelector("[data-when-clear]");
        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                bandRadios.forEach(function (r) { r.checked = false; });
                customInputs.forEach(function (i) { i.value = ""; });
                showCustom(false);
                weekdayInputs.forEach(function (i) { i.checked = false; });
                if (weekly) { weekly.checked = false; }
                applyWeekly();
                syncMode();
                if (dateInput) {
                    dateInput.value = "";
                    dateInput.dispatchEvent(new Event("change", { bubbles: true }));
                }
                renderCalendar();
                summarize();
            });
        }

        // Any change to the real inputs (band chips, weekday chips, custom times) refreshes the pill.
        control.addEventListener("change", function () {
            syncMode();
            summarize();
        });
        summarize();
    }

    // Discovery "Filters" control: the secondary facet row (price / activity / accessibility)
    // collapses behind a counting trigger in the search pill. Same contract as the When popover —
    // the chips are real form inputs that ride the HTMX swap; no JS leaves the row inline.
    function initMoreControl() {
        var control = document.querySelector("[data-more-control]");
        if (!control) {
            return;
        }
        var form = control.closest("form");
        var trigger = form ? form.querySelector("[data-more-trigger]") : null;
        var panel = control.querySelector("[data-more-panel]");
        var foot = control.querySelector("[data-more-foot]");
        var count = trigger ? trigger.querySelector("[data-more-count]") : null;
        if (!trigger || !panel) {
            return;
        }

        control.classList.add("more-enhanced");
        trigger.hidden = false;
        if (foot) { foot.hidden = false; }
        panel.hidden = true;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "More filters");
        panel.setAttribute("tabindex", "-1");

        function summarize() {
            var n = panel.querySelectorAll("input:checked").length;
            if (count) {
                count.textContent = String(n);
                count.hidden = n === 0;
            }
            trigger.classList.toggle("is-active", n > 0);
        }

        function setOpen(open) {
            panel.hidden = !open;
            trigger.setAttribute("aria-expanded", open ? "true" : "false");
            if (open) { panel.focus({ preventScroll: true }); }
        }
        trigger.addEventListener("click", function () { setOpen(panel.hidden); });
        document.addEventListener("click", function (e) {
            if (panel.hidden) { return; }
            if (!(e.target instanceof Element) || !e.target.isConnected) { return; }
            if (!control.contains(e.target) && !trigger.contains(e.target)) {
                setOpen(false);
            }
        });
        panel.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                setOpen(false);
                trigger.focus();
            }
        });
        var done = control.querySelector("[data-more-done]");
        if (done) {
            done.addEventListener("click", function () {
                setOpen(false);
                trigger.focus();
            });
        }

        var clearBtn = control.querySelector("[data-more-clear]");
        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                var inputs = panel.querySelectorAll("input[type=checkbox]");
                inputs.forEach(function (i) { i.checked = false; });
                // One bubbled change is enough: HTMX re-serializes the whole form.
                if (inputs.length) {
                    inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
                }
                summarize();
            });
        }

        control.addEventListener("change", summarize);
        summarize();
    }

    function init() {
        initToggle();
        initCopyLink();
        initGallery();
        initWhenControl();
        initMoreControl();
        syncFilterBarHeight();
        initStickyFilter();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
