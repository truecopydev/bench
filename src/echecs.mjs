/*
 * WHAT A FAILURE IS MADE OF. The judge says a table is wrong as soon as one row
 * of the truth is not read as the same sequence of numbers. That holds a wrong
 * digit and a row cut differently as the same fault. A person who looked at the
 * print of each failed reading says which one it is; the class is a judgement,
 * so it is kept beside the rows it was made on and anyone can contest it.
 */

/** The classes a failed reading falls in, most serious first. */
export const CLASSES = {
	'wrong-number': 'A printed number is read as another one, or a number that is not printed is written.',
	'row-cut': 'Every number is right. The report prints one entry on two or three lines (a wrapped label, two staggered lines) and the reader wrote it as one row.',
	'note-reference': 'Every table number is right. A note number or a footnote call is fused to its label, or split from it, unlike the published table.',
	'outside-table': 'Every table number is right. The truth carries a number that is not in the table (a page number) and the reader left it out.'
};

/** The rows of the truth a reading misses, with the judge's own walk (src/juge.mjs). */
export function lignesManquees(verite, lues) {
	const manquees = [];
	let curseur = 0;
	verite.forEach((ligne, rang) => {
		const at = lues.indexOf(ligne.join(' '), curseur);
		if (at === -1) manquees.push({ row: rang, numbers: ligne.join(' ') });
		else curseur = at + 1;
	});
	return manquees;
}

/** The failed readings of the given arms, as [id, arm] pairs in a stable order. */
export function lecturesFausses(verdicts, bras) {
	return Object.keys(verdicts)
		.sort()
		.flatMap((id) => bras.filter((b) => verdicts[id][b] && !verdicts[id][b].juste).map((b) => [id, b]));
}

/** How many failed readings each arm has in each class. */
export function compter(echecs, bras) {
	const compte = Object.fromEntries(bras.map((b) => [b, Object.fromEntries(Object.keys(CLASSES).map((c) => [c, 0]))]));
	for (const e of echecs) compte[e.reader][e.class]++;
	return compte;
}
