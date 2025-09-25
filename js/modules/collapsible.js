import { queryAll, query, toggleHidden, setText } from './dom.js';

const updateToggleState = (button, target) => {
  if (!button || !target) {
    return;
  }

  const expandIcon = query('.icon-expand', button);
  const collapseIcon = query('.icon-collapse', button);
  const labelSpan = query('.section-toggle-label', button);
  const label = button.getAttribute('data-label') || 'section';
  const isHidden = target.classList?.contains('hidden');
  const expanded = !isHidden;
  const action = expanded ? 'Collapse' : 'Expand';
  const accessibleLabel = `${action} ${label}`;

  button.setAttribute('aria-expanded', expanded);
  button.setAttribute('aria-label', accessibleLabel);
  button.setAttribute('title', accessibleLabel);

  if (labelSpan) {
    setText(labelSpan, accessibleLabel);
  }

  expandIcon?.classList?.toggle('hidden', expanded);
  collapseIcon?.classList?.toggle('hidden', !expanded);
};

export const initCollapsibleSections = (rootDocument = document) => {
  const collapsibleHeaders = queryAll('.collapsible-header', rootDocument);
  collapsibleHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const targetName = header.getAttribute('data-target');
      if (!targetName) {
        return;
      }

      const content = query(`.collapsible-content[data-content="${targetName}"]`, rootDocument);
      const icon = query('.toggle-icon', header);
      content?.classList?.toggle('expanded');
      icon?.classList?.toggle('rotated');
    });
  });

  const sectionToggles = queryAll('.section-toggle', rootDocument);
  sectionToggles.forEach((button) => {
    const targetId = button.getAttribute('data-target');
    if (!targetId) {
      return;
    }

    const targetElement = query(`#${targetId}`, rootDocument);
    if (!targetElement) {
      return;
    }

    updateToggleState(button, targetElement);

    button.addEventListener('click', () => {
      toggleHidden(targetElement, !targetElement.classList?.contains('hidden'));
      updateToggleState(button, targetElement);
    });
  });
};

export const expandSectionById = (sectionId, rootDocument = document) => {
  if (!sectionId) {
    return;
  }

  const section = query(`#${sectionId}`, rootDocument);
  if (!section || !section.hasAttribute('data-collapsible')) {
    return;
  }

  const toggleButton = query('.section-toggle', section);
  if (!toggleButton) {
    return;
  }

  const targetId = toggleButton.getAttribute('data-target');
  if (!targetId) {
    return;
  }

  const targetElement = query(`#${targetId}`, rootDocument);
  if (targetElement && targetElement.classList?.contains('hidden')) {
    toggleButton.click();
  }
};
