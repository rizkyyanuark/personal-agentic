"""Publish a complete immutable two-platform inventory (explicit release job only)."""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import urllib.error
import urllib.request


def main() -> None:
    release = os.environ["CI_COMMIT_SHA"]
    if not re.fullmatch(r"[0-9a-f]{40}", release):
        raise ValueError("Invalid source commit")
    directory = pathlib.Path("worker-packages")
    files: list[pathlib.Path] = []
    for platform in ("windows-x64", "linux-arm64"):
        manifest_path = directory / f"{platform}.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest["release"] != release or manifest["protocol"] != 1 or manifest["platform"] != platform:
            raise ValueError("Mismatched or incompatible release inventory")
        archive = directory / f"worker-{platform}.zip"
        if manifest["package"]["sha256"] != hashlib.sha256(archive.read_bytes()).hexdigest():
            raise ValueError("Archive checksum mismatch")
        files.append(archive)
        files.append(manifest_path)
    base = f"{os.environ['CI_API_V4_URL']}/projects/{os.environ['CI_PROJECT_ID']}/packages/generic/worker/{release}/"
    headers = {"JOB-TOKEN": os.environ["CI_JOB_TOKEN"]}
    # Upload manifests last: a failed archive transfer must not advertise a ready release.
    for path in sorted(files, key=lambda p: p.suffix == ".json"):
        request = urllib.request.Request(base + path.name, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=120) as existing:
                if existing.read() != path.read_bytes():
                    raise ValueError("Refusing to replace an immutable release asset")
                continue
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise RuntimeError(f"Package lookup failed: HTTP {error.code}") from None
        request = urllib.request.Request(base + path.name, data=path.read_bytes(), headers=headers, method="PUT")
        with urllib.request.urlopen(request, timeout=120) as response:
            if response.status not in (200, 201):
                raise RuntimeError("Package publication failed")
    print(f"Published complete worker inventory for {release}")


if __name__ == "__main__":
    main()
