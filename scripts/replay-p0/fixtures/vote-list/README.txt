Synthetic capture of /ko/vote from a local production-setting build with real fonts
(2026-10-15, build ulGwme5ItIoLQx4aLUchX, commit 12231ca9, Sentry 9.47.1, useCompression=false, Playwright 1.63.0 Chromium).
Loopback backend (scripts/replay-p0/tools/vote-list-upstream.cjs), synthetic data only.
Captured with scripts/replay-p0/tools/vote-list-capture.cjs. Procedure: docs/reports/2026-10-15-replay-build-manifest-design.html §6.
wire-<width>-<n>.bin = raw SDK envelope n (1..3 = replay segments 0..2).
Raw files contain unmasked custom events (loopback URLs, synthetic aria-label) and font URLs on the loopback origin.
They hold synthetic data only. Never replace them with captures of real users or real production data.
