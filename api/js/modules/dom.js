export const byId = (id, root = document) => {
  if (!root || typeof root.getElementById !== 'function') {
    return null;
  }
  return root.getElementById(id);
};

export const query = (selector, root = document) => {
  if (!root || typeof root.querySelector !== 'function') {
    return null;
  }
  return root.querySelector(selector);
};

export const queryAll = (selector, root = document) => {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return [];
  }
  return Array.from(root.querySelectorAll(selector));
};

export const toggleHidden = (element, hidden) => {
  if (!element || !element.classList) {
    return;
  }
  element.classList.toggle('hidden', hidden);
};

export const swapClasses = (element, classesToAdd = [], classesToRemove = []) => {
  if (!element || !element.classList) {
    return;
  }
  classesToRemove.forEach((cls) => element.classList.remove(cls));
  classesToAdd.forEach((cls) => element.classList.add(cls));
};

export const setText = (element, value) => {
  if (!element) {
    return;
  }
  element.textContent = value;
};

export const safeScrollIntoView = (element) => {
  if (!element || typeof element.scrollIntoView !== 'function') {
    return;
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
