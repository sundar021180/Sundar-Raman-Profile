import { queryAll } from './dom.js';

export const initTimeline = (rootDocument = document) => {
  const timelineItems = queryAll('.timeline-item', rootDocument);
  if (timelineItems.length === 0) {
    return;
  }

  timelineItems.forEach((item) => {
    item.addEventListener('click', () => {
      timelineItems.forEach((entry) => entry.classList?.remove('active'));
      item.classList?.add('active');
    });
  });
};
