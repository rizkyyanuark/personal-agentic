#!/bin/sh
set -eu
if [ "$#" -ne 0 ] || [ "${SSH_ORIGINAL_COMMAND:-}" != release ]; then
    printf '%s\n' 'Only the release command is permitted.' >&2
    exit 1
fi
exec /usr/bin/sudo -n /usr/bin/python3 -I /usr/local/sbin/personal-agentic-release
