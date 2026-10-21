#!/usr/bin/env node
/*
 * REPLAY THE WHOLE BENCH, with nothing but this repository.
 *
 *     npm run rejouer -- --chrome /usr/bin/chromium
 *     npm run rejouer -- --outils truecopy,pdftotext --limite 50
 *     npm run rejouer -- --python .venv/bin/python --python-docling .venv-docling/bin/python
 *     npm run rejouer -- --reprendre   (after a death: the Python witnesses skip what lectures/ already holds)
 *     npm run rejouer -- --juger       (judge again what lectures/ holds, from the last replay: no printing, no reading)
 *
 * 1. prints each published table (pieces/<id>.html) to PDF with ONE headless
 *    Chrome driven over DevTools, into cache/pdf (not versioned);
 * 2. reads each PDF with every arm: truecopy (readTable, default options),
 *    pdftotext -layout (poppler, resolved by its banner), pdfplumber, camelot
 *    and docling (temoins/temoins.py, settings fixed there; docling lives in its
 *    own environment, temoins/requirements-docling.txt);
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
import { lecturesGardees, lignesLues, lireParLots } from '../src/temoins.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const opt = (nom, defaut) => {
	const i = process.argv.indexOf(`--${nom}`);
	return i === -1 ? defaut : process.argv[i + 1];
};
const OUTILS = opt('outils', 'truecopy,pdftotext,pdfplumber,camelot,docling').split(',');
const CHROME = opt('chrome', process.env.CHROME ?? 'chromium');
const CACHE = opt('cache', join(RACINE, 'cache'));
const PYTHON = opt('python', process.env.PYTHON ?? 'python3');
const PYTHON_DOCLING = opt('python-docling', process.env.PYTHON_DOCLING ?? PYTHON);
const pythonDe = (outil) => (outil === 'docling' ? PYTHON_DOCLING : PYTHON);
const LIMITE = Number(opt('limite', 1e9));
const REPRENDRE = process.argv.includes('--reprendre');
const JUGER = process.argv.includes('--juger');

const pdfDe = (id) => join(CACHE, 'pdf', `${id}.pdf`);
const fichierLectures = (outil) => join(RACINE, 'lectures', `${outil}.jsonl`);
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

/** A fresh process every LOT_PYTHON pieces, each lot kept on disk as soon as it is read (src/temoins.mjs). */
const LOT_PYTHON = Number(process.env.LOT_PYTHON) || 100;

function lirePython(outil, pieces) {
	const liste = join(CACHE, `liste-${outil}.txt`);
	const lire = (lot) => {
		writeFileSync(liste, lot.map((p) => `${p.id}\t${pdfDe(p.id)}`).join('\n') + '\n');
		return lignesLues(execFileSync(pythonDe(outil), [join(RACINE, 'temoins', 'temoins.py'), outil, liste], { encoding: 'utf8', maxBuffer: 1 << 30, timeout: 4 * 3600_000 }));
	};
	return lireParLots(pieces, { taille: LOT_PYTHON, lire, fichier: fichierLectures(outil), reprendre: REPRENDRE, surLot: (n, total) => console.log(`  ${outil} ${n}/${total}`) });
}

const VERSIONS = {
	truecopy: () => JSON.parse(readFileSync(join(RACINE, 'node_modules', 'truecopy', 'package.json'), 'utf8')).version,
	pdftotext: () => versionPdftotext(),
	pdfplumber: () => banniere(PYTHON, [join(RACINE, 'temoins', 'temoins.py'), 'pdfplumber', '--version']),
	camelot: () => banniere(PYTHON, [join(RACINE, 'temoins', 'temoins.py'), 'camelot', '--version']),
	docling: () => banniere(PYTHON_DOCLING, [join(RACINE, 'temoins', 'temoins.py'), 'docling', '--version'])
};
const LECTEURS = { truecopy: lireTruecopy, pdftotext: lirePdftotext, pdfplumber: (p) => lirePython('pdfplumber', p), camelot: (p) => lirePython('camelot', p), docling: (p) => lirePython('docling', p) };

/** Score one reading: rows right, and what the reader said of it (nothing at all, its own doubt, a failure). */
function verdict(verite, lecture) {
	const n = noter(verite, lecture.rows);
	return {
		juste: n.juste,
		lignes: n.lignes,
		justes: n.justes,
		...(lecture.rows.length === 0 ? { vide: true } : {}),
		...(lecture.findings ? { fiable: lecture.findings.length === 0 } : {}),
		...(lecture.error ? { erreur: true } : {})
	};
}

/** Print and read everything: the replay proper. */
async function rejouer(pieces) {
	const imprimes = await imprimer(pieces.map((p) => p.id));
	console.log(`${pieces.length} pieces, ${imprimes} printed`);
	mkdirSync(join(RACINE, 'lectures'), { recursive: true });
	const versions = {};
	const lectures = {};
	for (const outil of OUTILS) {
		versions[outil] = VERSIONS[outil]();
		lectures[outil] = await LECTEURS[outil](pieces);
		writeFileSync(fichierLectures(outil), lectures[outil].map((l) => JSON.stringify(l)).join('\n') + '\n');
		console.log(`${outil} ${versions[outil]} read`);
	}
	const banc = { chrome: banniere(CHROME, ['--version']), node: process.version, plateforme: `${process.platform} ${process.arch}` };
	return { jour: new Date().toISOString().slice(0, 10), versions, banc, lectures };
}

/** Judge again what the last replay read, as lectures/ holds it: its day, versions and banners are kept. */
function dernierRejeu() {
	const dossier = join(RACINE, 'resultats');
	const dernier = readdirSync(dossier).filter((f) => f.endsWith('.json')).sort().at(-1);
	if (!dernier) throw new Error('nothing to judge again: resultats/ is empty');
	const { jour, versions, banc } = JSON.parse(readFileSync(join(dossier, dernier), 'utf8'));
	const lectures = Object.fromEntries(OUTILS.map((outil) => [outil, lecturesGardees(fichierLectures(outil))]));
	return { jour, versions, banc, lectures };
}

async function main() {
	const pieces = lirePieces();
	const verites = new Map(pieces.map((p) => [p.id, p.verite.lignes]));
	const { jour, versions, banc, lectures } = JUGER ? dernierRejeu() : await rejouer(pieces);
	const verdicts = {};
	for (const outil of OUTILS) {
		for (const l of lectures[outil].filter((l) => verites.has(l.id))) {
			verdicts[l.id] ??= {};
			verdicts[l.id][outil] = verdict(verites.get(l.id), l);
		}
	}
	mkdirSync(join(RACINE, 'resultats'), { recursive: true });
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
