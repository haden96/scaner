document.addEventListener('DOMContentLoaded', async () => {
    const table = document.getElementById('bettingTable');
    const tbody = document.getElementById('tableBody');
    const headRow = document.getElementById('tableHeadRow');

    const filterTypeEl = document.getElementById('filterType');
    const minValueEl = document.getElementById('minValue');
    const btnFilter = document.getElementById('btnFilter');
    const btnReset = document.getElementById('btnReset');
    const searchBox = document.getElementById('searchBox');
    const rowCount = document.getElementById('rowCount');

    const hideYellowCardsEl = document.getElementById('hideYellowCards');
    const oddsConditionEl = document.getElementById('oddsCondition');
    const oddsValueEl = document.getElementById('oddsValue');

    // NOWE: minimalna liczba bukmacherów
    const minBookmakersEl = document.getElementById('minBookmakers');

    const bkList = document.getElementById('bkList');
    const bkAll = document.getElementById('bkAll');
    const bkNone = document.getElementById('bkNone');
    const bkHint = document.getElementById('bkHint');
    const bkRestoreDeleted = document.getElementById('bkRestoreDeleted');

    const LS_KEY = "bestbk_filter_selected_v1";
    const DELETED_KEY = "deleted_rows_v1";

    let allBookmakers = [];
    let selectedBestBK = new Set();
    let deletedRows = new Set();

    let currentData = null;
    let sorter = null;

    const toNumFromCell = (el) => {
        if (!el) return NaN;
        const s = (el.dataset.value ?? el.textContent ?? '').toString().replace(',', '.').trim();
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : NaN;
    };

    const fmt2 = (x) => Number.isFinite(x) ? x.toFixed(2) : '';

    function loadSelectedBestBK(defaultList) {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return new Set(defaultList);
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Set(defaultList);
            return new Set(arr.filter(x => defaultList.includes(x)));
        } catch {
            return new Set(defaultList);
        }
    }

    function saveSelectedBestBK() {
        localStorage.setItem(LS_KEY, JSON.stringify([...selectedBestBK]));
    }

    function loadDeletedRows() {
        try {
            const raw = localStorage.getItem(DELETED_KEY);
            if (!raw) return new Set();
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Set();
            return new Set(arr.map(String));
        } catch {
            return new Set();
        }
    }

    function saveDeletedRows() {
        localStorage.setItem(DELETED_KEY, JSON.stringify([...deletedRows]));
    }

    function updateBKHint() {
        bkHint.textContent = `Wybrane: ${selectedBestBK.size}/${allBookmakers.length} | Usunięte: ${deletedRows.size}`;
    }

    function renderBookmakerCheckboxes(bookmakers) {
        bkList.textContent = "";
        const frag = document.createDocumentFragment();

        for (const bk of bookmakers) {
            const label = document.createElement("label");
            label.className = "flex items-center gap-2 text-sm";

            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "h-4 w-4";
            cb.checked = selectedBestBK.has(bk);

            cb.addEventListener("change", () => {
                if (cb.checked) selectedBestBK.add(bk);
                else selectedBestBK.delete(bk);

                saveSelectedBestBK();
                updateBKHint();
                applyFilter();
            });

            const span = document.createElement("span");
            span.textContent = bk;

            label.append(cb, span);
            frag.appendChild(label);
        }

        bkList.appendChild(frag);
        updateBKHint();
    }

    function renderTable({ rows, bookmakers }) {
        while (headRow.cells.length > 10) headRow.deleteCell(9);

        const deleteTh = headRow.lastElementChild;
        for (const bk of bookmakers) {
            const th = document.createElement("th");
            th.className = "text-right p-2";
            th.setAttribute("data-sort-method", "number");
            th.textContent = bk;
            headRow.insertBefore(th, deleteTh);
        }

        const frag = document.createDocumentFragment();

        for (const row of rows) {
            const rid = String(row.id ?? "");
            if (!rid) continue;
            if (deletedRows.has(rid)) continue;

            const tr = document.createElement("tr");
            tr.className = "border-t";
            tr.dataset.id = rid;

            const tdMatch = document.createElement("td");
            tdMatch.className = "p-2";
            tdMatch.textContent = row.match;

            const tdMarket = document.createElement("td");
            tdMarket.className = "p-2";
            tdMarket.textContent = row.market;

            const tdDesc = document.createElement("td");
            tdDesc.className = "p-2";
            tdDesc.textContent = row.description;

            const tdBestOdds = document.createElement("td");
            tdBestOdds.className = "text-right p-2";
            tdBestOdds.dataset.col = "odds";
            tdBestOdds.dataset.value = Number.isFinite(row.best_odds) ? String(row.best_odds) : "";
            tdBestOdds.textContent = fmt2(row.best_odds);

            const tdDiff = document.createElement("td");
            tdDiff.className = "text-right p-2";
            tdDiff.dataset.col = "diff";
            tdDiff.dataset.value = Number.isFinite(row.diff) ? String(row.diff) : "";
            tdDiff.textContent = fmt2(row.diff);

            const tdVal = document.createElement("td");
            tdVal.className = "text-right p-2";
            tdVal.dataset.col = "value";
            tdVal.dataset.value = Number.isFinite(row.value) ? String(row.value) : "";
            tdVal.textContent = fmt2(row.value);

            const tdValNew = document.createElement("td");
            tdValNew.className = "text-right p-2";
            tdValNew.dataset.col = "value_new";
            tdValNew.dataset.value = Number.isFinite(row.value_new) ? String(row.value_new) : "";
            tdValNew.textContent = fmt2(row.value_new);

            const tdBest = document.createElement("td");
            tdBest.className = "p-2";
            tdBest.dataset.col = "best_bk";
            tdBest.textContent = row.best_bk ?? "";

            tr.append(tdMatch, tdMarket, tdDesc, tdBestOdds, tdDiff, tdVal, tdValNew, tdBest);

            for (const bk of bookmakers) {
                const td = document.createElement("td");
                td.className = "text-right p-2";
                const v = row.odds?.[bk];
                td.dataset.value = Number.isFinite(v) ? String(v) : "";
                td.textContent = fmt2(v);
                tr.appendChild(td);
            }

            const tdDelete = document.createElement("td");
            tdDelete.className = "text-center p-2";

            const btnDel = document.createElement("button");
            btnDel.type = "button";
            btnDel.title = "Usuń rekord";
            btnDel.className = "btn-del text-red-600 hover:text-red-800 text-lg";
            btnDel.textContent = "✖";

            btnDel.addEventListener("click", () => {
                const bestBk = (row.best_bk ?? "").toString().trim();
                const desc = (row.description ?? "").toString().trim();
                const m = (row.match ?? "").toString().trim();

                const ok = confirm(`Usunąć rekord?\n\n${m}\n${bestBk} | ${desc}`);
                if (!ok) return;

                deletedRows.add(rid);
                saveDeletedRows();
                tr.remove();
                updateBKHint();
                applyFilter();
            });

            tdDelete.appendChild(btnDel);
            tr.appendChild(tdDelete);

            frag.appendChild(tr);
        }

        tbody.textContent = "";
        tbody.appendChild(frag);
    }

    function applyFilter() {
        const type = filterTypeEl.value;
        const minRaw = (minValueEl.value ?? '').trim();
        const min = minRaw === '' ? -Infinity : parseFloat(minRaw.replace(',', '.'));
        const term = (searchBox.value ?? '').trim().toLowerCase();
        const hideYellow = hideYellowCardsEl.checked;

        const oddsCondition = oddsConditionEl.value;
        const oddsRaw = (oddsValueEl.value ?? '').trim();
        const oddsVal = oddsRaw === '' ? NaN : parseFloat(oddsRaw.replace(',', '.'));

        // NOWE: minimalna liczba bukmacherów do porównania
        const minBkRaw = (minBookmakersEl?.value ?? '').trim();
        const minBk = minBkRaw === '' ? 0 : parseInt(minBkRaw, 10);

        let visible = 0;

        table.querySelectorAll('tbody tr').forEach(row => {
            const valCell = row.querySelector(type === 'diff' ? 'td[data-col="diff"]' : 'td[data-col="value"]');
            const val = toNumFromCell(valCell);

            const passVal = (min === -Infinity) || (Number.isFinite(val) && val >= min);
            const textMatch = term === '' || row.textContent.toLowerCase().includes(term);
            const notYellow = !hideYellow || !row.textContent.toLowerCase().includes('yellow card');

            let passOdds = true;
            if (!isNaN(oddsVal) && oddsCondition) {
                const odds = toNumFromCell(row.querySelector('td[data-col="odds"]'));
                if (!Number.isFinite(odds)) {
                    passOdds = false;
                } else {
                    passOdds = oddsCondition === "above" ? (odds > oddsVal) : (odds < oddsVal);
                }
            }

            const bestBk = (row.querySelector('td[data-col="best_bk"]')?.textContent ?? "").trim();
            const passBestBk = selectedBestBK.size === 0 ? true : selectedBestBK.has(bestBk);

            // NOWE: liczba bukmacherów z poprawnym kursem w dynamicznych kolumnach
            let bkCount = 0;
            row.querySelectorAll('td[data-value]').forEach(td => {
                const col = td.dataset.col; // stałe mają data-col
                if (col) return;            // pomijamy stałe: odds/diff/value/value_new/best_bk
                const n = toNumFromCell(td);
                if (Number.isFinite(n)) bkCount++;
            });
            const passMinBk = bkCount >= (Number.isFinite(minBk) ? minBk : 0);

            if (passVal && textMatch && notYellow && passOdds && passBestBk && passMinBk) {
                row.style.display = '';
                visible++;
            } else {
                row.style.display = 'none';
            }
        });

        rowCount.textContent = `${visible} wyników`;

        if (sorter) sorter.refresh();
    }

    function fullRerender() {
        if (!currentData) return;
        renderTable(currentData);
        if (sorter) sorter.refresh();
        applyFilter();
        updateBKHint();
    }

    try {
        const res = await fetch("frontend.json?v=" + Date.now(), { cache: "no-store" });
        const data = await res.json();
        currentData = data;
        const lastUpdateEl = document.getElementById("lastUpdate");

        function formatPL(iso) {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return "—";
            return new Intl.DateTimeFormat("pl-PL", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }).format(d);
        }

        if (lastUpdateEl) {
            lastUpdateEl.textContent = data.generated_at ? formatPL(data.generated_at) : "—";
        }

        allBookmakers = data.bookmakers ?? [];

        deletedRows = loadDeletedRows();
        selectedBestBK = loadSelectedBestBK(allBookmakers);

        renderBookmakerCheckboxes(allBookmakers);
        renderTable(data);

        sorter = new Tablesort(table);
        sorter.refresh();

        applyFilter();
        updateBKHint();
    } catch (e) {
        tbody.innerHTML = `<tr><td class="p-3 text-red-600" colspan="99">Błąd ładowania JSON: ${e.message}</td></tr>`;
    }

    btnFilter.addEventListener('click', applyFilter);

    btnReset.addEventListener('click', () => {
        minValueEl.value = '';
        searchBox.value = '';
        oddsConditionEl.value = '';
        oddsValueEl.value = '';
        hideYellowCardsEl.checked = false;

        // NOWE: reset pola min bukmacherów
        minBookmakersEl.value = '';

        applyFilter();
    });

    searchBox.addEventListener('input', applyFilter);
    minValueEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });
    searchBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });

    hideYellowCardsEl.addEventListener('change', applyFilter);
    oddsConditionEl.addEventListener('change', applyFilter);
    oddsValueEl.addEventListener('input', applyFilter);
    oddsValueEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });

    // NOWE: reakcja na zmianę min bukmacherów
    minBookmakersEl.addEventListener('input', applyFilter);
    minBookmakersEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });

    bkAll.addEventListener("click", () => {
        selectedBestBK = new Set(allBookmakers);
        saveSelectedBestBK();
        bkList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateBKHint();
        applyFilter();
    });

    bkNone.addEventListener("click", () => {
        selectedBestBK = new Set();
        saveSelectedBestBK();
        bkList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateBKHint();
        applyFilter();
    });

    bkRestoreDeleted.addEventListener("click", () => {
        const ok = confirm("Przywrócić WSZYSTKIE usunięte rekordy? (wyczyści localStorage)");
        if (!ok) return;
        deletedRows = new Set();
        localStorage.removeItem(DELETED_KEY);
        fullRerender();
    });

    const darkToggle = document.getElementById('darkToggle');
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark');
        darkToggle.textContent = '☀️ Tryb jasny';
    }
    darkToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        const isDark = document.body.classList.contains('dark');
        localStorage.setItem('darkMode', isDark ? '1' : '0');
        darkToggle.textContent = isDark ? '☀️ Tryb jasny' : '🌙 Tryb nocny';
    });
});