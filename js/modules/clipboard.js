const fallbackCopy = (text, rootDocument = document) => {
  if (!rootDocument) {
    throw new Error('Clipboard unavailable');
  }
  const textarea = rootDocument.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  rootDocument.body.appendChild(textarea);
  textarea.select();
  rootDocument.execCommand?.('copy');
  rootDocument.body.removeChild(textarea);
};

export const copyText = async (text, { clipboard = navigator?.clipboard, rootDocument = document } = {}) => {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Nothing to copy');
  }

  if (clipboard && typeof clipboard.writeText === 'function') {
    await clipboard.writeText(text);
    return;
  }

  fallbackCopy(text, rootDocument);
};
