import { EPUBBook } from './js/epub-engine.js';
import { I18N } from './js/constants.js';

let currentLang = localStorage.getItem('kdp_lang') || 'en';
let epubInstances = [];
let filenames = [];
let dlfilenames = [];
let currentEditIdx = null;

const outputDiv = document.getElementById('output');
const mainStatusDiv = document.getElementById('main_status');
const fileInput = document.getElementById('file');
const dropZone = document.getElementById('drop-zone');
const btnDlAll = document.getElementById('btnDlAll');

function t(key, n) {
  let text = I18N[currentLang][key] || key;
  if (n !== undefined) text = text.replace('{n}', n);
  return text;
}

function applyI18N() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerText = t(key);
  });
}

function buildOutputHTML(idx) {
  const epub = epubInstances[idx];
  const card = document.createElement('div');
  card.className = 'result-card';

  // Status icon mapping
  const statusIcons = {
    'applied': 'check-circle',
    'verified': 'circle-check',
    'warning': 'alert-triangle',
    'skipped': 'minus-circle'
  };

  // Tooltip messages
  const statusTooltips = {
    'applied': t('tooltip_applied'),
    'verified': t('tooltip_verified'),
    'warning': t('tooltip_warning'),
    'skipped': t('tooltip_skipped')
  };

  card.innerHTML = `
    <div class="result-header">
      <h3>${filenames[idx]}</h3>
    </div>
    <div class="cover-container">
      <div class="cover-preview" onclick="document.getElementById('cover-pick-${idx}').click()">
        ${epub.coverUrl ? `<img src="${epub.coverUrl}" alt="Cover">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--apple-text-secondary)">${t('no_cover')}</div>`}
      </div>
      <div class="cover-info">
        <div class="meta-info" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">
          <span class="meta-badge">${epub.metadata.title || t('unknown')}</span>
          <span class="meta-badge">${epub.metadata.author || t('unknown')}</span>
          <span class="meta-badge">${epub.metadata.language || '??'}</span>
        </div>
        <ul class="optimization-checklist">
          ${epub.optimizations.map(opt => `
            <li class="opt-item ${opt.status}" title="${statusTooltips[opt.status] || ''}">
              <div class="opt-status">
                <i data-lucide="${statusIcons[opt.status] || 'circle'}"></i>
              </div>
              <span>${t(opt.id, opt.payload)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
    <div class="result-actions" style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap">
      <button class="dl-btn btn-secondary" style="flex:1;min-width:120px" onclick="window.openEditor(${idx})" data-i18n="edit_meta">${t('edit_meta')}</button>
      <button class="dl-btn btn-secondary" style="flex:1;min-width:120px" onclick="window.openReader(${idx})" data-i18n="preview">${t('preview')}</button>
      <button class="dl-btn" style="flex:1;min-width:120px" onclick="window.downloadEpub(${idx})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span data-i18n="download">${t('download')}</span>
      </button>
    </div>
    <input type="file" id="cover-pick-${idx}" style="display:none" accept="image/jpeg,image/png" onchange="window.handleCoverChange(${idx}, this.files[0])">
  `;

  // Initialize Lucide icons
  setTimeout(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, 0);

  return card;
}

async function handleFiles(files) {
  mainStatusDiv.style.display = 'block';
  mainStatusDiv.innerText = t('processing');
  mainStatusDiv.setAttribute('data-i18n', 'processing');
  mainStatusDiv.style.background = 'rgba(0, 122, 255, 0.1)';
  mainStatusDiv.style.color = 'var(--apple-blue)';
  outputDiv.innerHTML = '';
  btnDlAll.style.display = 'none';

  epubInstances = [];
  filenames = [];
  dlfilenames = [];

  const fileArray = Array.from(files);
  const startTime = performance.now();

  const results = await Promise.all(fileArray.map(async file => {
    try {
      const epub = new EPUBBook();
      await epub.readEPUB(file);
      epub.parseMetadata();
      epub.findCover();
      await epub.runAllOptimizations();
      return { epub, name: file.name, error: null };
    } catch (e) {
      console.error('Error processing:', file.name, e);
      return { epub: null, name: file.name, error: e.message };
    }
  }));

  results.forEach(res => {
    if (res.epub) {
      epubInstances.push(res.epub);
      filenames.push(res.name);
      dlfilenames.push(res.name);
      outputDiv.appendChild(buildOutputHTML(epubInstances.length - 1));
    } else {
      // Show error card for failed files
      const errorCard = document.createElement('div');
      errorCard.className = 'result-card';
      errorCard.style.borderColor = '#FF3B30';
      errorCard.innerHTML = `
        <div class="result-header">
          <h3 style="color: #FF3B30;">❌ ${res.name}</h3>
        </div>
        <p style="color: var(--text-secondary); margin: 1rem 0;">
          ${t('err_processing')}: ${res.error || t('err_unknown')}
        </p>
      `;
      outputDiv.appendChild(errorCard);
    }
  });

  mainStatusDiv.innerText = t('done');
  mainStatusDiv.setAttribute('data-i18n', 'done');
  mainStatusDiv.style.background = 'rgba(52, 199, 89, 0.1)';
  mainStatusDiv.style.color = '#34C759';

  if (files.length > 1) {
    btnDlAll.style.display = 'flex';
    document.getElementById('bulk-edit-container').style.display = 'block';
  } else {
    document.getElementById('bulk-edit-container').style.display = 'none';
  }

  console.log(`✅ Processed ${files.length} files in ${(performance.now() - startTime).toFixed(2)}ms`);
}

// Global exports for inline onclick handlers
window.downloadEpub = async (idx) => {
  const blob = await epubInstances[idx].writeEPUB();
  saveAs(blob, dlfilenames[idx]);
};

window.openEditor = (idx) => {
  currentEditIdx = idx;
  const meta = epubInstances[idx].metadata;
  document.getElementById('edit-title').value = meta.title || '';
  document.getElementById('edit-author').value = meta.author || '';
  document.getElementById('edit-series').value = meta.series || '';
  document.getElementById('edit-language').value = meta.language || '';
  document.getElementById('modal-metadata').classList.add('active');
};

window.closeMetadataModal = () => {
  document.getElementById('modal-metadata').classList.remove('active');
  currentEditIdx = null;
};

window.saveMetadataChanges = () => {
  if (currentEditIdx === null) return;
  const epub = epubInstances[currentEditIdx];
  epub.updateMetadata({
    title: document.getElementById('edit-title').value,
    author: document.getElementById('edit-author').value,
    series: document.getElementById('edit-series').value,
    language: document.getElementById('edit-language').value
  });

  const oldCard = outputDiv.children[currentEditIdx];
  const newCard = buildOutputHTML(currentEditIdx);
  outputDiv.replaceChild(newCard, oldCard);

  window.closeMetadataModal();
};

window.openReader = (idx) => {
  const epub = epubInstances[idx];
  let firstFile = '';
  for (const file in epub.files) {
    if ((file.endsWith('.html') || file.endsWith('.xhtml')) &&
      !file.includes('nav.xhtml') && !file.includes('toc.xhtml')) {
      firstFile = file;
      break;
    }
  }

  if (firstFile) {
    document.getElementById('reader-frame').srcdoc = epub.files[firstFile];
  }
  document.getElementById('modal-reader').classList.add('active');
};

window.closeReaderModal = () => {
  document.getElementById('modal-reader').classList.remove('active');
  document.getElementById('reader-frame').srcdoc = '';
};

window.handleCoverChange = async (idx, file) => {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const uint8 = new Uint8Array(e.target.result);
    await epubInstances[idx].updateCover(uint8, file.type);

    const oldCard = outputDiv.children[idx];
    const newCard = buildOutputHTML(idx);
    outputDiv.replaceChild(newCard, oldCard);
  };
  reader.readAsArrayBuffer(file);
};

window.toggleLanguage = () => {
  currentLang = currentLang === 'en' ? 'pt' : 'en';
  localStorage.setItem('kdp_lang', currentLang);
  applyI18N();
};

window.toggleTheme = () => {
  document.body.classList.toggle('light-mode');
  localStorage.setItem('kdp_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
};

window.toggleNamingInput = () => {
  const keep = document.getElementById('keepOriginalFilename')?.checked;
  const pattern = document.getElementById('naming-pattern-container');
  const input = document.getElementById('namingPattern');
  if (pattern) pattern.style.opacity = keep ? '0.3' : '1';
  if (input) input.disabled = keep;
};

window.applyBulkMetadata = () => {
  const author = document.getElementById('bulk-author')?.value.trim();
  const series = document.getElementById('bulk-series')?.value.trim();

  if (!author && !series) return;

  epubInstances.forEach((epub, idx) => {
    const updates = {};
    if (author) updates.author = author;
    if (series) updates.series = series;
    epub.updateMetadata(updates);

    const oldCard = outputDiv.children[idx];
    const newCard = buildOutputHTML(idx);
    outputDiv.replaceChild(newCard, oldCard);
  });

  mainStatusDiv.innerHTML = t('bulk_meta_applied', epubInstances.length);
  mainStatusDiv.style.display = 'block';
};

// Event listeners
fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFiles(e.target.files);
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

['dragleave', 'dragend'].forEach(type => {
  dropZone.addEventListener(type, () => dropZone.classList.remove('drag-over'));
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const epubFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.epub'));
  if (epubFiles.length) handleFiles(epubFiles);
});

btnDlAll?.addEventListener('click', async () => {
  const oldText = btnDlAll.innerHTML;
  btnDlAll.innerHTML = t('preparing_zip');

  const blobWriter = new zip.BlobWriter('application/zip');
  const writer = new zip.ZipWriter(blobWriter, { extendedTimestamp: false });

  for (let i = 0; i < epubInstances.length; i++) {
    const blob = await epubInstances[i].writeEPUB();
    await writer.add(dlfilenames[i], new zip.BlobReader(blob));
  }

  await writer.close();
  saveAs(await blobWriter.getData(), 'fixed-epubs.zip');
  btnDlAll.innerHTML = oldText;
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme
  if (localStorage.getItem('kdp_theme') === 'light') {
    document.body.classList.add('light-mode');
  }

  // Apply translations
  applyI18N();

  // Bind toggle buttons
  const langToggle = document.getElementById('lang-toggle');
  const themeToggle = document.getElementById('theme-toggle');

  if (langToggle) {
    langToggle.addEventListener('click', () => {
      if (currentLang === 'en') currentLang = 'pt';
      else if (currentLang === 'pt') currentLang = 'es';
      else currentLang = 'en';

      localStorage.setItem('kdp_lang', currentLang);
      applyI18N();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      localStorage.setItem('kdp_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    });
  }

  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});
