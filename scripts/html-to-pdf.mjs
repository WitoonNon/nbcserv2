/**
 * Render one of the HTML documents in docs/ to a PDF beside it.
 *
 *   node scripts/html-to-pdf.mjs docs/NBC-QT-2024-053-Stock-System-TH.html
 *
 * Uses whichever Chrome or Edge is already on the machine rather than pulling
 * a second Chromium down as a dependency — the only thing needed here is the
 * print pipeline, and every Windows box has one.
 *
 * The Thai fonts come from Google Fonts over the network and are subset into
 * the PDF, so the file opens correctly on a machine that has neither font
 * installed. That matters: these documents get forwarded to the client's
 * accountant, not just read here.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const input = process.argv[2];
if (!input) { console.error('ใช้: node scripts/html-to-pdf.mjs <ไฟล์.html>'); process.exit(1); }
if (!existsSync(input)) { console.error('ไม่พบไฟล์: ' + input); process.exit(1); }

const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) { console.error('ไม่พบ Chrome หรือ Edge ในเครื่อง'); process.exit(1); }

const src = resolve(input).split(String.fromCharCode(92)).join('/');
const out = src.replace(/\.html$/i, '.pdf');

execFileSync(browser, [
  '--headless', '--disable-gpu', '--no-sandbox',
  // Fonts load over the network; without a budget the PDF can render before
  // they arrive and silently fall back to a face with no Thai glyphs.
  '--virtual-time-budget=20000',
  '--print-to-pdf-no-header',
  `--print-to-pdf=${out}`,
  `file:///${src}`,
], { stdio: 'pipe' });

const pdf = readFileSync(out).toString('latin1');
const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
const embedded = pdf.includes('/FontFile2') || pdf.includes('/FontFile3');
console.log(`✓ ${out}`);
console.log(`  ${(statSync(out).size / 1024).toFixed(0)} KB · ${pages} หน้า · ฟอนต์ ${embedded ? 'ฝังครบ' : '🔴 ไม่ได้ฝัง'}`);
