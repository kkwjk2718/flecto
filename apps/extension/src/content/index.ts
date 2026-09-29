import { FlectoController } from './controller';

const scope = globalThis as typeof globalThis & { __flectoController?: FlectoController };
async function activateWhenReady(pendingSubmit = false, autoPrepare = false): Promise<void> {
  if (document.readyState === 'loading') await new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  await scope.__flectoController!.activate(pendingSubmit, autoPrepare);
}
if (!scope.__flectoController) {
  scope.__flectoController = new FlectoController(document);
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
    const item = message as { type?: string; pendingSubmit?: boolean; autoPrepare?: boolean };
    if (item.type === 'FLECTO_VISION_GUARD' || item.type === 'FLECTO_VISION_RELEASE') {
      if (sender.tab) return; // callbacks are background-only, never another content script
      void scope.__flectoController!.visionCallback(message).then(sendResponse, () => sendResponse(null));
      return true;
    }
    if (item.type === 'FLECTO_ACTIVATE' && !sender.tab) void activateWhenReady(!!item.pendingSubmit, item.autoPrepare === true);
    if (item.type === 'FLECTO_SOURCE_NAVIGATION') scope.__flectoController!.sourceNavigation();
    if (item.type === 'FLECTO_DEACTIVATE') void scope.__flectoController!.close();
  });
}
void activateWhenReady();
