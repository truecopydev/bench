/*
 * A SPLIT NUMBER: a cell the report writes with spaces inside one number
 * (`6 4 5 ,13 7` for 645,137), as HTML converted from a PDF often does. The
 * print shows 645,137 but the report's machine-readable layer does not carry
 * that number, so the truth of the piece misses it: a reader that reads the
 * page right is judged wrong. Such a piece has no truth to judge against.
 */

import { canonique } from './juge.mjs';

const ANNEES = /^(19|20)\d\d (\d|(19|20)\d\d)$/;
const RENVOI = /^\d{1,2}(\.\d{1,2})?$/;

/**
 * Several note references in one cell (`12, 13`, `4 5`, `10.1 10.2`): not one
 * number, and not a split one. Bare integers with no comma between them are
 * references only when they go up and carry no sign: `(4 7)` and `43 1` are
 * numbers split in two.
 */
function sontDesRenvois(cellule) {
	const nu = cellule.replace(/^\((.*)\)$/, '$1');
	const jetons = nu.split(/\s?[,.]\s|\s/).filter(Boolean);
	if (jetons.length < 2 || !jetons.every((j) => RENVOI.test(j))) return false;
	if (/[,.]\s/.test(nu) || jetons.some((j) => j.includes('.'))) return true;
	return nu === cellule && jetons.every((j, i) => i === 0 || Number(j) > Number(jetons[i - 1]));
}

const texte = (html) =>
	html
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
		.replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ')
		.replace(/[\s -]+/g, ' ')
		.trim();

/** The text of every cell of the tables of a page, in order. */
export function cellulesPubliees(html) {
	return [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => texte(m[1]));
}

/** Whether a cell is not a number as written and becomes one once its spaces are removed. */
export function estMorcele(cellule) {
	if (!/\d/.test(cellule) || canonique(cellule) !== null) return false;
	if (sontDesRenvois(cellule) || ANNEES.test(cellule)) return false;
	return canonique(cellule.replace(/ /g, '')) !== null;
}

/** The split numbers of a published page. */
export function nombresMorceles(html) {
	return cellulesPubliees(html).filter(estMorcele);
}
