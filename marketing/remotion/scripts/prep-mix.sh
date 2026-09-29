#!/bin/sh
# Makes gitignored mix-ready copies with Remotion's bundled ffmpeg (only loudnorm/volume/aresample are available there).
# VO: loudnorm dynamic mode acts as a gentle leveller + true-peak limiter so the master can reach ~-15 LUFS without clipping.
# done_soft: the ElevenLabs take peaks at -32 dBTP, so it gets a fixed +14 dB.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
A=public/audio
npx remotion ffmpeg -hide_banner -loglevel error -y -i $A/vo-sara-4.mp3 -af "loudnorm=I=-16:TP=-2.5:LRA=9,aresample=48000" -c:a pcm_s16le $A/vo-sara-4-mix.wav
npx remotion ffmpeg -hide_banner -loglevel error -y -i $A/sfx-done_soft-1.mp3 -af "volume=14dB,aresample=48000" -c:a pcm_s16le $A/sfx-done_soft-1-mix.wav
for f in vo-sara-4-mix sfx-done_soft-1-mix; do
  printf '%s ' $f
  npx remotion ffmpeg -hide_banner -nostats -i $A/$f.wav -af loudnorm=print_format=summary -f wav -y /dev/null 2>&1 | grep -E 'Input (Integrated|True Peak)' | tr -s ' ' | paste -sd' ' -
done
