/*
 * Read pieces with a Python witness, a fresh process per lot, and keep what
 * each lot read on disk at once: a lot that dies (docling's peak on a wide
 * table, a host short of memory) costs that lot, not the hours before it, and
 * the next run resumes after the pieces already read.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** The readings already on disk, one JSON object per line; nothing when the file is absent or empty. */
export function lecturesGardees(fichier) {
	if (!existsSync(fichier)) return [];
	return readFileSync(fichier, 'utf8')
		.split('\n')
		.filter((l) => l.startsWith('{"id"'))
		.map((l) => JSON.parse(l));
}

/** Only the JSON lines of this bench: a witness like docling prints its own lines on stdout too. */
export function lignesLues(sortie) {
	return sortie
		.split('\n')
		.filter((l) => l.startsWith('{"id"'))
		.map((l) => JSON.parse(l));
}

/**
 * Read `pieces` by lots of `taille` with `lire(lot) -> readings`, writing
 * `fichier` after every lot. With `reprendre`, the pieces already in `fichier`
 * are not read again; without it a replay reads everything, as a bench must.
 * Returns every reading, in the order of `pieces`.
 */
export function lireParLots(pieces, { taille, lire, fichier, reprendre = false, surLot = () => {} }) {
	const gardees = new Map(reprendre ? lecturesGardees(fichier).map((l) => [l.id, l]) : []);
	const restantes = pieces.filter((p) => !gardees.has(p.id));
	for (let debut = 0; debut < restantes.length; debut += taille) {
		const lot = restantes.slice(debut, debut + taille);
		for (const lecture of lire(lot)) gardees.set(lecture.id, lecture);
		const lectures = pieces.filter((p) => gardees.has(p.id)).map((p) => gardees.get(p.id));
		writeFileSync(fichier, lectures.map((l) => JSON.stringify(l)).join('\n') + '\n');
		surLot(Math.min(debut + taille, restantes.length), restantes.length);
	}
	return pieces.filter((p) => gardees.has(p.id)).map((p) => gardees.get(p.id));
}
