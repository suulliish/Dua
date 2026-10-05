/* ============================================================
   PRAYER TIMES — Өскемен, official table of DUMK (muftyat.kz)
   Decides which tab fits "right now", so the app opens where you pray.
============================================================ */
const PRAYER_TZ = 'Asia/Almaty';
let prayerTimes = null;   // { "2026": { "10-05": [fajr, sunrise, dhuhr, asr, maghrib, isha] } }, minutes after midnight

function loadPrayerTimes() {
    return fetch('data/times-oskemen.json')
        .then(r => r.json())
        .then(j => { prayerTimes = j.years; })
        .catch(() => { prayerTimes = null; });   // no table: the app simply opens on the last tab
}

// current calendar day and minute of the day in Өскемен, whatever the phone's own time zone is
function almatyNow() {
    const p = {};
    new Intl.DateTimeFormat('en-CA', {
        timeZone: PRAYER_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return { day: new Date(Date.UTC(+p.year, +p.month - 1, +p.day)), minute: +p.hour * 60 + +p.minute };
}

function timesOn(dayUTC) {
    if (!prayerTimes) return null;
    const mm = String(dayUTC.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dayUTC.getUTCDate()).padStart(2, '0');
    const year = prayerTimes[dayUTC.getUTCFullYear()];
    return (year && year[`${mm}-${dd}`]) || null;
}

// Fajr→Dhuhr: fajr · Dhuhr→Asr: dhuhr · Asr→Maghrib: asr · Maghrib→Isha: maghrib
// Isha→last third of the night: isha · last third of the night→Fajr: tahajjud
function tabByTime() {
    const now = almatyNow();
    const today = timesOn(now.day);
    if (!today) return null;
    const [fajr, , dhuhr, asr, maghrib, isha] = today;
    const m = now.minute;
    if (m >= fajr && m < dhuhr)    return 'fajr';
    if (m >= dhuhr && m < asr)     return 'dhuhr';
    if (m >= asr && m < maghrib)   return 'asr';
    if (m >= maghrib && m < isha)  return 'maghrib';

    // night runs from Maghrib to the next Fajr; its last third is the time of tahajjud
    let nightStart, nightEnd;
    if (m >= isha) {
        const tomorrow = timesOn(new Date(now.day.getTime() + 864e5));
        nightStart = maghrib;
        nightEnd = 1440 + (tomorrow ? tomorrow[0] : fajr);
    } else {
        const yesterday = timesOn(new Date(now.day.getTime() - 864e5));
        nightStart = (yesterday ? yesterday[4] : maghrib) - 1440;
        nightEnd = fajr;
    }
    return m >= nightStart + (nightEnd - nightStart) * 2 / 3 ? 'tahajjud' : 'isha';
}
