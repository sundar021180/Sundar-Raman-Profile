import { queryAll } from './dom.js';
import { expandSectionById } from './collapsible.js';

export const initNavigation = (rootDocument = document) => {
  const navLinks = queryAll('nav a[href^="#"]', rootDocument);
  navLinks.forEach((link) => {
    if (link.id === 'contactLink') {
      return;
    }

    link.addEventListener('click', () => {
      const targetHash = link.getAttribute('href');
      const sectionId = targetHash ? targetHash.substring(1) : '';
      expandSectionById(sectionId, rootDocument);
    });
  });

  if (globalThis.window?.location?.hash) {
    const sectionId = globalThis.window.location.hash.substring(1);
    expandSectionById(sectionId, rootDocument);
  }
};
