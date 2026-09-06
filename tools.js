// --- PDF TOOLS: MERGE / PAGES / COMPRESS ---

function filterPdfFiles(files) {
    return files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
}

function downloadPdfBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    saveAs(blob, filename);
}

function baseName(filename) {
    return filename.replace(/\.pdf$/i, '');
}

// ========== MERGE ==========
const mergeInput = document.getElementById('merge-input');
const mergeBtn = document.getElementById('merge-btn');
const mergeClearBtn = document.getElementById('merge-clear-btn');
const mergeFileList = document.getElementById('merge-file-list');
const mergeActions = document.getElementById('merge-actions');
const mergeStatus = document.getElementById('merge-status');
const mergeProgress = document.getElementById('merge-progress');
const mergeContainer = document.getElementById('merge-progress-container');

let mergeFiles = [];
let mergeDragIndex = null;

function syncMergeUi() {
    mergeFileList.innerHTML = '';
    mergeFiles.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'file-list-item';
        li.draggable = true;
        li.dataset.index = String(index);
        li.innerHTML = `
            <span class="file-list-handle" aria-hidden="true">⋮⋮</span>
            <span class="file-list-index">${index + 1}</span>
            <div class="file-list-meta">
                <span class="file-list-name" title="${file.name}">${file.name}</span>
                <span class="file-list-size">${formatBytes(file.size)}</span>
            </div>
            <div class="file-list-actions">
                <button type="button" class="btn-icon" data-action="up" title="Subir" aria-label="Subir" ${index === 0 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                <button type="button" class="btn-icon" data-action="down" title="Bajar" aria-label="Bajar" ${index === mergeFiles.length - 1 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <button type="button" class="btn-icon danger" data-action="remove" title="Quitar" aria-label="Quitar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        `;
        mergeFileList.appendChild(li);
    });

    const hasFiles = mergeFiles.length > 0;
    mergeActions.style.display = hasFiles ? 'flex' : 'none';
    mergeBtn.disabled = mergeFiles.length < 2;
}

function addMergeFiles(files) {
    const pdfs = filterPdfFiles(files);
    if (pdfs.length === 0) {
        showToast('Seleccione archivos PDF válidos', 'error');
        return;
    }
    mergeFiles = mergeFiles.concat(pdfs);
    syncMergeUi();
    showToast(`${pdfs.length} PDF(s) agregados a la lista`, 'success');
}

function moveMergeItem(from, to) {
    if (to < 0 || to >= mergeFiles.length) return;
    const [item] = mergeFiles.splice(from, 1);
    mergeFiles.splice(to, 0, item);
    syncMergeUi();
}

mergeFileList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const li = btn.closest('.file-list-item');
    const index = Number(li.dataset.index);
    const action = btn.dataset.action;
    if (action === 'remove') {
        mergeFiles.splice(index, 1);
        syncMergeUi();
    } else if (action === 'up') {
        moveMergeItem(index, index - 1);
    } else if (action === 'down') {
        moveMergeItem(index, index + 1);
    }
});

mergeFileList.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.file-list-item');
    if (!li) return;
    mergeDragIndex = Number(li.dataset.index);
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
});

mergeFileList.addEventListener('dragend', (e) => {
    const li = e.target.closest('.file-list-item');
    if (li) li.classList.remove('dragging');
    mergeFileList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    mergeDragIndex = null;
});

mergeFileList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const li = e.target.closest('.file-list-item');
    if (!li || mergeDragIndex === null) return;
    mergeFileList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
});

mergeFileList.addEventListener('drop', (e) => {
    e.preventDefault();
    const li = e.target.closest('.file-list-item');
    if (!li || mergeDragIndex === null) return;
    const toIndex = Number(li.dataset.index);
    if (toIndex !== mergeDragIndex) {
        moveMergeItem(mergeDragIndex, toIndex);
    }
});

if (mergeInput) {
    mergeInput.addEventListener('change', (e) => {
        addMergeFiles(Array.from(e.target.files || []));
        mergeInput.value = '';
    });
}
setupDropzone('merge-dropzone', 'merge-input', addMergeFiles);

if (mergeClearBtn) {
    mergeClearBtn.addEventListener('click', () => {
        mergeFiles = [];
        syncMergeUi();
        showToast('Lista de PDFs limpiada', 'info');
    });
}

async function executeMerge() {
    if (mergeFiles.length < 2) return;
    mergeBtn.disabled = true;
    mergeContainer.style.display = 'block';
    mergeProgress.style.width = '0%';
    showToast(`Uniendo ${mergeFiles.length} documentos...`, 'info');

    try {
        const merged = await PDFLib.PDFDocument.create();
        stripPdfMetadata(merged);
        const total = mergeFiles.length;

        for (let i = 0; i < total; i++) {
            const file = mergeFiles[i];
            mergeStatus.innerHTML = `<span>Procesando: <strong>${file.name}</strong></span> <span>${i + 1} de ${total}</span>`;
            const bytes = await file.arrayBuffer();
            const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach(page => merged.addPage(page));
            mergeProgress.style.width = `${((i + 1) / total) * 100}%`;
        }

        mergeStatus.innerHTML = `<span>Generando archivo final...</span>`;
        const outBytes = await merged.save();
        downloadPdfBytes(outBytes, 'pdfs_unidos.pdf');
        mergeStatus.innerHTML = `<span>Unión finalizada. Descarga iniciada.</span>`;
        showToast('PDF unido descargado con éxito', 'success');
    } catch (err) {
        console.error(err);
        mergeStatus.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
        showToast(`Error al unir PDFs: ${err.message}`, 'error');
    }

    mergeBtn.disabled = mergeFiles.length < 2;
}

if (mergeBtn) {
    mergeBtn.addEventListener('click', () => {
        if (mergeFiles.length < 2) return;
        showConfirmModal({
            title: 'Confirmar unión de PDFs',
            message: `¿Desea unir <strong>${mergeFiles.length} archivos PDF</strong> en el orden indicado?`,
            actionText: 'Unir PDFs',
            onConfirm: executeMerge
        });
    });
}

// ========== EDIT PAGES ==========
const pagesInput = document.getElementById('pages-input');
const pagesGrid = document.getElementById('pages-grid');
const pagesToolbar = document.getElementById('pages-toolbar');
const pagesActions = document.getElementById('pages-actions');
const pagesSummaryText = document.getElementById('pages-summary-text');
const pagesExportBtn = document.getElementById('pages-export-btn');
const pagesResetBtn = document.getElementById('pages-reset-btn');
const pagesStatus = document.getElementById('pages-status');
const pagesProgress = document.getElementById('pages-progress');
const pagesContainer = document.getElementById('pages-progress-container');
const pagesDropzone = document.getElementById('pages-dropzone');

let pagesSourceFile = null;
let pagesSourceBytes = null;
let pagesState = []; // { id, sourceIndex, rotation, thumbUrl }
let pagesDragId = null;
let pagesIdSeq = 0;

function revokePageThumbs() {
    pagesState.forEach(p => {
        if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
    });
}

function syncPagesUi() {
    pagesGrid.innerHTML = '';
    pagesState.forEach((page, index) => {
        const card = document.createElement('article');
        card.className = 'page-card';
        card.draggable = true;
        card.dataset.id = page.id;
        card.innerHTML = `
            <div class="page-thumb-wrap">
                <span class="page-badge">${index + 1}</span>
                <img src="${page.thumbUrl}" alt="Página ${index + 1}" style="transform: rotate(${page.rotation}deg)">
            </div>
            <div class="page-card-footer">
                <button type="button" class="btn-icon" data-action="rotate-left" title="Rotar izquierda" aria-label="Rotar izquierda">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button type="button" class="btn-icon" data-action="rotate-right" title="Rotar derecha" aria-label="Rotar derecha">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </button>
                <button type="button" class="btn-icon danger" data-action="delete" title="Eliminar página" aria-label="Eliminar página">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        `;
        pagesGrid.appendChild(card);
    });

    const hasPages = pagesState.length > 0;
    pagesToolbar.style.display = hasPages ? 'flex' : 'none';
    pagesActions.style.display = hasPages ? 'flex' : 'none';
    pagesDropzone.style.display = hasPages ? 'none' : 'block';
    pagesExportBtn.disabled = !hasPages;
    if (pagesSourceFile) {
        pagesSummaryText.textContent = `${pagesSourceFile.name} · ${pagesState.length} página(s)`;
    }
}

async function renderPageThumbnail(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.35 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    page.cleanup();
    return URL.createObjectURL(blob);
}

async function loadPagesPdf(files) {
    const pdfs = filterPdfFiles(files);
    if (pdfs.length === 0) {
        showToast('Seleccione un archivo PDF válido', 'error');
        return;
    }

    const file = pdfs[0];
    pagesContainer.style.display = 'block';
    pagesProgress.style.width = '0%';
    pagesStatus.innerHTML = `<span>Cargando miniaturas de <strong>${file.name}</strong>...</span>`;
    showToast('Generando miniaturas de páginas...', 'info');

    try {
        revokePageThumbs();
        pagesState = [];
        pagesSourceFile = file;
        pagesSourceBytes = await file.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({ data: pagesSourceBytes.slice(0) });
        const pdf = await loadingTask.promise;
        const total = pdf.numPages;

        for (let i = 1; i <= total; i++) {
            const thumbUrl = await renderPageThumbnail(pdf, i);
            pagesState.push({
                id: `p-${++pagesIdSeq}`,
                sourceIndex: i - 1,
                rotation: 0,
                thumbUrl
            });
            pagesProgress.style.width = `${(i / total) * 100}%`;
            pagesStatus.innerHTML = `<span>Miniatura ${i} de ${total}</span>`;
        }

        await loadingTask.destroy();
        syncPagesUi();
        pagesStatus.innerHTML = `<span>${total} páginas listas para editar.</span>`;
        showToast(`${total} páginas cargadas`, 'success');
    } catch (err) {
        console.error(err);
        pagesStatus.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
        showToast(`Error al cargar PDF: ${err.message}`, 'error');
    }
}

function resetPagesEditor() {
    revokePageThumbs();
    pagesState = [];
    pagesSourceFile = null;
    pagesSourceBytes = null;
    syncPagesUi();
    pagesContainer.style.display = 'none';
    if (pagesInput) pagesInput.value = '';
}

pagesGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('.page-card');
    const id = card.dataset.id;
    const page = pagesState.find(p => p.id === id);
    if (!page) return;

    const action = btn.dataset.action;
    if (action === 'rotate-left') {
        page.rotation = (page.rotation + 270) % 360;
        syncPagesUi();
    } else if (action === 'rotate-right') {
        page.rotation = (page.rotation + 90) % 360;
        syncPagesUi();
    } else if (action === 'delete') {
        if (pagesState.length === 1) {
            showToast('Debe conservar al menos una página', 'error');
            return;
        }
        if (page.thumbUrl) URL.revokeObjectURL(page.thumbUrl);
        pagesState = pagesState.filter(p => p.id !== id);
        syncPagesUi();
    }
});

pagesGrid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.page-card');
    if (!card) return;
    pagesDragId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
});

pagesGrid.addEventListener('dragend', (e) => {
    const card = e.target.closest('.page-card');
    if (card) card.classList.remove('dragging');
    pagesGrid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    pagesDragId = null;
});

pagesGrid.addEventListener('dragover', (e) => {
    e.preventDefault();
    const card = e.target.closest('.page-card');
    if (!card || !pagesDragId) return;
    pagesGrid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    card.classList.add('drag-over');
});

pagesGrid.addEventListener('drop', (e) => {
    e.preventDefault();
    const card = e.target.closest('.page-card');
    if (!card || !pagesDragId) return;
    const from = pagesState.findIndex(p => p.id === pagesDragId);
    const to = pagesState.findIndex(p => p.id === card.dataset.id);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = pagesState.splice(from, 1);
    pagesState.splice(to, 0, item);
    syncPagesUi();
});

if (pagesInput) {
    pagesInput.addEventListener('change', (e) => {
        loadPagesPdf(Array.from(e.target.files || []));
        pagesInput.value = '';
    });
}
setupDropzone('pages-dropzone', 'pages-input', loadPagesPdf);

if (pagesResetBtn) {
    pagesResetBtn.addEventListener('click', resetPagesEditor);
}

async function executePagesExport() {
    if (!pagesSourceBytes || pagesState.length === 0) return;
    pagesExportBtn.disabled = true;
    pagesContainer.style.display = 'block';
    pagesProgress.style.width = '0%';
    pagesStatus.innerHTML = `<span>Reconstruyendo PDF editado...</span>`;

    try {
        const src = await PDFLib.PDFDocument.load(pagesSourceBytes.slice(0), { ignoreEncryption: true });
        const out = await PDFLib.PDFDocument.create();
        stripPdfMetadata(out);

        const total = pagesState.length;
        for (let i = 0; i < total; i++) {
            const item = pagesState[i];
            const [copied] = await out.copyPages(src, [item.sourceIndex]);
            const existing = copied.getRotation().angle || 0;
            copied.setRotation(PDFLib.degrees((existing + item.rotation) % 360));
            out.addPage(copied);
            pagesProgress.style.width = `${((i + 1) / total) * 100}%`;
        }

        const bytes = await out.save();
        const name = `${baseName(pagesSourceFile.name)}_editado.pdf`;
        downloadPdfBytes(bytes, name);
        pagesStatus.innerHTML = `<span>PDF editado listo. Descarga iniciada.</span>`;
        showToast('PDF editado descargado con éxito', 'success');
    } catch (err) {
        console.error(err);
        pagesStatus.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
        showToast(`Error al exportar: ${err.message}`, 'error');
    }

    pagesExportBtn.disabled = pagesState.length === 0;
}

if (pagesExportBtn) {
    pagesExportBtn.addEventListener('click', () => {
        if (pagesState.length === 0) return;
        showConfirmModal({
            title: 'Confirmar exportación',
            message: `¿Desea descargar el PDF con <strong>${pagesState.length} página(s)</strong> en el orden y rotación actuales?`,
            actionText: 'Descargar PDF',
            onConfirm: executePagesExport
        });
    });
}

// ========== COMPRESS ==========
const COMPRESS_PRESETS = {
    high: { dpi: 120, quality: 0.85, label: 'Alta calidad' },
    medium: { dpi: 96, quality: 0.7, label: 'Equilibrada' },
    low: { dpi: 72, quality: 0.55, label: 'Máxima reducción' }
};

const compressInput = document.getElementById('compress-input');
const compressBtn = document.getElementById('compress-btn');
const compressFileSummary = document.getElementById('compress-file-summary');
const compressSummaryText = document.getElementById('compress-summary-text');
const compressQualityPanel = document.getElementById('compress-quality-panel');
const compressStatus = document.getElementById('compress-status');
const compressProgress = document.getElementById('compress-progress');
const compressContainer = document.getElementById('compress-progress-container');

let compressFile = null;

function updateCompressFile(files) {
    const pdfs = filterPdfFiles(files);
    if (pdfs.length === 0) {
        showToast('Seleccione un archivo PDF válido', 'error');
        return;
    }
    compressFile = pdfs[0];
    compressSummaryText.textContent = `${compressFile.name} · ${formatBytes(compressFile.size)}`;
    compressFileSummary.style.display = 'flex';
    compressQualityPanel.style.display = 'block';
    compressBtn.disabled = false;
    showToast(`PDF '${compressFile.name}' listo para comprimir`, 'success');
}

if (compressInput) {
    compressInput.addEventListener('change', (e) => {
        updateCompressFile(Array.from(e.target.files || []));
        compressInput.value = '';
    });
}
setupDropzone('compress-dropzone', 'compress-input', updateCompressFile);

function getSelectedCompressPreset() {
    const selected = document.querySelector('input[name="compress-quality"]:checked');
    return COMPRESS_PRESETS[selected ? selected.value : 'high'];
}

async function canvasToJpgBytes(canvas, quality) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
}

async function executeCompress() {
    if (!compressFile) return;
    const preset = getSelectedCompressPreset();
    compressBtn.disabled = true;
    compressContainer.style.display = 'block';
    compressProgress.style.width = '0%';
    showToast(`Comprimiendo con perfil ${preset.label}...`, 'info');

    const originalSize = compressFile.size;

    try {
        const arrayBuffer = await compressFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const out = await PDFLib.PDFDocument.create();
        stripPdfMetadata(out);

        const scale = preset.dpi / 72;
        const total = pdf.numPages;

        for (let i = 1; i <= total; i++) {
            compressStatus.innerHTML = `<span>Página <strong>${i}</strong> de ${total}</span>`;
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { alpha: false });
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;

            const jpgBytes = await canvasToJpgBytes(canvas, preset.quality);
            const image = await out.embedJpg(jpgBytes);
            const pdfPage = out.addPage([image.width, image.height]);
            pdfPage.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

            page.cleanup();
            compressProgress.style.width = `${(i / total) * 100}%`;
        }

        await loadingTask.destroy();
        compressStatus.innerHTML = `<span>Guardando PDF comprimido...</span>`;
        const outBytes = await out.save({ useObjectStreams: true });
        const newSize = outBytes.byteLength;
        const ratio = originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0;
        downloadPdfBytes(outBytes, `${baseName(compressFile.name)}_comprimido.pdf`);

        const sizeMsg = ratio > 0
            ? `Reducción aprox. ${ratio}% (${formatBytes(originalSize)} → ${formatBytes(newSize)})`
            : `Tamaño resultante: ${formatBytes(newSize)} (puede no reducirse si el PDF ya era liviano)`;

        compressStatus.innerHTML = `<span>${sizeMsg}</span>`;
        showToast(sizeMsg, 'success', 6000);
    } catch (err) {
        console.error(err);
        compressStatus.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
        showToast(`Error al comprimir: ${err.message}`, 'error');
    }

    compressBtn.disabled = !compressFile;
}

if (compressBtn) {
    compressBtn.addEventListener('click', () => {
        if (!compressFile) return;
        const preset = getSelectedCompressPreset();
        showConfirmModal({
            title: 'Confirmar compresión',
            message: `¿Comprimir <strong>${compressFile.name}</strong> con perfil <strong>${preset.label}</strong>?<br><br><small style="color:#9ca3af">Nota: la compresión rasteriza las páginas (el texto deja de ser seleccionable).</small>`,
            actionText: 'Comprimir PDF',
            onConfirm: executeCompress
        });
    });
}
