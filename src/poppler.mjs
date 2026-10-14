/**
 * The bench's poppler tools, resolved by their own banner and never by PATH order
 * alone: Git for Windows puts Xpdf 4.00's `pdftotext` and `pdfinfo` ahead of
 * poppler in a Bash shell, and that control arm reads ESEF tables twice as badly
 * (P1: 16.0 % right instead of 58.6 % on the same 642 PDFs).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const POPPLER = /poppler/i;

/** Return the first candidate whose banner names poppler; throw, naming what was refused, when none does. */
export function choisirPoppler(nom, candidats, banniere) {
	const refuses = [];
	for (const chemin of candidats) {
		const texte = banniere(chemin);
		if (POPPLER.test(texte)) return chemin;
		refuses.push(`${chemin} (${texte.split(/\r?\n/)[0].trim() || 'silent'})`);
	}
	throw new Error(`no poppler ${nom}: ${refuses.join(', ') || 'nothing on PATH'} - set POPPLER_BIN to poppler's bin folder`);
}

/** List the executables named `nom`: POPPLER_BIN first, then each PATH entry, in order. */
export function candidatsDe(nom, env = process.env, existe = existsSync) {
	const dossiers = [env.POPPLER_BIN, ...(env.PATH ?? env.Path ?? '').split(delimiter)].filter(Boolean);
	const fichiers = process.platform === 'win32' ? [`${nom}.exe`, nom] : [nom];
	return [...new Set(dossiers.flatMap((d) => fichiers.map((f) => join(d, f))))].filter((c) => existe(c));
}

// Xpdf exits 99 on -v: the banner is read on stderr whatever the exit code.
const banniereDe = (chemin) => {
	const sonde = spawnSync(chemin, ['-v'], { encoding: 'utf8', timeout: 10_000 });
	return `${sonde.stdout ?? ''}${sonde.stderr ?? ''}`;
};

const resolus = new Map();

/** Resolve the poppler build of a tool (`pdftotext`, `pdftoppm`, `pdfinfo`, `pdfseparate`). */
export function outilPoppler(nom) {
	if (!resolus.has(nom)) resolus.set(nom, choisirPoppler(nom, candidatsDe(nom), banniereDe));
	return resolus.get(nom);
}

/** Run a poppler tool by name, with the options of `execFileSync`. */
export function poppler(nom, args, options) {
	return execFileSync(outilPoppler(nom), args, options);
}

/** The first banner line of the resolved `pdftotext`, to write into a result. */
export function versionPdftotext() {
	return banniereDe(outilPoppler('pdftotext')).split(/\r?\n/)[0].trim();
}
