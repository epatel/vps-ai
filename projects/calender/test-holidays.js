#!/usr/bin/env node
/**
 * Test the Swedish holiday / ISO-week math in index.html.
 *
 *   node projects/calender/test-holidays.js
 *
 * The functions are extracted straight out of index.html so there is no
 * duplicated copy of the logic to drift out of sync.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Everything from the holiday helpers up to (but not including) the storage
// section is pure logic with no DOM dependencies.
const from = script.indexOf("function easterSunday");
const to = script.indexOf(" * Storage");
if (from < 0 || to < 0) {
    console.error("Could not locate the holiday section in index.html");
    process.exit(1);
}
const logic = script.slice(from, script.lastIndexOf("/*", to));

const ctx = { module: {}, console };
vm.createContext(ctx);
vm.runInContext(logic + "\n;this.api = { easterSunday, swedishHolidays, isoWeek, key };", ctx);
const { swedishHolidays, isoWeek } = ctx.api;

let failures = 0;
const check = (label, got, want) => {
    if (got !== want) { failures++; console.log(`  FAIL ${label}: got ${got}, want ${want}`); }
};

/* Reference dates from the Swedish almanac. */
const EXPECTED = {
    2023: { "Påskdagen": "2023-04-09", "Kristi himmelsfärdsdag": "2023-05-18", "Pingstdagen": "2023-05-28", "Midsommardagen": "2023-06-24", "Alla helgons dag": "2023-11-04" },
    2024: { "Påskdagen": "2024-03-31", "Kristi himmelsfärdsdag": "2024-05-09", "Pingstdagen": "2024-05-19", "Midsommardagen": "2024-06-22", "Alla helgons dag": "2024-11-02" },
    2025: { "Påskdagen": "2025-04-20", "Kristi himmelsfärdsdag": "2025-05-29", "Pingstdagen": "2025-06-08", "Midsommardagen": "2025-06-21", "Alla helgons dag": "2025-11-01" },
    2026: { "Påskdagen": "2026-04-05", "Kristi himmelsfärdsdag": "2026-05-14", "Pingstdagen": "2026-05-24", "Midsommardagen": "2026-06-20", "Alla helgons dag": "2026-10-31" },
    2027: { "Påskdagen": "2027-03-28", "Kristi himmelsfärdsdag": "2027-05-06", "Pingstdagen": "2027-05-16", "Midsommardagen": "2027-06-26", "Alla helgons dag": "2027-11-06" },
    2030: { "Påskdagen": "2030-04-21", "Kristi himmelsfärdsdag": "2030-05-30", "Pingstdagen": "2030-06-09", "Midsommardagen": "2030-06-22", "Alla helgons dag": "2030-11-02" },
};

console.log("Swedish holidays");
for (const year of Object.keys(EXPECTED)) {
    const table = swedishHolidays(+year);
    const dateOf = name => Object.entries(table).find(([, v]) => v.sv === name)?.[0];
    for (const [name, want] of Object.entries(EXPECTED[year])) {
        check(`${year} ${name}`, dateOf(name), want);
    }
    // 13 official red days per year that are not simply "every Sunday".
    check(`${year} red-day count`, Object.values(table).filter(v => v.red).length, 13);
    // Midsummer Day and All Saints' Day always fall on a Saturday.
    for (const name of ["Midsommardagen", "Alla helgons dag"]) {
        const [Y, M, D] = dateOf(name).split("-").map(Number);
        check(`${year} ${name} is a Saturday`, new Date(Y, M - 1, D).getDay(), 6);
    }
    // Eves sit exactly one day before their holiday.
    const eves = [["Midsommarafton", "Midsommardagen"], ["Allhelgonaafton", "Alla helgons dag"], ["Påskafton", "Påskdagen"]];
    for (const [eve, day] of eves) {
        const e = new Date(...dateOf(eve).split("-").map((n, i) => i === 1 ? n - 1 : +n));
        const h = new Date(...dateOf(day).split("-").map((n, i) => i === 1 ? n - 1 : +n));
        check(`${year} ${eve} is the day before ${day}`, (h - e) / 86400000, 1);
    }
}

console.log("ISO week numbers");
const WEEKS = [
    ["2026-01-01", 1], ["2027-01-01", 53], ["2025-12-29", 1],
    ["2024-12-30", 1], ["2026-06-15", 25], ["2021-01-01", 53], ["2020-12-31", 53],
];
for (const [d, want] of WEEKS) {
    const [Y, M, D] = d.split("-").map(Number);
    check(`week of ${d}`, isoWeek(new Date(Y, M - 1, D)), want);
}

console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
