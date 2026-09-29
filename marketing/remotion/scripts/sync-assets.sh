#!/bin/sh
# Copies the actual product captures, local fonts and the chosen ElevenLabs takes into public/.
# public/assets, public/audio and public/fonts are gitignored. Override the source with FLECTO_CREATIVE_DIR.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${FLECTO_CREATIVE_DIR:-/Users/kkwjk2718/Documents/kakao-ralphthon-main/.flecto/creative}"
mkdir -p "$HERE/public/assets" "$HERE/public/audio" "$HERE/public/fonts"
for f in 01-source-benefits 02-flecto-input 02-flecto-input-filled 02-filled 03-flecto-choice 03-flecto-choice-empty 03-empty 04-flecto-review 05-flecto-success 06-culture-success; do
  if [ -f "$SRC/assets/$f.png" ]; then cp "$SRC/assets/$f.png" "$HERE/public/assets/$f.png"; fi
done
for f in vo-sara-4.mp3 music-1.mp3 sfx-select_tick-1.mp3 sfx-press_soft-1.mp3 sfx-done_soft-1.mp3 sfx-brand_ending-1.mp3; do
  if [ -f "$SRC/audio/$f" ]; then cp "$SRC/audio/$f" "$HERE/public/audio/$f"; fi
done
for w in Regular Medium SemiBold Bold ExtraBold; do
  for d in "$HOME/Library/Fonts" /Library/Fonts; do
    if [ -f "$d/Pretendard-$w.otf" ]; then cp "$d/Pretendard-$w.otf" "$HERE/public/fonts/"; break; fi
  done
done
ls "$HERE/public/assets" "$HERE/public/audio" "$HERE/public/fonts"
