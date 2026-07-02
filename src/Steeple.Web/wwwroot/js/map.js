/*
 * Steeple map module — Leaflet over OpenStreetMap tiles.
 * Reads pin + bounds data from a <script id="map-data" type="application/json"> tag
 * and exposes window.SteepleMap.{init, rebuild} so site.js can refresh it after
 * an HTMX swap. Guards for a missing #map (e.g. pages without a map).
 */
(function () {
    "use strict";

    var map = null;
    var markerLayer = null;

    function readData() {
        var el = document.getElementById("map-data");
        if (!el) {
            return null;
        }
        try {
            return JSON.parse(el.textContent || el.innerText || "{}");
        } catch (e) {
            return null;
        }
    }

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function popupHtml(pin) {
        // The photo is full-bleed (edge to edge); only the text lives in a padded body.
        var html = '<div class="map-popup">';
        if (pin.photo) {
            html += '<img class="map-popup-photo" src="' + esc(pin.photo) + '" alt="' + esc(pin.name) + '" />';
        }
        html += '<div class="map-popup-body">';
        html += '<a class="map-popup-link" href="' + esc(pin.url) + '">' + esc(pin.name) + "</a>";
        if (pin.venue) {
            html += '<span class="map-popup-venue">' + esc(pin.venue) + "</span>";
        }
        if (pin.price) {
            var cls = pin.free ? "map-popup-price is-free" : "map-popup-price";
            html += '<span class="' + cls + '">' + esc(pin.price) + "</span>";
        }
        html += "</div></div>";
        return html;
    }

    // A modern teardrop pin (Steeple palette) instead of Leaflet's default blue marker.
    // Sage for free spaces, terracotta for paid — matching the badges used elsewhere.
    function pinIcon(free) {
        var color = free ? "#5B7553" : "#C0623F";
        var html =
            '<svg class="hs-pin-svg" width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">' +
            '<path d="M15 1.5C7.82 1.5 2 7.18 2 14.2c0 9.2 11.1 22.2 12.2 23.5a1.05 1.05 0 0 0 1.6 0' +
            'C16.9 36.4 28 23.4 28 14.2 28 7.18 22.18 1.5 15 1.5Z" fill="' + color + '" ' +
            'stroke="#FBF7F0" stroke-width="2.5"/>' +
            '<circle cx="15" cy="14" r="4.6" fill="#FBF7F0"/></svg>';
        return L.divIcon({
            className: "hs-pin",
            html: html,
            iconSize: [30, 40],
            iconAnchor: [15, 38],
            popupAnchor: [0, -34]
        });
    }

    function drawMarkers(data) {
        if (!map || !data) {
            return;
        }
        if (markerLayer) {
            markerLayer.clearLayers();
        } else {
            markerLayer = L.layerGroup().addTo(map);
        }

        var pins = (data && data.pins) || [];
        pins.forEach(function (pin) {
            if (typeof pin.lat !== "number" || typeof pin.lng !== "number") {
                return;
            }
            L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.free) })
                .addTo(markerLayer)
                .bindPopup(popupHtml(pin));
        });

        // A single pin (detail page) — center on it rather than fitting bounds.
        if (pins.length === 1) {
            map.setView([pins[0].lat, pins[0].lng], 15);
        }
    }

    function fitToBounds(data) {
        if (!map || !data) {
            return;
        }
        if (data.bounds) {
            var b = data.bounds;
            map.fitBounds([
                [b.minLat, b.minLng],
                [b.maxLat, b.maxLng]
            ], { padding: [16, 16] });
        } else if (data.center) {
            map.setView([data.center.lat, data.center.lng], 14);
        }
    }

    var expandBtn = null;

    function expandIconSvg() {
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    }

    function collapseIconSvg() {
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>';
    }

    // Toggle the discovery map between its in-column size and a full-viewport overlay.
    function setExpanded(el, want) {
        if (!el) {
            return;
        }
        el.classList.toggle("map-expanded", want);
        document.body.classList.toggle("hs-map-locked", want);
        if (expandBtn) {
            var label = want ? "Collapse map" : "Expand map to full screen";
            expandBtn.title = want ? "Collapse map" : "Expand map";
            expandBtn.setAttribute("aria-label", label);
            expandBtn.innerHTML = want ? collapseIconSvg() : expandIconSvg();
        }
        // Let the layout change settle before Leaflet re-measures its tiles.
        setTimeout(invalidate, 60);
    }

    function addExpandControl(el) {
        var ExpandControl = L.Control.extend({
            options: { position: "topright" },
            onAdd: function () {
                var container = L.DomUtil.create("div", "leaflet-bar hs-map-expand");
                var btn = L.DomUtil.create("a", "", container);
                btn.href = "#";
                btn.title = "Expand map";
                btn.setAttribute("role", "button");
                btn.setAttribute("aria-label", "Expand map to full screen");
                btn.innerHTML = expandIconSvg();
                expandBtn = btn;
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(btn, "click", function (e) {
                    L.DomEvent.preventDefault(e);
                    setExpanded(el, !el.classList.contains("map-expanded"));
                });
                return container;
            }
        });
        map.addControl(new ExpandControl());

        // Escape collapses the expanded map.
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && el.classList.contains("map-expanded")) {
                setExpanded(el, false);
            }
        });
    }

    function init() {
        var el = document.getElementById("map");
        if (!el || map) {
            return;
        }

        var data = readData();
        var center = (data && data.center) || { lat: 38.9012, lng: -77.2653 };

        // The detail-page mini-map stays static; the discovery map gets scroll-wheel zoom and the
        // expand-to-fullscreen control.
        var isMini = el.classList.contains("map-mini");

        map = L.map(el, { scrollWheelZoom: !isMini }).setView([center.lat, center.lng], 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        if (!isMini) {
            addExpandControl(el);
        }

        fitToBounds(data);
        drawMarkers(data);

        // Late-loading images (e.g. the detail-page gallery) can change layout after the map
        // was created, leaving Leaflet with stale tile positions. Re-measure once settled.
        requestAnimationFrame(invalidate);
        if (document.readyState !== "complete") {
            window.addEventListener("load", invalidate, { once: true });
        }
        // A ResizeObserver corrects tile positioning whenever the container's box changes
        // (late images, font swaps, responsive reflow) — robust for the detail mini-map.
        if (window.ResizeObserver) {
            new ResizeObserver(invalidate).observe(el);
        }
    }

    // Rebuild markers (and re-fit) from the current #map-data — used after an HTMX swap.
    function rebuild() {
        if (!map) {
            init();
            return;
        }
        var data = readData();
        fitToBounds(data);
        drawMarkers(data);
        // Tiles can mis-size if the container was hidden during a layout change.
        setTimeout(function () {
            if (map) {
                map.invalidateSize();
            }
        }, 0);
    }

    function invalidate() {
        if (map) {
            map.invalidateSize();
        }
    }

    window.SteepleMap = { init: init, rebuild: rebuild, invalidate: invalidate };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
