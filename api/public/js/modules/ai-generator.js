import { contextOptions } from '../data/catalog.js';
import {
  byId,
  queryAll,
  toggleHidden,
  setText,
  safeScrollIntoView
} from './dom.js';
import { copyText } from './clipboard.js';

const STORAGE_KEY = 'ai-generator-access-token';

export const populateContextSelect = (selectElement, { publications, projects } = contextOptions, rootDocument = document) => {
  if (!selectElement || !rootDocument) {
    return;
  }

  const createOption = (item) => {
    const option = rootDocument.createElement('option');
    option.value = item.description;
    option.textContent = item.title;
    return option;
  };

  const publicationGroup = rootDocument.createElement('optgroup');
  publicationGroup.label = 'Publications';
  publications.forEach((pub) => publicationGroup.appendChild(createOption(pub)));

  const projectGroup = rootDocument.createElement('optgroup');
  projectGroup.label = 'Projects';
  projects.forEach((proj) => projectGroup.appendChild(createOption(proj)));

  selectElement.append(publicationGroup, projectGroup);
};

export const buildProjectPrompt = (title, description) => {
  const safeTitle = title || 'the selected project';
  const detailSentence = description ? ` Here are the available details: ${description}` : '';
  return `Summarise the selected project "${safeTitle}".${detailSentence} Focus on the objectives, approach, and impact in two to three sentences.`;
};

export const buildPublicationPrompt = (title, description) => {
  const safeTitle = title || 'the selected publication';
  const detailSentence = description ? ` Here are the available details: ${description}` : '';
  return `Summarise the key contribution of the publication "${safeTitle}".${detailSentence} Highlight the research problem, methodology, findings, and potential real-world impact in two to three sentences suitable for an executive profile.`;
};

export const buildGeneralPrompt = (topic) => {
  return `Generate a professional thought leadership insight on the topic "${topic}". The insight should be in a single paragraph, suitable for a resume or professional profile.`;
};

const loadToken = (storage) => {
  try {
    return storage?.getItem?.(STORAGE_KEY) || '';
  } catch (error) {
    console.warn('Unable to load stored access token', error);
    return '';
  }
};

const persistToken = (storage, token) => {
  try {
    if (!storage?.setItem) {
      return;
    }
    storage.setItem(STORAGE_KEY, token);
  } catch (error) {
    console.warn('Unable to persist access token', error);
  }
};

const extractToken = (input) => (input?.value || '').trim();

const withToken = (input, storage) => {
  if (!input) {
    return '';
  }
  const stored = loadToken(storage);
  if (stored) {
    input.value = stored;
  }

  input.addEventListener('change', () => {
    persistToken(storage, extractToken(input));
  });
  input.addEventListener('blur', () => {
    persistToken(storage, extractToken(input));
  });

  return extractToken(input);
};

const showError = (container, messageElement, message) => {
  if (!container || !messageElement) {
    return;
  }
  setText(messageElement, message);
  toggleHidden(container, false);
};

const hideError = (container) => {
  if (!container) {
    return;
  }
  toggleHidden(container, true);
};

const showResult = (container, textElement, text, copyButton) => {
  if (textElement) {
    setText(textElement, text);
  }
  if (copyButton) {
    toggleHidden(copyButton, false);
  }
  toggleHidden(container, false);
};

const hideResult = (container, copyButton) => {
  toggleHidden(container, true);
  if (copyButton) {
    toggleHidden(copyButton, true);
  }
};

const setLoading = (element, isLoading) => {
  if (!element) {
    return;
  }
  toggleHidden(element, !isLoading);
};

const createRequest = async ({
  prompt,
  fetcher,
  token,
  onSuccess,
  onError,
  ui
}) => {
  const {
    loadingElement,
    resultElement,
    errorElement,
    errorMessageElement,
    textElement,
    copyButton
  } = ui;

  hideError(errorElement);
  hideResult(resultElement, copyButton);
  setLoading(loadingElement, true);

  if (!token) {
    setLoading(loadingElement, false);
    showError(errorElement, errorMessageElement, 'Please enter your Gemini API key before generating insights.');
    return;
  }

  try {
    const response = await fetcher('/api/generate-insight', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'X-Gemini-Api-Key': token
      },
      body: JSON.stringify({ prompt })
    });

    let data;

    if (!response.ok) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      const message = data?.error || data?.message || `Request failed with status ${response.status}`;
      const details = data?.details;
      throw new Error(details ? `${message} (${details})` : message);
    }

    data = data || (await response.json());
    const insight = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!insight) {
      throw new Error('No insight generated. Please try again.');
    }

    showResult(resultElement, textElement, insight, copyButton);
    if (typeof onSuccess === 'function') {
      onSuccess(insight);
    }
  } catch (error) {
    console.error('Failed to generate insight:', error);
    showError(errorElement, errorMessageElement, error.message);
    if (typeof onError === 'function') {
      onError(error);
    }
  } finally {
    setLoading(loadingElement, false);
  }
};

const registerCopyHandler = (button, textElement) => {
  if (!button || !textElement) {
    return;
  }

  button.addEventListener('click', async () => {
    const textToCopy = textElement.textContent || '';
    try {
      await copyText(textToCopy);
      const originalMarkup = button.innerHTML;
      button.innerHTML = 'Copied!';
      setTimeout(() => {
        button.innerHTML = originalMarkup;
      }, 2000);
    } catch (error) {
      console.error('Copy failed', error);
    }
  });
};

const resolveContextDetails = (item) => {
  if (!item) {
    return { title: '', description: '' };
  }

  const titleElement = item.querySelector('[data-title]');
  const descriptionElement = item.querySelector('[data-description]');
  const title = titleElement?.getAttribute('data-title')?.trim() || titleElement?.textContent?.trim() || '';
  const description =
    descriptionElement?.getAttribute('data-description')?.trim() || descriptionElement?.textContent?.trim() || '';

  return { title, description };
};

const buildUiContext = (rootDocument) => ({
  loadingElement: byId('loadingIndicator', rootDocument),
  resultElement: byId('resultContainer', rootDocument),
  errorElement: byId('errorContainer', rootDocument),
  errorMessageElement: byId('errorMessage', rootDocument),
  textElement: byId('insightText', rootDocument),
  copyButton: byId('copyInsightBtn', rootDocument)
});

export const initAiGenerator = ({
  rootDocument = document,
  fetcher = globalThis.fetch,
  storage = globalThis.localStorage
} = {}) => {
  if (typeof fetcher !== 'function') {
    console.error('Fetch implementation is not available.');
    return;
  }

  const generateBtn = byId('generateBtn', rootDocument);
  const generateContextBtn = byId('generateContextBtn', rootDocument);
  const topicInput = byId('topicInput', rootDocument);
  const contextPromptInput = byId('contextPromptInput', rootDocument);
  const contextSelect = byId('contextSelect', rootDocument);
  const projectLoadingIndicator = byId('projectLoadingIndicator', rootDocument);
  const projectInsightContainer = byId('projectInsightContainer', rootDocument);
  const projectInsightText = byId('projectInsightText', rootDocument);
  const projectInsightTitle = byId('projectInsightTitle', rootDocument);
  const projectErrorContainer = byId('projectErrorContainer', rootDocument);
  const projectErrorMessage = byId('projectErrorMessage', rootDocument);
  const publicationLoadingIndicator = byId('publicationLoadingIndicator', rootDocument);
  const publicationInsightContainer = byId('publicationInsightContainer', rootDocument);
  const publicationInsightTitle = byId('publicationInsightTitle', rootDocument);
  const publicationInsightText = byId('publicationInsightText', rootDocument);
  const publicationErrorContainer = byId('publicationErrorContainer', rootDocument);
  const publicationErrorMessage = byId('publicationErrorMessage', rootDocument);
  const accessTokenInput = byId('accessTokenInput', rootDocument);

  const uiContext = buildUiContext(rootDocument);

  registerCopyHandler(uiContext.copyButton, uiContext.textElement);

  if (contextSelect) {
    populateContextSelect(contextSelect, contextOptions, rootDocument);
  }

  let activeToken = withToken(accessTokenInput, storage);

  accessTokenInput?.addEventListener('input', () => {
    activeToken = extractToken(accessTokenInput);
  });

  const baseRequest = (prompt, uiOverrides = {}, callbacks = {}) => {
    const combinedUi = { ...uiContext, ...uiOverrides };
    return createRequest({
      prompt,
      fetcher,
      token: activeToken,
      onSuccess: callbacks.onSuccess,
      onError: callbacks.onError,
      ui: combinedUi
    });
  };

  generateBtn?.addEventListener('click', () => {
    const topic = topicInput?.value?.trim();
    if (!topic) {
      showError(uiContext.errorElement, uiContext.errorMessageElement, 'Please enter a topic to generate a general insight.');
      return;
    }
    baseRequest(buildGeneralPrompt(topic));
  });

  generateContextBtn?.addEventListener('click', () => {
    const context = contextSelect?.value;
    const userPrompt = contextPromptInput?.value?.trim();
    if (!context || !userPrompt) {
      showError(
        uiContext.errorElement,
        uiContext.errorMessageElement,
        'Please select a publication or project and enter a question to generate a context-aware insight.'
      );
      return;
    }
    baseRequest(`Based on the following context: "${context}", generate a professional insight that addresses this question: "${userPrompt}". The insight should be in a single paragraph, suitable for a resume or professional profile.`);
  });

  const projectLinks = queryAll('.project-item a', rootDocument);
  projectLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const projectItem = event.currentTarget.closest('.project-item');
      if (!projectItem) {
        showError(projectErrorContainer, projectErrorMessage, 'Unable to identify the selected project. Please try again.');
        return;
      }

      const { title, description } = resolveContextDetails(projectItem);
      if (!title && !description) {
        showError(projectErrorContainer, projectErrorMessage, 'No details were found for the selected project. Please try another project.');
        return;
      }

      if (projectInsightTitle) {
        setText(projectInsightTitle, title ? `Project Insight: ${title}` : 'Project Insight');
      }

      baseRequest(buildProjectPrompt(title, description), {
        loadingElement: projectLoadingIndicator,
        resultElement: projectInsightContainer,
        errorElement: projectErrorContainer,
        errorMessageElement: projectErrorMessage,
        textElement: projectInsightText
      }, {
        onSuccess: () => safeScrollIntoView(projectInsightContainer)
      });
    });
  });

  const publicationButtons = queryAll('.generate-publication-insight', rootDocument);
  publicationButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const publicationItem = button.closest('.publication-item');
      if (!publicationItem) {
        showError(
          publicationErrorContainer,
          publicationErrorMessage,
          'Unable to identify the selected publication. Please try again.'
        );
        return;
      }

      const { title, description } = resolveContextDetails(publicationItem);
      if (!title && !description) {
        showError(
          publicationErrorContainer,
          publicationErrorMessage,
          'No details were found for the selected publication. Please try another publication.'
        );
        return;
      }

      if (publicationInsightTitle) {
        setText(publicationInsightTitle, title ? `Publication Insight: ${title}` : 'Publication Insight');
      }

      baseRequest(buildPublicationPrompt(title, description), {
        loadingElement: publicationLoadingIndicator,
        resultElement: publicationInsightContainer,
        errorElement: publicationErrorContainer,
        errorMessageElement: publicationErrorMessage,
        textElement: publicationInsightText
      }, {
        onSuccess: () => safeScrollIntoView(publicationInsightContainer)
      });
    });
  });
};
