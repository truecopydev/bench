"""Read bench PDFs with a Python table extractor, one JSON line per PDF on stdout.

    python temoins/temoins.py pdfplumber list.txt
    python temoins/temoins.py camelot list.txt

Each line of list.txt is `<id>\t<path to pdf>`. Output: {"id", "rows", "error"}.
Settings are fixed here and never tuned per document: pdfplumber reads every
page with the text strategy in both directions (the printed tables carry no
rulings to follow); camelot reads every page with the stream flavor.
"""
import json
import sys


def rows_pdfplumber(path):
    import pdfplumber

    rows = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            settings = {"vertical_strategy": "text", "horizontal_strategy": "text"}
            for table in page.extract_tables(settings):
                rows.extend([[cell or "" for cell in row] for row in table])
    return rows


def rows_camelot(path):
    import camelot

    rows = []
    for table in camelot.read_pdf(path, pages="all", flavor="stream"):
        rows.extend(table.df.astype(str).values.tolist())
    return rows


def version(tool):
    import importlib.metadata

    return importlib.metadata.version("camelot-py" if tool == "camelot" else tool)


def main():
    tool, listing = sys.argv[1], sys.argv[2]
    if listing == "--version":
        print(version(tool))
        return
    read = {"pdfplumber": rows_pdfplumber, "camelot": rows_camelot}[tool]
    with open(listing, encoding="utf-8") as f:
        for line in f:
            ident, path = line.rstrip("\n").split("\t")
            try:
                out = {"id": ident, "rows": read(path)}
            except Exception as e:  # a tool that fails on a document has read nothing
                out = {"id": ident, "rows": [], "error": f"{type(e).__name__}: {e}"[:300]}
            print(json.dumps(out, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
