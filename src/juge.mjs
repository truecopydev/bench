/*
 * THE JUDGE, shared by every arm and borrowed from none of them: what a table
 * number is, and when a row reads right. truecopy is one of the arms measured,
 * so the judge cannot use its notation.
 *
 * A row of the truth (the numbers of one <tr> of the published iXBRL table,
 * canonical form) must be found, IN ORDER, as a read row carrying exactly the
 * same sequence of numbers. A merged column, a split number, a lost row or a
 * deformed digit makes the row miss.
 */

const BLANCS = /[\s    ]+/g;
const TIRETS = /^[-−–—]+$/;
const GROUPE = /^\d{1,3}(?:[ .,'’]\d{3})*(?:[.,]\d+)?$|^\d+(?:[.,]\d+)?$/;

/**
 * The number of a cell in canonical form (sign and digits, no leading zeros), or
 * `null` when the cell is not ONE number. A cell carrying two (two columns merged
 * into one) is not a number: that is exactly the fault the bench must see.
 */
export function canonique(cellule) {
	let t = String(cellule ?? '').replace(BLANCS, ' ').trim();
	if (t === '' || TIRETS.test(t.replace(/ /g, ''))) return null;
	t = t.replace(/\s*(%|€|EUR|k€|M€|\$)\s*$/i, '').replace(/^\s*(€|\$)\s*/, '').replace(/\*+$/, '').trim();
	let negatif = false;
	if (/^\(.*\)$/.test(t)) {
		negatif = true;
		t = t.slice(1, -1).trim();
	}
	if (/^[-−–+]/.test(t)) {
		negatif = t[0] !== '+';
		t = t.slice(1).trim();
	}
	if (/[-−]$/.test(t)) {
		negatif = true;
		t = t.slice(0, -1).trim();
	}
	if (!GROUPE.test(t)) return null;
	const chiffres = t.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
	return (negatif && /[1-9]/.test(chiffres) ? '-' : '') + chiffres;
}

/** The numbers of a row, in order; cells that are not one are skipped. */
export function numericRow(cellules) {
	return cellules.map(canonique).filter((v) => v !== null);
}

/** Score a reading against the truth: rows right, and whether the whole table is right. */
export function noter(verite, rowsLues) {
	const lues = rowsLues.map(numericRow).filter((r) => r.length > 0).map((r) => r.join(' '));
	let curseur = 0;
	let justes = 0;
	for (const ligne of verite) {
		const cle = ligne.join(' ');
		const at = lues.indexOf(cle, curseur);
		if (at !== -1) {
			justes++;
			curseur = at + 1;
		}
	}
	return { lignes: verite.length, justes, juste: justes === verite.length };
}
