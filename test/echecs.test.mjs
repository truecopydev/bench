import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELES, brasDe } from '../src/ia.mjs';
import { CLASSES, compter, lecturesFausses, lignesManquees } from '../src/echecs.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (...chemin) => JSON.parse(readFileSync(join(racine, ...chemin), 'utf8'));
const bras = MODELES.map(brasDe);

test('a missed row is one the judge does not find, in order', () => {
	const verite = [['1', '2'], ['3'], ['1', '2']];
	assert.deepEqual(lignesManquees(verite, ['1 2', '3', '1 2']), []);
	assert.deepEqual(lignesManquees(verite, ['1 2', '3 1 2']), [{ row: 1, numbers: '3' }, { row: 2, numbers: '1 2' }]);
	assert.deepEqual(lignesManquees(verite, ['3', '1 2']), [{ row: 1, numbers: '3' }, { row: 2, numbers: '1 2' }]);
});

test('the failed readings are those of the arms asked, piece by piece', () => {
	const verdicts = { b: { x: { juste: false }, y: { juste: true } }, a: { x: { juste: false }, y: { juste: false }, z: { juste: false } } };
	assert.deepEqual(lecturesFausses(verdicts, ['x', 'y']), [['a', 'x'], ['a', 'y'], ['b', 'x']]);
});

test('every failed reading of the last AI result has a class and a sentence, and no other reading has one', () => {
	const dernier = readdirSync(join(racine, 'resultats', 'ia')).filter((f) => f.endsWith('.json')).sort().pop();
	const { jour, verdicts } = json('resultats', 'ia', dernier);
	const liste = json('echecs-ia.json');
	assert.equal(liste.day, jour);
	assert.deepEqual(liste.failures.map((e) => [e.id, e.reader]), lecturesFausses(verdicts, bras));
	for (const e of liste.failures) {
		assert.ok(e.class in CLASSES, `${e.id} ${e.reader}: no class`);
		assert.ok(typeof e.what === 'string' && e.what.length > 20, `${e.id} ${e.reader}: no sentence`);
		assert.ok(e.missed.length > 0, `${e.id} ${e.reader}: no missed row`);
		assert.equal(e.missed.length, verdicts[e.id][e.reader].lignes - verdicts[e.id][e.reader].justes);
	}
	assert.deepEqual(liste.classes, CLASSES);
	assert.deepEqual(liste.counts, compter(liste.failures, bras));
});

test('the README gives the counts of the list', () => {
	const { counts } = json('echecs-ia.json');
	const readme = readFileSync(join(racine, 'README.md'), 'utf8');
	for (const b of bras) {
		const c = counts[b];
		const total = Object.values(c).reduce((a, n) => a + n, 0);
		assert.ok(readme.includes(`| ${b} | ${total} | ${c['wrong-number']} | ${c['row-cut']} | ${c['note-reference']} | ${c['outside-table']} |`), `README: the line of ${b} is not that of echecs-ia.json`);
	}
});
