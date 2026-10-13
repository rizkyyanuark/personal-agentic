#!/usr/bin/env bash
set -euo pipefail
test "$(uname -m)" = aarch64
apt-get update
apt-get install -y --no-install-recommends protobuf-compiler libprotobuf-dev clang lld cmake libssl-dev pkg-config xz-utils
cat > /usr/local/bin/cc <<'SH'
#!/bin/sh
exec /usr/bin/cc -fuse-ld=lld "$@"
SH
chmod 755 /usr/local/bin/cc
rustup component add rustfmt
bash src/scripts/install-onnx.sh /usr/local/lib
ldconfig
cd src
cargo fmt --all --check
cargo test --workspace --locked
cargo build --locked --bin agentic-enterprise
mkdir -p ci-artifacts
strip --strip-unneeded -o ci-artifacts/agentic-enterprise "$CARGO_TARGET_DIR/debug/agentic-enterprise"
chmod 755 ci-artifacts/agentic-enterprise
xz -6 -T1 ci-artifacts/agentic-enterprise
