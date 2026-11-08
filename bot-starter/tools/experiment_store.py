#!/usr/bin/env python3
"""Offline, append-only experiment provenance. No runner, network or deployment actions.

Usage:
  python3 -I tools/experiment_store.py import
  python3 -I tools/experiment_store.py compare --prefix validation-gain
Only latest snapshots per summary path appear in comparisons; revisions remain stored.
"""
import argparse
import hashlib
import json
import pathlib
import sqlite3
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime-odysseus"
WARNING = ("Surrogate only, not live win probability or rating gain. Uncertainty is "
           "conditional on historical inputs/model; fresh seeds do not make a reused "
           "historical cohort independent. No automatic deployment.")
REACTIVE_WARNING = ("Synthetic reactive wins/places are model outcomes, not historical-score "
                    "exceedance or live wins. Conditional uncertainty excludes simulator "
                    "misspecification, selection and CPU timing effects. No automatic deployment.")
MAX_BYTES = 64 * 1024 * 1024


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    """Read a bounded immutable byte snapshot, retaining its content hash."""
    if path.stat().st_size > MAX_BYTES:
        raise ValueError(f"File exceeds {MAX_BYTES} bytes: {path.name}")
    raw = path.read_bytes()
    if len(raw) > MAX_BYTES:
        raise ValueError(f"File exceeds limit: {path.name}")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path.name}")
    canonical(value)  # Reject NaN/Infinity rather than storing invalid JSON.
    return value, digest(raw)


def connect(path):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS experiments (
        id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE,
        summary_path TEXT NOT NULL, prefix TEXT NOT NULL, imported_at TEXT NOT NULL,
        source_reference TEXT, summary_sha256 TEXT NOT NULL,
        config_json TEXT, config_sha256 TEXT, analysis_json TEXT,
        analysis_sha256 TEXT, warning TEXT NOT NULL,
        provenance_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS arms (
        experiment_id INTEGER NOT NULL REFERENCES experiments(id), label TEXT NOT NULL,
        metric_type TEXT NOT NULL CHECK(metric_type='surrogate'),
        dataset_path TEXT, dataset_sha256 TEXT, seed INTEGER, samples INTEGER, n INTEGER,
        parameters_json TEXT, metrics_json TEXT NOT NULL, detail_sha256 TEXT,
        warnings_json TEXT NOT NULL, PRIMARY KEY(experiment_id,label)
      );
      CREATE INDEX IF NOT EXISTS experiment_path ON experiments(summary_path,id);
      CREATE INDEX IF NOT EXISTS arm_dataset ON arms(dataset_sha256,seed);
      CREATE TABLE IF NOT EXISTS reactive_experiments (
        id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE,
        summary_path TEXT NOT NULL, prefix TEXT NOT NULL, imported_at TEXT NOT NULL,
        summary_sha256 TEXT NOT NULL, source_sha256 TEXT NOT NULL,
        manifest_json TEXT NOT NULL, dictionary_sha256 TEXT NOT NULL,
        config_json TEXT NOT NULL, recorded_config_sha256 TEXT,
        canonical_config_sha256 TEXT NOT NULL, status TEXT NOT NULL,
        report_json TEXT NOT NULL, warning TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reactive_arms (
        experiment_id INTEGER NOT NULL REFERENCES reactive_experiments(id),
        field TEXT NOT NULL, label TEXT NOT NULL,
        metric_type TEXT NOT NULL CHECK(metric_type='synthetic_reactive'),
        seed INTEGER, samples INTEGER, n INTEGER NOT NULL,
        parameters_json TEXT, rival_json TEXT, metrics_json TEXT NOT NULL,
        comparison_json TEXT, outcomes_json TEXT NOT NULL, outcomes_sha256 TEXT NOT NULL,
        PRIMARY KEY(experiment_id,field,label)
      );
      CREATE INDEX IF NOT EXISTS reactive_path ON reactive_experiments(summary_path,id);
    """)
    return db


def dataset_reference(raw, root):
    if not raw:
        return None, None, "Dataset not recorded; independent validation cannot be established."
    path = pathlib.Path(raw)
    if not path.is_absolute():
        path = root / path
    path = path.resolve()
    # Dataset discovery is restricted to the public offline data folder.
    if not path.is_relative_to((root / "data").resolve()) or path.suffix != ".json":
        return str(path), None, "Dataset outside local data/*.json; not read or hashed."
    if not path.is_file():
        return str(path), None, "Dataset missing; content hash unavailable."
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(block)
    return str(path), hasher.hexdigest(), (
        "Dataset hash observed at import; historical run-time identity is not proven.")


def collect(summary_path, root):
    summary_path = summary_path.resolve()
    suffix = "-screen-summary.json"
    if not summary_path.name.endswith(suffix):
        raise ValueError("Only *-screen-summary.json inputs are accepted")
    prefix = summary_path.name[:-len(suffix)]
    summary, summary_hash = read_json(summary_path)
    if not isinstance(summary.get("arms"), dict) or not summary["arms"]:
        raise ValueError("Summary must contain a non-empty arms object")
    config_path = summary_path.with_name(prefix + "-config.json")
    analysis_path = summary_path.with_name(prefix + "-analysis.json")
    config, config_hash = read_json(config_path) if config_path.is_file() else ({}, None)
    analysis, analysis_hash = read_json(analysis_path) if analysis_path.is_file() else ({}, None)
    configured_arms = dict(config.get("arms", []))
    arms = []
    dataset_cache = {}
    for label, metrics in summary["arms"].items():
        if not isinstance(label, str) or not label or any(c in label for c in "/\\"):
            raise ValueError("Unsafe arm label")
        if not isinstance(metrics, dict):
            raise ValueError("Arm metrics must be an object")
        detail_path = summary_path.with_name(prefix + "-" + label + ".json")
        detail, detail_hash = read_json(detail_path) if detail_path.is_file() else ({}, None)
        notes = []
        raw_dataset = detail.get("calibrationDataset", config.get("dataset"))
        if raw_dataset not in dataset_cache:
            dataset_cache[raw_dataset] = dataset_reference(raw_dataset, root)
        dataset_path, dataset_hash, note = dataset_cache[raw_dataset]
        notes.append(note)
        if detail.get("label", label) != label:
            raise ValueError(f"Detail label differs from summary: {label}")
        summary_seed = summary.get("seed", config.get("seed"))
        if detail.get("seed", summary_seed) != summary_seed:
            raise ValueError(f"Detail seed differs from summary: {label}")
        params = detail.get("parameters")
        if params is None and config:
            params = {**config.get("base", {}), **configured_arms.get(label, {})}
            notes.append("Parameters reconstructed from explicit config only; defaults unknown.")
        if params is None:
            notes.append("No parameter detail/config; defaults are not inferred.")
        samples = (params or {}).get("samples", summary.get("samples"))
        if "samples" in summary and samples != summary["samples"]:
            raise ValueError(f"Detail samples differ from summary: {label}")
        n = metrics.get("N", config.get("N"))
        games = detail.get("result", {}).get("games")
        if isinstance(games, list) and n is not None and len(games) != n:
            raise ValueError(f"Detail game count differs from summary: {label}")
        if configured_arms and set(configured_arms) != set(summary["arms"]):
            notes.append("Summary lacks configured arms or differs from config; may be partial.")
        notes.append("Same seed does not by itself verify paired exogenous draws.")
        arms.append(dict(label=label, dataset_path=dataset_path, dataset_sha256=dataset_hash,
                         seed=summary_seed, samples=samples, n=n,
                         parameters=params, metrics=metrics, detail_sha256=detail_hash,
                         warnings=notes))
    provenance = {
        "summary_path": str(summary_path), "summary_sha256": summary_hash,
        "config_sha256": config_hash, "analysis_sha256": analysis_hash,
        "source_reference": summary.get("source"),
        "arms": [{"label": a["label"], "detail_sha256": a["detail_sha256"],
                  "dataset_path": a["dataset_path"], "dataset_sha256": a["dataset_sha256"]}
                 for a in arms],
        "source_verification": "Source reference copied from summary, not independently verified.",
    }
    return dict(prefix=prefix, summary_path=str(summary_path), summary=summary,
                summary_sha256=summary_hash, config=config, config_sha256=config_hash,
                analysis=analysis, analysis_sha256=analysis_hash, arms=arms,
                provenance=provenance, fingerprint=digest(canonical(provenance).encode()))


def import_summary(db, summary_path, root=ROOT):
    if pathlib.Path(summary_path).name.endswith("-reactive-summary.json"):
        return import_reactive_summary(db, pathlib.Path(summary_path))
    # Collect/validate all inputs before transaction; malformed imports cannot partially persist.
    record = collect(pathlib.Path(summary_path), pathlib.Path(root).resolve())
    with db:
        found = db.execute("SELECT id FROM experiments WHERE fingerprint=?",
                           (record["fingerprint"],)).fetchone()
        if found:
            return {"id": found["id"], "inserted": False, "prefix": record["prefix"]}
        cursor = db.execute("""INSERT INTO experiments
          (fingerprint,summary_path,prefix,imported_at,source_reference,summary_sha256,
           config_json,config_sha256,analysis_json,analysis_sha256,warning,provenance_json)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
          (record["fingerprint"], record["summary_path"], record["prefix"],
           datetime.now(timezone.utc).isoformat(), record["summary"].get("source"),
           record["summary_sha256"], canonical(record["config"]), record["config_sha256"],
           canonical(record["analysis"]), record["analysis_sha256"], WARNING,
           canonical(record["provenance"])))
        ident = cursor.lastrowid
        for arm in record["arms"]:
            db.execute("""INSERT INTO arms
              (experiment_id,label,metric_type,dataset_path,dataset_sha256,seed,samples,n,
               parameters_json,metrics_json,detail_sha256,warnings_json)
              VALUES(?,?,'surrogate',?,?,?,?,?,?,?,?,?)""",
              (ident, arm["label"], arm["dataset_path"], arm["dataset_sha256"], arm["seed"],
               arm["samples"], arm["n"], canonical(arm["parameters"]),
               canonical(arm["metrics"]), arm["detail_sha256"], canonical(arm["warnings"])))
    return {"id": ident, "inserted": True, "prefix": record["prefix"]}


def compare(db, prefix=None):
    rows = db.execute("""SELECT e.id,e.prefix,e.source_reference,e.summary_path,
      a.* FROM experiments e JOIN arms a ON a.experiment_id=e.id
      WHERE e.id=(SELECT MAX(e2.id) FROM experiments e2
                  WHERE e2.summary_path=e.summary_path)
      ORDER BY e.id,a.label""").fetchall()
    output = []
    for row in rows:
        if prefix is not None and row["prefix"] != prefix:
            continue
        item = dict(row)
        for column in ("parameters_json", "metrics_json", "warnings_json"):
            item[column[:-5]] = json.loads(item.pop(column))
        # Reuse counts are by distinct experiment, never by arms within a paired screen.
        same = [r for r in rows if r["id"] != row["id"] and row["dataset_sha256"]
                and r["dataset_sha256"] == row["dataset_sha256"]]
        item["same_dataset_other_experiments"] = len({r["id"] for r in same})
        item["same_dataset_seed_other_experiments"] = len({
            r["id"] for r in same if row["seed"] is not None and r["seed"] == row["seed"]})
        item["independent_validation_established"] = False
        item["uncertainty_scope"] = "Conditional simulation/model; no population independence claim."
        output.append(item)
    return {"warning": WARNING, "reactive_warning": REACTIVE_WARNING,
            "latest_snapshots_only": True, "arms": output,
            "reactive_arms": compare_reactive(db, prefix)}


def import_reactive_summary(db, path):
    """Additive schema keeps reactive wins entirely separate from market exceedance."""
    path = pathlib.Path(path).resolve()
    summary, source_file_hash = read_json(path)
    if summary.get("metric_type") != "synthetic_reactive_simulation":
        raise ValueError("Reactive summary must identify synthetic_reactive_simulation")
    config, manifest = summary.get("config"), summary.get("sourceManifest")
    if not isinstance(config, dict) or not isinstance(manifest, dict) or not manifest:
        raise ValueError("Reactive summary requires config and source manifest")
    for value in manifest.values():
        if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise ValueError("Manifest entries must be lowercase SHA256 hashes")
    manifest_hash = digest(canonical(manifest).encode())
    if summary.get("sourceSha256") != manifest_hash:
        raise ValueError("Source hash does not match canonical source manifest")
    dictionary_hash = manifest.get("spacetimedb/wordlist.txt")
    if dictionary_hash is None:
        raise ValueError("Dictionary hash missing from source manifest")
    fields = summary.get("fields")
    if not isinstance(fields, dict):
        raise ValueError("Reactive fields must be an object")
    arms = []
    for field, group in fields.items():
        if not isinstance(group, dict) or not isinstance(group.get("arms"), dict):
            raise ValueError("Reactive field requires arms object")
        for label, arm in group["arms"].items():
            if not isinstance(arm, dict):
                raise ValueError("Reactive arm must be an object")
            outcomes = arm.get("fullOutcomes")
            if not isinstance(outcomes, list) or len(outcomes) != config.get("N"):
                raise ValueError("Reactive outcomes missing or count differs from config N")
            for index, row in enumerate(outcomes):
                if not isinstance(row, dict) or row.get("matchIndex") != index:
                    raise ValueError("Reactive outcomes have inconsistent indices")
                if type(row.get("win")) is not bool:
                    raise ValueError("Reactive win must remain boolean, not market exceedance")
            parameters = arm.get("effectivePolicy")
            metric = {key: arm[key] for key in
                      ("score", "place", "syntheticWinPercent", "elapsedSeconds") if key in arm}
            arms.append({
                "field": field, "label": label, "seed": config.get("seed"),
                "samples": parameters.get("samples") if isinstance(parameters, dict) else None,
                "n": len(outcomes), "parameters": parameters,
                "rival": arm.get("effectiveRival"), "metrics": metric,
                "comparison": group.get("comparisons", {}).get(label),
                "outcomes": outcomes, "outcomes_sha256": digest(canonical(outcomes).encode())})
    prefix = path.name.removesuffix("-reactive-summary.json")
    fingerprint = digest(canonical({"path": str(path), "summary_sha256": source_file_hash}).encode())
    with db:
        found = db.execute("SELECT id FROM reactive_experiments WHERE fingerprint=?",
                           (fingerprint,)).fetchone()
        if found:
            return {"id": found["id"], "inserted": False, "prefix": prefix,
                    "metric_type": "synthetic_reactive"}
        cursor = db.execute("""INSERT INTO reactive_experiments
          (fingerprint,summary_path,prefix,imported_at,summary_sha256,source_sha256,
           manifest_json,dictionary_sha256,config_json,recorded_config_sha256,
           canonical_config_sha256,status,report_json,warning)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (fingerprint, str(path), prefix, datetime.now(timezone.utc).isoformat(),
           source_file_hash, manifest_hash, canonical(manifest), dictionary_hash,
           canonical(config), summary.get("configSha256"), digest(canonical(config).encode()),
           summary.get("status", "unknown"), canonical(summary), REACTIVE_WARNING))
        ident = cursor.lastrowid
        for arm in arms:
            db.execute("""INSERT INTO reactive_arms
              (experiment_id,field,label,metric_type,seed,samples,n,parameters_json,
               rival_json,metrics_json,comparison_json,outcomes_json,outcomes_sha256)
              VALUES(?,?,?,'synthetic_reactive',?,?,?,?,?,?,?,?,?)""",
              (ident, arm["field"], arm["label"], arm["seed"], arm["samples"], arm["n"],
               canonical(arm["parameters"]), canonical(arm["rival"]), canonical(arm["metrics"]),
               canonical(arm["comparison"]), canonical(arm["outcomes"]), arm["outcomes_sha256"]))
    return {"id": ident, "inserted": True, "prefix": prefix, "metric_type": "synthetic_reactive"}


def compare_reactive(db, prefix=None):
    rows = db.execute("""SELECT e.id,e.prefix,e.source_sha256,e.dictionary_sha256,
      e.recorded_config_sha256,e.canonical_config_sha256,e.status,e.summary_path,a.*
      FROM reactive_experiments e JOIN reactive_arms a ON a.experiment_id=e.id
      WHERE e.id=(SELECT MAX(e2.id) FROM reactive_experiments e2
                  WHERE e2.summary_path=e.summary_path)
      ORDER BY e.id,a.field,a.label""").fetchall()
    result = []
    for row in rows:
        if prefix is not None and row["prefix"] != prefix:
            continue
        item = dict(row)
        for column in ("parameters_json", "rival_json", "metrics_json", "comparison_json"):
            item[column[:-5]] = json.loads(item.pop(column))
        item.pop("outcomes_json")  # Full outcomes retained in DB; query remains concise.
        item["same_source_field_seed_other_experiments"] = len({
            other["id"] for other in rows if other["id"] != row["id"]
            and other["source_sha256"] == row["source_sha256"]
            and other["field"] == row["field"] and other["seed"] == row["seed"]})
        item["independent_validation_established"] = False
        item["provenance_limit"] = ("Manifest consistency verified; frozen source bytes not reread. "
                                    "Recorded input-config hash retained; normalized config separately hashed.")
        item["warning"] = REACTIVE_WARNING
        result.append(item)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=pathlib.Path, default=RUNTIME / "experiments.sqlite")
    subs = parser.add_subparsers(dest="command", required=True)
    ingest = subs.add_parser("import", help="Snapshot summaries and optional matching files")
    ingest.add_argument("summaries", nargs="*", type=pathlib.Path)
    query = subs.add_parser("compare", help="Read latest snapshots; never select/deploy automatically")
    query.add_argument("--prefix")
    args = parser.parse_args()
    db = connect(args.db)
    try:
        if args.command == "import":
            paths = args.summaries or sorted([*RUNTIME.glob("*-screen-summary.json"),
                                             *RUNTIME.glob("*-reactive-summary.json")])
            result = {"warning": WARNING, "imports": [], "errors": []}
            for path in paths:
                try:
                    result["imports"].append(import_summary(db, path))
                except (ValueError, OSError, TypeError, sqlite3.Error) as error:
                    result["errors"].append({"path": str(path), "error": str(error)})
            print(json.dumps(result, indent=2))
            return 1 if result["errors"] else 0
        print(json.dumps(compare(db, args.prefix), indent=2))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
