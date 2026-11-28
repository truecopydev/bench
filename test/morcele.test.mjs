import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cellulesPubliees, estMorcele, nombresMorceles } from '../src/morcele.mjs';

const racine = join(import.meta.dirname, '..');

test('a number written with spaces inside is split, whatever its separators', () => {
	for (const c of ['6 4 5 ,13 7', '629, 643', '(5 78 ,2 73)', '3,960, 000', '−1 8', '1253 089', '154.73 0', '4 1,1', '2,3 3', '(4 7)', '(8 8)', '43 1', '(61 6)', '3 ,233']) assert.ok(estMorcele(c), c);
});

test('a number, a text, several note references and a year with its footnote mark are not split numbers', () => {
	for (const c of ['645,137', '1 253 089', '(2,573)', '12 %', 'Goodwill', '', '-', '12, 13', '(7, 11)', '8 , 14', '7. 5', '4 5', '12 14', '(10.1 10.2)', '6.3 8', '13 2.1', '(9, 14 17)', '11, 12 13', '10 11 4.3', '2023 1', '2025 2024', 'Note 4 and 5']) assert.ok(!estMorcele(c), c);
});

test('the cells of a page are read without their markup', () => {
	const html = '<table><tr><th class="a">Assets</th><td><span>6 4 5</span>&nbsp;,13 7</td><td>629,643</td></tr></table>';
	assert.deepEqual(cellulesPubliees(html), ['Assets', '6 4 5 ,13 7', '629,643']);
	assert.deepEqual(nombresMorceles(html), ['6 4 5 ,13 7']);
});

test('no piece of the bench writes a split number, and a piece set aside is no longer in it', () => {
	const pieces = readdirSync(join(racine, 'pieces'));
	for (const f of pieces.filter((f) => f.endsWith('.html'))) assert.deepEqual(nombresMorceles(readFileSync(join(racine, 'pieces', f), 'utf8')), [], f);
	const { pieces: ecartees } = JSON.parse(readFileSync(join(racine, 'ecartees.json'), 'utf8'));
	assert.ok(ecartees.length > 0);
	for (const e of ecartees) assert.ok(!pieces.includes(`${e.id}.json`) && e.examples.length > 0 && e.rapport.startsWith('https://'), e.id);
});
