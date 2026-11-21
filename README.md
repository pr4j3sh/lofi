# lofi

> turn any song into a late night vibe.

A browser extension that transforms music playing on Spotify, YouTube Music and other music websites with real-time slowdown, reverb and EQ effects.

You may download and use it from Chrome extensions.

## Requirements

- Node 20+
- Chrome 116+

## Build

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the `dist/` directory.

For development, `npm run dev` rebuilds on change; reload the extension in `chrome://extensions` after each rebuild.

## Releasing

- Bump `version` in both `manifest.json` and `package.json` to the same value.
- Commit and push the version change.
- Create and push a matching tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
- `.github/workflows/release.yml` verifies the tag matches the extension version, builds the project, and attaches `lofi-X.Y.Z.zip` to a GitHub Release.
- Download that zip from GitHub Releases and upload it manually in the Chrome Web Store dashboard.
- Store screenshots and promo tiles are in [`store-assets/`](store-assets/).

## Presets

| Preset                    | Speed | Reverb |
| ------------------------- | ----: | -----: |
| Slowed + Reverb (default) | 0.80x |    40% |
| Dreamy                    | 0.85x |    35% |
| Rainy Night               | 0.75x |    55% |
| Vinyl                     | 0.90x |    22% |
| Deep Focus                | 0.95x |    15% |
| Original                  | 1.00x |     0% |

## References

- [sahinozan/slowed-and-reverb](https://github.com/sahinozan/slowed-and-reverb)
