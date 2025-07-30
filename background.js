chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "beautifyQuote" && info.selectionText) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ["capture.js"],
      },
      () => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (selectedText) => {
            createQuoteImage(selectedText);
          },
          args: [info.selectionText],
        });
      }
    );
  }
});
