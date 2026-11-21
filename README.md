# lofi

A Chrome MV3 extension that captures a tab's audio and plays it back slowed down with reverb, EQ and gentle limiting. All processing happens locally in the browser; nothing is recorded, uploaded or sent anywhere.

## Requirements

- Node 20+
- Chrome 116+ (the service-worker → offscreen-document stream-ID handoff requires it)

## Install / build

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the `dist/` directory.

For development, `npm run dev` rebuilds on change; reload the extension in `chrome://extensions` after each rebuild.

## Releasing

1. Bump `version` in both `manifest.json` and `package.json` to the same value.
2. Commit and push the version change.
3. Create and push a matching tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. `.github/workflows/release.yml` verifies the tag matches the extension version, builds the project, and attaches `lofi-X.Y.Z.zip` to a GitHub Release.
5. Download that zip from GitHub Releases and upload it manually in the Chrome Web Store dashboard.

## Manual test checklist

1. Open `chrome-extension://<extension-id>/test-audio.html` from the extension details page. It generates a local tone with no network requests and is always treated as supported.
2. Click the extension icon, then turn lofi on. You should hear the tone slowed (default 0.80x) with reverb. Chrome suppresses the tab's original audio while captured, so you should hear **one** copy only.
3. Move the speed and reverb sliders while it plays; changes are applied to the running AudioContext.
4. Switch presets; speed and reverb change together. The **Reset to defaults** button appears whenever these differ from the default preset.
5. Close the popup; audio keeps playing (the graph lives in an offscreen document).
6. Turn lofi off; the tab's original audio returns and no audio is duplicated.
7. On supported sites with site access granted, lofi injects a page-level hook that uses native playback rate for a cleaner tape-style slowdown. Sites without access fall back to the tabCapture path.
8. While playing on YouTube Music, press next a few times. Processing stays active and follows the new track without turning off.
9. Turn on auto-enable in Settings and approve the site-access prompt. Open a supported website; processing starts automatically with no popup click.
10. Reload the page; processing resumes automatically. With auto-enable off, a reload stays off.
11. Turn lofi off manually on YouTube Music; it stays off until you navigate to the page again.
12. Sites without granted access show a one-click prompt because the page hook cannot be injected without site permission.
13. Add a custom domain in Settings; it appears with its favicon (or a local monogram) and persists after reload. The pr4j3sh and GitHub links are in the settings footer.
14. Close the captured tab while playing; processing stops and the UI no longer reports active.

## Presets

| Preset | Speed | Reverb |
| --- | ---: | ---: |
| Slowed + Reverb (default) | 0.80x | 40% |
| Dreamy | 0.85x | 35% |
| Rainy Night | 0.80x | 40% |
| Vinyl | 0.90x | 22% |
| Deep Focus | 0.95x | 15% |
| Original | 1.00x | 0% |

The conservative wet/dry scaling, limiter settings and slowed preset were informed by the MIT-licensed [sahinozan/slowed-and-reverb](https://github.com/sahinozan/slowed-and-reverb) project. Its approach was ported conceptually to this extension's MV3 architecture.

## Architecture

- `src/background/service-worker.ts` — owns permissions, tab lifecycle and the single offscreen document.
- `src/content/` — MAIN-world page hook for supported players and the isolated-world message bridge.
- `src/offscreen/offscreen.ts` — message endpoint that hosts the audio engine.
- `src/audio/` — the Web Audio graph: AudioWorklet slowdown → Biquad EQ → Convolver reverb → gain/limiter.
- `src/storage/` and `src/sites/` — validated settings and the centralized site allowlist.
- `src/popup/` and `src/options/` — React UI; never own engine state.

## Known limitations

- Slowdown is tape-style: it lowers pitch along with speed. Pitch-preserving time stretching is not implemented.
- Only one tab can be processed at a time.
- Auto-enable uses a page hook on any supported site with granted host access, so it can start without a popup click. Sites without granted access use tab capture, which Chrome only allows after a user gesture and therefore need one click. Some DRM or cross-origin-media sites may not expose a usable media element and will fall back to tab capture.
- Audio behavior was implemented against current Chrome MV3 APIs; automated browser verification was not available in this environment.
