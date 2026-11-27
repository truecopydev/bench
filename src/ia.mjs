/*
 * THE AI READERS: a vision model is shown the PNG render of the same printed
 * PDF the other readers get, and asked for the rows. The instruction and the
 * schema are fixed here and never tuned per document.
 *
 * A model call costs money and is not deterministic, so these readers read a
 * fixed SAMPLE of the bench (`echantillon`), every reading is kept with the
 * model identifier that answered and the day it did, and a later run only
 * reads what is missing.
 */

import { createHash } from 'node:crypto';

/** The aliases a run may name, as the Claude Code CLI knows them. */
export const MODELES = ['haiku', 'sonnet', 'opus'];

export const brasDe = (modele) => `claude-${modele}`;

export const SCHEMA = {
	type: 'object',
	properties: {
		rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
		confidence: { type: 'number' }
	},
	required: ['rows', 'confidence'],
	additionalProperties: false
};

export const consigne = (fichiers) => `Read these page images with the Read tool, in order: ${fichiers.join(', ')}.
They are the pages of ONE financial table. Transcribe the table: one array per printed row, top to bottom, each cell as a string exactly as printed (keep the number formatting, parentheses and signs; an empty cell is ""). Include header rows.
Then give "confidence": your probability, from 0 to 1, that EVERY number in your transcription is exactly right and sits in the right row.
Answer with the JSON object only.`;

/**
 * The sample the AI readers read: the `n` pieces whose sha256 of the id sorts
 * first. No reader and no result had a say in it, anyone can recompute it, and
 * a larger `n` keeps every piece of a smaller one.
 */
export function echantillon(ids, n) {
	const cle = (id) => createHash('sha256').update(id).digest('hex');
	return [...ids].sort((a, b) => cle(a).localeCompare(cle(b))).slice(0, n);
}

/** An outage (session, quota): the piece stays unread and a later run takes it. */
export class Panne extends Error {}

const jsonDe = (texte) => {
	try {
		return JSON.parse(String(texte).replace(/^\s*```(json)?|```\s*$/g, '').trim());
	} catch {
		return null;
	}
};

/** The model that answered: of the identifiers the CLI billed, the one that wrote the most. */
export function modeleQuiARepondu(enveloppe) {
	const usages = Object.entries(enveloppe.modelUsage ?? {});
	if (usages.length === 0) return null;
	return usages.sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0][0];
}

/**
 * The reading carried by the output of `claude -p --output-format json`. An
 * answer that came back without rows is a READING FAILURE, kept and judged
 * wrong like a local reader that returns nothing; an envelope in error is a
 * `Panne`, kept nowhere.
 */
export function lectureDeLaCli(stdout) {
	let enveloppe;
	try {
		enveloppe = JSON.parse(stdout);
	} catch {
		throw new Panne('the CLI printed no JSON envelope');
	}
	if (enveloppe.is_error) throw new Panne(String(enveloppe.result).slice(0, 200));
	const model = modeleQuiARepondu(enveloppe);
	const reponse = enveloppe.structured_output ?? jsonDe(enveloppe.result);
	if (!Array.isArray(reponse?.rows)) return { rows: [], error: 'answer without rows', model };
	return {
		rows: reponse.rows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])),
		confidence: Math.max(0, Math.min(1, Number(reponse.confidence) || 0)),
		model
	};
}

/** Run `f` over `elements`, `n` at a time. */
export async function parPaquets(elements, n, f) {
	const file = [...elements];
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (file.length) await f(file.shift());
		})
	);
}

const unique = (valeurs) => [...new Set(valeurs.filter(Boolean))].sort();

/** What the readings of one AI reader say of themselves: the model identifiers that answered, the days they did. */
export function provenance(lectures) {
	return { models: unique(lectures.map((l) => l.model)), days: unique(lectures.map((l) => l.day)) };
}

/** The sample table of the README, best reader first. */
export function tableauEchantillon({ pieces, resume, versions }) {
	const lignes = [
		`The ${pieces} pieces of the sample, every reader judged on the same ones.`,
		'',
		'| reader | version | read on | tables right | rows right | nothing read | given reliable | wrong among reliable |',
		'| --- | --- | --- | --- | --- | --- | --- | --- |'
	];
	const ordre = Object.entries(resume).sort((a, b) => b[1].right - a[1].right || b[1].rowsRightPct - a[1].rowsRightPct);
	for (const [outil, r] of ordre) {
		const v = versions[outil];
		const fiable = r.givenReliable === undefined ? ['-', '-'] : [`${r.givenReliable}`, `${r.wrongAmongReliablePct} %`];
		lignes.push(`| ${outil} | ${v.version} | ${v.readOn} | ${r.right} / ${r.tables} (${r.rightPct} %) | ${r.rowsRightPct} % | ${r.nothingRead ?? 0} | ${fiable.join(' | ')} |`);
	}
	return lignes.join('\n');
}

/** Replace the AI section of a README with a new table. */
export function remplacerEchantillon(readme, tableau) {
	return readme.replace(/<!-- ai:start -->[\s\S]*<!-- ai:end -->/, `<!-- ai:start -->\n${tableau}\n<!-- ai:end -->`);
}
