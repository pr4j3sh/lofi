# Publishing lofi to the Chrome Web Store

This extension is built locally into `dist/`. The Chrome Web Store accepts a ZIP of that build output.

## 1. Prerequisites

- A Google account.
- Chrome Web Store Developer registration at <https://chromewebstore.google.com/> → **Developer Dashboard**.
- A one-time $5 developer registration fee.
- Accept the Chrome Web Store developer agreement.

## 2. Prepare the package

1. Do a final local check:

   ```bash
   npm install
   npm run build
   ```

2. Load `dist/` at `chrome://extensions` with **Developer mode** enabled and test it once more:
   - Open `chrome-extension://<extension-id>/test-audio.html`.
   - Turn lofi on and confirm the tone is slowed with reverb.
   - Test YouTube Music and Spotify Web Player.
   - Confirm the popup reflects the active state and audio stops on toggle off.

3. Bump the version in `manifest.json` before each publication, for example `0.1.0` → `0.1.1`.

4. Package the **contents** of `dist/`, not the folder itself:

   ```bash
   cd dist
   zip -r ../lofi-extension.zip .
   ```

   The ZIP must have `manifest.json` at its root. Do not upload a `.crx`; the Web Store wants a ZIP.

5. Optional: `public/test-audio.html` is copied into `dist/`. It is harmless and private, but if you do not want it in the public package, exclude it from the build output before zipping.

## 3. Create the store listing

In the Chrome Web Store Developer Dashboard:

1. Click **Add new item**.
2. Upload `lofi-extension.zip`.
3. Fill in:
   - **Name**: `lofi`
   - **Summary**: “Slowed + reverb for your favorite music sites.”
   - **Description**: explain what it does, supported sites, privacy, and that processing happens locally.
   - **Category**: *Music* or *Productivity*.
   - **Language**.
4. Add assets:
   - 128×128 icon — already generated in `public/icons/`.
   - Screenshots, typically 1280×800 or 640×400 — recommended.
   - Promo tile / small promo image — optional but helpful.

## 4. Privacy and permissions declaration

Declare:

- No personal data collected.
- No data shared with third parties.
- Audio is processed locally in the browser and never uploaded, downloaded, or stored.
- No analytics or telemetry.

Be ready to justify each permission:

- `tabCapture` — captures audio from the active music tab.
- `offscreen` — hosts the audio graph so processing continues while the popup is closed.
- `activeTab` — user-gesture access to the current tab.
- `scripting` — injects the page hook on supported players such as YouTube Music.
- `storage` — persists settings and custom sites.
- Host access to `https://music.youtube.com/*` — built-in support for zero-click auto-enable on YouTube Music.
- Optional host access to `http://*/*` and `https://*/*` — only requested when a user adds or enables a website in Settings, so the page hook can be injected for automatic activation on that site.

If a reviewer asks why both `tabCapture` and `scripting` are present: `scripting` injects a local page hook into sites the user has explicitly allowed; `tabCapture` remains the fallback for sites where the hook cannot attach. Host access is only used to inject local audio-processing code and is never used to read, upload, or store website data.

## 5. Distribution and submission

- Choose **Public** or **Unlisted**:
  - **Public**: searchable in the store.
  - **Unlisted**: anyone with the link can install it, but it is not searchable.
- Submit for review.
- Review usually takes a few days and can take longer for extensions using permissions such as `tabCapture`.

## 6. After approval

- Click **Publish**.
- Future updates: bump the manifest version, rebuild the ZIP, upload it to the same item, add release notes, and resubmit.

## Suggested description

`lofi` transforms music playing in your browser into a slowed, reverberated lofi experience in real time. It works on supported music websites and lets you add your own domains. All processing happens locally with the Web Audio API. No audio is recorded, uploaded, or sent anywhere.

Features:

- Adjustable playback speed with tape-style slowdown.
- Adjustable reverb with multiple presets.
- Simple EQ and gentle limiting.
- Per-site settings and custom website support.
- Audio keeps processing when the popup is closed.
- Auto-enable starts processing automatically on supported sites with granted site access; other sites show a clear one-click prompt.
