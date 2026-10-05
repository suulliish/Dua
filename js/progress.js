/* ============================================================
   PROGRESS — what is read today (resets at midnight) and the day streak
   Needs from app.js: tabsOrder, wheelsState, currentTabIndex, step, updateWheel3D
============================================================ */
const PROGRESS_KEY = 'dua-progress-v1';
const STREAK_KEY = 'dua-streak-v1';
let progress = { date: '', c: {}, m: {} };   // c: "tab:card" → taps; m: "tab:card" → indexes of names already read
let streakDays = [];                         // days on which at least one whole tab was read

function todayStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function loadProgress() {
    try {
        const p = JSON.parse(localStorage.getItem(PROGRESS_KEY));
        if (p && p.date === todayStr() && p.c) { progress = { date: p.date, c: p.c, m: p.m || {} }; return; }
    } catch (e) { /* fall through to a fresh day */ }
    progress = { date: todayStr(), c: {}, m: {} };
}
function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { /* works without storage */ }
}
function loadStreak() {
    try { const s = JSON.parse(localStorage.getItem(STREAK_KEY)); streakDays = Array.isArray(s) ? s : []; } catch (e) { streakDays = []; }
}
function saveStreak() {
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(streakDays.slice(-400))); } catch (e) { /* works without storage */ }
}

// "3 рет" → 3; anything else ("Намаздан кейін", "Көп рет", "Оқу") → one tick
function targetOf(count) {
    const m = /^(\d+)\s*рет$/.exec((count || '').trim());
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

/* ---------- one card ---------- */
function cardKey(card) { return `${card._act.id}:${card._act.index}`; }

function cardCount(card) {
    const { kind, target } = card._act;
    const key = cardKey(card);
    return kind === 'names' ? (progress.m[key] || []).length : Math.min(progress.c[key] || 0, target);
}

function refreshAction(card) {
    const { kind, target } = card._act;
    const c = cardCount(card);
    const done = c >= target;
    card.classList.toggle('done', done);
    card.querySelector('.act-fill').style.width = `${(c / target) * 100}%`;
    let label;
    if (kind === 'names')   label = done ? `✓ ${target} / ${target}` : `${c} / ${target} · бәрін оқыдым`;
    else if (target === 1)  label = done ? '✓ Оқылды' : 'Оқыдым';
    else                    label = done ? `✓ ${c} / ${target}` : `${c} / ${target}`;
    card.querySelector('.act-label').textContent = label;
    card.querySelector('.act-undo').hidden = c === 0;
    if (kind === 'names') {
        const read = new Set(progress.m[cardKey(card)] || []);
        card.querySelectorAll('.name-item').forEach((row, i) => {
            row.classList.toggle('read', read.has(i));
            row.setAttribute('aria-pressed', read.has(i));
        });
    }
}

function tabDoneCount(id) { return wheelsState[id].elements.filter(c => c.classList.contains('done')).length; }

function refreshTabProgress(id) {
    const total = wheelsState[id].elements.length;
    const done = tabDoneCount(id);
    const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
    if (btn) {
        btn.classList.toggle('complete', done === total);
        btn.querySelector('.tab-count').textContent = `${done}/${total}`;
    }
    if (tabsOrder[currentTabIndex] === id) document.getElementById('progFill').style.width = `${(done / total) * 100}%`;
}

// everything that must follow a change of one card
function commit(card, wasDone) {
    const id = card._act.id;
    saveProgress();
    refreshAction(card);
    refreshTabProgress(id);
    updateStreak();
    if (tabsOrder[currentTabIndex] === id) updateWheel3D(id);
    if (card.classList.contains('done') && !wasDone) {
        const btn = card.querySelector('.act-main');
        btn.classList.add('pulse');
        setTimeout(() => btn.classList.remove('pulse'), 800);
        autoAdvance(card);
    }
}

// after the last tick of a card, slide to the next one by itself
function autoAdvance(card) {
    setTimeout(() => {
        const id = card._act.id;
        const st = wheelsState[id];
        if (tabsOrder[currentTabIndex] !== id) return;
        if (st.elements[st.currentIndex] !== card || !card.classList.contains('done')) return;
        if (tabDoneCount(id) === st.elements.length) return;   // tab finished: stay on the last card
        step(1);
    }, 550);
}

function bumpCount(card, delta) {
    const key = cardKey(card);
    const wasDone = card.classList.contains('done');
    const before = progress.c[key] || 0;
    const c = Math.max(0, Math.min(card._act.target, before + delta));
    if (c === before) return;
    if (c === 0) delete progress.c[key]; else progress.c[key] = c;
    commit(card, wasDone);
}

function toggleName(card, i) {
    const key = cardKey(card);
    const wasDone = card.classList.contains('done');
    const set = new Set(progress.m[key] || []);
    if (set.has(i)) set.delete(i); else set.add(i);
    if (set.size === 0) delete progress.m[key]; else progress.m[key] = [...set].sort((a, b) => a - b);
    commit(card, wasDone);
}

function setAllNames(card, on) {
    const key = cardKey(card);
    const wasDone = card.classList.contains('done');
    if (on) progress.m[key] = Array.from({ length: card._act.target }, (_, i) => i); else delete progress.m[key];
    commit(card, wasDone);
}

function attachAction(card, id, index, item) {
    const kind = item.type === 'names' ? 'names' : 'count';
    card._act = { id, index, kind, target: kind === 'names' ? item.names.length : targetOf(item.count) };
    const row = document.createElement('div');
    row.className = 'card-action';
    row.innerHTML = `<button class="act-undo" type="button" aria-label="${kind === 'names' ? 'Белгілерді тазалау' : 'Бір санау азайту'}" hidden>−</button>
        <button class="act-main" type="button"><span class="act-fill"></span><span class="act-label"></span></button>`;
    const main = row.querySelector('.act-main');
    const undo = row.querySelector('.act-undo');
    if (kind === 'names') {
        main.addEventListener('click', () => setAllNames(card, true));
        undo.addEventListener('click', () => setAllNames(card, false));
        card.querySelectorAll('.name-item').forEach((el, i) => {
            el.addEventListener('click', () => toggleName(card, i));
            el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleName(card, i); } });
        });
    } else {
        main.addEventListener('click', () => bumpCount(card, 1));
        undo.addEventListener('click', () => bumpCount(card, -1));
    }
    card.appendChild(row);
    refreshAction(card);
}

/* ---------- streak: a day counts when at least one whole tab was read ---------- */
function updateStreak() {
    const anyTabDone = tabsOrder.some(id => tabDoneCount(id) === wheelsState[id].elements.length);
    const today = todayStr();
    const has = streakDays.includes(today);
    if (anyTabDone && !has) { streakDays.push(today); streakDays.sort(); saveStreak(); }
    else if (!anyTabDone && has) { streakDays = streakDays.filter(d => d !== today); saveStreak(); }
    renderStreak();
}

function streakLength() {
    const days = new Set(streakDays);
    const d = new Date();
    if (!days.has(todayStr(d))) d.setDate(d.getDate() - 1);   // today is not read yet: the streak is still alive through yesterday
    let n = 0;
    while (days.has(todayStr(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
}

function renderStreak() {
    const n = streakLength();
    const el = document.getElementById('streakText');
    el.textContent = n > 0 ? `Серия: ${n} күн` : '';
    el.classList.toggle('lit', streakDays.includes(todayStr()));
}

// the page may stay open overnight: start a clean day when it comes back to the foreground
function checkNewDay() {
    if (progress.date === todayStr()) return;
    progress = { date: todayStr(), c: {}, m: {} };
    saveProgress();
    tabsOrder.forEach(id => { wheelsState[id].elements.forEach(refreshAction); refreshTabProgress(id); });
    updateStreak();
    updateWheel3D(tabsOrder[currentTabIndex]);
}
