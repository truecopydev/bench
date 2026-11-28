import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Panne, echantillon, lectureDeLaCli, modeleQuiARepondu, parPaquets, provenance, remplacerEchantillon, tableauEchantillon } from '../src/ia.mjs';

const ids = Array.from({ length: 50 }, (_, i) => `esef-${i}`);

test('the sample does not depend on the order of the pieces, and a larger one keeps the smaller', () => {
	const dix = echantillon(ids, 10);
	assert.deepEqual(echantillon([...ids].reverse(), 10), dix);
	assert.deepEqual(echantillon(ids, 20).slice(0, 10), dix);
	assert.equal(new Set(dix).size, 10);
	assert.notDeepEqual(dix, ids.slice(0, 10));
});

const enveloppe = (corps) => JSON.stringify({ is_error: false, modelUsage: { 'claude-haiku-9': { outputTokens: 12 }, 'claude-sonnet-9': { outputTokens: 900 } }, ...corps });

test('a reading keeps its rows as strings, its confidence bounded, and the model that wrote the answer', () => {
	const lu = lectureDeLaCli(enveloppe({ structured_output: { rows: [['Revenue', 12], 'alone'], confidence: 1.4 } }));
	assert.deepEqual(lu, { rows: [['Revenue', '12'], ['alone']], confidence: 1, model: 'claude-sonnet-9' });
	assert.deepEqual(lectureDeLaCli(enveloppe({ result: '```json\n{"rows":[["1"]],"confidence":0.5}\n```' })).rows, [['1']]);
});

test('an answer without rows is a reading failure, kept and empty; an envelope in error is an outage', () => {
	assert.deepEqual(lectureDeLaCli(enveloppe({ result: 'I cannot read this image.' })), { rows: [], error: 'answer without rows', model: 'claude-sonnet-9' });
	assert.throws(() => lectureDeLaCli(JSON.stringify({ is_error: true, result: 'usage limit reached' })), Panne);
	assert.throws(() => lectureDeLaCli('not json'), Panne);
	assert.equal(modeleQuiARepondu({}), null);
});

test('readings are made a few at a time, each exactly once', async () => {
	let enCours = 0;
	let pic = 0;
	const faits = [];
	await parPaquets([1, 2, 3, 4, 5, 6, 7], 3, async (x) => {
		pic = Math.max(pic, ++enCours);
		await new Promise((r) => setTimeout(r, 2));
		faits.push(x);
		enCours--;
	});
	assert.equal(pic, 3);
	assert.deepEqual(faits.sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test('the sample table ranks the readers by tables right and says which model read, and when', () => {
	assert.deepEqual(provenance([{ model: 'm-2', day: '2026-11-27' }, { model: 'm-1', day: '2026-11-27' }, { day: '2026-11-28' }]), { models: ['m-1', 'm-2'], days: ['2026-11-27', '2026-11-28'] });
	const tableau = tableauEchantillon({
		pieces: 4,
		versions: { truecopy: { version: '2.0.14', readOn: '2026-10-21' }, 'claude-opus': { version: 'm-1', readOn: '2026-11-27' } },
		resume: {
			truecopy: { tables: 4, right: 1, rightPct: 25, rowsRightPct: 70, nothingRead: 0, givenReliable: 2, wrongAmongReliablePct: 50 },
			'claude-opus': { tables: 4, right: 3, rightPct: 75, rowsRightPct: 99, nothingRead: 0 }
		}
	});
	const lignes = tableau.split('\n');
	assert.equal(lignes[0], 'The 4 pieces of the sample, every reader judged on the same ones.');
	assert.equal(lignes[4], '| claude-opus | m-1 | 2026-11-27 | 3 / 4 (75 %) | 99 % | 0 | - | - |');
	assert.equal(lignes[5], '| truecopy | 2.0.14 | 2026-10-21 | 1 / 4 (25 %) | 70 % | 0 | 2 | 50 % |');
	assert.equal(remplacerEchantillon('a\n<!-- ai:start -->\nold\n<!-- ai:end -->\nb', 'new'), 'a\n<!-- ai:start -->\nnew\n<!-- ai:end -->\nb');
});

test('a model named gpt- is read through the Codex CLI and keeps its own name as reader', async () => {
	const { brasDe, parCodex } = await import('../src/ia.mjs');
	assert.equal(parCodex('gpt-9-x'), true);
	assert.equal(parCodex('opus'), false);
	assert.equal(brasDe('gpt-9-x'), 'gpt-9-x');
	assert.equal(brasDe('opus'), 'claude-opus');
});

test('both CLIs get the same instruction after its first sentence', async () => {
	const { consigne, consigneJointe } = await import('../src/ia.mjs');
	const suite = (texte) => texte.slice(texte.indexOf('Transcribe the table'));
	assert.equal(suite(consigneJointe(2)), suite(consigne(['a.png', 'b.png'])));
	assert.ok(consigneJointe(1).startsWith('The 1 attached image is the page of ONE financial table.'));
	assert.ok(consigneJointe(2).startsWith('The 2 attached images are, in order, the pages of ONE financial table.'));
});

test('the reading of the Codex CLI is the last message of a completed turn', async () => {
	const { lectureDeCodex, Panne } = await import('../src/ia.mjs');
	const lignes = (...evenements) => evenements.map((e) => JSON.stringify(e)).join('\n');
	const message = (text) => ({ type: 'item.completed', item: { type: 'agent_message', text } });
	const fini = { type: 'turn.completed', usage: {} };
	assert.deepEqual(lectureDeCodex(lignes({ type: 'turn.started' }, message('{"rows":[["Revenue","12"]],"confidence":0.9}'), fini), 'gpt-9-x'), { rows: [['Revenue', '12']], confidence: 0.9, model: 'gpt-9-x' });
	assert.deepEqual(lectureDeCodex(lignes(message('I cannot read this image.'), fini), 'gpt-9-x'), { rows: [], error: 'answer without rows', model: 'gpt-9-x' });
	assert.throws(() => lectureDeCodex(lignes({ type: 'turn.started' }, { type: 'error', message: 'usage limit reached' }), 'gpt-9-x'), (e) => e instanceof Panne && e.message === 'usage limit reached');
	assert.throws(() => lectureDeCodex('', 'gpt-9-x'), Panne);
});
