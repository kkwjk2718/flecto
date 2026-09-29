# FLECTO 30s ad: render notes

Source: `marketing/remotion/` (isolated Remotion 4.0.529 package, outside the root workspace). Brief: `marketing/FLECTO_30S_PRODUCTION_PROMPT.md`. VO text: `marketing/audio-script.json`.

## Build

```sh
export PATH=/Users/kkwjk2718/Documents/kakao-ralphthon-main/.flecto/toolchains/node-v24.21.0-darwin-arm64/bin:$PATH
cd marketing/remotion
npm run sync          # copies captures, Pretendard, chosen ElevenLabs takes into public/ (gitignored)
npx tsc --noEmit
node scripts/render-stills.mjs FlectoAd30 24,150,190,378,530,640,700,872   # QA stills -> out/stills
npm run render        # out/flecto-30s.mp4 (h264 CRF 18, AAC 256k, concurrency 1 via remotion.config.ts)
npm run poster        # out/flecto-30s-poster.png (f872)
```

Compositions: `FlectoAd30` (main), `FlectoAd30Captions` (VO captions on), `FlectoAd30Silent` (captions on, no audio). 1920x1080, 30fps, 900 frames.

## Decisions recorded

- Font: Pretendard (local OTF 400/500/600/700/800) loaded with FontFace from public/fonts; falls back to Apple SD Gothic Neo.
- Timing: scenes follow the measured VO segments of `vo-sara-4.mp3` at 0.8s (production-manifest `voiceSegmentsInVideo`: f24, f173, f329, f450, f592, f728), which are earlier than the brief's target frames. All frame numbers live in `src/timeline.ts`.
- No faked UI state: no drawn selection ring, no focus ring, no typed text, no button press animation. Selection/fill changes appear only if the real captures `02-flecto-input-filled.png`/`02-filled.png` and `03-flecto-choice-empty.png`/`03-empty.png` exist (auto-detected; re-run `npm run sync`). The select tick SFX plays only when that captured change exists.
- Review underlines (2px ink) are ad annotations drawn under the real values; coordinates were re-measured from the current 04 capture (captured ~30px scrolled).
- 04 → 05 is abridged (the 04 local review button is not the final submit). The result scenes carry the footnote "일부 과정 축약".
- End-card footnote per brief: "화면은 시연용 사이트에서 설치된 확장 프로그램으로 캡처한 실제 화면이며, 접수 번호는 시연 데이터입니다."
- Captures are drawn at 1440 CSS width whatever their pixel density, so 2x DPR replacements (2880x2200) keep the same crop coordinates.
- Audio: VO `vo-sara-4.mp3` at f24 (voOffsetFrames prop 0); music `music-1.mp3` (48s) cut at 30s, ducked ~4 dB under VO (6f attack, 18f release), faded f822–f885; SFX press_soft f580, done_soft f604, brand_ending f840, select_tick f356 (conditional). Mix levels are set by volume multipliers, not measured LUFS.
- Listening was not verified: the agent cannot hear audio. Sync was set from the manifest's silence-gap measurements; a human must listen before release.

## Not in git

public/assets, public/audio, public/fonts, out/ (renders, stills) are gitignored.
