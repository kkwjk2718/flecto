import { FlectoController } from './controller';

const scope = globalThis as typeof globalThis & { __flectoController?: FlectoController };
if (!scope.__flectoController) {
  scope.__flectoController = new FlectoController(document);
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
    const item = message as { type?: string; pendingSubmit?: boolean };
    if (item.type === 'FLECTO_ACTIVATE') void scope.__flectoController!.activate(!!item.pendingSubmit);
    if (item.type === 'FLECTO_SOURCE_NAVIGATION') scope.__flectoController!.sourceNavigation();
    if (item.type === 'FLECTO_DEACTIVATE') void scope.__flectoController!.close();
  });
}
void scope.__flectoController.activate();
