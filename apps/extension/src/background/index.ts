import { BackgroundBroker } from './broker';

export function startBackground(api: typeof chrome) {
  const broker = new BackgroundBroker(api);
  const event = (work: Promise<unknown>) => { void work.catch(() => undefined); };
  // Register listeners synchronously, before asynchronous storage restoration.
  api.runtime.onMessage.addListener((message, sender, reply) => {
    void broker.handle(message, sender).then(reply);
    return true;
  });
  api.action.onClicked.addListener((tab) => event(broker.activate(tab)));
  api.webNavigation.onCommitted.addListener((details) => event(broker.navigation(details)));
  api.webNavigation.onHistoryStateUpdated.addListener((details) => event(broker.navigation(details, true)));
  api.webNavigation.onReferenceFragmentUpdated.addListener((details) => event(broker.navigation(details, true)));
  api.tabs.onRemoved.addListener((tabId) => event(broker.remove(tabId)));
  api.tabs.onActivated.addListener((info) => broker.tabActivated(info));
  api.tabs.onReplaced.addListener((_added, removed) => event(broker.remove(removed)));
  return broker;
}

// The only startup guard: helpers/broker remain directly testable without Chrome.
export const background = typeof chrome !== 'undefined' && chrome.runtime?.id ? startBackground(chrome) : null;
