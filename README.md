# truecopy bench

A public table-extraction bench: **1 560 financial tables** published by listed
companies in their ESEF annual reports, the **truth** of each one taken from the
report's own machine-readable layer, and what each reader makes of them.

Every number of the truth comes from the `<table>` of the issuer's iXBRL report,
as served by [filings.xbrl.org](https://filings.xbrl.org). No reader produced
it, no person typed it.

## Results

<!-- results:start -->
Replay of 2026-10-21, Chromium 155.0.8059.79 built on Debian GNU/Linux 12 (bookworm), linux x64.

| reader | version | tables right | rows right | nothing read | given reliable | wrong among reliable |
| --- | --- | --- | --- | --- | --- | --- |
| truecopy | 2.0.14 | 656 / 1560 (42.1 %) | 79.9 % | 0 | 504 | 40.5 % |
| pdftotext | pdftotext version 22.12.0 | 817 / 1560 (52.4 %) | 84.3 % | 0 | - | - |
| pdfplumber | 0.11.4 | 245 / 1560 (15.7 %) | 55.6 % | 0 | - | - |
| camelot | 0.11.0 | 718 / 1560 (46 %) | 81.3 % | 3 | - | - |
| docling | 2.140.0 | 367 / 1560 (23.5 %) | 46.4 % | 642 | - | - |
<!-- results:end -->

**right**: every row of the truth is found, in order, as a read row carrying
exactly the same numbers. **rows right**: share of truth rows found.
**nothing read**: pages on which the reader returned no row at all - it found
no table where there is one. Such a page counts as wrong, for every reader:
docling's layout model misses the table on a large share of these prints, and
the tables it does see it reads about as often right as truecopy.
**given reliable**: readings that truecopy returned without any finding.
**wrong among reliable**: of those, how many were wrong - the number a reader
that claims to know when it is wrong must keep low. The other readers make no
such claim.

## AI readers

Three vision models read a fixed sample of the bench: the 300 pieces whose
sha256 of the id sorts first. Each model is shown the PNG render (110 dpi) of
the same printed PDF, through the Claude Code CLI, with one instruction and one
schema (`src/ia.mjs`), and its rows go to the same judge.

<!-- ai:start -->
The 300 pieces of the sample, every reader judged on the same ones.

| reader | version | read on | tables right | rows right | nothing read | given reliable | wrong among reliable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude-opus | claude-opus-5-5 | 2026-11-27 | 291 / 300 (97 %) | 99.4 % | 0 | - | - |
| claude-haiku | claude-haiku-5-5 | 2026-11-27 | 289 / 300 (96.3 %) | 99.7 % | 0 | - | - |
| claude-sonnet | claude-sonnet-5-5 | 2026-11-27 | 288 / 300 (96 %) | 99.3 % | 0 | - | - |
| pdftotext | pdftotext version 22.12.0 | 2026-10-21 | 158 / 300 (52.7 %) | 83.6 % | 0 | - | - |
| camelot | 0.11.0 | 2026-10-21 | 133 / 300 (44.3 %) | 79.8 % | 0 | - | - |
| truecopy | 2.0.14 | 2026-10-21 | 124 / 300 (41.3 %) | 78.1 % | 0 | 98 | 41.8 % |
| docling | 2.140.0 | 2026-10-21 | 67 / 300 (22.3 %) | 44.5 % | 129 | - | - |
| pdfplumber | 0.11.4 | 2026-10-21 | 42 / 300 (14 %) | 51.5 % | 0 | - | - |
<!-- ai:end -->

**version** of an AI reader: the model identifier that answered. **read on**:
the day it did. A model answers differently from one call to the next, so its
readings are kept as read (`lectures/claude-<model>.jsonl`) and never read
again.

## What is in it

| Path | What |
| --- | --- |
| `pieces/<id>.html` | the table as published in the report, with the report's own styles |
| `pieces/<id>.json` | the report's address, the issuer's LEI, country, period, the sha256 of the table page, the terms of the source, and the truth (`verite.lignes`: the numbers of each row, canonical form) |
| `sources.json` | the terms of each source as read, with their address and date, and the sources read and refused |
| `lectures/<reader>.jsonl` | the rows each reader returned, one line per piece |
| `lectures/claude-<model>.jsonl` | the rows each AI reader returned on the sample, with the model identifier, the day and the confidence it gave itself |
| `resultats/ia/<day>.json` | the sample: per-piece verdicts and per-reader summary, every reader on the same pieces |
| `resultats/<day>.json` | versions, banners of the bench, per-piece verdicts, per-reader summary |
| `src/juge.mjs` | the judge: what a table number is, and when a row reads right |

The pieces come from 332 reports of 23 countries of the European Economic Area,
926 of them French.

## Replay it

```sh
npm ci
python3 -m venv .venv && .venv/bin/pip install -r temoins/requirements.txt
python3 -m venv .venv-docling && .venv-docling/bin/pip install -r temoins/requirements-docling.txt
npm run rejouer -- --chrome "$(command -v chromium)" --python .venv/bin/python --python-docling .venv-docling/bin/python
```

The replay prints each table to PDF with one headless Chromium (A4 landscape,
the report's styles), reads each PDF with every reader, and scores every
reading with `src/juge.mjs`. Settings are fixed in the code and never tuned per
document: truecopy `readTable` with its default options; `pdftotext -layout`
(poppler, resolved by its banner), a row per line, cells split on two spaces or
more; pdfplumber with the text strategy both ways; camelot with the stream
flavor; docling without OCR, its table-structure model in accurate mode, each
table as its header row then its body rows.
`npm run rejouer -- --outils truecopy,pdftotext --limite 50` replays a part;
`npm run rejouer -- --juger` scores again what `lectures/` holds, without
printing or reading, when the judge changes.

The AI readers need the Claude Code CLI signed in to an account, and each
reading is a paid model call:

```sh
npm run lire-ia -- --modeles haiku,sonnet,opus --echantillon 300 --chrome "$(command -v chromium)"
```

It reads only the pieces of the sample a model has not read yet;
`npm run lire-ia -- --juger` scores again what `lectures/` holds, with no model
call. A larger `--echantillon` keeps every piece of a smaller one.

## What it does not prove

- The AI readers are judged on 300 pieces, not 1 560, each read once: a second
  call may read a table differently.
- An AI reader sees an image of the page, the other readers the PDF itself.

- The PDF read is Chromium's print of the published table, not a PDF laid out by
  the issuer: a different renderer moves some readings.
- Only reports written as real `<table>` elements are in; reports made of
  absolutely positioned words are not.
- Tables of one report are correlated; no interval is computed here.
- Signs are judged as the iXBRL table prints them.

## Sources and licences

The only source is filings.xbrl.org, whose terms, read on 2026-10-14, state:
"At present, there are no restrictions on the ways that the data can be used."
Each piece carries that text, its address and the date it was read.

Documents of five French property-fund managers were read and refused because
their terms forbid republication or say nothing; `sources.json` names them and
their reason.

No piece names a person: every table and every truth went through a check for
civilities and common first names in the languages of the reports, and a table
that failed it stayed out. The same check ships with the bench
(`src/personnes.mjs`) and `npm test` replays it on every piece, so you can
verify this rather than take it on trust. It is a list of titles and first
names, so it is incomplete: a rare first name with no title would pass.

## Licence

The code is MIT. The tables and their truth are the issuers' public filings,
redistributed under the terms of filings.xbrl.org quoted above.
