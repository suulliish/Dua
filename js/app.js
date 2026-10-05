/* ============================================================
   APP — tabs, 3D wheel of cards, gestures, start-up
   Uses data.js (duas), times.js (tab by time), progress.js (read counter, streak)
============================================================ */
let currentTabIndex = 0;
let unreadOnly = false;          // hide cards already read today
const AR_SCALES = [1, 1.15, 1.3, 0.88];   // Arabic text sizes the "Aa" button cycles through
let arScale = 1;
const STORE_KEY = 'dua-state-v1';
const wheelsState = {};

function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
}
function saveState() {
    try {
        const idx = {};
        tabsOrder.forEach(id => { if (wheelsState[id]) idx[id] = wheelsState[id].currentIndex; });
        localStorage.setItem(STORE_KEY, JSON.stringify({ tab: tabsOrder[currentTabIndex], idx, unreadOnly, arScale, date: todayStr() }));
    } catch (e) { /* storage unavailable: app works without it */ }
}

/* ============================================================
   TABS
============================================================ */
function updateNavFade() {
    const nav = document.querySelector('.nav-scroll');
    nav.classList.toggle('fade-l', nav.scrollLeft > 4);
    nav.classList.toggle('fade-r', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
}

function switchTab(tabId, instant) {
    currentTabIndex = tabsOrder.indexOf(tabId);
    document.querySelectorAll('.tab-btn').forEach(b => {
        const on = b.dataset.tab === tabId;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
        b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.dua-section').forEach(s => s.classList.toggle('active', s.id === tabId));
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) {
        const nav = document.querySelector('.nav-scroll');
        nav.scrollTo({ left: btn.offsetLeft - (nav.offsetWidth / 2) + (btn.offsetWidth / 2), behavior: instant ? 'auto' : 'smooth' });
    }
    if (wheelsState[tabId]) { updateWheel3D(tabId); refreshTabProgress(tabId); }
    saveState();
}

/* ============================================================
   CARD MARKUP
============================================================ */
function cardNum(i) { return i < 9 ? `0${i + 1}` : `${i + 1}`; }

// "перевод ✦ пояснение / дерек" → two parts, so the commentary can be styled apart
function splitNote(text) {
    const i = text.indexOf(' ✦ ');
    return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 3)];
}

function buildDuaCard(item, index) {
    const isLong  = item.arabic.length > 80;
    const isXLong = item.arabic.length > 200;
    const [meaning, note] = splitNote(item.translation);
    return `
        <div class="card-header">
            <div class="header-left">
                <span class="card-num">${cardNum(index)}</span>
                <span class="card-count">${item.count}</span>
            </div>
            <div class="card-title-wrap"><div class="card-title">${item.title}</div></div>
        </div>
        <div class="scroll-box">
            <div class="arabic-text ${isXLong ? 'xlong' : isLong ? 'long' : ''}" lang="ar" dir="rtl">${item.arabic}</div>
            <div class="card-footer">
                <div class="transcription-text">${item.transcription}</div>
                <div class="translation-text">${meaning}</div>
                ${note ? `<div class="dua-note">${note}</div>` : ''}
            </div>
        </div>`;
}

function buildSurasCard(item, index) {
    const surasHTML = item.suras.map((s, si) => `
        ${si > 0 ? '<hr class="surah-divider">' : ''}
        <div class="surah-label">${s.label}</div>
        <div class="arabic-text long" lang="ar" dir="rtl">${s.arabic}</div>
        <div class="surah-trans">${s.transcription}</div>
        <div class="surah-meaning">${s.translation}</div>
    `).join('');
    return `
        <div class="card-header">
            <div class="header-left">
                <span class="card-num">${cardNum(index)}</span>
                <span class="card-count">${item.count}</span>
            </div>
            <div class="card-title-wrap">
                <div class="card-title">${item.title}</div>
                ${item.note ? `<div class="card-subtitle">${item.note}</div>` : ''}
            </div>
        </div>
        <div class="scroll-box">${surasHTML}</div>`;
}

// every name is a row you can tap to mark as read
function buildNamesCard(item, index) {
    const namesHTML = item.names.map(n => `
        <div class="name-item" role="button" tabindex="0" aria-pressed="false">
            <span class="name-check" aria-hidden="true"></span>
            <div class="name-info">
                <div class="name-trans">${n.tr}</div>
                <div class="name-mean">${n.kk}</div>
            </div>
            <div class="name-ar" lang="ar" dir="rtl">${n.ar}</div>
        </div>`).join('');
    return `
        <div class="card-header">
            <div class="header-left">
                <span class="card-num">${cardNum(index)}</span>
                <span class="card-count">${item.count}</span>
            </div>
            <div class="card-title-wrap">
                <div class="card-title">${item.title}</div>
                <div class="card-subtitle">${item.subtitle}</div>
            </div>
        </div>
        <div class="scroll-box">
            <div class="names-list">${namesHTML}</div>
        </div>`;
}

/* ============================================================
   3D WHEEL
============================================================ */
// bottom fade only while there is more text below the visible part
function refreshMore(card) {
    const box = card.querySelector('.scroll-box');
    card.classList.toggle('has-more', box.scrollHeight - box.scrollTop - box.clientHeight > 4);
}

// indexes of the cards that take part in the wheel (all, or only the unread ones)
function visibleIndices(id) {
    const st = wheelsState[id];
    const all = st.elements.map((_, i) => i);
    if (!unreadOnly) return all;
    const shown = all.filter(i => i === st.currentIndex || !st.elements[i].classList.contains('done'));
    // everything is read: nothing to hide, show the whole tab
    return shown.length === 1 && st.elements[st.currentIndex].classList.contains('done') ? all : shown;
}

function updateProgress(position, total) {
    document.getElementById('progText').innerHTML = `<b>${position + 1}</b> / ${total}`;
}

function updateWheel3D(wheelId) {
    const state = wheelsState[wheelId];
    const vis = visibleIndices(wheelId);
    const total = vis.length;
    const curPos = Math.max(0, vis.indexOf(state.currentIndex));
    const cardH = state.elements[0].offsetHeight || 500;   // 0 while the tab is hidden
    const stepY = cardH * 0.26;
    state.elements.forEach((card, i) => {
        const pos = vis.indexOf(i);
        if (pos === -1) {   // read card hidden by the "unread only" filter
            card.style.opacity = 0;
            card.style.zIndex = 0;
            card.style.pointerEvents = 'none';
            card.classList.remove('is-active');
            card.setAttribute('aria-hidden', 'true');
            return;
        }
        let offset = pos - curPos;
        if (offset >  total / 2) offset -= total;
        if (offset < -total / 2) offset += total;

        if (offset === 0) {
            card.style.transform   = 'rotateX(0deg) translateZ(0px) translateY(0px)';
            card.style.opacity     = 1;
            card.style.filter      = 'brightness(1)';
            card.style.zIndex      = 10;
            card.style.pointerEvents = 'auto';
            card.classList.add('is-active');
            card.removeAttribute('aria-hidden');
            refreshMore(card);
        } else {
            const ty = offset * stepY;
            const tz = Math.abs(offset) * -100;
            const rx = offset * 24;
            card.style.transform   = `translateY(${ty}px) translateZ(${tz}px) rotateX(${rx}deg)`;
            card.style.opacity     = Math.max(0, 1 - Math.abs(offset) * 0.4);
            card.style.filter      = `brightness(${1 - Math.abs(offset) * 0.2})`;
            card.style.zIndex      = 10 - Math.abs(offset);
            card.style.pointerEvents = 'none';
            card.classList.remove('is-active');
            card.setAttribute('aria-hidden', 'true');
        }
    });
    if (tabsOrder[currentTabIndex] === wheelId) updateProgress(curPos, total);
}

function step(delta) {
    const id = tabsOrder[currentTabIndex];
    const st = wheelsState[id];
    if (!st || st.isAnimating) return;
    const vis = visibleIndices(id);
    if (vis.length < 2) return;
    const curPos = Math.max(0, vis.indexOf(st.currentIndex));
    st.isAnimating = true;
    st.currentIndex = vis[(curPos + delta + vis.length) % vis.length];
    st.elements[st.currentIndex].querySelector('.scroll-box').scrollTop = 0;   // read a card from its start
    updateWheel3D(id);
    saveState();
    setTimeout(() => { st.isAnimating = false; }, 400);
}
function goNext() { step(1); }
function goPrev() { step(-1); }

/* ============================================================
   SWIPE / SCROLL / KEYBOARD
============================================================ */
// can this box still scroll in the given direction (dy > 0 = down)?
function canScroll(box, dy) {
    if (!box || box.scrollHeight <= box.clientHeight + 1) return false;
    return dy > 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0;
}

function setupGlobalSwipes() {
    let startX = 0, startY = 0, box = null, startTop = 0, ignore = false;
    let wheelLock = 0, lastBoxScroll = 0;

    document.addEventListener('wheel', e => {
        if (!e.target.closest('.content-area')) return;
        const b = e.target.closest('.scroll-box');
        const now = Date.now();
        // text still scrolls: let it (and swallow the trackpad inertia tail so it does not flip the card)
        if (canScroll(b, e.deltaY)) { lastBoxScroll = now; return; }
        if (b && now - lastBoxScroll < 250) return;
        e.preventDefault();
        if (now < wheelLock || Math.abs(e.deltaY) < 8) return;
        wheelLock = now + 450;
        if (e.deltaY > 0) goNext(); else goPrev();
    }, { passive: false });

    document.addEventListener('touchstart', e => {
        ignore = !!e.target.closest('.nav-scroll, .controls, .card-action');   // scrolling the tab strip is not a swipe between tabs
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        box = e.target.closest('.scroll-box');
        startTop = box ? box.scrollTop : 0;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (ignore) return;
        const diffX = startX - e.changedTouches[0].clientX;
        const diffY = startY - e.changedTouches[0].clientY;

        if (Math.abs(diffX) > Math.abs(diffY) * 1.5 && Math.abs(diffX) > 50) {
            if (diffX > 0 && currentTabIndex < tabsOrder.length - 1) switchTab(tabsOrder[currentTabIndex + 1]);
            if (diffX < 0 && currentTabIndex > 0)                     switchTab(tabsOrder[currentTabIndex - 1]);
            return;
        }
        if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 40) {
            // inside a long card the swipe scrolls the text; it flips the card only from the text's end/start
            if (box && box.scrollTop !== startTop) return;
            if (box && diffY > 0 && box.scrollTop + box.clientHeight < box.scrollHeight - 1) return;
            if (box && diffY < 0 && box.scrollTop > 0) return;
            if (diffY > 0) goNext(); else goPrev();
        }
    }, { passive: true });

    document.addEventListener('keydown', e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const tabIdx = currentTabIndex;
        switch (e.key) {
            case 'ArrowDown': case 'PageDown': e.preventDefault(); goNext(); break;
            case 'ArrowUp':   case 'PageUp':   e.preventDefault(); goPrev(); break;
            case 'ArrowRight': if (tabIdx < tabsOrder.length - 1) switchTab(tabsOrder[tabIdx + 1]); break;
            case 'ArrowLeft':  if (tabIdx > 0)                     switchTab(tabsOrder[tabIdx - 1]); break;
        }
    });
}

/* ============================================================
   START-UP
============================================================ */
let wakeLock = null;   // keeps the screen on while reading
async function keepAwake() {
    try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    } catch (e) { /* not allowed right now: ignore */ }
}

function applyArScale() {
    document.documentElement.style.setProperty('--ar', arScale);
    const btn = document.getElementById('btnSize');
    if (btn) btn.classList.toggle('on', arScale !== 1);
}

function initAllWheels() {
    const saved = loadState();
    const sameDay = saved.date === todayStr();   // a new day starts from the first card
    unreadOnly = !!saved.unreadOnly;
    if (AR_SCALES.includes(saved.arScale)) arScale = saved.arScale;
    applyArScale();
    loadProgress();
    loadStreak();
    document.body.classList.add('no-anim');

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.innerHTML = `<span class="tab-label">${b.textContent.trim()}</span><span class="tab-count"></span>`;
    });

    tabsOrder.forEach(id => {
        const container = document.getElementById(`wheel-${id}`);
        const total = fullDatabase[id].length;
        const savedIdx = sameDay && saved.idx && Number.isInteger(saved.idx[id]) ? saved.idx[id] : 0;
        wheelsState[id] = { currentIndex: savedIdx >= 0 && savedIdx < total ? savedIdx : 0, isAnimating: false, elements: [] };

        fullDatabase[id].forEach((item, index) => {
            const card = document.createElement('div');
            card.className = `glass-card ${item.theme}`;

            if      (item.type === 'dua')   card.innerHTML = buildDuaCard(item, index);
            else if (item.type === 'suras') card.innerHTML = buildSurasCard(item, index);
            else if (item.type === 'names') card.innerHTML = buildNamesCard(item, index);

            card.querySelector('.scroll-box').addEventListener('scroll', () => refreshMore(card), { passive: true });
            attachAction(card, id, index, item);
            container.appendChild(card);
            wheelsState[id].elements.push(card);
        });
    });

    const filterBtn = document.getElementById('btnFilter');
    const syncFilterBtn = () => { filterBtn.classList.toggle('on', unreadOnly); filterBtn.setAttribute('aria-pressed', unreadOnly); };
    filterBtn.addEventListener('click', () => {
        unreadOnly = !unreadOnly;
        syncFilterBtn();
        updateWheel3D(tabsOrder[currentTabIndex]);
        saveState();
    });
    syncFilterBtn();

    document.getElementById('btnSize').addEventListener('click', () => {
        arScale = AR_SCALES[(AR_SCALES.indexOf(arScale) + 1) % AR_SCALES.length];
        applyArScale();
        updateWheel3D(tabsOrder[currentTabIndex]);   // text height changed: refresh the "more below" fade
        saveState();
    });

    document.querySelector('.nav-scroll').addEventListener('scroll', updateNavFade, { passive: true });
    document.getElementById('btnNext').addEventListener('click', goNext);
    document.getElementById('btnPrev').addEventListener('click', goPrev);
    setupGlobalSwipes();
    tabsOrder.forEach(refreshTabProgress);
    updateStreak();

    // opens on the tab of the prayer that is current in Өскемен; without the time table: where you stopped
    loadPrayerTimes().then(() => {
        const start = tabByTime() || (tabsOrder.includes(saved.tab) ? saved.tab : 'fajr');
        switchTab(start, true);
        updateNavFade();
    });

    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkNewDay();
            keepAwake();
            if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) {   // away for a while: the prayer has probably changed
                const t = tabByTime();
                if (t) switchTab(t);
            }
        } else {
            hiddenAt = Date.now();
            if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
        }
    });
    keepAwake();
    document.addEventListener('pointerup', keepAwake, { once: true });   // some iOS versions want a tap first

    // layout depends on fonts and window size: re-measure when they change
    const remeasure = () => { updateWheel3D(tabsOrder[currentTabIndex]); updateNavFade(); };
    window.addEventListener('resize', remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));
}

initAllWheels();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
