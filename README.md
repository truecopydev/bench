# truecopy bench

This public bench measures how readers extract tables. It holds 1 514 financial
tables that listed companies published in their ESEF annual reports. The truth
of each table comes from the report's own machine-readable layer, and the bench
keeps what each reader makes of it.

Every number of the truth comes from the `<table>` of the issuer's iXBRL report,
as served by [filings.xbrl.org](https://filings.xbrl.org). No reader produced
it, no person typed it.

## Results

<!-- results:start -->
Replay of 2026-10-21, Chromium 155.0.8059.79 built on Debian GNU/Linux 12 (bookworm), linux x64.

| reader | version | tables right | rows right | nothing read | given reliable | wrong among reliable |
| --- | --- | --- | --- | --- | --- | --- |
| truecopy | 2.0.14 | 646 / 1514 (42.7 %) | 80.3 % | 0 | 482 | 38.8 % |
| pdftotext | pdftotext version 22.12.0 | 812 / 1514 (53.6 %) | 85.1 % | 0 | - | - |
| pdfplumber | 0.11.4 | 234 / 1514 (15.5 %) | 55.6 % | 0 | - | - |
| camelot | 0.11.0 | 710 / 1514 (46.9 %) | 81.8 % | 3 | - | - |
| docling | 2.140.0 | 366 / 1514 (24.2 %) | 47.2 % | 604 | - | - |
<!-- results:end -->

A table is right when every row of the truth comes back, in order, as a read
row with exactly the same numbers. Rows right is the share of truth rows found.
Nothing read counts the pages on which the reader returned no row at all, so it
found no table where there is one. Such a page counts as wrong for every reader.
Docling's layout model misses the table on a large share of these prints, and
it reads the tables it does see about as often right as truecopy.
Given reliable counts the readings that truecopy returned without any finding.
Wrong among reliable is how many of those were wrong. A reader that claims to
know when it is wrong must keep that number low. The other readers make no such
claim.

## AI readers

Four vision models read a fixed sample of the bench, made of the 300 pieces
whose sha256 of the id sorts first. Each model is shown the PNG render (110 dpi) of
the same printed PDF, with one instruction and one schema (`src/ia.mjs`), and
its rows go to the same judge. The Claude models read through the Claude Code
CLI, which opens the pages with its Read tool. A model named `gpt-...` reads
through the Codex CLI, which takes the pages as attached images. Only the first
sentence of the instruction differs between the two, the one that says where
the pages are.

<!-- ai:start -->
The 300 pieces of the sample, every reader judged on the same ones.

| reader | version | read on | tables right | rows right | nothing read | given reliable | wrong among reliable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude-opus | claude-opus-5-5 | 2026-11-27, 2026-11-28 | 295 / 300 (98.3 %) | 99.9 % | 0 | - | - |
| claude-sonnet | claude-sonnet-5-5 | 2026-11-27, 2026-11-28 | 292 / 300 (97.3 %) | 99.7 % | 0 | - | - |
| gpt-6.2-sol | gpt-6.2-sol | 2026-11-28 | 291 / 300 (97 %) | 99.8 % | 0 | - | - |
| claude-haiku | claude-haiku-5-5 | 2026-11-27, 2026-11-28 | 290 / 300 (96.7 %) | 99.7 % | 0 | - | - |
| pdftotext | pdftotext version 22.12.0 | 2026-10-21 | 159 / 300 (53 %) | 84 % | 0 | - | - |
| camelot | 0.11.0 | 2026-10-21 | 137 / 300 (45.7 %) | 80 % | 0 | - | - |
| truecopy | 2.0.14 | 2026-10-21 | 126 / 300 (42 %) | 78.3 % | 0 | 95 | 37.9 % |
| docling | 2.140.0 | 2026-10-21 | 68 / 300 (22.7 %) | 45 % | 125 | - | - |
| pdfplumber | 0.11.4 | 2026-10-21 | 39 / 300 (13 %) | 51 % | 0 | - | - |
<!-- ai:end -->

The version of an AI reader is the model identifier that answered, and read on
is the day it did. A model answers differently from one call to the next, so its
readings are kept as read (`lectures/claude-<model>.jsonl`,
`lectures/gpt-<model>.jsonl`) and never read again. The Codex CLI answers with
the model the run names, so that name is the identifier kept.

### What the failures are

A table is wrong as soon as one row is not read as the same sequence of
numbers, so a wrong digit and a row cut differently count the same. The 32
failed readings of the four models were each compared with the print, by hand,
on 2026-11-28:

| reader | failed | wrong number | row cut | note reference | outside the table |
| --- | --- | --- | --- | --- | --- |
| claude-opus | 5 | 0 | 3 | 1 | 1 |
| gpt-6.2-sol | 9 | 1 | 5 | 2 | 1 |
| claude-sonnet | 8 | 0 | 4 | 3 | 1 |
| claude-haiku | 10 | 2 | 4 | 3 | 1 |

A wrong number is a printed number read as another, or a number written that
is not printed. A row cut has every number right, but an entry printed on two or
three lines comes back as one row. A note reference has every table number
right, but a note number or a footnote call is fused to its label or split from
it. Outside the table means the truth carries the page number and the reader
left it out.

`echecs-ia.json` names each failed reading with its report, the rows of the
truth it misses, its class and one sentence on what the print shows. The class
is a judgement, and anyone can open the report and contest it. `npm run echecs` lists the
failures again after a new reading and `npm test` refuses one without a class.
The other readers' failures were not classed.

## What is in it

| Path | What |
| --- | --- |
| `pieces/<id>.html` | the table as published in the report, with the report's own styles |
| `pieces/<id>.json` | the report's address, the issuer's LEI, country, period, the sha256 of the table page, the terms of the source, and the truth (`verite.lignes`: the numbers of each row, canonical form) |
| `sources.json` | the terms of each source as read, with their address and date, and the sources read and refused |
| `lectures/<reader>.jsonl` | the rows each reader returned, one line per piece |
| `lectures/claude-<model>.jsonl`, `lectures/gpt-<model>.jsonl` | the rows each AI reader returned on the sample, with the model identifier, the day and the confidence it gave itself |
| `resultats/ia/<day>.json` | the sample: per-piece verdicts and per-reader summary, every reader on the same pieces |
| `resultats/<day>.json` | versions, banners of the bench, per-piece verdicts, per-reader summary |
| `src/juge.mjs` | the judge: what a table number is, and when a row reads right |
| `echecs-ia.json` | the failed readings of the AI readers, each with the rows it misses and its class (`src/echecs.mjs`) |
| `ecartees.json` | the 46 pieces set aside, each with its report and the split numbers found (`src/morcele.mjs`) |

The pieces come from 327 reports of 23 countries of the European Economic Area,
919 of them French.

## Pieces set aside

Some reports are HTML converted from a PDF and write a number with spaces
inside it, such as `6 4 5 ,13 7` where the page shows 645,137. The machine-readable
layer of such a table does not carry that number, so its truth misses it, and a
reader that reads the page right was judged wrong. 46 pieces of 16 issuers were
in that case on 2026-11-28. They left `pieces/`, `ecartees.json` names each one
with its report, and every reader was judged again on the 1 514 that remain.
`npm run ecarter` applies the rule (`src/morcele.mjs`) and `npm test` refuses a
piece that breaks it. What the local readers read of those pieces stays in
`lectures/`.

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
document. Truecopy runs `readTable` with its default options. `pdftotext -layout`
comes from poppler, resolved by its banner, with a row per line and cells split
on two spaces or more. Pdfplumber uses the text strategy both ways and camelot
the stream flavor. Docling runs without OCR, with its table-structure model in
accurate mode, and gives each table as its header row then its body rows.

`npm run rejouer -- --outils truecopy,pdftotext --limite 50` replays a part.
When the judge changes, `npm run rejouer -- --juger` scores again what
`lectures/` holds, without printing or reading.

The AI readers need the Claude Code CLI signed in to an account, and the Codex
CLI for a model named `gpt-...`. Each reading is a paid model call:

```sh
npm run lire-ia -- --modeles haiku,sonnet,opus,gpt-6.2-sol --echantillon 300 --chrome "$(command -v chromium)"
```

It reads only the pieces of the sample a model has not read yet.
`npm run lire-ia -- --juger` scores again what `lectures/` holds, with no model
call. A larger `--echantillon` keeps every piece of a smaller one.

## What it does not prove

- The AI readers are judged on 300 pieces, not 1 514, each read once, and a second
  call may read a table differently.
- An AI reader sees an image of the page, the other readers the PDF itself.
- The PDF read is Chromium's print of the published table, not a PDF laid out by
  the issuer, and a different renderer moves some readings.
- Only reports written as real `<table>` elements are in. Reports made of
  absolutely positioned words are not.
- Tables of one report are correlated, and no interval is computed here.
- Signs are judged as the iXBRL table prints them.

## Sources and licences

The only source is filings.xbrl.org, whose terms, read on 2026-10-14, state:
"At present, there are no restrictions on the ways that the data can be used."
Each piece carries that text, its address and the date it was read.

Documents of five French property-fund managers were read and refused because
their terms forbid republication or say nothing. `sources.json` names them and
their reason.

No piece names a person. Every table and every truth went through a check for
titles and common first names in the languages of the reports, and a table
that failed it stayed out. The same check ships with the bench
(`src/personnes.mjs`) and `npm test` replays it on every piece, so you can
verify this rather than take it on trust. It is a list of titles and first
names, so it misses a rare first name with no title.

## Licence

The code is MIT. The tables and their truth are the issuers' public filings,
redistributed under the terms of filings.xbrl.org quoted above.
