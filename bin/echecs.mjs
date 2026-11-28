#!/usr/bin/env node
/*
 * LIST the failed readings of the AI readers with the rows of the truth each
 * one misses, in echecs-ia.json. The class and the sentence of a failure are
 * written by hand in that file after looking at the print; this command keeps
 * them, adds a failure that has none yet (class null, which `npm test` refuses)
 * and drops one that is no longer a failure.
 *
 *     npm run echecs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { numericRow } from '../src/juge.mjs';
import { MODELES, brasDe } from '../src/ia.mjs';
import { CLASSES, compter, lecturesFausses, lignesManquees } from '../src/echecs.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LISTE = join(RACINE, 'echecs-ia.json');
const json = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));

const dernier = readdirSync(join(RACINE, 'resultats', 'ia')).filter((f) => f.endsWith('.json')).sort().pop();
const { jour, echantillon, verdicts } = json(join(RACINE, 'resultats', 'ia', dernier));
const bras = MODELES.map(brasDe);

const lectures = Object.fromEntries(
	bras.map((b) => [b, new Map(readFileSync(join(RACINE, 'lectures', `${b}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((l) => [l.id, l]))])
);
const dejaDit = new Map((existsSync(LISTE) ? json(LISTE).failures : []).map((e) => [`${e.id} ${e.reader}`, e]));

const failures = lecturesFausses(verdicts, bras).map(([id, reader]) => {
	const piece = json(join(RACINE, 'pieces', `${id}.json`));
	const lues = (lectures[reader].get(id)?.rows ?? []).map(numericRow).filter((r) => r.length > 0).map((r) => r.join(' '));
	const dit = dejaDit.get(`${id} ${reader}`);
	return { id, rapport: piece.source.rapport, reader, class: dit?.class ?? null, what: dit?.what ?? null, missed: lignesManquees(piece.verite.lignes, lues) };
});

const classees = failures.filter((e) => e.class !== null);
writeFileSync(LISTE, JSON.stringify({ day: jour, sample: echantillon, classes: CLASSES, counts: compter(classees, bras), failures }, null, '\t') + '\n');
console.log(`${failures.length} failed readings, ${failures.length - classees.length} without a class`);
