document.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('tableBody');
    const headRow = document.getElementById('tableHeadRow');

    const oddsMinEl = document.getElementById('oddsMin');
    const oddsMaxEl = document.getElementById('oddsMax');
    const diffMinEl = document.getElementById('diffMin');
    const diffMaxEl = document.getElementById('diffMax');
    const valueMinEl = document.getElementById('valueMin');
    const valueMaxEl = document.getElementById('valueMax');
    const btnFilter = document.getElementById('btnFilter');
    const btnReset = document.getElementById('btnReset');
    const searchBox = document.getElementById('searchBox');
    const rowCount = document.getElementById('rowCount');
    const surebetBody = document.getElementById('surebetBody');
    const tabAll = document.getElementById('tabAll');
    const tabSurebets = document.getElementById('tabSurebets');
    const tabPaneAll = document.getElementById('tabPaneAll');
    const tabPaneSurebets = document.getElementById('tabPaneSurebets');

    // NOWE: minimalna liczba bukmacherów
    const minBookmakersEl = document.getElementById('minBookmakers');

    const bkList = document.getElementById('bkList');
    const bkAll = document.getElementById('bkAll');
    const bkNone = document.getElementById('bkNone');
    const bkHint = document.getElementById('bkHint');
    const bkRestoreDeleted = document.getElementById('bkRestoreDeleted');
    const marketList = document.getElementById('marketList');
    const marketAll = document.getElementById('marketAll');
    const marketNone = document.getElementById('marketNone');
    const marketHint = document.getElementById('marketHint');

    const LS_KEY = "bestbk_filter_selected_v1";
    const MARKET_LS_KEY = "market_filter_selected_v1";
    const DELETED_KEY = "deleted_rows_v1";

    let allBookmakers = [];
    let allMarkets = [];
    let selectedBestBK = new Set();
    let selectedMarkets = new Set();
    let deletedRows = new Set();

    let currentData = null;
    let rowModels = [];
    let currentSort = { key: null, dir: 'asc', type: 'string' };

    const fmt2 = (x) => Number.isFinite(x) ? x.toFixed(2) : '';
    const fmtPct = (x) => Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : '';

    function debounce(fn, wait = 200) {
        let t = null;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    }

    function parseMaybeNumber(raw) {
        const s = (raw ?? '').toString().trim();
        if (s === '') return null;
        const n = parseFloat(s.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }

    function inRange(value, min, max) {
        if (min === null && max === null) return true;
        if (!Number.isFinite(value)) return false;
        if (min !== null && value < min) return false;
        if (max !== null && value > max) return false;
        return true;
    }

    function normalizeMarketKey(marketRaw) {
        const market = (marketRaw ?? '').toString().trim().toLowerCase();
        // Grupowanie wszystkich wariantów typu "statystyka 0/1/2/3" pod jeden checkbox
        return market.replace(/\s+\d+$/, '').trim();
    }

    function getModelSortValue(model, key) {
        if (!model) return null;
        if (key.startsWith('bk:')) {
            const bk = key.slice(3);
            const v = model.oddsByBookmaker?.[bk];
            return Number.isFinite(v) ? v : null;
        }
        switch (key) {
            case 'match': return model.match;
            case 'market': return model.market;
            case 'description': return model.description;
            case 'odds': return model.odds;
            case 'diff': return model.diff;
            case 'value': return model.value;
            case 'best_bk': return model.bestBk;
            default: return null;
        }
    }

    function compareModels(a, b, { key, dir, type }) {
        const av = getModelSortValue(a, key);
        const bv = getModelSortValue(b, key);
        const sign = dir === 'asc' ? 1 : -1;

        if (type === 'number') {
            const aNum = Number.isFinite(av) ? av : null;
            const bNum = Number.isFinite(bv) ? bv : null;
            if (aNum === null && bNum === null) return 0;
            if (aNum === null) return 1;
            if (bNum === null) return -1;
            return (aNum - bNum) * sign;
        }

        const aStr = (av ?? '').toString().toLowerCase();
        const bStr = (bv ?? '').toString().toLowerCase();
        return aStr.localeCompare(bStr, 'pl') * sign;
    }

    function updateSortHeaderUI() {
        headRow.querySelectorAll('th').forEach((th) => {
            const key = th.dataset.sortKey;
            th.classList.remove('sorted-asc', 'sorted-desc', 'sortable');
            th.removeAttribute('aria-sort');
            if (!key) return;
            th.classList.add('sortable');
            th.setAttribute('aria-sort', 'none');
            if (currentSort.key === key) {
                th.classList.add(currentSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
                th.setAttribute('aria-sort', currentSort.dir === 'asc' ? 'ascending' : 'descending');
            }
        });
    }

    function setupSortHeaders() {
        headRow.querySelectorAll('th').forEach((th) => {
            const key = th.dataset.sortKey;
            if (!key) {
                th.onclick = null;
                return;
            }
            th.onclick = () => {
                const type = th.dataset.sortType === 'number' ? 'number' : 'string';
                if (currentSort.key === key) {
                    currentSort = { key, dir: currentSort.dir === 'asc' ? 'desc' : 'asc', type };
                } else {
                    currentSort = { key, dir: type === 'number' ? 'desc' : 'asc', type };
                }
                updateSortHeaderUI();
                applyFilter();
            };
        });
        updateSortHeaderUI();
    }

    function marketLabelFromKey(key) {
        return key;
    }

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

    function loadSelectedMarkets(defaultList) {
        try {
            const raw = localStorage.getItem(MARKET_LS_KEY);
            if (!raw) return new Set(defaultList);
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Set(defaultList);
            const filtered = arr.filter(x => defaultList.includes(x));
            return filtered.length > 0 ? new Set(filtered) : new Set(defaultList);
        } catch {
            return new Set(defaultList);
        }
    }

    function saveSelectedMarkets() {
        localStorage.setItem(MARKET_LS_KEY, JSON.stringify([...selectedMarkets]));
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

    function updateMarketHint() {
        marketHint.textContent = `Wybrane: ${selectedMarkets.size}/${allMarkets.length}`;
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

    function renderMarketCheckboxes(markets) {
        marketList.textContent = "";
        const frag = document.createDocumentFragment();

        for (const market of markets) {
            const marketLabel = marketLabelFromKey(market);
            const label = document.createElement("label");
            label.className = "flex items-center gap-2 text-sm";

            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "h-4 w-4";
            cb.checked = selectedMarkets.has(market);

            cb.addEventListener("change", () => {
                if (cb.checked) selectedMarkets.add(market);
                else selectedMarkets.delete(market);

                saveSelectedMarkets();
                updateMarketHint();
                applyFilter();
            });

            const span = document.createElement("span");
            span.textContent = marketLabel;

            label.append(cb, span);
            frag.appendChild(label);
        }

        marketList.appendChild(frag);
        updateMarketHint();
    }

    function renderTable({ rows, bookmakers }) {
        // Usuń wszystkie dynamiczne kolumny bukmacherów.
        headRow.querySelectorAll('th[data-sort-key^="bk:"]').forEach((th) => th.remove());

        const deleteTh = headRow.lastElementChild;
        for (const bk of bookmakers) {
            const th = document.createElement("th");
            th.className = "text-right p-2";
            th.dataset.sortKey = `bk:${bk}`;
            th.dataset.sortType = "number";
            th.textContent = bk;
            headRow.insertBefore(th, deleteTh);
        }

        const frag = document.createDocumentFragment();
        rowModels = [];
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
            tdMarket.dataset.col = "market";
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

            const tdBest = document.createElement("td");
            tdBest.className = "p-2";
            tdBest.dataset.col = "best_bk";
            tdBest.textContent = row.best_bk ?? "";

            tr.append(tdMatch, tdMarket, tdDesc, tdBestOdds, tdDiff, tdVal, tdBest);

            for (const bk of bookmakers) {
                const td = document.createElement("td");
                td.className = "text-right p-2";
                const v = row.odds?.[bk];
                td.dataset.value = Number.isFinite(v) ? String(v) : "";
                td.textContent = fmt2(v);
                tr.appendChild(td);
            }

            let bkCount = 0;
            for (const bk of bookmakers) {
                const v = row.odds?.[bk];
                if (Number.isFinite(v)) bkCount++;
            }

            const rowModel = {
                tr,
                match: (row.match ?? "").toString(),
                market: (row.market ?? "").toString(),
                description: (row.description ?? "").toString(),
                textLower: `${row.match ?? ""} ${row.market ?? ""} ${row.description ?? ""} ${row.best_bk ?? ""}`.toLowerCase(),
                diff: Number.isFinite(row.diff) ? row.diff : NaN,
                value: Number.isFinite(row.value) ? row.value : NaN,
                odds: Number.isFinite(row.best_odds) ? row.best_odds : NaN,
                bestBk: (row.best_bk ?? "").toString().trim(),
                oddsByBookmaker: row.odds ?? {},
                marketKey: normalizeMarketKey(row.market),
                bkCount,
                deleted: false
            };
            rowModels.push(rowModel);

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
                rowModel.deleted = true;
                tr.remove();
                updateBKHint();
                applyFilter();
                if (currentData) renderSurebetTable(currentData.rows ?? []);
            });

            tdDelete.appendChild(btnDel);
            tr.appendChild(tdDelete);

            frag.appendChild(tr);
        }

        tbody.textContent = "";
        tbody.appendChild(frag);
        setupSortHeaders();
    }

    function renderSurebetTable(rows) {
        if (!surebetBody) return;
        const byId = new Map();

        for (const row of rows) {
            const rid = String(row.id ?? "");
            if (!rid) continue;
            if (deletedRows.has(rid)) continue;
            const sbId = (row.surebet_id ?? "").toString().trim();
            if (!sbId) continue;
            if (!byId.has(sbId)) {
                byId.set(sbId, []);
            }
            byId.get(sbId).push(row);
        }

        const groups = [];
        for (const [id, groupRows] of byId.entries()) {
            const maxVal = groupRows.reduce((acc, r) => {
                const v = Number.isFinite(r.surebet_value) ? r.surebet_value : NaN;
                if (!Number.isFinite(v)) return acc;
                return Number.isFinite(acc) ? Math.max(acc, v) : v;
            }, NaN);
            groups.push({
                id,
                rows: groupRows,
                value: maxVal,
                match: (groupRows[0]?.match ?? "").toString(),
                market: (groupRows[0]?.market ?? "").toString(),
            });
        }

        groups.sort((a, b) => {
            const av = Number.isFinite(a.value) ? a.value : -Infinity;
            const bv = Number.isFinite(b.value) ? b.value : -Infinity;
            return bv - av;
        });

        const frag = document.createDocumentFragment();
        if (groups.length === 0) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.className = "p-3 text-gray-600";
            td.colSpan = 5;
            td.textContent = "Brak surebetów w danych.";
            tr.appendChild(td);
            frag.appendChild(tr);
            surebetBody.textContent = "";
            surebetBody.appendChild(frag);
            return;
        }
        for (const group of groups) {
            const tr = document.createElement("tr");

            const tdVal = document.createElement("td");
            tdVal.className = "text-right p-2";
            const pill = document.createElement("span");
            pill.className = "sb-pill";
            pill.textContent = Number.isFinite(group.value) ? fmtPct(group.value) : "—";
            tdVal.appendChild(pill);

            const tdMatch = document.createElement("td");
            tdMatch.className = "p-2";
            tdMatch.textContent = group.match;

            const tdMarket = document.createElement("td");
            tdMarket.className = "p-2";
            tdMarket.textContent = group.market;

            const [legA, legB] = group.rows;
            const tdLegA = document.createElement("td");
            tdLegA.className = "p-2";
            tdLegA.appendChild(renderSurebetLeg(legA));

            const tdLegB = document.createElement("td");
            tdLegB.className = "p-2";
            tdLegB.appendChild(renderSurebetLeg(legB));

            tr.append(tdVal, tdMatch, tdMarket, tdLegA, tdLegB);
            frag.appendChild(tr);
        }

        surebetBody.textContent = "";
        surebetBody.appendChild(frag);
    }

    function renderSurebetLeg(row) {
        const wrap = document.createElement("div");
        wrap.className = "sb-leg";
        if (!row) {
            wrap.textContent = "—";
            return wrap;
        }

        const desc = document.createElement("div");
        desc.textContent = (row.description ?? "").toString();

        const bk = document.createElement("div");
        bk.className = "sb-bk";
        bk.textContent = (row.best_bk ?? "").toString();

        const odds = document.createElement("div");
        odds.className = "sb-odds";
        const o = Number.isFinite(row.best_odds) ? row.best_odds.toFixed(2) : "—";
        odds.textContent = `Odds: ${o}`;

        wrap.append(desc, bk, odds);
        return wrap;
    }

    function setActiveTab(tab) {
        if (!tabAll || !tabSurebets || !tabPaneAll || !tabPaneSurebets) return;
        const isSurebets = tab === "surebets";
        tabAll.classList.toggle("tab-active", !isSurebets);
        tabSurebets.classList.toggle("tab-active", isSurebets);
        tabAll.setAttribute("aria-pressed", (!isSurebets).toString());
        tabSurebets.setAttribute("aria-pressed", isSurebets.toString());
        tabPaneAll.classList.toggle("is-hidden", isSurebets);
        tabPaneSurebets.classList.toggle("is-hidden", !isSurebets);
    }

    function applyFilter() {
        const term = (searchBox.value ?? '').trim().toLowerCase();
        const oddsMin = parseMaybeNumber(oddsMinEl?.value);
        const oddsMax = parseMaybeNumber(oddsMaxEl?.value);
        const diffMin = parseMaybeNumber(diffMinEl?.value);
        const diffMax = parseMaybeNumber(diffMaxEl?.value);
        const valueMin = parseMaybeNumber(valueMinEl?.value);
        const valueMax = parseMaybeNumber(valueMaxEl?.value);

        // NOWE: minimalna liczba bukmacherów do porównania
        const minBkRaw = (minBookmakersEl?.value ?? '').trim();
        const minBk = minBkRaw === '' ? 0 : parseInt(minBkRaw, 10);
        let visible = 0;
        const matched = [];

        for (const model of rowModels) {
            if (model.deleted || !model.tr.isConnected) continue;

            const passOdds = inRange(model.odds, oddsMin, oddsMax);
            const passDiff = inRange(model.diff, diffMin, diffMax);
            const passValue = inRange(model.value, valueMin, valueMax);
            const textMatch = term === '' || model.textLower.includes(term);

            const passBestBk = selectedBestBK.size === 0 ? true : selectedBestBK.has(model.bestBk);
            const passMarket = selectedMarkets.size === 0 ? true : selectedMarkets.has(model.marketKey);
            const passMinBk = model.bkCount >= (Number.isFinite(minBk) ? minBk : 0);

            if (passOdds && passDiff && passValue && textMatch && passBestBk && passMarket && passMinBk) {
                model.tr.style.display = '';
                visible++;
                matched.push(model);
            } else {
                model.tr.style.display = 'none';
            }
        }

        if (currentSort.key && matched.length > 1) {
            matched.sort((a, b) => compareModels(a, b, currentSort));
            const frag = document.createDocumentFragment();
            for (const model of matched) frag.appendChild(model.tr);
            tbody.appendChild(frag);
        }

        rowCount.textContent = `${visible} wyników`;
    }

    function fullRerender() {
        if (!currentData) return;
        renderTable(currentData);
        renderSurebetTable(currentData.rows ?? []);
        applyFilter();
        updateBKHint();
        updateMarketHint();
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
        allMarkets = [...new Set(
            (data.rows ?? [])
                .map(r => normalizeMarketKey(r.market))
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'pl'));

        deletedRows = loadDeletedRows();
        selectedBestBK = loadSelectedBestBK(allBookmakers);
        selectedMarkets = loadSelectedMarkets(allMarkets);

        renderBookmakerCheckboxes(allBookmakers);
        renderMarketCheckboxes(allMarkets);
        renderTable(data);
        renderSurebetTable(data.rows ?? []);

        applyFilter();
        updateBKHint();
        updateMarketHint();
    } catch (e) {
        tbody.innerHTML = `<tr><td class="p-3 text-red-600" colspan="99">Błąd ładowania JSON: ${e.message}</td></tr>`;
    }

    btnFilter.addEventListener('click', () => applyFilter());

    btnReset.addEventListener('click', () => {
        searchBox.value = '';
        oddsMinEl.value = '';
        oddsMaxEl.value = '';
        diffMinEl.value = '';
        diffMaxEl.value = '';
        valueMinEl.value = '';
        valueMaxEl.value = '';

        // NOWE: reset pola min bukmacherów
        minBookmakersEl.value = '';

        applyFilter();
    });

    const applyFilterDebounced = debounce(() => applyFilter(), 200);

    searchBox.addEventListener('input', applyFilterDebounced);
    searchBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });

    const rangeInputs = [oddsMinEl, oddsMaxEl, diffMinEl, diffMaxEl, valueMinEl, valueMaxEl];
    for (const input of rangeInputs) {
        input.addEventListener('input', applyFilterDebounced);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilter(); });
    }

    // NOWE: reakcja na zmianę min bukmacherów
    minBookmakersEl.addEventListener('input', () => applyFilter());
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

    marketAll.addEventListener("click", () => {
        selectedMarkets = new Set(allMarkets);
        saveSelectedMarkets();
        marketList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateMarketHint();
        applyFilter();
    });

    marketNone.addEventListener("click", () => {
        selectedMarkets = new Set();
        saveSelectedMarkets();
        marketList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateMarketHint();
        applyFilter();
    });

    if (tabAll && tabSurebets) {
        setActiveTab("all");
        tabAll.addEventListener("click", () => setActiveTab("all"));
        tabSurebets.addEventListener("click", () => setActiveTab("surebets"));
    }

    const darkToggle = document.getElementById('darkToggle');
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark');
        darkToggle.textContent = 'Tryb jasny';
    }
    darkToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        const isDark = document.body.classList.contains('dark');
        localStorage.setItem('darkMode', isDark ? '1' : '0');
        darkToggle.textContent = isDark ? 'Tryb jasny' : 'Tryb nocny';
    });
});
