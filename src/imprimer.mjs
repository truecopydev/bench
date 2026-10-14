/*
 * Print HTML pages to PDF with ONE headless Chrome driven over DevTools. Not
 * `chrome --print-to-pdf`: one invocation per table costs 22 s (the browser
 * starts, writes the PDF, then lingers) - 75 minutes for 200 tables. A browser
 * kept open prints the same page in under a second.
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reject every pending DevTools call: the connection is lost, none will be answered. */
export function rejeterEnAttente(attente, erreur) {
	for (const { ko } of attente.values()) ko(erreur);
	attente.clear();
}

/**
 * Print `travaux` (`{ url, sortie }`) in batches, a fresh browser per batch: a
 * headless Chrome kept open over hundreds of pages ends up dying. A job that
 * fails reopens the browser and is tried once more; what fails twice is
 * returned, named, instead of stopping the bench.
 */
export async function imprimerParLots(travaux, ouvrir, { parNavigateur = 100 } = {}) {
	const echecs = [];
	for (let i = 0; i < travaux.length; i += parNavigateur) {
		let imprimante = await ouvrir();
		try {
			for (const t of travaux.slice(i, i + parNavigateur)) {
				try {
					await imprimante.imprimer(t.url, t.sortie);
				} catch {
					imprimante.fermer();
					imprimante = await ouvrir();
					try {
						await imprimante.imprimer(t.url, t.sortie);
					} catch (e) {
						echecs.push({ ...t, cause: String(e?.message ?? e) });
					}
				}
			}
		} finally {
			imprimante.fermer();
		}
	}
	return echecs;
}

export async function ouvrirImprimante({ chrome, profil, port = 9333 }) {
	const enfant = spawn(
		chrome,
		[
			'--headless=new',
			'--disable-gpu',
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${profil}`,
			'--no-first-run',
			'--disable-extensions',
			'--disable-component-update',
			'--disable-default-apps',
			'--disable-sync',
			'about:blank'
		],
		{ stdio: 'ignore' }
	);
	let cible;
	for (let i = 0; i < 60 && !cible; i++) {
		await attendre(500);
		try {
			const liste = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
			cible = liste.find((t) => t.type === 'page');
		} catch {
			/* not ready yet */
		}
	}
	if (!cible) {
		enfant.kill();
		throw new Error('headless Chrome does not answer on the DevTools port');
	}
	const ws = new WebSocket(cible.webSocketDebuggerUrl);
	await new Promise((ok, ko) => {
		ws.onopen = ok;
		ws.onerror = ko;
	});
	let n = 0;
	const attente = new Map();
	let ferme = null;
	// A dying Chrome closes the connection: without this rejection the pending promises
	// never settle, the event loop empties and the bench exits 0 with no result.
	ws.onclose = () => {
		ferme = new Error('headless Chrome closed its DevTools connection');
		rejeterEnAttente(attente, ferme);
	};
	const evenements = [];
	ws.onmessage = (m) => {
		const msg = JSON.parse(m.data);
		if (msg.id && attente.has(msg.id)) {
			const { ok, ko } = attente.get(msg.id);
			attente.delete(msg.id);
			msg.error ? ko(new Error(msg.error.message)) : ok(msg.result);
		} else if (msg.method) evenements.forEach((f) => f(msg));
	};
	const envoyer = (method, params = {}) =>
		new Promise((ok, ko) => {
			if (ferme) return ko(ferme);
			const id = ++n;
			attente.set(id, { ok, ko });
			ws.send(JSON.stringify({ id, method, params }));
		});
	await envoyer('Page.enable');
	const naviguer = async (url, delai) => {
		const charge = new Promise((ok) => {
			const f = (msg) => {
				if (msg.method === 'Page.loadEventFired') {
					evenements.splice(evenements.indexOf(f), 1);
					ok();
				}
			};
			evenements.push(f);
		});
		await envoyer('Page.navigate', { url });
		await Promise.race([charge, attendre(delai)]);
	};
	const pdf = async (sortie) => {
		const { data } = await envoyer('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, landscape: true });
		writeFileSync(sortie, Buffer.from(data, 'base64'));
	};
	return {
		async imprimer(url, sortie) {
			await naviguer(url, 30_000);
			await pdf(sortie);
		},
		/** Open a heavy page in print media, as printing does. */
		async ouvrir(url, delai = 180_000) {
			await envoyer('Emulation.setEmulatedMedia', { media: 'print' });
			await naviguer(url, delai);
		},
		/** The value of an expression evaluated in the open page. */
		async evaluer(expression) {
			const { result, exceptionDetails } = await envoyer('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
			if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
			return result.value;
		},
		pdf,
		fermer() {
			ws.close();
			if (process.platform === 'win32') spawn('taskkill', ['/pid', String(enfant.pid), '/T', '/F'], { stdio: 'ignore' });
			else enfant.kill();
		}
	};
}
