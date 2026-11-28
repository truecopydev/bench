#!/usr/bin/env node
/*
 * THE AI READERS, on a fixed sample of the bench.
 *
 *     npm run lire-ia -- --modeles haiku,sonnet,opus --echantillon 300 --chrome /usr/bin/chromium
 *     npm run lire-ia -- --juger   (judge again what lectures/ holds: no model is called)
 *
 * 1. takes the sample (src/ia.mjs: the pieces whose sha256 of the id sorts first);
 * 2. prints each of its tables to PDF as the replay does, and renders the PDF
 *    to PNG pages with poppler's pdftoppm at 110 dpi;
 * 3. has each model read the pages through the Claude Code CLI (`claude -p`,
 *    its Read tool only) or, for a model named `gpt-...`, through the Codex
 *    CLI (`codex exec`, the pages attached), with the instruction and schema
 *    of src/ia.mjs;
 * 4. keeps every reading in lectures/<reader>.jsonl as soon as it is
 *    read, with the model identifier that answered and the day; a piece
 *    already read is never read again;
 * 5. judges the AI readers AND the readers of the last replay on the pieces of
 *    the sample that every AI reader has read, with the same src/juge.mjs, and
 *    writes resultats/ia/<day>.json and the sample table of the README.
 */

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODELES, Panne, SCHEMA, brasDe, consigne, consigneJointe, echantillon, lectureDeCodex, lectureDeLaCli, parCodex, parPaquets, provenance, remplacerEchantillon, tableauEchantillon } from '../src/ia.mjs';
import { imprimerParLots, ouvrirImprimante } from '../src/imprimer.mjs';
import { noter } from '../src/juge.mjs';
import { poppler } from '../src/poppler.mjs';
import { resumer } from '../src/resume.mjs';
import { lecturesGardees } from '../src/temoins.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const opt = (nom, defaut) => {
	const i = process.argv.indexOf(`--${nom}`);
	return i === -1 ? defaut : process.argv[i + 1];
};
/** Without --modeles: the Claude aliases, and every Codex model lectures/ already holds readings of. */
const dejaLusParCodex = () => readdirSync(join(RACINE, 'lectures')).filter((f) => f.endsWith('.jsonl') && parCodex(f)).map((f) => f.slice(0, -6));
const MODELES_LUS = opt('modeles', [...MODELES, ...dejaLusParCodex()].join(',')).split(',');
const TAILLE = Number(opt('echantillon', 300));
const PARALLELES = Number(opt('paralleles', 3));
const CHROME = opt('chrome', process.env.CHROME ?? 'chromium');
const CLAUDE = opt('claude', process.env.CLAUDE ?? 'claude');
const CODEX = opt('codex', process.env.CODEX ?? 'codex');
const CACHE = opt('cache', join(RACINE, 'cache'));
const JUGER = process.argv.includes('--juger');

const pdfDe = (id) => join(CACHE, 'pdf', `${id}.pdf`);
const fichierLectures = (bras) => join(RACINE, 'lectures', `${bras}.jsonl`);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

async function imprimer(ids) {
	mkdirSync(join(CACHE, 'pdf'), { recursive: true });
	const travaux = ids.filter((id) => !existsSync(pdfDe(id))).map((id) => ({ url: pathToFileURL(join(RACINE, 'pieces', `${id}.html`)).href, sortie: pdfDe(id) }));
	const echecs = await imprimerParLots(travaux, () => ouvrirImprimante({ chrome: CHROME, profil: join(CACHE, 'chrome') }));
	if (echecs.length) throw new Error(`printing failed twice: ${echecs.map((e) => e.sortie).join(', ')}`);
}

/** The PNG pages of a piece, in order; pdftoppm pads the page number, so the names sort. */
function pngsDe(id) {
	const dossier = join(CACHE, 'png');
	mkdirSync(dossier, { recursive: true });
	const pages = () => readdirSync(dossier).filter((f) => f.startsWith(`${id}-`) && f.endsWith('.png')).sort();
	if (pages().length === 0) poppler('pdftoppm', ['-r', '110', '-png', pdfDe(id), join(dossier, id)], { timeout: 120_000 });
	return pages();
}

/** Run a CLI with the instruction on stdin; its stdout, or a `Panne` when it does not start or answer. */
function cli(commande, args, invite, options) {
	return new Promise((ok, ko) => {
		const enfant = spawn(commande, args, options);
		let out = '';
		const minuterie = setTimeout(() => {
			enfant.kill();
			ko(new Panne('no answer in 6 minutes'));
		}, 360_000);
		enfant.stdout.on('data', (d) => (out += d));
		enfant.stderr.resume();
		enfant.on('error', (e) => {
			clearTimeout(minuterie);
			ko(new Panne(`${commande} does not start: ${e.message}`));
		});
		enfant.on('close', () => {
			clearTimeout(minuterie);
			ok(out);
		});
		enfant.stdin.end(invite);
	});
}

const claude = (modele, invite, cwd) =>
	cli(CLAUDE, ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA), '--model', modele, '--allowedTools', 'Read', '--strict-mcp-config'], invite, { cwd, env: { ...process.env, ANTHROPIC_API_KEY: '' } });

/** The Codex CLI takes the pages as attached images and the schema as a file; it runs in an empty directory, read-only, and keeps no session. */
function codex(modele, invite, pages, cwd) {
	const vide = join(CACHE, 'codex');
	mkdirSync(vide, { recursive: true });
	const schema = join(vide, 'schema.json');
	if (!existsSync(schema)) writeFileSync(schema, JSON.stringify(SCHEMA));
	const args = ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--json', '--model', modele, '--output-schema', schema, ...pages.flatMap((p) => ['--image', join(cwd, p)]), '-'];
	return cli(CODEX, args, invite, { cwd: vide, env: { ...process.env, OPENAI_API_KEY: '' } });
}

async function lectureDuModele(modele, id) {
	const pages = pngsDe(id);
	const dossier = join(CACHE, 'png');
	if (parCodex(modele)) return lectureDeCodex(await codex(modele, consigneJointe(pages.length), pages, dossier), modele);
	return lectureDeLaCli(await claude(modele, consigne(pages), dossier));
}

/** Read what each model has not read yet of the sample; every reading is on disk at once. */
async function lire(ids) {
	await imprimer(ids);
	mkdirSync(join(RACINE, 'lectures'), { recursive: true });
	const travaux = [];
	for (const modele of MODELES_LUS) {
		const lus = new Set(lecturesGardees(fichierLectures(brasDe(modele))).map((l) => l.id));
		for (const id of ids) if (!lus.has(id)) travaux.push({ modele, id });
	}
	console.log(`${ids.length} pieces in the sample, ${travaux.length} readings to make`);
	let pannes = 0;
	await parPaquets(travaux, PARALLELES, async ({ modele, id }) => {
		try {
			const lu = await lectureDuModele(modele, id);
			appendFileSync(fichierLectures(brasDe(modele)), JSON.stringify({ id, ...lu, day: aujourdhui() }) + '\n');
			console.log(`  ${modele} ${id} ${lu.error ?? `${lu.rows.length} rows`}`);
		} catch (e) {
			if (!(e instanceof Panne)) throw e;
			pannes++;
			console.log(`  ${modele} ${id} NOT READ: ${e.message}`);
		}
	});
	return pannes;
}

/** Put each AI reader's file back in sample order: readings arrive in the order the models answer. */
function ranger(ids) {
	const rang = new Map(ids.map((id, i) => [id, i]));
	for (const modele of MODELES_LUS) {
		const fichier = fichierLectures(brasDe(modele));
		const lectures = lecturesGardees(fichier).filter((l) => rang.has(l.id)).sort((a, b) => rang.get(a.id) - rang.get(b.id));
		if (lectures.length) writeFileSync(fichier, lectures.map((l) => JSON.stringify(l)).join('\n') + '\n');
	}
}

function dernierRejeu() {
	const dossier = join(RACINE, 'resultats');
	const dernier = readdirSync(dossier).filter((f) => f.endsWith('.json')).sort().at(-1);
	return JSON.parse(readFileSync(join(dossier, dernier), 'utf8'));
}

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

/** Judge every reader on the pieces of the sample that EVERY AI reader has read. */
function juger(ids) {
	const rejeu = dernierRejeu();
	const ia = MODELES_LUS.map(brasDe);
	const bras = [...Object.keys(rejeu.versions), ...ia];
	const lectures = Object.fromEntries(bras.map((b) => [b, new Map(lecturesGardees(fichierLectures(b)).map((l) => [l.id, l]))]));
	const communs = ids.filter((id) => ia.every((b) => lectures[b].has(id)));
	const verdicts = {};
	for (const id of communs) {
		const verite = JSON.parse(readFileSync(join(RACINE, 'pieces', `${id}.json`), 'utf8')).verite.lignes;
		verdicts[id] = Object.fromEntries(bras.filter((b) => lectures[b].has(id)).map((b) => [b, verdict(verite, lectures[b].get(id))]));
	}
	const versions = {};
	for (const b of Object.keys(rejeu.versions)) versions[b] = { version: rejeu.versions[b], readOn: rejeu.jour };
	for (const b of ia) {
		const p = provenance(communs.map((id) => lectures[b].get(id)));
		versions[b] = { version: p.models.join(', '), readOn: p.days.join(', ') };
	}
	return { jour: aujourdhui(), echantillon: TAILLE, pieces: communs.length, ia, versions, resume: resumer(verdicts, bras), verdicts };
}

async function main() {
	const tous = readdirSync(join(RACINE, 'pieces')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
	const ids = echantillon(tous, TAILLE);
	const pannes = JUGER ? 0 : await lire(ids);
	if (!JUGER) ranger(ids);
	const resultat = juger(ids);
	mkdirSync(join(RACINE, 'resultats', 'ia'), { recursive: true });
	const fichier = join(RACINE, 'resultats', 'ia', `${resultat.jour}.json`);
	writeFileSync(fichier, JSON.stringify(resultat, null, '\t') + '\n');
	const readme = join(RACINE, 'README.md');
	writeFileSync(readme, remplacerEchantillon(readFileSync(readme, 'utf8'), tableauEchantillon(resultat)));
	console.table(resultat.resume);
	console.log(`-> ${fichier}${pannes ? `, ${pannes} reading(s) not made: run again` : ''}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
