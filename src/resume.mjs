/**
 * The per-arm summary of a replay: tables read right, rows read right, pages
 * where the arm read nothing at all (no table found where there is one), and
 * for an arm that says when it doubts (truecopy's findings), how many of the
 * readings it gave as reliable were wrong - the number the bench exists for.
 */
export function resumer(verdicts, outils) {
	const resume = {};
	for (const outil of outils) {
		const v = Object.values(verdicts).map((p) => p[outil]).filter(Boolean);
		const justes = v.filter((x) => x.juste).length;
		const lignes = v.reduce((s, x) => s + x.lignes, 0);
		const lignesJustes = v.reduce((s, x) => s + x.justes, 0);
		const ligne = { tables: v.length, right: justes, rightPct: pct(justes, v.length), rowsRightPct: pct(lignesJustes, lignes), nothingRead: v.filter((x) => x.vide).length };
		if (v.some((x) => 'fiable' in x)) {
			const fiables = v.filter((x) => x.fiable);
			ligne.givenReliable = fiables.length;
			ligne.wrongAmongReliablePct = pct(fiables.filter((x) => !x.juste).length, fiables.length);
		}
		resume[outil] = ligne;
	}
	return resume;
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);

/** The results table of the README, as Markdown, from one replay. */
export function tableauMarkdown({ jour, versions, banc, resume }) {
	const lignes = [
		`Replay of ${jour}, ${banc.chrome ?? 'Chromium'}, ${banc.plateforme}.`,
		'',
		'| reader | version | tables right | rows right | nothing read | given reliable | wrong among reliable |',
		'| --- | --- | --- | --- | --- | --- | --- |'
	];
	for (const [outil, r] of Object.entries(resume)) {
		const fiable = r.givenReliable === undefined ? ['-', '-'] : [`${r.givenReliable}`, `${r.wrongAmongReliablePct} %`];
		lignes.push(`| ${outil} | ${versions[outil]} | ${r.right} / ${r.tables} (${r.rightPct} %) | ${r.rowsRightPct} % | ${r.nothingRead ?? 0} | ${fiable.join(' | ')} |`);
	}
	return lignes.join('\n');
}

/** Replace the results section of a README with a new table. */
export function remplacerResultats(readme, tableau) {
	return readme.replace(/<!-- results:start -->[\s\S]*<!-- results:end -->/, `<!-- results:start -->\n${tableau}\n<!-- results:end -->`);
}
