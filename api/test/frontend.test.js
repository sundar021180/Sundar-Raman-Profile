const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulePath = pathToFileURL(path.join(__dirname, '..', '..', 'js', 'modules', 'ai-generator.js')).href;

class MockElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.attributes = new Map();
        this.value = '';
        this._textContent = '';
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    append(...nodes) {
        nodes.forEach((node) => this.appendChild(node));
    }

    set textContent(value) {
        this._textContent = value;
    }

    get textContent() {
        return this._textContent;
    }
}

test('prompt builders produce contextualised strings', async () => {
    const { buildProjectPrompt, buildPublicationPrompt, buildGeneralPrompt } = await import(modulePath);

    const projectPrompt = buildProjectPrompt('AI Project', 'Predictive maintenance');
    assert.match(projectPrompt, /AI Project/);
    assert.match(projectPrompt, /Predictive maintenance/);

    const publicationPrompt = buildPublicationPrompt('Research Paper', 'Deep learning approach');
    assert.match(publicationPrompt, /Research Paper/);
    assert.match(publicationPrompt, /Deep learning approach/);

    const generalPrompt = buildGeneralPrompt('Ethical AI');
    assert.match(generalPrompt, /Ethical AI/);
});

test('populateContextSelect creates optgroups with options', async () => {
    const { populateContextSelect } = await import(modulePath);
    const selectElement = new MockElement('select');

    const mockDocument = {
        createElement: (tag) => new MockElement(tag)
    };

    populateContextSelect(selectElement, {
        publications: [
            { id: 'pub', title: 'Publication', description: 'Details' }
        ],
        projects: [
            { id: 'proj', title: 'Project', description: 'Impact' }
        ]
    }, mockDocument);

    assert.equal(selectElement.children.length, 2);
    const [pubGroup, projGroup] = selectElement.children;
    assert.equal(pubGroup.tagName, 'optgroup');
    assert.equal(projGroup.tagName, 'optgroup');
    assert.equal(pubGroup.children.length, 1);
    assert.equal(projGroup.children.length, 1);
    assert.equal(pubGroup.children[0].value, 'Details');
    assert.equal(projGroup.children[0].value, 'Impact');
});
