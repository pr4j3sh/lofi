import { AudioEngine } from '../audio/audio-engine';
import { handleMessage, sendMessage } from '../utils/messaging';
import type { EngineStatus, ExtensionMessage, LofiSettings, MessageResponse, StartCapturePayload } from '../types';

const engine = new AudioEngine();

function publishStatus(status: EngineStatus): void {
  void sendMessage({ type: 'STATUS_CHANGED', target: 'background', payload: status });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean | undefined => {
  const handled = handleMessage(message, 'offscreen', async (request: ExtensionMessage): Promise<MessageResponse> => {
    switch (request.type) {
      case 'PING':
        return { ok: true, data: 'pong' };
      case 'GET_STATUS':
        return { ok: true, data: engine.getStatus() };
      case 'START_CAPTURE': {
        const status = await engine.start((request as { payload: StartCapturePayload }).payload);
        publishStatus(status);
        return { ok: true, data: status };
      }
      case 'STOP_CAPTURE': {
        const status = await engine.stop();
        publishStatus(status);
        return { ok: true, data: status };
      }
      case 'APPLY_SETTINGS': {
        const settings = (request as { payload: { settings: LofiSettings } }).payload.settings;
        engine.updateSettings(settings);
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unsupported offscreen message` };
    }
  });

  if (!handled) return undefined;
  void handled.then(sendResponse);
  return true;
});
