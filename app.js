// ========================================
// Database and State Management
// ========================================

const DB_NAME = 'notepad_tools_db';
const DB_VERSION = 1;
let db = null;
let state = {
    notes: [],
    tools: [],
    currentNote: null,
    editingTool: null,
    activeTab: 'notes',
    activeTagFilter: null,
    settings: {
        theme: 'light',
        autosaveInterval: 3000
    },
    autosaveTimer: null,
    isDirty: false
};

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            if (!database.objectStoreNames.contains('notes')) {
                const notesStore = database.createObjectStore('notes', { keyPath: 'id' });
                notesStore.createIndex('title', 'title', { unique: false });
                notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            
            if (!database.objectStoreNames.contains('tools')) {
                const toolsStore = database.createObjectStore('tools', { keyPath: 'id' });
                toolsStore.createIndex('name', 'name', { unique: false });
                toolsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };
    });
}

// Load settings from localStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('notepad_settings');
    if (savedSettings) {
        state.settings = JSON.parse(savedSettings);
        applyTheme(state.settings.theme);
        document.getElementById('autosave-interval').value = state.settings.autosaveInterval;
    }
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('notepad_settings', JSON.stringify(state.settings));
}

// Apply theme
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.querySelector('.theme-icon').textContent = '☀️';
    } else {
        document.body.classList.remove('dark-theme');
        document.querySelector('.theme-icon').textContent = '🌙';
    }
}

// ========================================
// IndexedDB CRUD Operations
// ========================================

// Generic function to get all items from a store
function getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Generic function to add/update item in store
function putInStore(storeName, item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Generic function to delete item from store
function deleteFromStore(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ========================================
// Notes Functions
// ========================================

function createNote() {
    const note = {
        id: crypto.randomUUID(),
        title: 'Untitled Note',
        content: '',
        tags: [],
        pinned: false,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    return note;
}

async function loadNotes() {
    state.notes = await getAllFromStore('notes');
    renderNotesList();
}

async function saveNote(note) {
    note.updatedAt = new Date().toISOString();
    await putInStore('notes', note);
    
    const index = state.notes.findIndex(n => n.id === note.id);
    if (index >= 0) {
        state.notes[index] = note;
    } else {
        state.notes.push(note);
    }
    
    renderNotesList();
    updateSaveStatus('Saved');
    state.isDirty = false;
}

async function deleteNote(id) {
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    await deleteFromStore('notes', id);
    state.notes = state.notes.filter(n => n.id !== id);
    
    if (state.currentNote && state.currentNote.id === id) {
        state.currentNote = null;
        showEditorPlaceholder();
    }
    
    renderNotesList();
}

function filterAndSortNotes() {
    let filtered = [...state.notes];
    
    // Apply tag filter
    if (state.activeTagFilter) {
        filtered = filtered.filter(note => note.tags.includes(state.activeTagFilter));
    }
    
    // Apply search filter
    const searchQuery = document.getElementById('notes-search').value.toLowerCase();
    if (searchQuery) {
        filtered = filtered.filter(note => 
            note.title.toLowerCase().includes(searchQuery) ||
            note.content.toLowerCase().includes(searchQuery) ||
            note.tags.some(tag => tag.toLowerCase().includes(searchQuery))
        );
    }
    
    // Apply sorting
    const sortBy = document.getElementById('notes-sort').value;
    filtered.sort((a, b) => {
        switch(sortBy) {
            case 'updated-desc':
                return new Date(b.updatedAt) - new Date(a.updatedAt);
            case 'updated-asc':
                return new Date(a.updatedAt) - new Date(b.updatedAt);
            case 'created-desc':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'created-asc':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'title-asc':
                return a.title.localeCompare(b.title);
            case 'title-desc':
                return b.title.localeCompare(a.title);
            default:
                return 0;
        }
    });
    
    // Pinned notes always on top
    const pinned = filtered.filter(n => n.pinned);
    const unpinned = filtered.filter(n => !n.pinned);
    
    return [...pinned, ...unpinned];
}

function renderNotesList() {
    const notesList = document.getElementById('notes-list');
    const filteredNotes = filterAndSortNotes();
    
    if (filteredNotes.length === 0) {
        notesList.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 2rem;">No notes found</div>';
        return;
    }
    
    notesList.innerHTML = filteredNotes.map(note => {
        const badges = [];
        if (note.pinned) badges.push('📌');
        if (note.archived) badges.push('📦');
        
        return `
            <div class="note-item ${state.currentNote?.id === note.id ? 'active' : ''} ${note.pinned ? 'pinned' : ''} ${note.archived ? 'archived' : ''}" 
                 data-note-id="${note.id}"
                 data-testid="note-item-${note.id}">
                <div class="note-item-header">
                    <div class="note-item-title">${escapeHtml(note.title)}</div>
                    <div class="note-item-badges">${badges.join(' ')}</div>
                </div>
                <div class="note-item-preview">${escapeHtml(note.content.substring(0, 60))}${note.content.length > 60 ? '...' : ''}</div>
                ${note.tags.length > 0 ? `
                    <div class="note-item-tags">
                        ${note.tags.map(tag => `<span class="tag" data-tag="${escapeHtml(tag)}" data-testid="note-tag-${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    // Add click handlers
    notesList.querySelectorAll('.note-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tag')) {
                const noteId = item.dataset.noteId;
                selectNote(noteId);
            }
        });
    });
    
    // Add tag click handlers
    notesList.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            setTagFilter(tag.dataset.tag);
        });
    });
}

function selectNote(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    
    // Save current note if dirty
    if (state.currentNote && state.isDirty) {
        saveCurrentNote();
    }
    
    state.currentNote = note;
    state.isDirty = false;
    renderNoteEditor();
}

function renderNoteEditor() {
    const placeholder = document.getElementById('editor-placeholder');
    const content = document.getElementById('editor-content');
    
    if (!state.currentNote) {
        showEditorPlaceholder();
        return;
    }
    
    placeholder.classList.add('hidden');
    content.classList.remove('hidden');
    
    document.getElementById('note-title').value = state.currentNote.title;
    document.getElementById('note-tags').value = state.currentNote.tags.join(', ');
    document.getElementById('note-content').value = state.currentNote.content;
    
    renderNoteTags();
    updateNoteMetadata();
    updatePinArchiveButtons();
    
    renderNotesList(); // Re-render to update active state
}

function showEditorPlaceholder() {
    document.getElementById('editor-placeholder').classList.remove('hidden');
    document.getElementById('editor-content').classList.add('hidden');
}

function renderNoteTags() {
    const tagsDisplay = document.getElementById('note-tags-display');
    if (state.currentNote.tags.length === 0) {
        tagsDisplay.innerHTML = '';
        return;
    }
    
    tagsDisplay.innerHTML = state.currentNote.tags
        .map(tag => `<span class="tag" data-testid="editor-tag-${escapeHtml(tag)}">${escapeHtml(tag)}</span>`)
        .join('');
}

function updateNoteMetadata() {
    const metadata = document.getElementById('note-metadata');
    const created = new Date(state.currentNote.createdAt).toLocaleString();
    const updated = new Date(state.currentNote.updatedAt).toLocaleString();
    metadata.textContent = `Created: ${created} | Updated: ${updated}`;
}

function updatePinArchiveButtons() {
    const pinBtn = document.getElementById('pin-note-btn');
    const archiveBtn = document.getElementById('archive-note-btn');
    
    pinBtn.style.background = state.currentNote.pinned ? 'var(--accent-primary)' : '';
    archiveBtn.style.background = state.currentNote.archived ? 'var(--accent-primary)' : '';
}

function updateSaveStatus(status) {
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = status;
    
    if (status === 'Saving...') {
        saveStatus.style.color = 'var(--warning)';
    } else if (status === 'Saved') {
        saveStatus.style.color = 'var(--success)';
    }
}

function saveCurrentNote() {
    if (!state.currentNote) return;
    
    state.currentNote.title = document.getElementById('note-title').value || 'Untitled Note';
    state.currentNote.content = document.getElementById('note-content').value;
    
    const tagsInput = document.getElementById('note-tags').value;
    state.currentNote.tags = tagsInput
        .split(',') 
        .map(t => t.trim())
        .filter(t => t.length > 0);
    
    saveNote(state.currentNote);
    renderNoteTags();
}

function setupAutosave() {
    const interval = state.settings.autosaveInterval;
    
    if (state.autosaveTimer) {
        clearInterval(state.autosaveTimer);
        state.autosaveTimer = null;
    }
    
    if (interval !== 'off') {
        state.autosaveTimer = setInterval(() => {
            if (state.currentNote && state.isDirty) {
                updateSaveStatus('Saving...');
                saveCurrentNote();
            }
        }, parseInt(interval));
    }
}

// ========================================
// Tools Functions
// ========================================

function createTool() {
    return {
        id: crypto.randomUUID(),
        name: '',
        url: '',
        description: '',
        tags: [],
        favorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

async function loadTools() {
    state.tools = await getAllFromStore('tools');
    renderToolsGrid();
}

async function saveTool(tool) {
    tool.updatedAt = new Date().toISOString();
    await putInStore('tools', tool);
    
    const index = state.tools.findIndex(t => t.id === tool.id);
    if (index >= 0) {
        state.tools[index] = tool;
    } else {
        state.tools.push(tool);
    }
    
    renderToolsGrid();
}

async function deleteTool(id) {
    if (!confirm('Are you sure you want to delete this tool?')) return;
    
    await deleteFromStore('tools', id);
    state.tools = state.tools.filter(t => t.id !== id);
    renderToolsGrid();
}

async function toggleFavorite(id) {
    const tool = state.tools.find(t => t.id === id);
    if (!tool) return;
    
    tool.favorite = !tool.favorite;
    await saveTool(tool);
}

function filterAndSortTools() {
    let filtered = [...state.tools];
    
    // Apply tag filter
    if (state.activeTagFilter) {
        filtered = filtered.filter(tool => tool.tags.includes(state.activeTagFilter));
    }
    
    // Apply search filter
    const searchQuery = document.getElementById('tools-search').value.toLowerCase();
    if (searchQuery) {
        filtered = filtered.filter(tool => 
            tool.name.toLowerCase().includes(searchQuery) ||
            tool.description.toLowerCase().includes(searchQuery) ||
            tool.url.toLowerCase().includes(searchQuery) ||
            tool.tags.some(tag => tag.toLowerCase().includes(searchQuery))
        );
    }
    
    // Apply sorting
    const sortBy = document.getElementById('tools-sort').value;
    filtered.sort((a, b) => {
        switch(sortBy) {
            case 'updated-desc':
                return new Date(b.updatedAt) - new Date(a.updatedAt);
            case 'updated-asc':
                return new Date(a.updatedAt) - new Date(b.updatedAt);
            case 'created-desc':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'created-asc':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            default:
                return 0;
        }
    });
    
    // Favorite tools always on top
    const favorites = filtered.filter(t => t.favorite);
    const regular = filtered.filter(t => !t.favorite);
    
    return [...favorites, ...regular];
}

function renderToolsGrid() {
    const toolsGrid = document.getElementById('tools-grid');
    const filteredTools = filterAndSortTools();
    
    if (filteredTools.length === 0) {
        toolsGrid.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 2rem; grid-column: 1/-1;">No tools found</div>';
        return;
    }
    
    toolsGrid.innerHTML = filteredTools.map(tool => `
        <div class="tool-card" data-tool-id="${tool.id}" data-testid="tool-card-${tool.id}">
            <div class="tool-card-header">
                <div class="tool-card-title">${escapeHtml(tool.name)}</div>
                <div class="tool-card-actions">
                    <button class="favorite-btn ${tool.favorite ? 'active' : ''}" 
                            data-tool-id="${tool.id}"
                            data-testid="favorite-btn-${tool.id}"
                            title="Toggle favorite">⭐</button>
                    <button class="edit-tool-btn" 
                            data-tool-id="${tool.id}"
                            data-testid="edit-tool-btn-${tool.id}"
                            title="Edit">✏️</button>
                    <button class="delete-tool-btn" 
                            data-tool-id="${tool.id}"
                            data-testid="delete-tool-btn-${tool.id}"
                            title="Delete">🗑️</button>
                </div>
            </div>
            <a href="${escapeHtml(tool.url)}" class="tool-card-url" target="_blank" rel="noopener noreferrer" data-testid="tool-url-${tool.id}">${escapeHtml(tool.url)}</a>
            ${tool.description ? `<div class="tool-card-description">${escapeHtml(tool.description)}</div>` : ''}
            ${tool.tags.length > 0 ? `
                <div class="tool-card-tags">
                    ${tool.tags.map(tag => `<span class="tag" data-tag="${escapeHtml(tag)}" data-testid="tool-tag-${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');
    
    // Add event listeners
    toolsGrid.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(btn.dataset.toolId);
        });
    });
    
    toolsGrid.querySelectorAll('.edit-tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            editTool(btn.dataset.toolId);
        });
    });
    
    toolsGrid.querySelectorAll('.delete-tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTool(btn.dataset.toolId);
        });
    });
    
    toolsGrid.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            setTagFilter(tag.dataset.tag);
        });
    });
}

function showToolModal(tool = null) {
    state.editingTool = tool || createTool();
    
    document.getElementById('tool-modal-title').textContent = tool ? 'Edit Tool' : 'Add Tool';
    document.getElementById('tool-name').value = state.editingTool.name;
    document.getElementById('tool-url').value = state.editingTool.url;
    document.getElementById('tool-description').value = state.editingTool.description;
    document.getElementById('tool-tags').value = state.editingTool.tags.join(', ');
    
    document.getElementById('tool-modal').classList.add('active');
}

function hideToolModal() {
    document.getElementById('tool-modal').classList.remove('active');
    state.editingTool = null;
}

function saveToolFromModal() {
    const name = document.getElementById('tool-name').value.trim();
    const url = document.getElementById('tool-url').value.trim();
    
    if (!name || !url) {
        alert('Name and URL are required');
        return;
    }
    
    state.editingTool.name = name;
    state.editingTool.url = url;
    state.editingTool.description = document.getElementById('tool-description').value.trim();
    
    const tagsInput = document.getElementById('tool-tags').value;
    state.editingTool.tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
    
    saveTool(state.editingTool);
    hideToolModal();
}

function editTool(toolId) {
    const tool = state.tools.find(t => t.id === toolId);
    if (tool) {
        showToolModal(tool);
    }
}

// ========================================
// Tag Filter Functions
// ========================================

function setTagFilter(tag) {
    state.activeTagFilter = tag;
    renderTagFilter();
    
    if (state.activeTab === 'notes') {
        renderNotesList();
    } else {
        renderToolsGrid();
    }
}

function clearTagFilter() {
    state.activeTagFilter = null;
    renderTagFilter();
    
    if (state.activeTab === 'notes') {
        renderNotesList();
    } else {
        renderToolsGrid();
    }
}

function renderTagFilter() {
    const filterElement = document.getElementById('active-tag-filter');
    const tagName = document.getElementById('active-tag-name');
    
    if (state.activeTagFilter) {
        tagName.textContent = state.activeTagFilter;
        filterElement.classList.remove('hidden');
    } else {
        filterElement.classList.add('hidden');
    }
}

// ========================================
// Import/Export Functions
// ========================================

function exportData() {
    const data = {
        notes: state.notes,
        tools: state.tools,
        exportedAt: new Date().toISOString()
    };
    
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `notepad-tools-export-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

function importData() {
    document.getElementById('import-file-input').click();
}

async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate data structure
        if (!data.notes || !data.tools) {
            alert('Invalid import file format');
            return;
        }
        
        // Merge/upsert notes
        for (const note of data.notes) {
            const existing = state.notes.find(n => n.id === note.id);
            if (existing) {
                // Update existing
                Object.assign(existing, note);
                await putInStore('notes', existing);
            } else {
                // Add new
                await putInStore('notes', note);
                state.notes.push(note);
            }
        }
        
        // Merge/upsert tools
        for (const tool of data.tools) {
            const existing = state.tools.find(t => t.id === tool.id);
            if (existing) {
                // Update existing
                Object.assign(existing, tool);
                await putInStore('tools', existing);
            } else {
                // Add new
                await putInStore('tools', tool);
                state.tools.push(tool);
            }
        }
        
        // Re-render
        renderNotesList();
        renderToolsGrid();
        
        alert(`Import successful! Imported ${data.notes.length} notes and ${data.tools.length} tools.`);
    } catch (error) {
        console.error('Import error:', error);
        alert('Failed to import data. Please check the file format.');
    }
    
    // Reset file input
    event.target.value = '';
}

// ========================================
// UI Event Handlers
// ========================================

function switchTab(tabName) {
    state.activeTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });
    
    // Update view containers
    document.querySelectorAll('.view-container').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${tabName}-view`).classList.add('active');
}

// ========================================
// Utility Functions
// ========================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Smoke Tests
// ========================================

async function runSmokeTests() {
    console.log('🧪 Running Smoke Tests...');
    const results = [];
    
    try {
        // Test 1: Tool add + delete persistence
        console.log('Test 1: Tool add + delete persistence');
        const testTool = {
            id: crypto.randomUUID(),
            name: 'Test Tool',
            url: 'https://test.com',
            description: 'Test description',
            tags: ['test'],
            favorite: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await putInStore('tools', testTool);
        const retrievedTool = await getAllFromStore('tools');
        const toolExists = retrievedTool.some(t => t.id === testTool.id);
        await deleteFromStore('tools', testTool.id);
        const afterDelete = await getAllFromStore('tools');
        const toolDeleted = !afterDelete.some(t => t.id === testTool.id);
        results.push({ test: 'Tool add + delete', passed: toolExists && toolDeleted });
        
        // Test 2: Note add + delete persistence
        console.log('Test 2: Note add + delete persistence');
        const testNote = {
            id: crypto.randomUUID(),
            title: 'Test Note',
            content: 'Test content',
            tags: ['test'],
            pinned: false,
            archived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await putInStore('notes', testNote);
        const retrievedNotes = await getAllFromStore('notes');
        const noteExists = retrievedNotes.some(n => n.id === testNote.id);
        await deleteFromStore('notes', testNote.id);
        const afterNoteDelete = await getAllFromStore('notes');
        const noteDeleted = !afterNoteDelete.some(n => n.id === testNote.id);
        results.push({ test: 'Note add + delete', passed: noteExists && noteDeleted });
        
        // Test 3: Render stability
        console.log('Test 3: Render stability');
        await loadNotes();
        await loadTools();
        const notesRendered = document.getElementById('notes-list').children.length >= 0;
        const toolsRendered = document.getElementById('tools-grid').children.length >= 0;
        results.push({ test: 'Render stability', passed: notesRendered && toolsRendered });
        
        // Test 4: Favorite toggle
        console.log('Test 4: Favorite toggle');
        const favTool = {
            id: crypto.randomUUID(),
            name: 'Fav Test',
            url: 'https://fav.com',
            description: '',
            tags: [],
            favorite: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await putInStore('tools', favTool);
        state.tools.push(favTool);
        await toggleFavorite(favTool.id);
        const favToggled = state.tools.find(t => t.id === favTool.id).favorite === true;
        await deleteFromStore('tools', favTool.id);
        state.tools = state.tools.filter(t => t.id !== favTool.id);
        results.push({ test: 'Favorite toggle', passed: favToggled });
        
        // Test 5: Tag filter correctness
        console.log('Test 5: Tag filter correctness');
        const tagNote = {
            id: crypto.randomUUID(),
            title: 'Tag Test',
            content: 'Content',
            tags: ['important'],
            pinned: false,
            archived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await putInStore('notes', tagNote);
        state.notes.push(tagNote);
        setTagFilter('important');
        const filtered = filterAndSortNotes();
        const filterWorks = filtered.every(n => n.tags.includes('important'));
        clearTagFilter();
        await deleteFromStore('notes', tagNote.id);
        state.notes = state.notes.filter(n => n.id !== tagNote.id);
        results.push({ test: 'Tag filter', passed: filterWorks });
        
        // Display results
        console.table(results);
        
        const allPassed = results.every(r => r.passed);
        showTestBanner(allPassed ? '✅ All smoke tests passed!' : '⚠️ Some tests failed. Check console.');
        
    } catch (error) {
        console.error('Smoke tests failed:', error);
        showTestBanner('❌ Smoke tests encountered an error');
    }
}

function showTestBanner(message) {
    const banner = document.getElementById('test-banner');
    const messageEl = document.getElementById('test-message');
    
    messageEl.textContent = message;
    banner.classList.remove('hidden');
    
    setTimeout(() => {
        banner.classList.add('hidden');
    }, 5000);
}

// ========================================
// Initialization
// ========================================

async function initApp() {
    console.log('User authenticated, initializing app...');
    
    try {
        await initDB();
        loadSettings();
        await loadNotes();
        await loadTools();
        setupAutosave();
        
        // Update UI with user info
        window.authModule.updateUserUI();
        
        // Event Listeners
        
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
            applyTheme(state.settings.theme);
            saveSettings();
        });
        
        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => {
            document.getElementById('settings-modal').classList.add('active');
        });
        
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });
        
        document.getElementById('autosave-interval').addEventListener('change', (e) => {
            state.settings.autosaveInterval = e.target.value;
            saveSettings();
            setupAutosave();
        });
        
        // Import/Export
        document.getElementById('export-btn').addEventListener('click', exportData);
        document.getElementById('import-btn').addEventListener('click', importData);
        document.getElementById('import-file-input').addEventListener('change', handleImportFile);
        
        // Tag filter
        document.getElementById('clear-tag-filter').addEventListener('click', clearTagFilter);
        
        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });
        
        // Notes
        document.getElementById('new-note-btn').addEventListener('click', () => {
            const note = createNote();
            state.notes.push(note);
            saveNote(note);
            selectNote(note.id);
        });
        
        document.getElementById('notes-search').addEventListener('input', renderNotesList);
        document.getElementById('notes-sort').addEventListener('change', renderNotesList);
        
        document.getElementById('note-title').addEventListener('input', () => {
            state.isDirty = true;
            updateSaveStatus('Unsaved changes');
        });
        
        document.getElementById('note-content').addEventListener('input', () => {
            state.isDirty = true;
            updateSaveStatus('Unsaved changes');
        });
        
        document.getElementById('note-tags').addEventListener('input', () => {
            state.isDirty = true;
            updateSaveStatus('Unsaved changes');
        });
        
        document.getElementById('pin-note-btn').addEventListener('click', () => {
            if (state.currentNote) {
                state.currentNote.pinned = !state.currentNote.pinned;
                saveNote(state.currentNote);
                updatePinArchiveButtons();
            }
        });
        
        document.getElementById('archive-note-btn').addEventListener('click', () => {
            if (state.currentNote) {
                state.currentNote.archived = !state.currentNote.archived;
                saveNote(state.currentNote);
                updatePinArchiveButtons();
            }
        });
        
        document.getElementById('delete-note-btn').addEventListener('click', () => {
            if (state.currentNote) {
                deleteNote(state.currentNote.id);
            }
        });
        
        // Ctrl/Cmd+S to save
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (state.currentNote && state.isDirty) {
                    updateSaveStatus('Saving...');
                    saveCurrentNote();
                }
            }
        });
        
        // Tools
        document.getElementById('new-tool-btn').addEventListener('click', () => showToolModal());
        document.getElementById('tools-search').addEventListener('input', renderToolsGrid);
        document.getElementById('tools-sort').addEventListener('change', renderToolsGrid);
        
        document.getElementById('save-tool-btn').addEventListener('click', saveToolFromModal);
        document.getElementById('cancel-tool-btn').addEventListener('click', hideToolModal);
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
        
        console.log('✅ App initialized successfully');
        
        // Run smoke tests after init
        await runSmokeTests();
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
    }
}

async function init() {
    // Wait for authModule to be available
    let retries = 0;
    while (!window.authModule && retries < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (!window.authModule) {
        console.error('Auth module failed to load');
        return;
    }
    
    // Set up callback for when auth completes
    window.appInitialized = initApp;
    
    // Initialize authentication
    await window.authModule.initAuth();
    
    // If user is already authenticated, init app now
    if (window.authModule.authState.isAuthenticated) {
        await initApp();
    }
}

// Start the app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}