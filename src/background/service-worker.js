// Hide Promoted Jobs on LinkedIn - Service Worker

// Initialize default state on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    // Set default enabled state
    chrome.storage.sync.set({ enabled: true });

    // Inject content scripts into already-open LinkedIn tabs
    injectIntoExistingTabs();
  }
});

// Inject content scripts into existing LinkedIn tabs
async function injectIntoExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });

    for (const tab of tabs) {
      try {
        // Inject CSS files
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['src/content/styles.css']
        });

        // Inject JS files in order
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [
            'src/content/hidden-jobs-store.js',
            'src/content/content.js'
          ]
        });

      } catch (err) {
        // Tab may not be injectable (e.g. chrome:// pages)
      }
    }
  } catch (err) {
    // Tabs query failed
  }
}

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we're on LinkedIn
  if (tab.url && tab.url.includes('linkedin.com')) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (err) {
      // Side panel may not be available
    }
  }
});

// Optional: Handle messages from content script or popup if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getState') {
    chrome.storage.sync.get(['enabled'], (result) => {
      sendResponse({ enabled: result.enabled !== false });
    });
    return true; // Keep channel open for async response
  }
});
