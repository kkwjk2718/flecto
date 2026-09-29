#!/bin/sh
# Lossless remux of the rendered MP4s so the container duration is exactly 30.000s.
# Remotion's AAC stream carries encoder padding (30.059s); -shortest with stream copy trims it to the video length.
# The dropped tail (<25ms) lies in the silent last half second. Silent variant has no audio and is copied as is.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
mkdir -p out/final
for n in flecto-30s flecto-30s-captions flecto-30s-silent-captions; do
  if [ "$n" = flecto-30s-silent-captions ]; then
    npx remotion ffmpeg -hide_banner -loglevel error -y -i out/$n.mp4 -map 0 -c copy -shortest -movflags +faststart out/final/$n.mp4
  else
    # Master: loudnorm as a true-peak safety limiter (-14 LUFS, -1.5 dBTP); video stream copied.
    npx remotion ffmpeg -hide_banner -loglevel error -y -i out/$n.mp4 -map 0 -c:v copy -af 'loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000' -c:a aac -b:a 256k -shortest -movflags +faststart out/final/$n.mp4
  fi
  printf '%s ' "$n"
  npx remotion ffprobe -v error -show_entries format=duration:stream=codec_type,nb_frames,duration -of compact=p=0 out/final/$n.mp4 | paste -sd' ' -
done
cp out/flecto-30s-poster.png out/final/flecto-30s-poster.png
