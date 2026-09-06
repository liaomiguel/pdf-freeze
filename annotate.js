// --- PDF ANNOTATE: overlay editor (text / rect / image) ---

(function () {
    const annotateInput = document.getElementById('annotate-input');
    const annotateDropzone = document.getElementById('annotate-dropzone');
    const annotateWorkspace = document.getElementById('annotate-workspace');
    const annotateStage = document.getElementById('annotate-stage');
    const annotateCanvas = document.getElementById('annotate-pdf-canvas');
    const annotateOverlay = document.getElementById('annotate-overlay');
    const annotateDraft = document.getElementById('annotate-draft');
    const annotateColor = document.getElementById('annotate-color');
    const annotateFontSize = document.getElementById('annotate-font-size');
    const annotateDeleteBtn = document.getElementById('annotate-delete-btn');
    const annotateImageInput = document.getElementById('annotate-image-input');
    const annotatePrevBtn = document.getElementById('annotate-prev-btn');
    const annotateNextBtn = document.getElementById('annotate-next-btn');
    const annotatePageLabel = document.getElementById('annotate-page-label');
    const annotateExportBtn = document.getElementById('annotate-export-btn');
    const annotateResetBtn = document.getElementById('annotate-reset-btn');
    const annotateStatus = document.getElementById('annotate-status');
    const annotateProgress = document.getElementById('annotate-progress');
    const annotateContainer = document.getElementById('annotate-progress-container');

    if (!annotateWorkspace || !annotateCanvas) return;

    let annotateFile = null;
    let annotateBytes = null;
    let annotatePdf = null; // pdf.js doc
    let pageIndex = 0;
    let pageCount = 0;
    let pageWidthPt = 0;
    let pageHeightPt = 0;
    let displayWidth = 0;
    let displayHeight = 0;
    let activeTool = 'select';
    let selectedId = null;
    let objects = []; // overlays
    let idSeq = 0;
    let pendingImage = null; // { bytes, mime, url, aspect }

    // Interaction state
    let dragMode = null; // 'move' | 'resize' | 'draw-rect' | null
    let dragId = null;
    let dragStart = null;
    let resizeHandle = null;
    let drawStart = null;
    let objectSnapshot = null;

    function uid() {
        return `a-${++idSeq}`;
    }

    function currentColor() {
        return annotateColor ? annotateColor.value : '#111827';
    }

    function currentFontSizePt() {
        const n = Number(annotateFontSize && annotateFontSize.value);
        return Number.isFinite(n) ? Math.min(96, Math.max(8, n)) : 16;
    }

    function objectsOnPage(idx = pageIndex) {
        return objects.filter(o => o.pageIndex === idx);
    }

    function getObject(id) {
        return objects.find(o => o.id === id);
    }

    function setTool(tool) {
        activeTool = tool;
        document.querySelectorAll('[data-annotate-tool]').forEach(btn => {
            const on = btn.dataset.annotateTool === tool;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        annotateStage.classList.toggle('cursor-crosshair', tool === 'rect' || tool === 'text' || tool === 'image');
        if (tool !== 'select') {
            selectedId = null;
            renderOverlay();
        }
    }

    function setSelected(id) {
        selectedId = id;
        annotateDeleteBtn.disabled = !id;
        const obj = id ? getObject(id) : null;
        if (obj) {
            if (obj.color && annotateColor) annotateColor.value = obj.color;
            if (obj.type === 'text' && annotateFontSize && obj.fontSizePt) {
                annotateFontSize.value = String(Math.round(obj.fontSizePt));
            }
        }
        renderOverlay();
    }

    function deleteSelected() {
        if (!selectedId) return;
        const obj = getObject(selectedId);
        if (obj && obj.type === 'image' && obj.objectUrl) {
            URL.revokeObjectURL(obj.objectUrl);
        }
        objects = objects.filter(o => o.id !== selectedId);
        selectedId = null;
        annotateDeleteBtn.disabled = true;
        renderOverlay();
        showToast('Elemento eliminado', 'info');
    }

    function clamp01(v) {
        return Math.min(1, Math.max(0, v));
    }

    function clientToFrac(clientX, clientY) {
        const rect = annotateCanvas.getBoundingClientRect();
        return {
            x: clamp01((clientX - rect.left) / rect.width),
            y: clamp01((clientY - rect.top) / rect.height)
        };
    }

    async function renderPdfPage() {
        if (!annotatePdf) return;
        const page = await annotatePdf.getPage(pageIndex + 1);
        const base = page.getViewport({ scale: 1 });
        pageWidthPt = base.width;
        pageHeightPt = base.height;

        const shell = annotateStage.parentElement;
        const maxW = Math.max(280, (shell ? shell.clientWidth : 800) - 2);
        const scale = Math.min(1.5, maxW / pageWidthPt);
        const viewport = page.getViewport({ scale });

        displayWidth = viewport.width;
        displayHeight = viewport.height;
        annotateCanvas.width = Math.floor(displayWidth);
        annotateCanvas.height = Math.floor(displayHeight);
        annotateStage.style.width = `${annotateCanvas.width}px`;
        annotateStage.style.height = `${annotateCanvas.height}px`;

        const ctx = annotateCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, annotateCanvas.width, annotateCanvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();

        annotatePageLabel.textContent = `Página ${pageIndex + 1} / ${pageCount}`;
        annotatePrevBtn.disabled = pageIndex <= 0;
        annotateNextBtn.disabled = pageIndex >= pageCount - 1;
        renderOverlay();
    }

    function renderOverlay() {
        annotateOverlay.innerHTML = '';
        objectsOnPage().forEach(obj => {
            const el = document.createElement('div');
            el.className = `anno-item anno-${obj.type}${obj.id === selectedId ? ' selected' : ''}`;
            el.dataset.id = obj.id;
            el.style.left = `${obj.x * 100}%`;
            el.style.top = `${obj.y * 100}%`;
            el.style.width = `${obj.w * 100}%`;
            el.style.height = `${obj.h * 100}%`;

            if (obj.type === 'rect') {
                el.style.background = hexToRgba(obj.color || '#111827', obj.opacity ?? 1);
            } else if (obj.type === 'text') {
                const fontPx = (obj.fontSizePt / pageWidthPt) * displayWidth;
                el.innerHTML = `<div class="anno-text" contenteditable="false" spellcheck="false">${escapeHtml(obj.text || '')}</div>`;
                const textEl = el.querySelector('.anno-text');
                textEl.style.color = obj.color || '#111827';
                textEl.style.fontSize = `${Math.max(10, fontPx)}px`;
            } else if (obj.type === 'image') {
                const img = document.createElement('img');
                img.src = obj.objectUrl || '';
                img.alt = 'Imagen anotada';
                img.draggable = false;
                el.appendChild(img);
            }

            if (obj.id === selectedId) {
                ['nw', 'ne', 'sw', 'se'].forEach(h => {
                    const handle = document.createElement('span');
                    handle.className = `anno-handle anno-handle-${h}`;
                    handle.dataset.handle = h;
                    el.appendChild(handle);
                });
            }

            annotateOverlay.appendChild(el);
        });
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const n = parseInt(full, 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function hexToRgb01(hex) {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const n = parseInt(full, 16);
        return {
            r: ((n >> 16) & 255) / 255,
            g: ((n >> 8) & 255) / 255,
            b: (n & 255) / 255
        };
    }

    async function loadAnnotatePdf(files) {
        const pdfs = filterPdfFiles(files);
        if (!pdfs.length) {
            showToast('Seleccione un archivo PDF válido', 'error');
            return;
        }

        resetAnnotateState(false);
        annotateFile = pdfs[0];
        annotateBytes = await annotateFile.arrayBuffer();

        try {
            const loadingTask = pdfjsLib.getDocument({ data: annotateBytes.slice(0) });
            annotatePdf = await loadingTask.promise;
            pageCount = annotatePdf.numPages;
            pageIndex = 0;
            annotateDropzone.style.display = 'none';
            annotateWorkspace.style.display = 'block';
            await renderPdfPage();
            showToast(`PDF cargado · ${pageCount} página(s)`, 'success');
        } catch (err) {
            console.error(err);
            showToast(`Error al cargar PDF: ${err.message}`, 'error');
            resetAnnotateState(true);
        }
    }

    function resetAnnotateState(showDropzone) {
        objects.forEach(o => {
            if (o.objectUrl) URL.revokeObjectURL(o.objectUrl);
        });
        objects = [];
        selectedId = null;
        pendingImage = null;
        pageIndex = 0;
        pageCount = 0;
        annotateFile = null;
        annotateBytes = null;
        if (annotatePdf) {
            try { annotatePdf.destroy(); } catch (_) { /* ignore */ }
            annotatePdf = null;
        }
        annotateOverlay.innerHTML = '';
        annotateDraft.hidden = true;
        annotateWorkspace.style.display = 'none';
        if (showDropzone !== false) annotateDropzone.style.display = 'block';
        annotateContainer.style.display = 'none';
        annotateDeleteBtn.disabled = true;
        setTool('select');
        if (annotateInput) annotateInput.value = '';
    }

    // --- Tool buttons ---
    document.querySelectorAll('[data-annotate-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.annotateTool;
            if (tool === 'image') {
                setTool('image');
                annotateImageInput.click();
                return;
            }
            setTool(tool);
            if (tool === 'text') {
                showToast('Haga clic en la página para colocar texto', 'info');
            } else if (tool === 'rect') {
                showToast('Arrastre en la página para dibujar un recuadro', 'info');
            }
        });
    });

    annotateImageInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        annotateImageInput.value = '';
        if (!file) {
            setTool('select');
            return;
        }
        try {
            const prepared = await prepareImageForAnnotate(file);
            pendingImage = prepared;
            setTool('image');
            showToast('Haga clic en la página para colocar la imagen', 'info');
        } catch (err) {
            console.error(err);
            showToast(`No se pudo cargar la imagen: ${err.message}`, 'error');
            setTool('select');
        }
    });

    async function prepareImageForAnnotate(file) {
        const url = URL.createObjectURL(file);
        const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('formato no soportado'));
            el.src = url;
        });
        const aspect = img.width / Math.max(1, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        URL.revokeObjectURL(url);
        if (!blob) throw new Error('no se pudo convertir la imagen');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const objectUrl = URL.createObjectURL(blob);
        return { bytes, mime: 'image/png', url: objectUrl, aspect };
    }

    annotateDeleteBtn.addEventListener('click', deleteSelected);

    annotateColor.addEventListener('input', () => {
        const obj = selectedId ? getObject(selectedId) : null;
        if (!obj) return;
        obj.color = currentColor();
        renderOverlay();
    });

    annotateFontSize.addEventListener('change', () => {
        const obj = selectedId ? getObject(selectedId) : null;
        if (!obj || obj.type !== 'text') return;
        obj.fontSizePt = currentFontSizePt();
        renderOverlay();
    });

    annotatePrevBtn.addEventListener('click', async () => {
        if (pageIndex <= 0) return;
        selectedId = null;
        pageIndex -= 1;
        await renderPdfPage();
    });

    annotateNextBtn.addEventListener('click', async () => {
        if (pageIndex >= pageCount - 1) return;
        selectedId = null;
        pageIndex += 1;
        await renderPdfPage();
    });

    annotateResetBtn.addEventListener('click', () => resetAnnotateState(true));

    if (annotateInput) {
        annotateInput.addEventListener('change', (e) => {
            loadAnnotatePdf(Array.from(e.target.files || []));
            annotateInput.value = '';
        });
    }
    setupDropzone('annotate-dropzone', 'annotate-input', loadAnnotatePdf);

    window.addEventListener('resize', () => {
        if (annotatePdf) renderPdfPage();
    });

    document.addEventListener('keydown', (e) => {
        if (!annotateWorkspace || annotateWorkspace.style.display === 'none') return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
            e.preventDefault();
            deleteSelected();
        }
        if (e.key === 'Escape') {
            setSelected(null);
            setTool('select');
            annotateDraft.hidden = true;
            dragMode = null;
        }
    });

    // --- Pointer interactions ---
    annotateStage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    annotateOverlay.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.anno-item.anno-text');
        if (!item) return;
        const obj = getObject(item.dataset.id);
        if (!obj) return;
        setSelected(obj.id);
        setTool('select');
        const textEl = item.querySelector('.anno-text');
        textEl.contentEditable = 'true';
        textEl.focus();
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finish = () => {
            textEl.contentEditable = 'false';
            obj.text = textEl.innerText.replace(/\n+$/, '') || 'Texto';
            textEl.removeEventListener('blur', finish);
            renderOverlay();
        };
        textEl.addEventListener('blur', finish);
    });

    function onPointerDown(e) {
        if (!annotatePdf) return;
        if (e.target.closest('.anno-text') && e.target.isContentEditable) return;

        const handle = e.target.closest('.anno-handle');
        const item = e.target.closest('.anno-item');

        if (activeTool === 'select') {
            if (handle && item) {
                dragMode = 'resize';
                dragId = item.dataset.id;
                resizeHandle = handle.dataset.handle;
                objectSnapshot = { ...getObject(dragId) };
                dragStart = clientToFrac(e.clientX, e.clientY);
                setSelected(dragId);
                annotateStage.setPointerCapture?.(e.pointerId);
                e.preventDefault();
                return;
            }
            if (item) {
                dragMode = 'move';
                dragId = item.dataset.id;
                objectSnapshot = { ...getObject(dragId) };
                dragStart = clientToFrac(e.clientX, e.clientY);
                setSelected(dragId);
                annotateStage.setPointerCapture?.(e.pointerId);
                e.preventDefault();
                return;
            }
            setSelected(null);
            return;
        }

        if (activeTool === 'text') {
            const p = clientToFrac(e.clientX, e.clientY);
            const fontSizePt = currentFontSizePt();
            const w = Math.min(0.45, Math.max(0.18, (fontSizePt * 12) / pageWidthPt));
            const h = Math.min(0.2, Math.max(0.04, (fontSizePt * 1.6) / pageHeightPt));
            const obj = {
                id: uid(),
                type: 'text',
                pageIndex,
                x: clamp01(p.x - w / 2),
                y: clamp01(p.y - h / 2),
                w,
                h,
                text: 'Texto',
                fontSizePt,
                color: currentColor()
            };
            // keep inside page
            obj.x = clamp01(Math.min(obj.x, 1 - obj.w));
            obj.y = clamp01(Math.min(obj.y, 1 - obj.h));
            objects.push(obj);
            setSelected(obj.id);
            setTool('select');
            renderOverlay();
            // auto-edit
            requestAnimationFrame(() => {
                const el = annotateOverlay.querySelector(`[data-id="${obj.id}"] .anno-text`);
                if (!el) return;
                el.contentEditable = 'true';
                el.focus();
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                const finish = () => {
                    el.contentEditable = 'false';
                    obj.text = el.innerText.replace(/\n+$/, '') || 'Texto';
                    el.removeEventListener('blur', finish);
                    renderOverlay();
                };
                el.addEventListener('blur', finish);
            });
            e.preventDefault();
            return;
        }

        if (activeTool === 'image') {
            if (!pendingImage) {
                annotateImageInput.click();
                return;
            }
            const p = clientToFrac(e.clientX, e.clientY);
            const w = 0.28;
            const h = w * (pageWidthPt / pageHeightPt) / pendingImage.aspect;
            const obj = {
                id: uid(),
                type: 'image',
                pageIndex,
                x: clamp01(p.x - w / 2),
                y: clamp01(p.y - h / 2),
                w,
                h: Math.min(0.5, h),
                bytes: pendingImage.bytes,
                mime: pendingImage.mime,
                objectUrl: pendingImage.url
            };
            obj.x = clamp01(Math.min(obj.x, 1 - obj.w));
            obj.y = clamp01(Math.min(obj.y, 1 - obj.h));
            objects.push(obj);
            pendingImage = null;
            setSelected(obj.id);
            setTool('select');
            renderOverlay();
            e.preventDefault();
            return;
        }

        if (activeTool === 'rect') {
            dragMode = 'draw-rect';
            drawStart = clientToFrac(e.clientX, e.clientY);
            annotateDraft.hidden = false;
            annotateDraft.style.left = `${drawStart.x * 100}%`;
            annotateDraft.style.top = `${drawStart.y * 100}%`;
            annotateDraft.style.width = '0%';
            annotateDraft.style.height = '0%';
            annotateDraft.style.background = hexToRgba(currentColor(), 0.85);
            annotateStage.setPointerCapture?.(e.pointerId);
            e.preventDefault();
        }
    }

    function onPointerMove(e) {
        if (!dragMode) return;
        const p = clientToFrac(e.clientX, e.clientY);

        if (dragMode === 'draw-rect' && drawStart) {
            const x = Math.min(drawStart.x, p.x);
            const y = Math.min(drawStart.y, p.y);
            const w = Math.abs(p.x - drawStart.x);
            const h = Math.abs(p.y - drawStart.y);
            annotateDraft.style.left = `${x * 100}%`;
            annotateDraft.style.top = `${y * 100}%`;
            annotateDraft.style.width = `${w * 100}%`;
            annotateDraft.style.height = `${h * 100}%`;
            return;
        }

        const obj = dragId ? getObject(dragId) : null;
        if (!obj || !dragStart || !objectSnapshot) return;

        if (dragMode === 'move') {
            const dx = p.x - dragStart.x;
            const dy = p.y - dragStart.y;
            obj.x = clamp01(Math.min(objectSnapshot.x + dx, 1 - obj.w));
            obj.y = clamp01(Math.min(objectSnapshot.y + dy, 1 - obj.h));
            renderOverlay();
            return;
        }

        if (dragMode === 'resize') {
            let { x, y, w, h } = objectSnapshot;
            const right = x + w;
            const bottom = y + h;
            if (resizeHandle.includes('e')) {
                w = clamp01(p.x) - x;
            }
            if (resizeHandle.includes('s')) {
                h = clamp01(p.y) - y;
            }
            if (resizeHandle.includes('w')) {
                const nx = clamp01(p.x);
                w = right - nx;
                x = nx;
            }
            if (resizeHandle.includes('n')) {
                const ny = clamp01(p.y);
                h = bottom - ny;
                y = ny;
            }
            const minW = 0.02;
            const minH = 0.015;
            if (w < minW) {
                if (resizeHandle.includes('w')) x = right - minW;
                w = minW;
            }
            if (h < minH) {
                if (resizeHandle.includes('n')) y = bottom - minH;
                h = minH;
            }
            obj.x = clamp01(x);
            obj.y = clamp01(y);
            obj.w = Math.min(w, 1 - obj.x);
            obj.h = Math.min(h, 1 - obj.y);
            renderOverlay();
        }
    }

    function onPointerUp() {
        if (dragMode === 'draw-rect' && drawStart) {
            const left = parseFloat(annotateDraft.style.left) / 100;
            const top = parseFloat(annotateDraft.style.top) / 100;
            const w = parseFloat(annotateDraft.style.width) / 100;
            const h = parseFloat(annotateDraft.style.height) / 100;
            annotateDraft.hidden = true;
            if (w > 0.01 && h > 0.008) {
                const obj = {
                    id: uid(),
                    type: 'rect',
                    pageIndex,
                    x: left,
                    y: top,
                    w,
                    h,
                    color: currentColor(),
                    opacity: 1
                };
                objects.push(obj);
                setSelected(obj.id);
                setTool('select');
                renderOverlay();
            }
        }
        dragMode = null;
        dragId = null;
        dragStart = null;
        drawStart = null;
        objectSnapshot = null;
        resizeHandle = null;
    }

    // --- Export ---
    async function rasterizeTextToPng(obj, pageW, pageH) {
        const wPx = Math.max(8, Math.round(obj.w * pageW * 2));
        const hPx = Math.max(8, Math.round(obj.h * pageH * 2));
        const canvas = document.createElement('canvas');
        canvas.width = wPx;
        canvas.height = hPx;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, wPx, hPx);
        const fontPx = (obj.fontSizePt / pageW) * wPx / obj.w;
        ctx.font = `600 ${Math.max(10, fontPx)}px Inter, Arial, sans-serif`;
        ctx.fillStyle = obj.color || '#111827';
        ctx.textBaseline = 'top';
        const lines = String(obj.text || '').split('\n');
        const lineHeight = fontPx * 1.25;
        lines.forEach((line, i) => {
            ctx.fillText(line, 2, 2 + i * lineHeight, wPx - 4);
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        return new Uint8Array(await blob.arrayBuffer());
    }

    async function executeAnnotateExport() {
        if (!annotateBytes || !annotateFile) return;
        annotateExportBtn.disabled = true;
        annotateContainer.style.display = 'block';
        annotateProgress.style.width = '0%';
        annotateStatus.innerHTML = `<span>Fusionando anotaciones...</span>`;

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(annotateBytes.slice(0), { ignoreEncryption: true });
            stripPdfMetadata(pdfDoc);
            const pages = pdfDoc.getPages();
            const total = Math.max(1, objects.length);

            let done = 0;
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const { width, height } = page.getSize();
                const pageObjs = objects.filter(o => o.pageIndex === i);

                for (const obj of pageObjs) {
                    const x = obj.x * width;
                    const yTop = obj.y * height;
                    const w = obj.w * width;
                    const h = obj.h * height;
                    const y = height - yTop - h; // PDF bottom-left

                    if (obj.type === 'rect') {
                        const rgb = hexToRgb01(obj.color || '#111827');
                        page.drawRectangle({
                            x,
                            y,
                            width: w,
                            height: h,
                            color: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                            opacity: obj.opacity ?? 1,
                            borderWidth: 0
                        });
                    } else if (obj.type === 'image' && obj.bytes) {
                        let image;
                        if ((obj.mime || '').includes('png')) {
                            image = await pdfDoc.embedPng(obj.bytes);
                        } else {
                            image = await pdfDoc.embedJpg(obj.bytes);
                        }
                        page.drawImage(image, { x, y, width: w, height: h });
                    } else if (obj.type === 'text') {
                        const pngBytes = await rasterizeTextToPng(obj, width, height);
                        const image = await pdfDoc.embedPng(pngBytes);
                        page.drawImage(image, { x, y, width: w, height: h });
                    }

                    done += 1;
                    annotateProgress.style.width = `${Math.min(100, (done / total) * 100)}%`;
                }
            }

            annotateStatus.innerHTML = `<span>Guardando PDF...</span>`;
            const out = await pdfDoc.save();
            downloadPdfBytes(out, `${baseName(annotateFile.name)}_editado.pdf`);
            annotateStatus.innerHTML = `<span>PDF editado listo. Descarga iniciada.</span>`;
            annotateProgress.style.width = '100%';
            showToast('PDF editado descargado con éxito', 'success');
        } catch (err) {
            console.error(err);
            annotateStatus.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
            showToast(`Error al exportar: ${err.message}`, 'error');
        }

        annotateExportBtn.disabled = false;
    }

    annotateExportBtn.addEventListener('click', () => {
        if (!annotateFile) return;
        const count = objects.length;
        showConfirmModal({
            title: 'Confirmar exportación',
            message: count
                ? `¿Descargar el PDF con <strong>${count} anotación(es)</strong> fusionadas?`
                : `No hay anotaciones. ¿Descargar una copia del PDF original (metadatos limpios)?`,
            actionText: 'Descargar PDF',
            onConfirm: executeAnnotateExport
        });
    });
})();
