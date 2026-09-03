// SNACKBAR / TOAST NOTIFICATION UTILITY
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('snackbar-container');
    if (!container) return;

    const snackbar = document.createElement('div');
    snackbar.className = `snackbar snackbar-${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg class="snackbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg class="snackbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
        iconSvg = `<svg class="snackbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    snackbar.innerHTML = `
        ${iconSvg}
        <span class="snackbar-text">${message}</span>
        <button class="snackbar-close" aria-label="Cerrar">&times;</button>
    `;

    const closeBtn = snackbar.querySelector('.snackbar-close');
    const dismiss = () => {
        snackbar.classList.add('leaving');
        snackbar.addEventListener('animationend', () => {
            if (snackbar.parentNode) snackbar.parentNode.removeChild(snackbar);
        });
    };

    closeBtn.addEventListener('click', dismiss);
    container.appendChild(snackbar);

    if (duration > 0) {
        setTimeout(dismiss, duration);
    }
}

// DYNAMIC COPYRIGHT YEAR
document.addEventListener('DOMContentLoaded', () => {
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
});

// PRIVACY MODAL LOGIC
const privacyModal = document.getElementById('privacy-modal');
const privacyModalOpen = document.getElementById('privacy-modal-open');
const privacyModalClose = document.getElementById('privacy-modal-close');
const privacyModalConfirm = document.getElementById('privacy-modal-confirm');

function openPrivacyModal() {
    if (privacyModal) {
        privacyModal.classList.add('active');
        privacyModal.setAttribute('aria-hidden', 'false');
    }
}

function closePrivacyModal() {
    if (privacyModal) {
        privacyModal.classList.remove('active');
        privacyModal.setAttribute('aria-hidden', 'true');
    }
}

if (privacyModalOpen) privacyModalOpen.addEventListener('click', openPrivacyModal);
if (privacyModalClose) privacyModalClose.addEventListener('click', closePrivacyModal);
if (privacyModalConfirm) privacyModalConfirm.addEventListener('click', closePrivacyModal);

if (privacyModal) {
    privacyModal.addEventListener('click', (e) => {
        if (e.target === privacyModal) {
            closePrivacyModal();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && privacyModal && privacyModal.classList.contains('active')) {
        closePrivacyModal();
    }
});

// TAB SWITCHING LOGIC
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.setAttribute('aria-selected', 'true');
    }
    
    const targetPanel = document.getElementById(`${tabId}-tab`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }
}

// FORMAT NUMBER
const padZero = (num) => String(num).padStart(3, '0');

// DRAG & DROP UI ENHANCEMENTS
function setupDropzone(dropzoneId, inputId, handleFiles) {
    const dropzone = document.getElementById(dropzoneId);

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            handleFiles(Array.from(files));
        }
    });
}

// --- EXTRACT LOGIC (PDF/TIFF to PNG) ---
const extractInput = document.getElementById('extract-input');
const extractBtn = document.getElementById('extract-btn');
const extractStatus = document.getElementById('extract-status');
const extractProgress = document.getElementById('extract-progress');
const extractContainer = document.getElementById('extract-progress-container');
const extractFileSummary = document.getElementById('extract-file-summary');
const extractSummaryText = document.getElementById('extract-summary-text');
let pdfFilesToProcess = [];

function updateExtractFiles(files) {
    pdfFilesToProcess = files.filter(f => {
        const ext = f.name.toLowerCase();
        return ext.endsWith('.pdf') || ext.endsWith('.tif') || ext.endsWith('.tiff');
    });
    
    if (pdfFilesToProcess.length > 0) {
        extractSummaryText.textContent = `${pdfFilesToProcess.length} documento(s) listo(s) para procesar`;
        extractFileSummary.style.display = 'flex';
        extractBtn.disabled = false;
        showToast(`${pdfFilesToProcess.length} documento(s) detectado(s) correctamente`, 'success');
    } else {
        extractSummaryText.textContent = `No se detectaron archivos PDF ni TIFF válidos.`;
        extractFileSummary.style.display = 'flex';
        extractBtn.disabled = true;
        showToast('No se detectaron archivos .pdf, .tif o .tiff en la carpeta seleccionada', 'error');
    }
}

extractInput.addEventListener('change', (e) => {
    updateExtractFiles(Array.from(e.target.files));
});

setupDropzone('extract-dropzone', 'extract-input', updateExtractFiles);

extractBtn.addEventListener('click', async () => {
    extractBtn.disabled = true;
    extractContainer.style.display = 'block';
    extractProgress.style.width = '0%';
    const zip = new JSZip();
    
    let processed = 0;
    const total = pdfFilesToProcess.length;
    showToast(`Iniciando extracción y rasterizado de ${total} documento(s)...`, 'info');

    for (const file of pdfFilesToProcess) {
        extractStatus.innerHTML = `<span>Procesando: <strong>${file.name}</strong></span> <span>${processed + 1} de ${total}</span>`;
        try {
            const relativePath = file.webkitRelativePath || file.name;
            const lastDotIndex = relativePath.lastIndexOf('.');
            const folderPath = lastDotIndex !== -1 ? relativePath.substring(0, lastDotIndex) : relativePath;
            
            if (file.name.toLowerCase().endsWith('.pdf')) {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument(arrayBuffer);
                const pdf = await loadingTask.promise;
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const scale = 150 / 72; // 150 DPI rendering quality
                    const viewport = page.getViewport({ scale });
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const fileName = `pag_${padZero(i)}.png`;
                    zip.file(`${folderPath}/${fileName}`, blob);
                    
                    page.cleanup();
                }
                await loadingTask.destroy();
            } else if (file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff')) {
                const arrayBuffer = await file.arrayBuffer();
                const ifds = UTIF.decode(arrayBuffer);
                
                for (let i = 0; i < ifds.length; i++) {
                    UTIF.decodeImage(arrayBuffer, ifds[i]);
                    const rgba = UTIF.toRGBA8(ifds[i]);
                    const width = ifds[i].width;
                    const height = ifds[i].height;
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    const imageData = ctx.createImageData(width, height);
                    imageData.data.set(rgba);
                    ctx.putImageData(imageData, 0, 0);
                    
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const fileName = `pag_${padZero(i + 1)}.png`;
                    zip.file(`${folderPath}/${fileName}`, blob);
                }
            }
        } catch (error) {
            console.error(`Error procesando ${file.name}:`, error);
            showToast(`Error procesando ${file.name}: ${error.message}`, 'error');
        }
        processed++;
        extractProgress.style.width = `${(processed / total) * 100}%`;
    }

    extractStatus.innerHTML = `<span>Generando archivo comprimido ZIP final...</span>`;
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, "imagenes_extraidas.zip");
    
    extractStatus.innerHTML = `<span>Proceso finalizado con éxito. Descarga iniciada.</span>`;
    extractBtn.disabled = false;
    showToast('Imágenes extraídas y empaquetadas en ZIP con éxito', 'success');
});


// --- RECONSTRUCT LOGIC (PNG to PDF) ---
const reconstructInput = document.getElementById('reconstruct-input');
const reconstructBtn = document.getElementById('reconstruct-btn');
const reconstructStatus = document.getElementById('reconstruct-status');
const reconstructProgress = document.getElementById('reconstruct-progress');
const reconstructContainer = document.getElementById('reconstruct-progress-container');
const reconstructFileSummary = document.getElementById('reconstruct-file-summary');
const reconstructSummaryText = document.getElementById('reconstruct-summary-text');
let uploadedZipFile = null;

function updateReconstructFile(files) {
    if (files.length > 0) {
        uploadedZipFile = files[0];
        reconstructSummaryText.textContent = `Archivo ZIP seleccionado: ${uploadedZipFile.name} (${(uploadedZipFile.size / (1024 * 1024)).toFixed(2)} MB)`;
        reconstructFileSummary.style.display = 'flex';
        reconstructBtn.disabled = false;
        showToast(`Archivo ZIP '${uploadedZipFile.name}' cargado correctamente`, 'success');
    }
}

reconstructInput.addEventListener('change', (e) => {
    updateReconstructFile(Array.from(e.target.files));
});

setupDropzone('reconstruct-dropzone', 'reconstruct-input', updateReconstructFile);

reconstructBtn.addEventListener('click', async () => {
    if (!uploadedZipFile) return;
    reconstructBtn.disabled = true;
    reconstructContainer.style.display = 'block';
    reconstructProgress.style.width = '0%';
    reconstructStatus.innerHTML = `<span>Leyendo estructura ZIP...</span>`;
    showToast('Iniciando lectura y reconstrucción de PDF plano...', 'info');
    
    try {
        const inputZip = await JSZip.loadAsync(uploadedZipFile);
        const outputZip = new JSZip();
        
        // Group images by folder
        const folders = {};
        
        inputZip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                const ext = relativePath.split('.').pop().toLowerCase();
                if (['png', 'jpg', 'jpeg'].includes(ext)) {
                    const parts = relativePath.split('/');
                    const fileName = parts.pop();
                    const folderPath = parts.join('/');
                    
                    if (!folders[folderPath]) folders[folderPath] = [];
                    folders[folderPath].push({ name: fileName, entry: zipEntry });
                }
            }
        });

        const folderPaths = Object.keys(folders);
        let processed = 0;
        const total = folderPaths.length;

        for (const folderPath of folderPaths) {
            reconstructStatus.innerHTML = `<span>Reconstruyendo: <strong>${folderPath || 'Raíz'}</strong></span> <span>${processed + 1} de ${total}</span>`;
            
            const files = folders[folderPath].sort((a, b) => a.name.localeCompare(b.name));
            
            const pdfDoc = await PDFLib.PDFDocument.create();
            pdfDoc.setTitle('');
            pdfDoc.setAuthor('');
            pdfDoc.setSubject('');
            pdfDoc.setKeywords([]);
            pdfDoc.setProducer('');
            pdfDoc.setCreator('');
            
            for (const file of files) {
                const imageBytes = await file.entry.async('uint8array');
                let image;
                
                if (file.name.toLowerCase().endsWith('.png')) {
                    image = await pdfDoc.embedPng(imageBytes);
                } else {
                    image = await pdfDoc.embedJpg(imageBytes);
                }
                
                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: image.width,
                    height: image.height,
                });
            }
            
            const pdfBytes = await pdfDoc.save();
            const folderParts = folderPath.split('/');
            const folderName = folderParts.pop() || 'documento_sanitizado';
            const pdfName = `${folderName}.pdf`;
            const pdfPath = folderParts.join('/');
            const finalPath = pdfPath ? `${pdfPath}/${pdfName}` : pdfName;
            
            outputZip.file(finalPath, pdfBytes);
            
            processed++;
            reconstructProgress.style.width = `${(processed / total) * 100}%`;
        }

        reconstructStatus.innerHTML = `<span>Empaquetando PDFs plano en archivo ZIP...</span>`;
        const content = await outputZip.generateAsync({ type: 'blob' });
        saveAs(content, "pdfs_reconstruidos.zip");
        
        reconstructStatus.innerHTML = `<span>Reconstrucción finalizada con éxito. Descarga iniciada.</span>`;
        showToast('PDFs planos sanitizados generados y descargados con éxito', 'success');
    } catch (err) {
        console.error(err);
        reconstructStatus.innerHTML = `<span style="color:#ef4444">Error durante la reconstrucción: ${err.message}</span>`;
        showToast(`Error durante la reconstrucción: ${err.message}`, 'error');
    }
    
    reconstructBtn.disabled = false;
});
