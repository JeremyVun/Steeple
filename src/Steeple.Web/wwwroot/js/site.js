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
    }

    function init() {
        initToggle();
        initCopyLink();
        initGallery();
        initWhenControl();
        syncFilterBarHeight();
        initStickyFilter();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
