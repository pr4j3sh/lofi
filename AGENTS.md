# lofi

A browser extension that transforms music playing on websites like Spotify and YouTube Music into slowed-down, reverberated audio in real time.

The extension should work across music websites without downloading songs, accessing music APIs, or modifying the original audio files.

## 1. Product Vision

Build a lightweight, privacy-friendly browser extension that lets users experience any supported music website in a lofi style.

Core experience:

1. User opens a music website.
2. lofi detects whether the website is supported.
3. User enables audio processing.
4. The extension captures the browser tab's audio.
5. Audio is processed in real time with adjustable slowing and reverb.
6. Processed audio is played through the user's normal audio output.

The extension should be generic enough to support user-added websites, not just Spotify and YouTube Music.

## 2. Technology Stack

Use the following technologies:

- TypeScript for application logic.
- React for the extension UI.
- Vite for bundling and development.
- Chrome Extension Manifest V3.
- Web Audio API for audio processing.
- AudioWorklet for custom audio DSP.
- Chrome Storage API for persistent settings.
- CSS for styling.

Target Chromium-based browsers initially.

Keep dependencies minimal. Avoid introducing libraries unless they provide meaningful value.

## 3. Project Architecture

Use a modular architecture with clear separation between audio processing, browser integration, UI, and settings.

Suggested structure:

```text
lofi/
├── public/
│   └── icons/
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   │
│   ├── audio/
│   │   ├── audio-engine.ts
│   │   ├── audio-manager.ts
│   │   ├── effects/
│   │   │   ├── reverb.ts
│   │   │   ├── slowdown.ts
│   │   │   ├── equalizer.ts
│   │   │   └── filter.ts
│   │   └── worklets/
│   │       └── time-stretch-processor.ts
│   │
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.ts
│   │
│   ├── popup/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── styles/
│   │
│   ├── options/
│   │   ├── App.tsx
│   │   └── components/
│   │
│   ├── storage/
│   │   ├── settings.ts
│   │   └── defaults.ts
│   │
│   ├── sites/
│   │   ├── site-manager.ts
│   │   └── supported-sites.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   └── utils/
│       └── messaging.ts
│
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── AGENTS.md
```

You may adjust the structure when implementation requires it, but maintain modularity.

## 4. Core Features

### 4.1 Audio Capture

Use Chrome's `chrome.tabCapture` API to capture audio from the currently active browser tab.

Requirements:

- Capture audio from the selected tab.
- Do not capture audio from unrelated tabs.
- Do not download or store captured audio.
- Route captured audio through the processing pipeline.
- Ensure processed audio reaches the user's speakers.
- Stop capture and release resources when disabled.
- Handle tab closure and navigation correctly.

Important technical constraints:

- Chrome requires a user gesture to initiate tab capture.
- Do not assume audio capture can start automatically just because a supported website was detected.
- Use an offscreen document where appropriate to host the AudioContext and processing pipeline.
- Handle stream IDs and messaging between the service worker and offscreen document correctly.
- Ensure the original tab audio is not duplicated.

### 4.2 Audio Processing

The audio engine should be independent of the React UI.

Use the Web Audio API.

Required effects:

**Reverb**

- Use ConvolverNode.
- Support adjustable wet/dry mix.
- Support different impulse responses.
- Include a default reverb preset.

**Slowdown**

- Support adjustable playback speed.
- Initial target range: 0.70x to 1.00x.
- Provide a default speed of 0.85x.
- Avoid audio glitches and buffer underruns.
- Implement slowdown using a custom AudioWorklet-based resampling/time-stretching approach for captured live audio.
- Do not assume playbackRate can be directly applied to MediaStreamAudioSourceNode.
- Pitch-preserving time stretching can be a later enhancement.

**Equalizer**

- Use BiquadFilterNode.
- Support bass and treble adjustment.
- Keep the initial implementation simple.

**Volume**

- Use GainNode.
- Prevent clipping.
- Provide safe default levels.

### 4.3 Audio Engine Pipeline

Keep the audio graph modular.

Expected conceptual pipeline:

```text
MediaStream
    |
MediaStreamAudioSourceNode
    |
SlowdownProcessor (AudioWorklet)
    |
Equalizer
    |
Reverb
    |
GainNode
    |
AudioContext.destination
```

Effects should be independently configurable.

Allow effects to be enabled or disabled without rebuilding the entire audio graph unnecessarily.

### 4.4 Website Detection

The extension should detect supported websites.

Initial supported websites:

- Spotify Web Player
- YouTube Music

Requirements:

- Maintain a configurable website allowlist.
- Detect website domains.
- Automatically identify whether the current tab is a supported music website.
- Allow users to add custom websites.
- Allow users to remove websites.
- Persist custom websites.
- Avoid hardcoding website detection throughout the application.

Use a centralized site manager.

Example configuration:

```typescript
interface SupportedSite {
  name: string;
  domain: string;
  enabled: boolean;
  custom: boolean;
}
```

The initial site list should be configurable and extensible.

### 4.5 Automatic Activation

Provide an option called:

**Automatically enable lofi on supported websites**

Expected behavior:

- Detect when the user navigates to a supported website.
- Show the extension as available.
- Automatically activate processing when capture has already been initiated and the required permissions are available.
- Do not bypass Chrome's user-gesture requirements.
- If explicit user interaction is required, show a clear activation prompt.

Remember that automatic website detection and automatic audio capture are separate operations.

### 4.6 Custom Website Management

Users should be able to add their own websites.

Requirements:

- Add a domain.
- Remove a domain.
- Enable or disable individual domains.
- Validate domain input.
- Prevent duplicate entries.
- Reject invalid URLs and unsupported schemes.
- Persist the list using Chrome Storage API.

Do not require users to write JavaScript or configure audio processing manually.

## 5. User Interface

The UI should be minimal, modern, and focused on music.

Avoid an unnecessarily complicated dashboard.

### 5.1 Popup

The popup should contain:

1. Extension name and logo.
2. Current website name.
3. Main enable/disable toggle.
4. Playback speed control.
5. Reverb intensity control.
6. Preset selector.
7. Settings button.

Suggested layout:

```text
+-----------------------------+
|  lofi                       |
|  Spotify                    |
|                             |
|  [ ON / OFF ]               |
|                             |
|  Playback Speed             |
|  0.85x                      |
|  [---------O----------]     |
|                             |
|  Reverb                     |
|  65%                        |
|  [-------------O------]     |
|                             |
|  Presets                    |
|  [Dreamy] [Rainy] [Vinyl]   |
|                             |
|  Settings                   |
+-----------------------------+
```

The popup must reflect the actual audio engine state.

Changing a slider should update the running audio engine in real time.

### 5.2 Settings Page

Include:

- Automatically enable on supported websites.
- Manage supported websites.
- Add custom website.
- Remove custom website.
- Default playback speed.
- Default reverb intensity.
- Default preset.

### 5.3 Design Guidelines

Use a calm, minimal aesthetic.

Design direction:

- Dark theme by default.
- Muted colors.
- Subtle gradients.
- Rounded components.
- Minimal animations.
- Clear typography.
- No unnecessary visual clutter.

The UI should feel like a small music utility, not an administration dashboard.

## 6. Presets

Implement these initial presets:

| Preset                | Speed | Reverb |
| --------------------- | ----: | -----: |
| Slowed + Reverb       | 0.80x |    40% |
| Dreamy                | 0.85x |    35% |
| Rainy Night           | 0.75x |    55% |
| Vinyl                 | 0.90x |    22% |
| Deep Focus            | 0.95x |    15% |
| Original              | 1.00x |     0% |

Treat these as initial defaults. Keep preset definitions centralized and configurable.

Selecting a preset should update all associated audio parameters immediately.

## 7. Data Persistence

Use `chrome.storage.local`.

Suggested settings model:

```typescript
interface LofiSettings {
  enabled: boolean;
  autoEnable: boolean;

  playbackSpeed: number;
  reverbMix: number;

  selectedPreset: string;

  sites: SupportedSite[];

  siteSettings: Record<
    string,
    {
      playbackSpeed: number;
      reverbMix: number;
      enabled: boolean;
    }
  >;
}
```

Requirements:

- Provide default settings.
- Handle missing settings gracefully.
- Validate stored values.
- Avoid overwriting existing user settings during upgrades.
- Persist changes immediately.
- Keep settings independent per website where applicable.

## 8. Chrome Extension Permissions

Use Manifest V3.

Only request permissions that are necessary.

Expected permissions may include:

- `tabCapture`
- `offscreen`
- `storage`
- `activeTab`

Use optional host permissions for user-added websites where appropriate.

Do not request broad permissions without justification.

Never collect browsing history, credentials, cookies, or website content.

## 9. Error Handling

Handle the following cases:

- Unsupported website.
- Audio capture permission denied.
- Tab capture unavailable.
- AudioContext initialization failure.
- AudioWorklet loading failure.
- Tab closed during playback.
- Website navigation during processing.
- Invalid custom website.
- Audio processing failure.

Display meaningful error messages in the popup.

Never leave the extension in a state where the UI reports that processing is active when it is not.

Ensure audio tracks, nodes, and contexts are properly cleaned up.

## 10. Performance Requirements

Audio processing is the most important part of this application.

Requirements:

- Avoid blocking the browser's main thread.
- Use AudioWorklet for custom DSP.
- Avoid unnecessary allocations inside audio processing callbacks.
- Avoid memory leaks.
- Avoid creating multiple AudioContexts unnecessarily.
- Clean up unused streams and nodes.
- Keep CPU usage reasonable.
- Avoid introducing noticeable audio glitches.

Audio processing must remain functional when the popup is closed.

## 11. Privacy and Security

This extension should operate entirely locally.

Requirements:

- No backend server.
- No external API calls.
- No music downloads.
- No audio uploads.
- No analytics or telemetry by default.
- No tracking.
- No collection of personal information.

All audio processing must happen inside the browser.

## 12. Development Milestones

Implement the project incrementally.

Do not attempt to implement everything at once.

### Milestone 1: Project Foundation

- Initialize the React + TypeScript + Vite project.
- Configure Chrome Manifest V3.
- Set up the background service worker.
- Set up the offscreen document.
- Implement communication between components.
- Build and load the extension in Chrome.

Acceptance criteria:

- Extension loads without errors.
- Popup opens.
- Background service worker works.
- Offscreen document can be created.

### Milestone 2: Audio Capture

- Implement tabCapture.
- Obtain a stream ID through a user gesture.
- Pass the stream ID to the offscreen document.
- Initialize AudioContext.
- Connect captured audio to the destination without effects.
- Implement stop and cleanup.

Acceptance criteria:

- Capture audio from a YouTube tab.
- Hear the audio normally.
- Stop capture without refreshing the tab.
- No duplicate audio output.
- No resource leaks.

### Milestone 3: Audio Effects

- Implement reverb.
- Implement adjustable reverb intensity.
- Implement slowdown using AudioWorklet.
- Implement adjustable speed.
- Add basic equalizer controls.
- Add volume control.

Acceptance criteria:

- Reverb works in real time.
- Slowing works in real time.
- Settings can be changed while music is playing.
- No significant audio glitches.

### Milestone 4: Popup UI

- Build the popup.
- Add enable/disable controls.
- Add playback speed slider.
- Add reverb slider.
- Add presets.
- Connect UI to the audio engine.

Acceptance criteria:

- All controls work.
- UI reflects the actual processing state.
- Audio processing continues when popup closes.

### Milestone 5: Website Management

- Implement Spotify detection.
- Implement YouTube Music detection.
- Add custom website management.
- Add automatic website detection.
- Implement auto-enable settings.
- Implement per-site settings.

Acceptance criteria:

- Supported websites are detected.
- Custom websites can be added and removed.
- Settings persist after browser restart.
- Automatic activation respects Chrome permission requirements.

### Milestone 6: Polish and Testing

- Handle browser lifecycle events.
- Improve error handling.
- Test different Chromium versions.
- Optimize audio processing.
- Improve popup design.
- Write documentation.

## 13. Testing Strategy

Test against:

- YouTube.
- YouTube Music.
- Spotify Web Player.
- A custom HTML page containing an audio element.

Test scenarios:

- Enable processing.
- Disable processing.
- Change playback speed.
- Change reverb intensity.
- Switch presets.
- Close popup while audio is playing.
- Navigate between websites.
- Close the active tab.
- Open multiple tabs.
- Restart the browser.
- Add and remove custom websites.
- Deny permissions.

Do not consider the MVP complete until audio capture and processing work reliably.

## 14. Coding Standards

- Use TypeScript strict mode.
- Prefer small, focused modules.
- Use interfaces for shared data structures.
- Avoid `any` wherever possible.
- Avoid unnecessary abstractions.
- Keep audio processing independent of React.
- Keep browser API interactions centralized.
- Use meaningful names.
- Handle asynchronous operations and errors explicitly.
- Avoid global mutable state.
- Do not duplicate settings or preset definitions.
- Write comments for non-obvious DSP implementations.
- Keep dependencies minimal.

## 15. Instructions for the Coding Agent

Before implementing:

1. Inspect the existing repository.
2. Understand the current project structure.
3. Check the latest Chrome Extension Manifest V3 APIs and documentation.
4. Identify any technical limitations before choosing an implementation.
5. Propose a short implementation plan.

During implementation:

- Work milestone by milestone.
- Prioritize working audio capture over UI.
- Do not fake audio processing with UI-only controls.
- Do not claim an effect works until it actually processes audio.
- Test each milestone before moving forward.
- Keep the code maintainable and production-oriented.
- Do not introduce unnecessary features outside the product scope.

If a technical assumption proves incorrect, explain the issue and choose a technically sound alternative.

After completing each milestone, summarize:

- What was implemented.
- Important files changed.
- How to test it.
- Known limitations.
- Remaining tasks.

## 16. Definition of Done

The MVP is complete when:

- The extension installs successfully in Chrome.
- It detects Spotify and YouTube Music.
- It captures tab audio reliably.
- It slows down captured audio.
- It applies real-time reverb.
- Users can adjust both effects.
- Audio continues processing after closing the popup.
- Users can add custom websites.
- Settings persist across browser restarts.
- Audio resources are properly cleaned up.
- No audio is transmitted outside the browser.

**Primary objective: Build a working real-time audio transformation extension, not merely a visually complete browser extension.**
