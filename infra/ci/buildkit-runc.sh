#!/bin/sh
set -eu
remaining=$#
awaiting_value=0
seen_command=0
while [ "$remaining" -gt 0 ]; do
  argument=$1
  shift
  insert=0
  if [ "$seen_command" -eq 0 ]; then
    if [ "$awaiting_value" -eq 1 ]; then
      awaiting_value=0
    else
      case "$argument" in
        --root|--log|--log-format|--rootless) awaiting_value=1 ;;
        -*) : ;;
        run|create) seen_command=1; insert=1 ;;
        *) seen_command=1 ;;
      esac
    fi
  fi
  set -- "$@" "$argument"
  if [ "$insert" -eq 1 ]; then
    set -- "$@" --no-new-keyring
  fi
  remaining=$((remaining - 1))
done
exec /usr/bin/buildkit-runc "$@"
