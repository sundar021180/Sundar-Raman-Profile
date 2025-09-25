import { byId, toggleHidden, swapClasses } from './dom.js';
import { copyText } from './clipboard.js';

export const initContactModal = (rootDocument = document) => {
  const messageBox = byId('messageBox', rootDocument);
  const contactLink = byId('contactLink', rootDocument);
  const footerContactLink = byId('footerContactLink', rootDocument);
  const closeMessageBox = byId('closeMessageBox', rootDocument);
  const copyEmailBtn = byId('copyEmailBtn', rootDocument);
  const contactEmail = byId('contactEmail', rootDocument);

  if (!messageBox || !contactLink || !closeMessageBox || !contactEmail) {
    return;
  }

  const showMessageBox = (show) => {
    toggleHidden(messageBox, !show);
    if (show) {
      swapClasses(messageBox, ['flex'], ['hidden']);
    } else {
      swapClasses(messageBox, ['hidden'], ['flex']);
    }
  };

  contactLink.addEventListener('click', (event) => {
    event.preventDefault();
    showMessageBox(true);
  });

  if (footerContactLink) {
    footerContactLink.addEventListener('click', (event) => {
      event.preventDefault();
      showMessageBox(true);
    });
  }

  closeMessageBox.addEventListener('click', () => showMessageBox(false));

  messageBox.addEventListener('click', (event) => {
    if (event.target === messageBox) {
      showMessageBox(false);
    }
  });

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', async () => {
      try {
        await copyText(contactEmail.textContent || '', { rootDocument });
        swapClasses(copyEmailBtn, ['bg-green-100', 'text-green-700'], []);
        copyEmailBtn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">' +
          '<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 5.707 10.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clip-rule="evenodd"></path>' +
          '<path d="M5 13l-2-2v5a2 2 0 002 2h10a2 2 0 002-2v-5l-2 2-3 3-3-3-4 4z"></path>' +
          '</svg>';
        setTimeout(() => {
          swapClasses(copyEmailBtn, [], ['bg-green-100', 'text-green-700']);
          copyEmailBtn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">' +
            '<path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"></path>' +
            '<path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 013 3v11a3 3 0 01-3 3H6a3 3 0 01-3-3V5a3 3 0 013-3z"></path>' +
            '</svg>';
        }, 2000);
      } catch (error) {
        console.error('Failed to copy email:', error);
      }
    });
  }
};
