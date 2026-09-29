# FLECTO 30s ad: render notes

Source: `marketing/remotion/` (isolated Remotion 4.0.529 package, outside the root workspace). Brief: `marketing/FLECTO_30S_PRODUCTION_PROMPT.md`. VO text: `marketing/audio-script.json`.

## Build

```sh
export PATH="$PWD/.flecto/toolchains/node-v24.21.0-darwin-arm64/bin:$PATH"   # from the main checkout root (Node 24)
cd marketing/remotion
npm run sync          # copies captures (+ sidecar JSON), Pretendard, chosen ElevenLabs takes into public/ (gitignored)
# from a separate worktree: FLECTO_CREATIVE_DIR=/path/to/main/.flecto/creative npm run sync
npx tsc --noEmit
node scripts/render-stills.mjs FlectoAd30 24,150,190,378,530,640,700,872   # QA stills -> out/stills
npm run render        # out/flecto-30s.mp4 (h264 CRF 18, AAC 256k, concurrency 1 via remotion.config.ts)
npm run poster        # out/flecto-30s-poster.png (f872)
sh scripts/finalize.sh   # lossless remux to out/final/*.mp4 with container duration exactly 30.000s
```

Compositions: `FlectoAd30` (main), `FlectoAd30Captions` (VO captions on), `FlectoAd30Silent` (captions on, no audio). 1920x1080, 30fps, 900 frames.
Caption variants scale the scene to 984/1080 (top-centred) and reserve a 96px paper band at the bottom for the caption, so captions never cover capture UI (the earlier y=976 overlay covered the f640 footer buttons).

## Decisions recorded

- Font: Pretendard (local OTF 400/500/600/700/800) loaded with FontFace from public/fonts; falls back to Apple SD Gothic Neo.
- Timing: scenes follow the measured VO segments of `vo-sara-4.mp3` at 0.8s (production-manifest `voiceSegmentsInVideo`: f24, f173, f329, f450, f592, f728), which are earlier than the brief's target frames. All frame numbers live in `src/timeline.ts`.
- No faked UI state: no drawn selection ring, no focus ring, no typed text, no button press animation. Selection/fill changes appear only if the real captures `02-flecto-input-filled.png`/`02-filled.png` and `03-flecto-choice-empty.png`/`03-empty.png` exist (auto-detected; re-run `npm run sync`). The select tick SFX plays only when that captured change exists.
- Review underlines (2px ink) are ad annotations drawn under the real values. Coordinates re-measured from the 14:51 KST 2x captures (2880x2200, DPR 2, sidecar JSON with build hashes): 04 value bottoms y=460/587/715/843; morph crops 01 (247,481,600x130: label+input+hint) → 02 (367,322,706x232: label+"원래 사이트 안내"+input).
- 14:51 captures include `02-flecto-input-filled.png` and `03-flecto-choice-empty.png`, so the input fill (f236–f250) and the 가전 selection (f356) are real captured states, and the select tick plays.
- Encoder: yuv420p, bt709, tv range (drafts before 15:00 were tagged yuvj420p full range).
- Real state changes (input fill f236, 가전 selection f356) use 6-frame dissolves to limit ghosting.
- 04 → 05 is abridged (the 04 local review button is not the final submit). The result scenes carry the footnote "일부 과정 축약".
- End-card footnote per brief: "화면은 시연용 사이트에서 설치된 확장 프로그램으로 캡처한 실제 화면이며, 접수 번호는 시연 데이터입니다."
- Captures are drawn at 1440 CSS width whatever their pixel density, so 2x DPR replacements (2880x2200) keep the same crop coordinates.
- Audio: VO starts at f24 (0.8s, voOffsetFrames 0) and runs 27.77s to 28.57s. `scripts/prep-mix.sh` (called by `npm run sync`) makes `vo-sara-4-mix.wav` with bundled-ffmpeg loudnorm (measured -16.8 LUFS / -2.5 dBTP; source was -21.4 / -4.6) and `sfx-done_soft-1-mix.wav` (+14 dB; source peaks at -32 dBTP). VO gain 0.9. Music `music-1.mp3` (-22.2 LUFS source) at 0.8 in gaps and 0.45 under VO (6f attack, 18f release), faded f822–f885, cut at 30s. SFX press_soft f580 (0.6), done_soft f604 (0.8), brand_ending f840 (0.9), select_tick f356 (only with a real 03-empty capture).
- Measured master (`out/flecto-30s.mp4`, bundled ffmpeg loudnorm summary, 14:41 KST): integrated -15.1 LUFS, true peak -2.0 dBTP, LRA 5.8 LU. 29.5–30.0s: -63 LUFS (effectively silent). First pass without leveling measured -18.8 LUFS / -4.4 dBTP. ebur128/volumedetect are not in the bundled ffmpeg.
- Listening was not verified: the agent cannot hear audio. Sync was set from the manifest's silence-gap measurements; a human must listen before release.

## Not in git

public/assets, public/audio, public/fonts, out/ (renders, stills) are gitignored.

## Adaptive capture regions (A/B recapture)

All capture-dependent coordinates are in `src/regions.ts` (logical CSS px of the 1440x1100 viewport; 2x files use the same numbers). A capture sidecar can override them without code changes by adding a `regions` object:

- `01-source-benefits.json`: `{"regions": {"crop": {"x","w"}, "field": {"x","y","w","h"}, "zoom": 1.5}}`: A's visible horizontal crop, the order-number field group (label + input + hint), optional push-in factor.
- `02-flecto-input.json`: `{"regions": {"crop": {...}, "field": {...}}}`: B's crop (used for 02–06) and its order-number field group.
- `04-flecto-review.json`: `{"regions": {"values": [{"x","y","w","h"} x4]}}`: order no., date, category, consent value text boxes; the ad draws a 2px underline under each.

Rects are `getBoundingClientRect()` values at scroll position of the capture. Without sidecar regions the hand-measured defaults apply. `AssetInspect` renders a capture with a 50/100px grid for measuring: `npx remotion still src/index.ts AssetInspect out/inspect/01.png --props='{"asset":"01-source-benefits"}'`.

Opening (A→B): A is shown whole, pushed in on its order field (f84–f146, zoom clamped so the field stays inside the sheet), the rest of A fades (f140–f156) while the real field crop lifts out and grows into B's field (f146–f182), then B builds around it. Only capture pixels are used.

Draft backup before the A/B recapture: `out/draft-backup-1508/` (source captures + sidecars, synced assets, all MP4s/poster, SHA256SUMS.txt).
