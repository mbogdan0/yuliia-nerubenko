# Loading and animation review

Reviewed on October 4, 2026. Baseline: commit `95f5d01`.
These are local samples from the loading review, not physical-device benchmarks.

## Cold loading

Production builds ran locally in Chromium with fresh browser contexts and
HTTP cache disabled. Network emulation used 10 Mbit/s download and 50ms latency
at a 1366 × 768 viewport. Readiness means the startup loader closed; the updated
sample also waited for the first rendered animation frame.

| Initial route | Baseline | Updated sample | Symbol PNG payload, before → after |
| --- | ---: | ---: | ---: |
| All symbols | 8.25s | 5.47s | 9.22MB → 6.03MB |
| Single Cherry | 8.25s | 0.53s | 9.22MB → 0.082MB |
| Slot Demo | 8.23s | 3.20s | 9.22MB → 3.18MB |

Payload uses decimal MB and excludes skeletons, atlas manifests, JavaScript,
and the optional popup. These are individual runs; later layout changes were
not retimed. The main improvement comes from loading the requested view first.

## Animation sample

Chromium mobile emulation used a 390 × 844 viewport, DPR 2, and CPU slowdown ×4.
Actual WebGL draw intervals were sampled during two seconds of idle and three
seconds of spinning. The four-row portrait sample rendered close to 60fps:
median interval about 16.7ms, 95th percentile about 25ms, no interval over 34ms,
and no main-thread task over 50ms. The first prepared popup show also stayed
below 27ms between rendered frames in this sample.

The baseline already had good frame pacing. The changes reduce unnecessary
work and prepare the popup texture before showing it. This does not measure physical-phone
GPU performance. See Google's [frame budget guidance](https://web.dev/articles/rail)
and [Pixi's performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips).

## Verification scope

The reviewed build passed TypeScript, ESLint, and production build checks.
Browser checks covered phones, landscape phones, tablets, and short laptop
viewports, along with deep links, rapid navigation, resize during a spin,
leaving Slot during a spin, and popup dismissal.

The mobile layout gives priority to larger artwork. Tall portrait screens add
rows; short and landscape screens keep fewer rows and smaller controls.

Injected Gallery and Slot asset failures recovered through Retry. Blocked
popup downloads did not block spins, and background preparation recovered after
requests were restored. Static fruit transitions were compared with fresh Idle
poses. Live skeleton inspection found no missing configured animation variants
or unmatched body-slot names.

## Remaining limits

- The Joker popup is the largest texture. A smaller export would reduce its
  download and GPU memory costs; background loading only changes when they occur.
- Repack Seven's high atlas to fit devices with a 4096px texture-size limit.
- Joker's high symbol texture dominates a full Gallery load. Further large
  reductions need a lighter export or better lossless packing.

The motion is suitable for a polished animation demo. A full game's feedback
would also need sound and authored landing and anticipation cues.
Physical iOS/Android devices, Safari, thermal throttling, and long battery runs
were not measured.
