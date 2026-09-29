// C01 installable build seam. The verified controller/message implementation replaces this.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined || !tab.url?.startsWith('http')) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
});
export {};
