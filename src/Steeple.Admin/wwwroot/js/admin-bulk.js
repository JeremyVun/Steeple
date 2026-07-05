// Bulk-select wiring shared by the admin tables (listings, applications, users). Tables
// re-render via htmx outerHTML swaps that clear every row checkbox, so selection state is
// always rebuilt from the live checkboxes — nothing to persist across a swap. Delegated on
// document so the handlers survive swaps without re-binding, and kept out of inline event
// attributes so the admin's strict CSP (script-src 'self') doesn't block it.
(function () {
    function sync(form) {
        if (!form) return;
        var rows = form.querySelectorAll('.admin-row-check');
        var checked = 0;
        rows.forEach(function (b) { if (b.checked) checked++; });

        var count = form.querySelector('[data-selected-count]');
        if (count) count.textContent = checked + ' selected';

        var all = form.querySelector('.admin-select-all');
        if (all) {
            all.checked = rows.length > 0 && checked === rows.length;
            all.indeterminate = checked > 0 && checked < rows.length;
        }

        var apply = form.querySelector('.admin-bulkbar-apply button');
        if (apply) apply.disabled = checked === 0;
    }

    document.addEventListener('change', function (e) {
        var el = e.target;
        if (!el || !el.classList) return;

        if (el.classList.contains('admin-select-all')) {
            var form = el.closest('form');
            if (!form) return;
            form.querySelectorAll('.admin-row-check').forEach(function (b) { b.checked = el.checked; });
            sync(form);
        } else if (el.classList.contains('admin-row-check')) {
            sync(el.closest('form'));
        }
    });
})();
