#!/usr/bin/env node
/*
 * SET ASIDE the pieces whose published table writes numbers split by spaces
 * (src/morcele.mjs): their truth misses those numbers. Each one leaves pieces/
 * and is named in ecartees.json with its report and what was found.
 *
 *     npm run ecarter
 */

import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nombresMorceles } from '../src/morcele.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIECES = join(RACINE, 'pieces');
const LISTE = join(RACINE, 'ecartees.json');

const ecartees = JSON.parse(readFileSync(LISTE, 'utf8'));
const deja = new Set(ecartees.pieces.map((p) => p.id));
for (const f of readdirSync(PIECES).filter((f) => f.endsWith('.html')).sort()) {
	const id = f.slice(0, -5);
	const morceles = nombresMorceles(readFileSync(join(PIECES, f), 'utf8'));
	if (morceles.length === 0) continue;
	const { source } = JSON.parse(readFileSync(join(PIECES, `${id}.json`), 'utf8'));
	if (!deja.has(id)) ecartees.pieces.push({ id, rapport: source.rapport, sha256Page: source.sha256Page, splitNumbers: morceles.length, examples: morceles.slice(0, 3) });
	rmSync(join(PIECES, f));
	rmSync(join(PIECES, `${id}.json`));
	console.log(`${id} ${morceles.length}`);
}
ecartees.pieces.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(LISTE, JSON.stringify(ecartees, null, '\t') + '\n');
console.log(`${ecartees.pieces.length} pieces set aside, ${readdirSync(PIECES).filter((f) => f.endsWith('.json')).length} in the bench`);
