#!/usr/bin/env node
/*
 * REPLAY THE WHOLE BENCH, with nothing but this repository.
 *
 *     npm run rejouer -- --chrome /usr/bin/chromium
 *     npm run rejouer -- --outils truecopy,pdftotext --limite 50
 *
 * 1. prints each published table (pieces/<id>.html) to PDF with ONE headless
 *    Chrome driven over DevTools, into cache/pdf (not versioned);
 * 2. reads each PDF with every arm: truecopy (readTable, default options),
 *    pdftotext -layout (poppler, resolved by its banner), pdfplumber and camelot
 *    (temoins/temoins.py, settings fixed there);
 * 3. scores every reading with src/juge.mjs against the truth of the piece;
 * 4. writes lectures/<arm>.jsonl (the rows read) and resultats/<day>.json
 *    (versions, banners, per-piece verdicts, per-arm summary).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { noter } from '../src/juge.mjs';
import { imprimerParLots, ouvrirImprimante } from '../src/imprimer.mjs';
import { poppler, versionPdftotext } from '../src/poppler.mjs';
import { remplacerResultats, resumer, tableauMarkdown } from '../src/resume.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const opt = (nom, defaut) => {
	const i = process.argv.indexOf(`--${nom}`);
	return i === -1 ? defaut : process.argv[i + 1];
};
const OUTILS = opt('outils', 'truecopy,pdftotext,pdfplumber,camelot').split(',');
const CHROME = opt('chrome', process.env.CHROME ?? 'chromium');
const CACHE = opt('cache', join(RACINE, 'cache'));
const PYTHON = opt('python', process.env.PYTHON ?? 'python3');
const LIMITE = Number(opt('limite', 1e9));

const pdfDe = (id) => join(CACHE, 'pdf', `${id}.pdf`);
const banniere = (cmd, args) => {
	try {
		return execFileSync(cmd, args, { encoding: 'utf8', timeout: 60_000 }).trim().split(/\r?\n/)[0];
	} catch {
		return null;
	}
};

function lirePieces() {
	const dossier = join(RACINE, 'pieces');
	return readdirSync(dossier)
		.filter((f) => f.endsWith('.json'))
		.sort()
		.slice(0, LIMITE)
		.map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')));
}

/** Print what is missing, a fresh browser every hundred pages: a long-lived headless Chrome dies quietly. */
async function imprimer(ids) {
	mkdirSync(join(CACHE, 'pdf'), { recursive: true });
	const manquants = ids.filter((id) => !existsSync(pdfDe(id)));
	const travaux = manquants.map((id) => ({ url: pathToFileURL(join(RACINE, 'pieces', `${id}.html`)).href, sortie: pdfDe(id) }));
	const echecs = await imprimerParLots(travaux, () => ouvrirImprimante({ chrome: CHROME, profil: join(CACHE, 'chrome') }));
	if (echecs.length) throw new Error(`printing failed twice: ${echecs.map((e) => e.sortie).join(', ')}`);
	return manquants.length;
}

async function lireTruecopy(pieces) {
	const { readTable } = await import('truecopy');
	const out = [];
	for (const p of pieces) {
		const table = await readTable(new File([readFileSync(pdfDe(p.id))], 'table.pdf', { type: 'application/pdf' }));
		out.push({ id: p.id, rows: table.rows, findings: table.findings.map((f) => f.code) });
	}
	return out;
}

function lirePdftotext(pieces) {
	return pieces.map((p) => {
		const texte = poppler('pdftotext', ['-layout', '-enc', 'UTF-8', pdfDe(p.id), '-'], { encoding: 'utf8', timeout: 60_000 });
		const rows = texte
			.split(/\r?\n/)
			.filter((l) => l.trim() !== '')
			.map((l) => l.trim().split(/\s{2,}/));
		return { id: p.id, rows };
	});
}

function lirePython(outil, pieces) {
	const liste = join(CACHE, `liste-${outil}.txt`);
	writeFileSync(liste, pieces.map((p) => `${p.id}\t${pdfDe(p.id)}`).join('\n') + '\n');
	const sortie = execFileSync(PYTHON, [join(RACINE, 'temoins', 'temoins.py'), outil, liste], { encoding: 'utf8', maxBuffer: 1 << 30, timeout: 4 * 3600_000 });
	return sortie.trim().split('\n').map((l) => JSON.parse(l));
}

const VERSIONS = {
	truecopy: () => JSON.parse(readFileSync(join(RACINE, 'node_modules', 'truecopy', 'package.json'), 'utf8')).version,
	pdftotext: () => versionPdftotext(),
	pdfplumber: () => banniere(PYTHON, [join(RACINE, 'temoins', 'temoins.py'), 'pdfplumber', '--version']),
	camelot: () => banniere(PYTHON, [join(RACINE, 'temoins', 'temoins.py'), 'camelot', '--version'])
};
const LECTEURS = { truecopy: lireTruecopy, pdftotext: lirePdftotext, pdfplumber: (p) => lirePython('pdfplumber', p), camelot: (p) => lirePython('camelot', p) };

async function main() {
	const pieces = lirePieces();
	const imprimes = await imprimer(pieces.map((p) => p.id));
	console.log(`${pieces.length} pieces, ${imprimes} printed`);
	const jour = new Date().toISOString().slice(0, 10);
	mkdirSync(join(RACINE, 'lectures'), { recursive: true });
	mkdirSync(join(RACINE, 'resultats'), { recursive: true });
	const verites = new Map(pieces.map((p) => [p.id, p.verite.lignes]));
	const verdicts = {};
	const versions = {};
	for (const outil of OUTILS) {
		versions[outil] = VERSIONS[outil]();
		const lectures = await LECTEURS[outil](pieces);
		writeFileSync(join(RACINE, 'lectures', `${outil}.jsonl`), lectures.map((l) => JSON.stringify(l)).join('\n') + '\n');
		for (const l of lectures) {
			const n = noter(verites.get(l.id), l.rows);
			verdicts[l.id] ??= {};
			verdicts[l.id][outil] = { juste: n.juste, lignes: n.lignes, justes: n.justes, ...(l.findings ? { fiable: l.findings.length === 0 } : {}), ...(l.error ? { erreur: true } : {}) };
		}
		console.log(`${outil} ${versions[outil]} read`);
	}
	const banc = { chrome: banniere(CHROME, ['--version']), node: process.version, plateforme: `${process.platform} ${process.arch}` };
	const resume = resumer(verdicts, OUTILS);
	const fichier = join(RACINE, 'resultats', `${jour}.json`);
	writeFileSync(fichier, JSON.stringify({ jour, pieces: pieces.length, versions, banc, resume, verdicts }, null, '\t') + '\n');
	const readme = join(RACINE, 'README.md');
	writeFileSync(readme, remplacerResultats(readFileSync(readme, 'utf8'), tableauMarkdown({ jour, versions, banc, resume })));
	console.table(resume);
	console.log(`-> ${fichier}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
