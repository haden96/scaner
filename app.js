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
    const middlebetBody = document.getElementById('middlebetBody');
    const tabAll = document.getElementById('tabAll');
    const tabSurebets = document.getElementById('tabSurebets');
    const tabMiddlebets = document.getElementById('tabMiddlebets');
    const tabPaneAll = document.getElementById('tabPaneAll');
    const tabPaneSurebets = document.getElementById('tabPaneSurebets');
    const tabPaneMiddlebets = document.getElementById('tabPaneMiddlebets');

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
    const marketToggle = document.getElementById('marketToggle');
    const marketPanelBody = document.getElementById('marketPanelBody');

    const LS_KEY = "bestbk_filter_selected_v1";
    const MARKET_LS_KEY = "market_filter_selected_v1";
    const MARKET_PANEL_OPEN_KEY = "market_filter_panel_open_v1";
    const MARKET_GROUPS_LS_KEY = "market_filter_groups_open_v1";
    const DELETED_KEY = "deleted_rows_v1";

    let allBookmakers = [];
    let allMarkets = [];
    let selectedBestBK = new Set();
    let selectedMarkets = new Set();
    let deletedRows = new Map();
    let openMarketGroups = new Set();

    let currentData = null;
    let rowModels = [];
    let currentSort = { key: null, dir: 'asc', type: 'string' };

    const fmt2 = (x) => Number.isFinite(x) ? x.toFixed(2) : '';
    const fmtPct = (x) => Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : '';

    function getRowSurebets(row) {
        const surebets = Array.isArray(row?.surebets) ? row.surebets : [];
        const normalized = surebets
            .map((item) => ({
                surebet_id: (item?.surebet_id ?? "").toString().trim(),
                surebet_type: (item?.surebet_type ?? "").toString().trim(),
                surebet_value: Number.isFinite(item?.surebet_value) ? item.surebet_value : NaN,
            }))
            .filter((item) => item.surebet_id);

        if (normalized.length > 0) {
            return normalized;
        }

        const legacyId = (row?.surebet_id ?? "").toString().trim();
        if (!legacyId) return [];
        return [
            {
                surebet_id: legacyId,
                surebet_type: (row?.surebet_type ?? "").toString().trim(),
                surebet_value: Number.isFinite(row?.surebet_value) ? row.surebet_value : NaN,
            },
        ];
    }

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

    function sourceMarketsLabel(row) {
        const arr = Array.isArray(row?.source_markets) ? row.source_markets.filter(Boolean) : [];
        if (arr.length <= 1) return "";
        return ` [src: ${arr.join(" | ")}]`;
    }

    function rowPassesMarketFilter(row) {
        if (selectedMarkets.size === 0) return true;
        const keys = new Set();
        const marketKey = normalizeMarketKey(row?.market);
        if (marketKey) keys.add(marketKey);
        const sourceMarkets = Array.isArray(row?.source_markets) ? row.source_markets : [];
        for (const market of sourceMarkets) {
            const sourceKey = normalizeMarketKey(market);
            if (sourceKey) keys.add(sourceKey);
        }
        return [...keys].some((key) => selectedMarkets.has(key));
    }

    function rerenderOpportunityTables() {
        if (!currentData) return;
        renderSurebetTable(currentData.rows ?? [], currentData.bookmakers ?? []);
        renderMiddlebetTable(currentData.middlebets ?? []);
    }

    function markDeletedRecord(id, meta = {}) {
        const rid = (id ?? "").toString().trim();
        if (!rid) return;
        deletedRows.set(rid, {
            type: (meta.type ?? "row").toString(),
            value: Number.isFinite(meta.value) ? meta.value : null,
        });
    }

    function numberOrNull(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function deletedRecordStaysHidden(id, currentValue = null) {
        const rid = (id ?? "").toString().trim();
        if (!rid || !deletedRows.has(rid)) return false;

        const meta = deletedRows.get(rid) ?? {};
        const deletedValue = numberOrNull(meta.value);
        const valueNow = numberOrNull(currentValue);
        if (deletedValue !== null && valueNow !== null && valueNow > deletedValue) {
            deletedRows.delete(rid);
            saveDeletedRows();
            updateBKHint();
            return false;
        }
        return true;
    }

    function deleteOpportunityRecord(id, title, details, value, type) {
        const rid = (id ?? "").toString().trim();
        if (!rid) return;
        const ok = confirm(`Usunąć ${title}?\n\n${details}`);
        if (!ok) return;
        markDeletedRecord(rid, { type, value });
        saveDeletedRows();
        updateBKHint();
        rerenderOpportunityTables();
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

    function loadMarketPanelOpen() {
        try {
            return localStorage.getItem(MARKET_PANEL_OPEN_KEY) === "1";
        } catch {
            return false;
        }
    }

    function saveMarketPanelOpen(isOpen) {
        try {
            localStorage.setItem(MARKET_PANEL_OPEN_KEY, isOpen ? "1" : "0");
        } catch {
            // ignore localStorage errors
        }
    }

    function setMarketPanelOpen(isOpen) {
        if (!marketPanelBody || !marketToggle) return;
        marketPanelBody.classList.toggle('is-collapsed', !isOpen);
        marketToggle.textContent = isOpen ? 'Ukryj filtry' : 'Filtry rynków';
        marketToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        saveMarketPanelOpen(isOpen);
    }

    function marketGroupKey(market) {
        const value = (market ?? '').toString().toLowerCase();
        if (value.includes('goal') || value.includes('both teams to score') || value.includes('team to score')) return 'Gole';
        if (value.includes('card')) return 'Kartki';
        if (value.includes('corner')) return 'Różne';
        if (value.includes('shot')) return 'Strzały';
        if (value.includes('offside')) return 'Spalone';
        if (value.includes('foul')) return 'Faule';
        return 'Inne';
    }

    function marketGroupOrder(name) {
        const order = {
            'Gole': 0,
            'Kartki': 1,
            'Różne': 2,
            'Strzały': 3,
            'Spalone': 4,
            'Faule': 5,
            'Inne': 6,
        };
        return order[name] ?? 99;
    }

    function loadOpenMarketGroups() {
        try {
            const raw = localStorage.getItem(MARKET_GROUPS_LS_KEY);
            if (!raw) return new Set();
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
        } catch {
            return new Set();
        }
    }

    function saveOpenMarketGroups() {
        try {
            localStorage.setItem(MARKET_GROUPS_LS_KEY, JSON.stringify([...openMarketGroups]));
        } catch {
            // ignore localStorage errors
        }
    }

    function loadDeletedRows() {
        try {
            const raw = localStorage.getItem(DELETED_KEY);
            if (!raw) return new Map();
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Map();
            const entries = [];
            for (const item of arr) {
                if (typeof item === "string") {
                    entries.push([item, { type: "row", value: null }]);
                    continue;
                }
                if (!item || typeof item !== "object") continue;
                const id = (item.id ?? "").toString().trim();
                if (!id) continue;
                entries.push([
                    id,
                    {
                        type: (item.type ?? "row").toString(),
                        value: numberOrNull(item.value),
                    },
                ]);
            }
            return new Map(entries);
        } catch {
            return new Map();
        }
    }


    function saveDeletedRows() {
        const payload = [...deletedRows.entries()].map(([id, meta]) => ({
            id,
            type: meta?.type ?? "row",
            value: numberOrNull(meta?.value),
        }));
        localStorage.setItem(DELETED_KEY, JSON.stringify(payload));
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
                rerenderOpportunityTables();
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
        const grouped = new Map();

        for (const market of markets) {
            const groupName = marketGroupKey(market);
            if (!grouped.has(groupName)) grouped.set(groupName, []);
            grouped.get(groupName).push(market);
        }

        const orderedGroups = [...grouped.entries()].sort((a, b) => {
            const diff = marketGroupOrder(a[0]) - marketGroupOrder(b[0]);
            return diff !== 0 ? diff : a[0].localeCompare(b[0], 'pl');
        });

        const frag = document.createDocumentFragment();
        for (const [groupName, groupMarketsRaw] of orderedGroups) {
            const groupMarkets = [...groupMarketsRaw].sort((a, b) => marketLabelFromKey(a).localeCompare(marketLabelFromKey(b), 'pl'));
            const section = document.createElement('section');
            section.className = 'market-group';
            const isOpen = openMarketGroups.has(groupName);
            section.classList.toggle('is-collapsed', !isOpen);

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'market-group-toggle';
            toggle.textContent = groupName;

            const count = document.createElement('span');
            count.className = 'market-group-count';
            count.textContent = `${groupMarkets.filter((market) => selectedMarkets.has(market)).length}/${groupMarkets.length}`;
            toggle.appendChild(count);

            toggle.addEventListener('click', (event) => {
                event.stopPropagation();
                if (section.classList.contains('is-collapsed')) {
                    openMarketGroups = new Set([groupName]);
                    saveOpenMarketGroups();
                    renderMarketCheckboxes(allMarkets);
                } else {
                    section.classList.add('is-collapsed');
                    openMarketGroups.delete(groupName);
                    saveOpenMarketGroups();
                }
            });

            const body = document.createElement('div');
            body.className = 'market-group-body';
            const grid = document.createElement('div');
            grid.className = 'market-chip-grid';

            for (const market of groupMarkets) {
                const marketLabel = marketLabelFromKey(market);
                const label = document.createElement('label');
                label.className = 'market-chip';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'h-4 w-4';
                cb.checked = selectedMarkets.has(market);
                cb.addEventListener('change', () => {
                    if (cb.checked) selectedMarkets.add(market);
                    else selectedMarkets.delete(market);
                    saveSelectedMarkets();
                    renderMarketCheckboxes(allMarkets);
                    updateMarketHint();
                    applyFilter();
                    rerenderOpportunityTables();
                });

                const span = document.createElement('span');
                span.textContent = marketLabel;
                label.append(cb, span);
                grid.appendChild(label);
            }

            body.appendChild(grid);
            section.append(toggle, body);
            frag.appendChild(section);
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
            if (deletedRecordStaysHidden(rid)) continue;

            const tr = document.createElement("tr");
            tr.className = "border-t";
            tr.dataset.id = rid;
            const tdMatch = document.createElement("td");
            tdMatch.className = "p-2";
            tdMatch.textContent = row.match;

            const tdMarket = document.createElement("td");
            tdMarket.className = "p-2";
            tdMarket.dataset.col = "market";
            tdMarket.textContent = `${row.market ?? ""}${sourceMarketsLabel(row)}`;

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

                markDeletedRecord(rid, { type: "row", value: null });
                saveDeletedRows();
                rowModel.deleted = true;
                tr.remove();
                updateBKHint();
                applyFilter();
                rerenderOpportunityTables();
            });

            tdDelete.appendChild(btnDel);
            tr.appendChild(tdDelete);

            frag.appendChild(tr);
        }

        tbody.textContent = "";
        tbody.appendChild(frag);
        setupSortHeaders();
    }

    function renderSurebetTable(rows, bookmakers = []) {
        if (!surebetBody) return;
        const byId = new Map();

        for (const row of rows) {
            const rid = String(row.id ?? "");
            if (!rid) continue;
            if (deletedRecordStaysHidden(rid)) continue;
            for (const surebet of getRowSurebets(row)) {
                if ((surebet.surebet_type ?? "").toString() === "middle") continue;
                const sbId = (surebet.surebet_id ?? "").toString().trim();
                if (!sbId) continue;
                if (!byId.has(sbId)) {
                    byId.set(sbId, []);
                }
                byId.get(sbId).push({ row, surebet });
            }
        }

        const legSortWeight = (row) => {
            const desc = (row?.description ?? "").toString().trim().toLowerCase();
            const prefix = desc.split(/\s+/, 1)[0];
            const weights = {
                home: 0,
                "1": 0,
                draw: 1,
                x: 1,
                away: 2,
                "2": 2,
                over: 3,
                under: 4,
            };
            return [weights[prefix] ?? 99, desc];
        };

        const groups = [];
        for (const [id, groupEntriesRaw] of byId.entries()) {
            const groupEntries = [...groupEntriesRaw].sort((a, b) => {
                const [aw, ad] = legSortWeight(a.row);
                const [bw, bd] = legSortWeight(b.row);
                if (aw !== bw) return aw - bw;
                return ad.localeCompare(bd, 'pl');
            });
            if (groupEntries.length < 2) continue;
            if (!groupEntries.some((entry) => rowPassesMarketFilter(entry.row))) continue;

            const bestBookmakers = [...new Set(
                groupEntries
                    .map((entry) => (entry?.row?.best_bk ?? "").toString().trim())
                    .filter(Boolean)
            )];
            const passBookmakerFilter = selectedBestBK.size === 0
                ? true
                : bestBookmakers.length > 0 && bestBookmakers.every((bk) => selectedBestBK.has(bk));
            if (!passBookmakerFilter) continue;

            const maxVal = groupEntries.reduce((acc, entry) => {
                const v = Number.isFinite(entry?.surebet?.surebet_value) ? entry.surebet.surebet_value : NaN;
                if (!Number.isFinite(v)) return acc;
                return Number.isFinite(acc) ? Math.max(acc, v) : v;
            }, NaN);
            if (deletedRecordStaysHidden(id, maxVal)) continue;

            groups.push({
                id,
                entries: groupEntries,
                value: maxVal,
                match: (groupEntries[0]?.row?.match ?? "").toString(),
                market: (groupEntries[0]?.row?.market ?? "").toString(),
                period: (groupEntries[0]?.row?.period ?? "").toString(),
                surebetType: (groupEntries[0]?.surebet?.surebet_type ?? "").toString(),
                bestBookmakers,
            });
        }

        groups.sort((a, b) => {
            const av = Number.isFinite(a.value) ? a.value : -Infinity;
            const bv = Number.isFinite(b.value) ? b.value : -Infinity;
            return bv - av;
        });

        const frag = document.createDocumentFragment();
        if (tabSurebets) {
            tabSurebets.textContent = `Surebety (${groups.length})`;
        }

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
            group.entries.forEach((entry, index) => {
                const leg = entry.row;
                const tr = document.createElement("tr");
                tr.className = index === 0 ? "sb-group-start" : "sb-group-cont";

                if (index === 0) {
                    const tdVal = document.createElement("td");
                    tdVal.className = "text-right p-2 sb-group-meta";
                    tdVal.rowSpan = group.entries.length;
                    const pill = document.createElement("span");
                    pill.className = "sb-pill";
                    pill.textContent = Number.isFinite(group.value) ? fmtPct(group.value) : "—";
                    tdVal.appendChild(pill);

                    const tdMatch = document.createElement("td");
                    tdMatch.className = "p-2 sb-group-meta";
                    tdMatch.rowSpan = group.entries.length;
                    tdMatch.textContent = group.match;

                    if (group.bestBookmakers.length > 0) {
                        const meta = document.createElement("div");
                        meta.className = "sb-period";
                        meta.textContent = `Best: ${group.bestBookmakers.join(" + ")}`;
                        tdMatch.appendChild(meta);
                    }

                    const tdMarket = document.createElement("td");
                    tdMarket.className = "p-2 sb-group-meta";
                    tdMarket.rowSpan = group.entries.length;
                    const marketName = document.createElement("div");
                    marketName.textContent = group.surebetType === "surebet_cards_vs_yellow"
                        ? "cards vs yellow cards"
                        : group.market;
                    tdMarket.appendChild(marketName);
                    if (group.period) {
                        const period = document.createElement("div");
                        period.className = "sb-period";
                        period.textContent = group.period;
                        tdMarket.appendChild(period);
                    }

                    tr.append(tdVal, tdMatch, tdMarket);
                }

                const tdLeg = document.createElement("td");
                tdLeg.className = "p-2 sb-leg-cell";
                tdLeg.appendChild(renderSurebetLeg(leg, bookmakers));
                tr.appendChild(tdLeg);

                if (index === 0) {
                    const tdDelete = document.createElement("td");
                    tdDelete.className = "text-center p-2 sb-group-meta";
                    tdDelete.rowSpan = group.entries.length;

                    const btnDel = document.createElement("button");
                    btnDel.type = "button";
                    btnDel.title = "Usuń surebet";
                    btnDel.className = "btn-del text-red-600 hover:text-red-800 text-lg";
                    btnDel.textContent = "✖";
                    btnDel.addEventListener("click", () => {
                        deleteOpportunityRecord(
                            group.id,
                            "surebet",
                            `${group.match}\n${group.market}\nBest: ${group.bestBookmakers.join(" + ")}`,
                            group.value,
                            "surebet"
                        );
                    });

                    tdDelete.appendChild(btnDel);
                    tr.appendChild(tdDelete);
                }
                frag.appendChild(tr);
            });
        }

        surebetBody.textContent = "";
        surebetBody.appendChild(frag);
    }

    function renderSurebetLeg(row, bookmakers = []) {
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
        const bkName = (row.best_bk ?? "").toString();
        odds.textContent = `Best: ${bkName} ${o}`.trim();

        const oddsList = document.createElement("div");
        oddsList.className = "sb-odds-list";

        const allOdds = row.odds ?? {};
        const list = (bookmakers.length ? bookmakers : Object.keys(allOdds)).filter((bkName) => {
            return Number.isFinite(allOdds?.[bkName]);
        });

        if (list.length === 0) {
            const empty = document.createElement("span");
            empty.className = "sb-odds-item";
            empty.textContent = "Brak kursów";
            oddsList.appendChild(empty);
        } else {
            for (const bkName of list) {
                const v = allOdds[bkName];
                const item = document.createElement("div");
                item.className = "sb-odds-item";
                if ((row.best_bk ?? "").toString() === bkName) {
                    item.classList.add("is-best");
                }
                const name = document.createElement("span");
                name.className = "sb-odds-name";
                name.textContent = bkName;
                const val = document.createElement("span");
                val.className = "sb-odds-val";
                val.textContent = Number.isFinite(v) ? v.toFixed(2) : "—";
                item.append(name, val);
                oddsList.appendChild(item);
            }
        }

        wrap.append(desc, bk, odds, oddsList);
        return wrap;
    }


    function renderMiddlebetTable(middlebets = []) {
        if (!middlebetBody) return;
        const list = Array.isArray(middlebets) ? middlebets : [];
        const filtered = list.filter((row) => {
            const rid = (row?.id ?? "").toString().trim();
            if (rid && deletedRecordStaysHidden(rid, row?.roi_mid)) return false;
            if (!rowPassesMarketFilter(row)) return false;
            const bestBookmakers = [
                (row?.best_over_bk ?? "").toString().trim(),
                (row?.best_under_bk ?? "").toString().trim(),
            ].filter(Boolean);
            if (selectedBestBK.size === 0) return true;
            return bestBookmakers.length > 0 && bestBookmakers.every((bk) => selectedBestBK.has(bk));
        });
        const sorted = [...filtered].sort((a, b) => {
            const av = Number.isFinite(a?.roi_mid) ? a.roi_mid : -Infinity;
            const bv = Number.isFinite(b?.roi_mid) ? b.roi_mid : -Infinity;
            return bv - av;
        });

        const frag = document.createDocumentFragment();
        if (tabMiddlebets) {
            tabMiddlebets.textContent = `Middlebety (${sorted.length})`;
        }

        if (sorted.length === 0) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.className = "p-3 text-gray-600";
            td.colSpan = 6;
            td.textContent = "Brak middlebetów w danych.";
            tr.appendChild(td);
            frag.appendChild(tr);
            middlebetBody.textContent = "";
            middlebetBody.appendChild(frag);
            return;
        }

        for (const row of sorted) {
            const tr = document.createElement("tr");

            const tdVal = document.createElement("td");
            tdVal.className = "text-right p-2";
            const pill = document.createElement("span");
            pill.className = "sb-pill";
            pill.textContent = Number.isFinite(row.roi_mid) ? fmtPct(row.roi_mid) : "—";
            tdVal.appendChild(pill);
            if (Number.isFinite(row.roi_min)) {
                const sub = document.createElement("div");
                sub.className = "sb-sub sb-under";
                sub.textContent = `min: ${fmtPct(row.roi_min)}`;
                tdVal.appendChild(sub);
            }

            const tdMatch = document.createElement("td");
            tdMatch.className = "p-2";
            tdMatch.textContent = (row.match ?? "").toString();

            const tdMarket = document.createElement("td");
            tdMarket.className = "p-2";
            tdMarket.textContent = (row.market ?? "").toString();

            const tdOver = document.createElement("td");
            tdOver.className = "p-2";
            tdOver.appendChild(renderMiddlebetLeg(row, "over"));

            const tdUnder = document.createElement("td");
            tdUnder.className = "p-2";
            tdUnder.appendChild(renderMiddlebetLeg(row, "under"));

            const tdDelete = document.createElement("td");
            tdDelete.className = "text-center p-2";

            const btnDel = document.createElement("button");
            btnDel.type = "button";
            btnDel.title = "Usuń middlebet";
            btnDel.className = "btn-del text-red-600 hover:text-red-800 text-lg";
            btnDel.textContent = "✖";
            btnDel.addEventListener("click", () => {
                deleteOpportunityRecord(
                    row.id,
                    "middlebet",
                    `${row.match ?? ""}\n${row.market ?? ""}\n${row.over ?? ""} / ${row.under ?? ""}`,
                    row.roi_mid,
                    "middlebet"
                );
            });
            tdDelete.appendChild(btnDel);

            tr.append(tdVal, tdMatch, tdMarket, tdOver, tdUnder, tdDelete);
            frag.appendChild(tr);
        }

        middlebetBody.textContent = "";
        middlebetBody.appendChild(frag);
    }

    function renderMiddlebetLeg(row, side) {
        const wrap = document.createElement("div");
        wrap.className = "sb-leg";
        if (!row) {
            wrap.textContent = "—";
            return wrap;
        }

        const desc = document.createElement("div");
        desc.textContent = side === "over" ? (row.over ?? "").toString() : (row.under ?? "").toString();

        const bk = document.createElement("div");
        bk.className = "sb-bk";
        bk.textContent = side === "over" ? (row.best_over_bk ?? "").toString() : (row.best_under_bk ?? "").toString();

        const odds = document.createElement("div");
        odds.className = "sb-odds";
        const o = side === "over" ? row.over_odds : row.under_odds;
        const bkName = side === "over"
            ? (row.best_over_bk ?? "").toString()
            : (row.best_under_bk ?? "").toString();
        const oTxt = Number.isFinite(o) ? o.toFixed(2) : "—";
        odds.textContent = `Best: ${bkName} ${oTxt}`.trim();

        const oddsList = document.createElement("div");
        oddsList.className = "sb-odds-list";
        const allOdds = side === "over" ? (row.over_odds_by_bk ?? {}) : (row.under_odds_by_bk ?? {});
        const list = Object.keys(allOdds).filter((bkName) => Number.isFinite(allOdds?.[bkName]));

        if (list.length === 0) {
            const empty = document.createElement("span");
            empty.className = "sb-odds-item";
            empty.textContent = "Brak kursów";
            oddsList.appendChild(empty);
        } else {
            for (const bkName of list) {
                const v = allOdds[bkName];
                const item = document.createElement("div");
                item.className = "sb-odds-item";
                const bestBk = side === "over" ? (row.best_over_bk ?? "").toString() : (row.best_under_bk ?? "").toString();
                if (bestBk === bkName) item.classList.add("is-best");

                const name = document.createElement("span");
                name.className = "sb-odds-name";
                name.textContent = bkName;
                const val = document.createElement("span");
                val.className = "sb-odds-val";
                val.textContent = Number.isFinite(v) ? v.toFixed(2) : "—";
                item.append(name, val);
                oddsList.appendChild(item);
            }
        }

        wrap.append(desc, bk, odds, oddsList);
        return wrap;
    }

    function setActiveTab(tab) {
        if (!tabAll || !tabSurebets || !tabMiddlebets || !tabPaneAll || !tabPaneSurebets || !tabPaneMiddlebets) return;
        const isSurebets = tab === "surebets";
        const isMiddle = tab === "middlebets";
        const isAll = !isSurebets && !isMiddle;

        tabAll.classList.toggle("tab-active", isAll);
        tabSurebets.classList.toggle("tab-active", isSurebets);
        tabMiddlebets.classList.toggle("tab-active", isMiddle);

        tabAll.setAttribute("aria-pressed", isAll.toString());
        tabSurebets.setAttribute("aria-pressed", isSurebets.toString());
        tabMiddlebets.setAttribute("aria-pressed", isMiddle.toString());

        tabPaneAll.classList.toggle("is-hidden", !isAll);
        tabPaneSurebets.classList.toggle("is-hidden", !isSurebets);
        tabPaneMiddlebets.classList.toggle("is-hidden", !isMiddle);
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
        rerenderOpportunityTables();
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
            [...(data.rows ?? []), ...(data.middlebets ?? [])]
                .flatMap(r => [
                    normalizeMarketKey(r.market),
                    ...(Array.isArray(r.source_markets) ? r.source_markets.map(normalizeMarketKey) : []),
                ])
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'pl'));

        deletedRows = loadDeletedRows();
        selectedBestBK = loadSelectedBestBK(allBookmakers);
        selectedMarkets = loadSelectedMarkets(allMarkets);

        renderBookmakerCheckboxes(allBookmakers);
        renderMarketCheckboxes(allMarkets);
        renderTable(data);
        renderSurebetTable(data.rows ?? [], data.bookmakers ?? []);
        renderMiddlebetTable(data.middlebets ?? []);

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
        rerenderOpportunityTables();
    });

    bkNone.addEventListener("click", () => {
        selectedBestBK = new Set();
        saveSelectedBestBK();
        bkList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateBKHint();
        applyFilter();
        rerenderOpportunityTables();
    });

    bkRestoreDeleted.addEventListener("click", () => {
        const ok = confirm("Przywrócić WSZYSTKIE usunięte rekordy? (wyczyści localStorage)");
        if (!ok) return;
        deletedRows = new Map();
        localStorage.removeItem(DELETED_KEY);
        fullRerender();
    });

    marketAll.addEventListener("click", () => {
        selectedMarkets = new Set(allMarkets);
        saveSelectedMarkets();
        renderMarketCheckboxes(allMarkets);
        updateMarketHint();
        applyFilter();
        rerenderOpportunityTables();
    });

    marketNone.addEventListener("click", () => {
        selectedMarkets = new Set();
        saveSelectedMarkets();
        renderMarketCheckboxes(allMarkets);
        updateMarketHint();
        applyFilter();
        rerenderOpportunityTables();
    });

    openMarketGroups = loadOpenMarketGroups();

    if (marketToggle) {
        setMarketPanelOpen(loadMarketPanelOpen());
        marketToggle.addEventListener('click', () => {
            const isCollapsed = marketPanelBody?.classList.contains('is-collapsed');
            setMarketPanelOpen(!!isCollapsed);
        });
    }

    document.addEventListener('click', (event) => {
        if (!marketPanelBody || marketPanelBody.classList.contains('is-collapsed')) return;
        const clickedInsidePanel = event.target instanceof Element
            && (!!event.target.closest('#marketPanelBody') || !!event.target.closest('#marketToggle'));
        if (!clickedInsidePanel) {
            if (openMarketGroups.size > 0) {
                openMarketGroups.clear();
                saveOpenMarketGroups();
                renderMarketCheckboxes(allMarkets);
            }
        }
    });

    if (tabAll && tabSurebets) {
        setActiveTab("all");
        tabAll.addEventListener("click", () => setActiveTab("all"));
        tabSurebets.addEventListener("click", () => setActiveTab("surebets"));
        if (tabMiddlebets) {
            tabMiddlebets.addEventListener("click", () => setActiveTab("middlebets"));
        }
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
