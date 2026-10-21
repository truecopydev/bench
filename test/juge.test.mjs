import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonique, noter } from '../src/juge.mjs';
import { resumer } from '../src/resume.mjs';

test('a cell is ONE number or none', () => {
	assert.equal(canonique('1 234'), '1234');
	assert.equal(canonique('(1,234)'), '-1234');
	assert.equal(canonique('12.5 %'), '125');
	assert.equal(canonique('1,234 56'), null);
	assert.equal(canonique('-'), null);
});

test('a row reads right only with the same numbers, in order', () => {
	const verite = [['1234', '5678'], ['-12', '0']];
	assert.deepEqual(noter(verite, [['Revenue', '1 234', '5 678'], ['Tax', '(12)', '0']]), { lignes: 2, justes: 2, juste: true });
	assert.deepEqual(noter(verite, [['Revenue', '1 234 5 678'], ['Tax', '(12)', '0']]).juste, false);
	assert.equal(noter(verite, [['Tax', '(12)', '0'], ['Revenue', '1 234', '5 678']]).justes, 1);
});

test('the summary counts the wrong readings an arm gave as reliable', () => {
	const r = resumer({ a: { t: { juste: false, lignes: 2, justes: 1, fiable: true } }, b: { t: { juste: true, lignes: 2, justes: 2, fiable: true } } }, ['t']);
	assert.equal(r.t.wrongAmongReliablePct, 50);
	assert.equal(r.t.rowsRightPct, 75);
	assert.equal(r.t.nothingRead, 0);
});

test('the summary counts the pages where an arm read nothing at all', () => {
	const r = resumer({ a: { t: { juste: false, lignes: 2, justes: 0, vide: true } }, b: { t: { juste: true, lignes: 2, justes: 2 } } }, ['t']);
	assert.equal(r.t.nothingRead, 1);
	assert.equal(r.t.rightPct, 50);
});

test('the README table is rewritten between its markers, nothing else', async () => {
	const { remplacerResultats, tableauMarkdown } = await import('../src/resume.mjs');
	const t = tableauMarkdown({ jour: 'd', versions: { t: '1' }, banc: { chrome: 'C', plateforme: 'p' }, resume: { t: { tables: 2, right: 1, rightPct: 50, rowsRightPct: 75, nothingRead: 1 } } });
	assert.match(t, /\| t \| 1 \| 1 \/ 2 \(50 %\) \| 75 % \| 1 \| - \| - \|/);
	assert.equal(remplacerResultats('a\n<!-- results:start -->\nold\n<!-- results:end -->\nb', 'new'), 'a\n<!-- results:start -->\nnew\n<!-- results:end -->\nb');
});
