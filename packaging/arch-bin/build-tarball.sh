#!/usr/bin/env bash
# Assembles ai-leash-bin.tar.gz: the prebuilt binary, desktop file, icons,
# license, and PKGBUILD, all sitting flat next to each other so `makepkg`
# needs no network access. Run from the repo root after
# `npx tauri build --bundles deb`; writes ai-leash-bin.tar.gz to $PWD.
set -euo pipefail

deb=$(ls src-tauri/target/release/bundle/deb/*.deb)
version=$(node -p "require('./src-tauri/tauri.conf.json').version")

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

bsdtar -C "$workdir" -xf "$deb" data.tar.gz
mkdir "$workdir/extracted"
bsdtar -C "$workdir/extracted" -xf "$workdir/data.tar.gz" ./usr

out="$workdir/ai-leash-bin"
mkdir "$out"
install -Dm755 "$workdir/extracted/usr/bin/ai-leash" "$out/ai-leash"
install -Dm644 packaging/arch-bin/ai-leash.desktop "$out/ai-leash.desktop"
install -Dm644 "$workdir/extracted/usr/share/icons/hicolor/32x32/apps/ai-leash.png" "$out/ai-leash-32.png"
install -Dm644 "$workdir/extracted/usr/share/icons/hicolor/128x128/apps/ai-leash.png" "$out/ai-leash-128.png"
install -Dm644 "$workdir/extracted/usr/share/icons/hicolor/256x256@2/apps/ai-leash.png" "$out/ai-leash-256.png"
install -Dm644 LICENSE "$out/LICENSE"
sed "s/^pkgver=.*/pkgver=$version/" packaging/arch-bin/PKGBUILD > "$out/PKGBUILD"

tar -C "$workdir" -czf ai-leash-bin.tar.gz ai-leash-bin
