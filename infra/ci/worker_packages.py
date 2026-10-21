"""Build immutable worker archives from already compiled native executables."""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import struct
import zipfile

PLATFORMS = {"windows-x64": "agentic-enterprise.exe", "linux-arm64": "agentic-enterprise"}


def architecture(data: bytes, platform: str) -> None:
    if platform == "linux-arm64":
        if data[:6] != b"\x7fELF\x02\x01" or len(data) < 20 or struct.unpack_from("<H", data, 18)[0] != 183:
            raise ValueError("Expected a Linux ARM64 ELF executable")
    else:
        if data[:2] != b"MZ" or len(data) < 64:
            raise ValueError("Expected a Windows x64 PE executable")
        offset = struct.unpack_from("<I", data, 60)[0]
        if data[offset:offset + 4] != b"PE\x00\x00" or data[offset + 4:offset + 6] != b"\x64\x86":
            raise ValueError("Expected a Windows x64 PE executable")


def package(binary: pathlib.Path, platform: str, release: str, output: pathlib.Path,
            libraries: list[pathlib.Path]) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", release):
        raise ValueError("Release must be the full source commit")
    data = binary.read_bytes()
    architecture(data, platform)
    files = {PLATFORMS[platform]: data}
    for library in libraries:
        if platform != "windows-x64" or ".." in library.name or not re.fullmatch(r"[A-Za-z0-9_.-]+\.dll", library.name):
            raise ValueError("Only explicit Windows runtime DLLs can be bundled")
        if library.name.lower() in {name.lower() for name in files}:
            raise ValueError("Duplicate package member")
        content = library.read_bytes()
        architecture(content, platform)
        files[library.name] = content
    if len(files) > 32 or sum(map(len, files.values())) > 768 * 1024 * 1024:
        raise ValueError("Worker expansion exceeds 768 MiB")
    output.mkdir(parents=True, exist_ok=True)
    filename = f"worker-{platform}.zip"
    target = output / filename
    temporary = target.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, content in sorted(files.items()):
            entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100755 << 16
            archive.writestr(entry, content)
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
    if temporary.stat().st_size > 128 * 1024 * 1024:
        temporary.unlink()
        raise ValueError("Worker archive exceeds 128 MiB")
    temporary.replace(target)
    return {"file": filename, "sha256": digest, "size": target.stat().st_size,
            "files": [{"name": n, "sha256": hashlib.sha256(b).hexdigest(), "size": len(b)}
                      for n, b in sorted(files.items())]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=pathlib.Path, required=True)
    parser.add_argument("--platform", choices=PLATFORMS, required=True)
    parser.add_argument("--release", required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--library", type=pathlib.Path, action="append", default=[])
    args = parser.parse_args()
    entry = package(args.binary, args.platform, args.release, args.output, args.library)
    (args.output / f"{args.platform}.json").write_text(json.dumps(
        {"schema": 1, "protocol": 1, "release": args.release, "platform": args.platform,
         "package": entry}, indent=2) + "\n", encoding="utf-8")
    print(f"Packaged {args.platform} at source {args.release}")


if __name__ == "__main__":
    main()
