document.addEventListener('DOMContentLoaded', () => {
    /* --- Contact modal functionality --- */
    const messageBox = document.getElementById('messageBox');
    const contactLink = document.getElementById('contactLink');
    const footerContactLink = document.getElementById('footerContactLink');
    const closeMessageBox = document.getElementById('closeMessageBox');
    const copyEmailBtn = document.getElementById('copyEmailBtn');
    const contactEmail = document.getElementById('contactEmail');

    const toggleMessageBox = (show) => {
        if (show) {
            messageBox.classList.remove('hidden');
            messageBox.classList.add('flex');
        } else {
            messageBox.classList.add('hidden');
            messageBox.classList.remove('flex');
        }
    };

    contactLink.addEventListener('click', (event) => {
        event.preventDefault();
        toggleMessageBox(true);
    });

    if (footerContactLink) {
        footerContactLink.addEventListener('click', (event) => {
            event.preventDefault();
            toggleMessageBox(true);
        });
    }

    closeMessageBox.addEventListener('click', () => toggleMessageBox(false));

    messageBox.addEventListener('click', (event) => {
        if (event.target === messageBox) {
            toggleMessageBox(false);
        }
    });

    copyEmailBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(contactEmail.textContent).then(() => {
            copyEmailBtn.classList.add('bg-green-100', 'text-green-700');
            copyEmailBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 5.707 10.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clip-rule="evenodd" />
                    <path d="M5 13l-2-2v5a2 2 0 002 2h10a2 2 0 002-2v-5l-2 2-3 3-3-3-4 4z" />
                </svg>`;
            setTimeout(() => {
                copyEmailBtn.classList.remove('bg-green-100', 'text-green-700');
                copyEmailBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 013 3v11a3 3 0 01-3 3H6a3 3 0 01-3-3V5a3 3 0 013-3z" />
                    </svg>`;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy email:', err);
        });
    });

    /* --- Timeline functionality --- */
    const timelineItems = document.querySelectorAll('.timeline-item');

    timelineItems.forEach(item => {
        item.addEventListener('click', () => {
            timelineItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });

    /* --- Collapsible sections --- */
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');

    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const target = header.getAttribute('data-target');
            const content = document.querySelector(`.collapsible-content[data-content="${target}"]`);
            const icon = header.querySelector('.toggle-icon');

            content.classList.toggle('expanded');
            icon.classList.toggle('rotated');
        });
    });

    /* --- Section toggles for portfolio and publications --- */
    const sectionToggles = document.querySelectorAll('.section-toggle');

    sectionToggles.forEach(button => {
        const targetId = button.getAttribute('data-target');
        const target = document.getElementById(targetId);

        if (!target) {
            return;
        }

        const label = button.getAttribute('data-label') || 'section';
        const expandIcon = button.querySelector('.icon-expand');
        const collapseIcon = button.querySelector('.icon-collapse');
        const labelSpan = button.querySelector('.section-toggle-label');

        const updateButtonState = () => {
            const isHidden = target.classList.contains('hidden');
            const expanded = !isHidden;
            const action = expanded ? 'Collapse' : 'Expand';
            const accessibleLabel = `${action} ${label}`;

            button.setAttribute('aria-expanded', expanded);
            button.setAttribute('aria-label', accessibleLabel);
            button.setAttribute('title', accessibleLabel);

            if (labelSpan) {
                labelSpan.textContent = accessibleLabel;
            }

            if (expandIcon) {
                expandIcon.classList.toggle('hidden', expanded);
            }

            if (collapseIcon) {
                collapseIcon.classList.toggle('hidden', !expanded);
            }
        };

        updateButtonState();

        button.addEventListener('click', () => {
            target.classList.toggle('hidden');
            updateButtonState();
        });
    });

    /* --- AI Generator Functionality --- */
    const generateBtn = document.getElementById('generateBtn');
    const generateContextBtn = document.getElementById('generateContextBtn');
    const topicInput = document.getElementById('topicInput');
    const contextPromptInput = document.getElementById('contextPromptInput');
    const contextSelect = document.getElementById('contextSelect');
    const resultContainer = document.getElementById('resultContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const insightText = document.getElementById('insightText');
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');
    const copyInsightBtn = document.getElementById('copyInsightBtn');

    const publications = [
        { id: 'pub1', title: 'Computational Estimation of Microsecond to Second Atomistic Folding Times', description: 'A research paper on developing computational methods for simulating and analyzing protein-ligand binding, which has implications for drug discovery.' },
        { id: 'pub2', title: 'Middle-way flexible docking', description: 'A publication focused on using a combined resolution approach with Monte Carlo simulations to predict the poses of molecules binding to estrogen receptors, a key step in computational drug design.' },
        { id: 'pub3', title: 'Role of length-dependent stability of collagen-like peptides', description: 'An early career research paper using molecular dynamics to investigate the stability of collagen-like peptides based on their length, highlighting foundational work in molecular simulation.' },
        { id: 'pub4', title: 'Exploring the changes in the structure of α-helical peptides adsorbed onto a single walled carbon nanotube', description: 'A research article detailing the use of classical molecular dynamics to analyze how the structure of α-helical peptides changes when they interact with carbon nanotubes, a topic with applications in bionanotechnology.' }
    ];

    const projects = [
        { id: 'proj1', title: 'AI-Powered Production Rate Prediction', description: 'Developed a machine learning model to predict the production rate of critical assets, enabling proactive adjustments and improving overall output.' },
        { id: 'proj2', title: 'Unburnt Fuel Prediction Inside Furnace Chambers', description: 'A predictive model that identifies conditions leading to unburnt fuel in furnaces, preventing safety incidents and optimizing fuel efficiency.' },
        { id: 'proj3', title: 'Corrosion Prediction using Drone Images', description: 'Utilized computer vision and machine learning to analyze drone imagery, automatically detecting and predicting corrosion on industrial equipment.' },
        { id: 'proj4', title: 'Service Level Prediction Platform', description: 'Developed an AI platform that forecasts service level performance to help with capacity planning and ensuring customer satisfaction.' },
        { id: 'proj5', title: 'Fraud Detection API', description: 'A microservice API that uses a combination of supervised and unsupervised learning to identify and flag fraudulent transactions in a large financial dataset.' }
    ];

    const optgroupPub = document.createElement('optgroup');
    optgroupPub.label = 'Publications';
    publications.forEach(pub => {
        const option = document.createElement('option');
        option.value = pub.description;
        option.textContent = pub.title;
        optgroupPub.appendChild(option);
    });

    const optgroupProj = document.createElement('optgroup');
    optgroupProj.label = 'Projects';
    projects.forEach(proj => {
        const option = document.createElement('option');
        option.value = proj.description;
        option.textContent = proj.title;
        optgroupProj.appendChild(option);
    });

    contextSelect.appendChild(optgroupPub);
    contextSelect.appendChild(optgroupProj);

    const generateInsight = async (prompt) => {
        loadingIndicator.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        errorContainer.classList.add('hidden');

        try {
            const response = await fetch('/api/generate-insight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Unknown error');
            }

            const data = await response.json();
            const insight = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (insight) {
                insightText.textContent = insight;
                resultContainer.classList.remove('hidden');
            } else {
                throw new Error('No insight generated. Please try again.');
            }
        } catch (error) {
            console.error('Failed to generate insight:', error);
            errorMessage.textContent = error.message;
            errorContainer.classList.remove('hidden');
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    };

    const generateProjectPrompt = (title, description) => {
        const safeTitle = title || 'the selected project';
        const detailSentence = description ? ` Here are the available details: ${description}` : '';
        return `Summarise the selected project "${safeTitle}".${detailSentence} Focus on the objectives, approach, and impact in two to three sentences.`;
    };

    generateBtn.addEventListener('click', () => {
        const topic = topicInput.value.trim();
        if (topic) {
            const prompt = `Generate a professional thought leadership insight on the topic "${topic}". The insight should be in a single paragraph, suitable for a resume or professional profile.`;
            generateInsight(prompt);
        } else {
            errorMessage.textContent = 'Please enter a topic to generate a general insight.';
            errorContainer.classList.remove('hidden');
        }
    });

    generateContextBtn.addEventListener('click', () => {
        const context = contextSelect.value;
        const userPrompt = contextPromptInput.value.trim();
        if (context && userPrompt) {
            const prompt = `Based on the following context: "${context}", generate a professional insight that addresses this question: "${userPrompt}". The insight should be in a single paragraph, suitable for a resume or professional profile.`;
            generateInsight(prompt);
        } else {
            errorMessage.textContent = 'Please select a publication or project and enter a question to generate a context-aware insight.';
            errorContainer.classList.remove('hidden');
        }
    });

    const projectLinks = document.querySelectorAll('.project-item a');

    projectLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();

            const projectItem = event.currentTarget.closest('.project-item');
            if (!projectItem) {
                errorMessage.textContent = 'Unable to identify the selected project. Please try again.';
                errorContainer.classList.remove('hidden');
                return;
            }

            const titleElement = projectItem.querySelector('[data-title]');
            const descriptionElement = projectItem.querySelector('[data-description]');

            const title = titleElement?.getAttribute('data-title')?.trim() || titleElement?.textContent?.trim();
            const description = descriptionElement?.getAttribute('data-description')?.trim() || descriptionElement?.textContent?.trim();

            if (!title && !description) {
                errorMessage.textContent = 'No details were found for the selected project. Please try another project.';
                errorContainer.classList.remove('hidden');
                return;
            }

            const prompt = generateProjectPrompt(title, description);
            generateInsight(prompt);
        });
    });

    copyInsightBtn.addEventListener('click', () => {
        const textToCopy = insightText.textContent;
        try {
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = copyInsightBtn.innerHTML;
                copyInsightBtn.innerHTML = 'Copied!';
                setTimeout(() => {
                    copyInsightBtn.innerHTML = originalText;
                }, 2000);
            }).catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = textToCopy;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);

                const originalText = copyInsightBtn.innerHTML;
                copyInsightBtn.innerHTML = 'Copied!';
                setTimeout(() => {
                    copyInsightBtn.innerHTML = originalText;
                }, 2000);
            });
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            const originalText = copyInsightBtn.innerHTML;
            copyInsightBtn.innerHTML = 'Copied!';
            setTimeout(() => {
                copyInsightBtn.innerHTML = originalText;
            }, 2000);
        }
    });
});
