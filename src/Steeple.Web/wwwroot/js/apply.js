// Apply-form behaviours (CSP forbids inline scripts).
//  - Frequency toggle: the weekly-only fields (end date, day of week) show only for weekly.
//  - Turnstile: the widget's callback drops its token into the hidden form field.
(function () {
    "use strict";

    var form = document.getElementById("apply-form");
    if (!form) {
        return;
    }

    function currentFrequency() {
        var checked = form.querySelector("[data-freq-radio]:checked");
        return checked ? checked.value : "oneOff";
    }

    function applyFrequency() {
        var weekly = currentFrequency() === "recurringWeekly";
        form.querySelectorAll("[data-when-freq]").forEach(function (field) {
            var shownFor = field.getAttribute("data-when-freq").split(" ");
            field.hidden = shownFor.indexOf(currentFrequency()) === -1;
        });
        // "Date" reads better for a one-off; "First date" for a weekly series.
        var startLabel = form.querySelector("[data-label-oneoff]");
        if (startLabel) {
            startLabel.textContent = weekly
                ? startLabel.getAttribute("data-label-weekly")
                : startLabel.getAttribute("data-label-oneoff");
        }
    }

    form.querySelectorAll("[data-freq-radio]").forEach(function (radio) {
        radio.addEventListener("change", applyFrequency);
    });
    applyFrequency();

    // Called by the Turnstile widget (data-callback).
    window.steepleApplyTurnstileDone = function (token) {
        form.querySelectorAll("input.turnstile-token").forEach(function (input) {
            input.value = token;
        });
    };
})();
