// Sign-in page glue (CSP forbids inline scripts, so all behaviour lives here).
//
// Google: the GIS library renders its official button; its callback drops the returned
// credential (ID token) into the hidden same-origin form and submits it — the BFF exchanges it
// at the API. Apple is a plain form POST to /auth/apple/start (no JS needed).
//
// Turnstile: when configured, the providers stay hidden until the widget calls
// steepleTurnstileDone with a response token, which is copied into every provider form.
(function () {
    "use strict";

    var config = document.getElementById("auth-config");
    if (!config) {
        return;
    }

    var googleClientId = config.getAttribute("data-google-client-id") || "";
    var turnstileEnabled = config.getAttribute("data-turnstile-enabled") === "true";

    function revealProviders() {
        var providers = document.getElementById("auth-providers");
        var waiting = document.getElementById("auth-waiting");
        if (providers) {
            providers.classList.remove("auth-hidden");
        }
        if (waiting) {
            waiting.hidden = true;
        }
    }

    // Called by the Turnstile widget (data-callback).
    window.steepleTurnstileDone = function (token) {
        document.querySelectorAll("input.turnstile-token").forEach(function (input) {
            input.value = token;
        });
        revealProviders();
    };

    if (!turnstileEnabled) {
        revealProviders();
    }

    // Called by the GIS library once it has loaded.
    window.onGoogleLibraryLoad = function () {
        var container = document.getElementById("google-signin");
        if (!container || !googleClientId || !window.google) {
            return;
        }

        window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: function (response) {
                var form = document.getElementById("google-form");
                var credential = document.getElementById("google-credential");
                if (form && credential && response && response.credential) {
                    credential.value = response.credential;
                    form.submit();
                }
            },
        });

        window.google.accounts.id.renderButton(container, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "pill",
            width: 320,
        });
    };
})();
