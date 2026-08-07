# Contributing to EchoVision

Thanks for taking a look. This is a small assistive-technology project — the
people it is for rely on it behaving predictably, so correctness and
accessibility matter more here than feature count.

## Setup

Requires Node 22+.

```bash
git clone https://github.com/TevBenji/echovision.git
cd echovision
npm install
npm run dev
```

Open <http://localhost:8080>. No `.env` file is needed — the app runs on the local
TensorFlow.js model by default.

The camera only works on `localhost` or HTTPS. See the README for how to test on
a phone.

## Before you open a PR

All four of these must pass. CI runs exactly the same commands.

```bash
npm run lint        # must report 0 errors
npm run typecheck   # must be clean
npm test            # must be green
npm run build       # must succeed
```

Formatting is Prettier; run `npm run format` before committing.

## What we're looking for

Good first contributions:

- **Accessibility fixes.** Screen-reader labels, focus order, contrast, touch
  target sizes. This is the highest-value area and the easiest to get wrong.
- **Distance calibration.** The estimator in `src/utils/objectDetection.ts` maps
  bounding-box size to metres using a table of typical object widths. Real
  measurements from real cameras would improve it more than any code change.
- **Code splitting.** The bundle is ~1.6 MB because TensorFlow.js ships whole.
- **Browser support for voice commands.** Currently Chromium-only via the Web
  Speech API.

Please open an issue before starting anything large, so you don't duplicate work.

## PR expectations

- **One concern per PR.** A bug fix and a refactor in the same diff is two PRs.
- **Non-trivial logic needs a test.** Vitest, colocated as `*.test.ts`. See
  `src/utils/mobileDetectionHelper.test.ts` for the pattern — plain asserts,
  no fixtures, no mocking frameworks.
- **Describe how you verified it.** Especially for camera and speech changes,
  which the test suite cannot cover. Say which browser and device you used.
- **Never commit secrets.** No API keys, no `.env` files. Remember that `VITE_*`
  variables are compiled into the public bundle and are not secret by design.

## Testing camera and speech changes

The automated suite covers the pure detection helpers only. Anything touching
`getUserMedia`, `SpeechSynthesis`, or `SpeechRecognition` has to be checked by
hand. When you change those paths, please confirm:

- Camera starts, and stops cleanly when you navigate away (no stuck recording light)
- Permission-denied shows a useful message rather than a blank screen
- Speech does not overlap or queue up indefinitely
- It behaves on a real phone, not just a desktop window resized to look like one

## Code style

- TypeScript, no `any` — the lint rule is on and enforced
- Functions named `use*` must be React hooks. If it isn't a hook, don't prefix it
  (this was a real bug in this codebase)
- Prefer the platform: native elements and browser APIs before dependencies
