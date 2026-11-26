"""Coordinator-run, no-host-port integration against selected source/current7.

No environment files, account files, provider URLs or shared stacks are read.
All subprocess environments are explicit. Docker uses one local Unix socket
and a fresh empty CLI config. Run labels never reuse receipts or logs.
"""

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import traceback
from urllib.parse import urlsplit
import uuid

sys.dont_write_bytecode = True

from pair_fixture import PairFactory, PairFixtureError, PUBLIC_JWT_SECRET
from setup_db import setup, source_hashes, verify_source


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
WEB_HEAD = "a67c927777dfb0f4de18630d7446fde0325eced4"
ENV = {"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "NODE_ENV": "test", "PYTHONDONTWRITEBYTECODE": "1",
       "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"}
OWNED = ["__tests__/integration/payment/orders-postgrest.http.ts", *[
    "scripts/payment/order-http/" + name for name in ["run.py", "pair_fixture.py", "test_pair_fixture.py", "bundle.mjs",
        "network-guard.cjs", "auth-fixture.ts", "seed.sql", "assert.sql", "setup_db.py"]]]
PRODUCT = {
    "lib/payment/server-order.ts": "426c03761cbc55171bbe1f10a71afbd794d41ed8614c60772ad2bb0e9ba0c243",
    "lib/payment/server-order-repository.ts": "bb58bd4c2fda2c94739813ff197e4a03aa3bad9cab3ec4f863aa86b5fbdf6a55",
    "app/api/payment/orders/route.ts": "c89f765cbfcd9a9e31d264759a4b0e8504dbd741df9038bc65e5b9abca425aa8",
    "utils/log-event-codes.ts": "e1aca50d36554526ae590e01597d6119ff669cd2d88434e75e7daa45a77210b3",
    "__tests__/lib/payment/server-order.test.ts": "a9e351ea7d5eea49de6c8e49085ed00233dedc7af8629dec86c263c5f8088dcd",
    "__tests__/lib/payment/server-order-repository.test.ts": "edb77d01479d94d97fffd4aa75218deef12c23f68a1bfb89cf7a83f699e6fc3b",
    "__tests__/api/payment/orders.test.ts": "4eb2d71e99c3d28ade23f95b5b8aa34f687b74dc56a85b8906c2b169123fd9ab",
}


def hashes(paths):
    return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


def artifact_hashes(directory):
    return {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() if (directory / name).is_file() else None
            for name in ("orders-http.cjs", "network-guard.cjs", "config.json")}


def interpreter_evidence():
    return {"executable": sys.executable, "version": sys.version,
            "flags": {name: getattr(sys.flags, name) for name in dir(sys.flags)
                      if not name.startswith("_") and isinstance(getattr(sys.flags, name), (int, bool))},
            "flagsRepr": repr(sys.flags), "dontWriteBytecode": sys.dont_write_bytecode,
            "bytecodePolicy": "sys.dont_write_bytecode forced True before local helper imports; DB helpers compile verified source bytes without reading pyc"}


def jwt(role, *, sub=None):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")
    claims = {"role": role, "iss": "public-order-http-fixture", "exp": 4102444800}
    if sub:
        claims["sub"] = sub
    message = encode({"alg": "HS256", "typ": "JWT"}) + "." + encode(claims)
    signature = base64.urlsafe_b64encode(hmac.new(PUBLIC_JWT_SECRET.encode(), message.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return message + "." + signature


class LocalDocker:
    def __init__(self, executable, endpoint, out):
        parsed = urlsplit(endpoint)
        if parsed.scheme != "unix" or parsed.netloc or parsed.query or parsed.fragment or not parsed.path.startswith("/"):
            raise PairFixtureError("Only an explicit local Unix Docker socket is allowed")
        socket = Path(parsed.path).resolve(strict=True)
        if not stat.S_ISSOCK(socket.stat().st_mode):
            raise PairFixtureError("Docker endpoint is not a Unix socket")
        self.executable = str(Path(executable).resolve(strict=True))
        self.endpoint = "unix://" + str(socket)
        self.config = out / "empty-docker-config"
        self.config.mkdir()
        self.out = out
        self.count = 0

    def __call__(self, args, *, timeout=30, input=None):
        if not 0 < timeout <= 30:
            raise PairFixtureError("Docker commands require a deadline of at most 30 seconds")
        command = [self.executable, "--config", str(self.config), "--host", self.endpoint, *args]
        self.count += 1
        record = {"sequence": self.count, "args": list(args), "argv": command, "timeoutSeconds": timeout}
        try:
            result = subprocess.run(command, input=input, capture_output=True, text=True, timeout=timeout, env=ENV)
            record.update(exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr)
            return result
        except BaseException as exc:
            record.update(exitCode=None, error=type(exc).__name__, detail=str(exc))
            raise
        finally:
            with (self.out / "docker-commands.jsonl").open("a") as stream:
                stream.write(json.dumps(record) + "\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-image", choices=["postgres:15.8", "postgres:17.6"], required=True)
    parser.add_argument("--run-label", required=True)
    parser.add_argument("--db-workspace", required=True)
    parser.add_argument("--docker-host", required=True)
    parser.add_argument("--docker-bin", default=shutil.which("docker"))
    parser.add_argument("--node-bin", default=shutil.which("node"))
    parser.add_argument("--source-manifest", default=str(ROOT / ".orca-task-payment-t5-order-http/db-source-manifest.json"))
    parser.add_argument("--logging-manifest", default="/Users/Shared/ai-agent-config-backups-charlie/usage-evidence/payment-t5-order-http/logging-read-boundary.json")
    parser.add_argument("--mode", choices=["current7", "orders-only1"], default="current7")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", args.run_label):
        raise PairFixtureError("Invalid new run label")
    os.umask(0o077)
    out = ROOT / ".artifacts/payment-web-order-http" / args.run_label
    out.mkdir(parents=True, exist_ok=False)
    node_out = out / "node-artifacts"
    node_out.mkdir()
    original_argv = getattr(sys, "orig_argv", None)
    evidence = {"status": "failed", "mode": args.mode, "finalEligible": args.mode == "current7",
                "recordedAt": datetime.now(timezone.utc).isoformat(), "postgresImage": args.postgres_image,
                "scope": "Selected source plus synthetic Auth/Vault/profile/campaign, auth-only fixture and prefix-only Kong replacement; no provider/GoTrue/UI/production/FULL claim",
                "stage": "preflight", "nodeExitCode": None, "completed": False, "observerCompleted": False,
                "invocation": {"argv": list(sys.argv), "interpreterArgv": list(original_argv) if original_argv is not None else None,
                               "interpreterArgvAvailable": original_argv is not None,
                               "interpreterArgvUnavailableReason": None if original_argv is not None else
                                   "sys.orig_argv is unavailable on this interpreter; original interpreter arguments were not observed",
                               "mainArgv": list(argv) if argv is not None else list(sys.argv[1:])},
                "interpreter": interpreter_evidence(),
                "loggingManifest": {"path": str(Path(args.logging_manifest).resolve()), "sha256": None},
                "artifactHashesBefore": {"orders-http.cjs": None, "network-guard.cjs": None, "config.json": None},
                "artifactHashesAfter": {"orders-http.cjs": None, "network-guard.cjs": None, "config.json": None},
                "artifactsUnchanged": None,
                "limits": {"dependencies": "installed node_modules readonly; full dependency-tree hashes not pinned",
                           "typecheck": "project tsc excludes tests", "postgrestPool": "1; sequential evidence, no concurrency proof",
                           "postgresReadinessSeconds": 45, "httpReadinessSeconds": 23, "nodeDeadlineMs": 24000}}
    pair = None
    db_root = manifest = db_before = None
    files = []
    before = {}
    original_handler = signal.getsignal(signal.SIGTERM)

    def terminate(_signum, _frame):
        raise PairFixtureError("Termination requested; preserve failure and clean only proven owned resources")

    signal.signal(signal.SIGTERM, terminate)
    try:
        db_root, manifest, db_before = verify_source(args.db_workspace, args.source_manifest)
        logging_path = Path(args.logging_manifest).resolve(strict=True)
        logging_bytes = logging_path.read_bytes()
        evidence["loggingManifest"] = {"path": str(logging_path), "sha256": hashlib.sha256(logging_bytes).hexdigest()}
        logging = json.loads(logging_bytes)["sources"]
        log_paths = [Path(path) for path in logging]
        if any(not path.resolve(strict=True).is_relative_to(ROOT) for path in log_paths) or hashes(log_paths) != logging:
            raise PairFixtureError("Logging source closure differs from the approved hash manifest")
        files = list(dict.fromkeys([*[ROOT / path for path in OWNED], *[ROOT / path for path in PRODUCT], *log_paths]))
        before = hashes(files)
        if any(before[str(ROOT / path)] != wanted for path, wanted in PRODUCT.items()):
            raise PairFixtureError("Frozen web product or existing test source differs")
        head = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True, capture_output=True, timeout=30, env=ENV)
        if head.returncode or head.stdout.strip() != WEB_HEAD:
            raise PairFixtureError("Frozen web HEAD differs")
        evidence.update(webHead=head.stdout.strip(), dbHead=manifest["sourceCommit"], sourcesBefore=before,
                        dbSourcesBefore=db_before, dependencySqlSha256=manifest["dependencySqlSha256"])
        evidence["stage"] = "bundle"
        if not args.node_bin or not args.docker_bin:
            raise PairFixtureError("Existing host Node and Docker executables are required; installation is forbidden")
        evidence["bundleArgv"] = [args.node_bin, str(HERE / "bundle.mjs"), str(node_out)]
        bundled = subprocess.run(evidence["bundleArgv"], text=True,
                                 capture_output=True, timeout=30, env=ENV)
        (out / "bundle.log").write_text(bundled.stdout + bundled.stderr)
        evidence["bundleExitCode"] = bundled.returncode
        evidence["artifactHashesBefore"]["orders-http.cjs"] = artifact_hashes(node_out)["orders-http.cjs"]
        if bundled.returncode:
            raise PairFixtureError("Host bundle failed; no container was created")
        shutil.copyfile(HERE / "network-guard.cjs", node_out / "network-guard.cjs")
        evidence["artifactHashesBefore"]["network-guard.cjs"] = artifact_hashes(node_out)["network-guard.cjs"]
        transport = LocalDocker(args.docker_bin, args.docker_host, out)
        pair = PairFactory(transport, pg_image=args.postgres_image, artifact_dir=node_out, modules_dir=ROOT / "node_modules")
        evidence["stage"] = "factory-start"
        pair.start()
        evidence.update(runId=pair.run_id, imageIds=pair.images, actualServerVersion=pair.version)
        evidence["stage"] = "source-db-setup"
        evidence["dbSetup"] = setup(pair, db_root, manifest, out, mode=args.mode)
        evidence["stage"] = "postgrest-start"
        pair.start_postgrest()
        completion = "ORDER_HTTP_COMPLETE_" + uuid.uuid4().hex
        config = {"restIp": pair.role("postgrest")["ipv4"], "restAlias": "order-rest", "restPort": 3000,
                  "serviceJwt": jwt("service_role"), "anonJwt": jwt("anon"),
                  "authenticatedJwt": jwt("authenticated", sub="a733bb01-0000-4000-8000-000000000001"),
                  "completionMarker": completion, "nodeDeadlineMs": 24000}
        (node_out / "config.json").write_text(json.dumps(config, indent=2) + "\n")
        evidence["artifactHashesBefore"]["config.json"] = artifact_hashes(node_out)["config.json"]
        evidence.update(completionMarker=completion, actualPostgrestUrl="http://" + config["restIp"] + ":3000/rpc/create_web_payment_order",
                        proxyBoundary="127.0.0.1 port0, exact registered port only; prefix-only /rest/v1/rpc to /rpc")
        evidence["stage"] = "http-child"
        evidence["nodeArgv"] = ["node", "--require", "/fixture/network-guard.cjs", "/fixture/orders-http.cjs"]
        child = pair.exec_node(evidence["nodeArgv"], check=False)
        (out / "http.stdout.log").write_text(child.stdout)
        (out / "http.stderr.log").write_text(child.stderr)
        evidence.update(nodeExitCode=child.returncode, completed=child.returncode == 0 and child.stdout.splitlines().count(completion) == 1)
        for prefix, name in (("ORDER_HTTP_PARTIAL_RESULT ", "http-partial-result.json"), ("ORDER_HTTP_RESULT ", "http-result.json")):
            rows = [line[len(prefix):] for line in child.stdout.splitlines() if line.startswith(prefix)]
            if rows:
                payload = json.loads(rows[-1])
                (out / name).write_text(json.dumps(payload, indent=2) + "\n")
                evidence["actualHttpBoundary"] = payload.get("guard")
        if not evidence["completed"]:
            raise PairFixtureError("HTTP child failed or did not reach its unique completion marker")
        result = json.loads((out / "http-result.json").read_text())
        evidence.update(actualHttpBoundary=result["guard"], observedNetworkDenials=result["observedDenials"],
                        observedExplicitEscapeDenials=result.get("observedExplicitEscapeDenials"))
        evidence["stage"] = "root-sql-observer"
        baseline = json.dumps(evidence["dbSetup"]["financialBaseline"], separators=(",", ":"))
        observed = pair.sql("set order_http.financial_baseline to '" + baseline + "';\n" + (HERE / "assert.sql").read_text(), check=False)
        (out / "observer.log").write_text(observed.stdout + observed.stderr)
        evidence.update(observerExitCode=observed.returncode,
                        observerCompleted=observed.returncode == 0 and observed.stdout.splitlines()[-1:] == ["order-http-observer-complete"])
        if not evidence["observerCompleted"]:
            raise PairFixtureError("Root-only SQL observer failed or did not complete")
        observer = json.loads(next(line for line in observed.stdout.splitlines() if line.startswith('{"orders"')))
        database = {row["order_id"]: row for row in observer["orders"]}
        for tap in result["taps"]:
            if tap.get("status") == 200:
                raw = tap["response"]
                if raw["quote"] != database[raw["order_id"]]["quote"]:
                    raise PairFixtureError("Original HTTP quote differs from the final immutable database quote")
        evidence["httpQuoteMatchesFinalDatabase"] = True
        evidence["stage"] = "completed-diagnostic" if args.mode != "current7" else "completed-current7"
        evidence["status"] = "diagnostic-passed" if args.mode != "current7" else "passed"
    except BaseException as exc:
        evidence.update(error=str(exc), errorType=type(exc).__name__, traceback=traceback.format_exc())
    finally:
        if pair is not None:
            evidence.update(runId=pair.run_id, imageIds=pair.images, network=pair.network, containers=pair.containers,
                            unknownCreation=pair.ledger.unknown, uncertainPhase=pair.uncertain_phase)
            try:
                pair.close()
            except BaseException as cleanup_error:
                evidence.update(status="failed", cleanupError=str(cleanup_error), cleanupTraceback=traceback.format_exc())
            evidence["absence"] = pair.cleanup.absence if pair.cleanup else None
            if any(pair.ledger.known.values()) and (not pair.cleanup or pair.cleanup.absence["network"] is not True
                    or any(value is not True for value in pair.cleanup.absence["containers"].values())):
                evidence["status"] = "failed"
        try:
            evidence["artifactHashesAfter"] = artifact_hashes(node_out)
            artifact_before = evidence["artifactHashesBefore"]
            if any(value is not None for value in artifact_before.values()):
                evidence["artifactsUnchanged"] = artifact_before == evidence["artifactHashesAfter"]
                if evidence["artifactsUnchanged"] is not True:
                    evidence["status"] = "failed"
            if evidence["loggingManifest"]["sha256"] is not None:
                evidence["loggingManifestSha256After"] = hashlib.sha256(Path(evidence["loggingManifest"]["path"]).read_bytes()).hexdigest()
                evidence["loggingManifestUnchanged"] = evidence["loggingManifestSha256After"] == evidence["loggingManifest"]["sha256"]
                if not evidence["loggingManifestUnchanged"]:
                    evidence["status"] = "failed"
            if files:
                evidence["sourcesAfter"] = hashes(files)
                evidence["sourcesUnchanged"] = before == evidence["sourcesAfter"]
            if db_before is not None:
                evidence["dbSourcesAfter"] = source_hashes(db_root, manifest)
                evidence["dbSourcesUnchanged"] = db_before == evidence["dbSourcesAfter"]
            if evidence.get("sourcesUnchanged") is not True or evidence.get("dbSourcesUnchanged") is not True:
                evidence["status"] = "failed"
        except BaseException as source_error:
            evidence.update(status="failed", sourceVerificationError=str(source_error))
        signal.signal(signal.SIGTERM, original_handler)
        evidence["interpreterAfter"] = interpreter_evidence()
        evidence["exitCode"] = 0 if evidence["status"] == "passed" else 3 if evidence["status"] == "diagnostic-passed" else 1
        (out / "receipt.json").write_text(json.dumps(evidence, indent=2) + "\n")
        print(json.dumps({key: evidence.get(key) for key in ("status", "stage", "nodeExitCode", "completed", "observerCompleted", "absence", "error", "cleanupError")}))
        print("Receipt: " + str(out / "receipt.json"))
    return evidence["exitCode"]


if __name__ == "__main__":
    raise SystemExit(main())
