import { initContactModal } from './modules/contact-modal.js';
import { initTimeline } from './modules/timeline.js';
import { initCollapsibleSections } from './modules/collapsible.js';
import { initNavigation } from './modules/navigation.js';
import { initAiGenerator } from './modules/ai-generator.js';

document.addEventListener('DOMContentLoaded', () => {
  initContactModal();
  initTimeline();
  initCollapsibleSections();
  initNavigation();
  initAiGenerator();
});
