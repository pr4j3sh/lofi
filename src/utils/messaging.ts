import { isExtensionMessage, type ExtensionMessage, type MessageResponse } from '../types';

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unexpected error';
}

export async function sendMessage<T = unknown>(message: ExtensionMessage): Promise<MessageResponse<T>> {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response || typeof response !== 'object') {
      return { ok: false, error: 'No response from extension' };
    }
    return response as MessageResponse<T>;
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** Shared listener helper: ignores unrelated targets and converts thrown errors into responses. */
export function handleMessage(
  message: unknown,
  target: ExtensionMessage['target'],
  handler: (message: ExtensionMessage) => Promise<MessageResponse>,
): Promise<MessageResponse> | undefined {
  if (!isExtensionMessage(message) || message.target !== target) return undefined;
  return handler(message).catch((error: unknown) => ({ ok: false, error: errorMessage(error) }));
}
