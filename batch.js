document.addEventListener('DOMContentLoaded', () => {
    // --- 元素获取 ---
    const dom = {
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        fileInput: document.getElementById('file-input'),
        fileListCard: document.getElementById('file-list-card'),
        fileListBody: document.getElementById('file-list-body'),
        settingsCard: document.getElementById('settings-card'),
        actionCard: document.getElementById('action-card'),
        exportFormatSelect: document.getElementById('export-format'),
        mp3BitrateLabel: document.getElementById('mp3-bitrate-label'),
        mp3BitrateSelect: document.getElementById('mp3-bitrate'),
        postVolumeSlider: document.getElementById('post-volume'),
        postVolumeLabel: document.getElementById('post-volume-label'),
        fadeInInput: document.getElementById('fade-in'),
        fadeOutInput: document.getElementById('fade-out'),
        startBatchProcessBtn: document.getElementById('start-batch-process-btn'),
        downloadZipBtn: document.getElementById('download-zip-btn'),
        batchProgressBar: document.getElementById('batch-progress-bar'),
        batchStatusLabel: document.getElementById('batch-status-label'),
    };

    // --- 全局状态 ---
    let filesToProcess = [];
    let audioContext;
    let isProcessing = false;

    // --- 初始化 ---
    function init() {
        setupEventListeners();
        initAudioContext();
        // 主题切换初始化
        if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-mode');
            dom.themeToggleBtn.textContent = '切换为亮色主题';
        }
    }

    function setupEventListeners() {
        dom.themeToggleBtn.addEventListener('click', toggleTheme);
        dom.fileInput.addEventListener('change', handleFileSelection);
        dom.exportFormatSelect.addEventListener('change', () => {
            const isMp3 = dom.exportFormatSelect.value === 'mp3';
            dom.mp3BitrateLabel.style.display = dom.mp3BitrateSelect.style.display = isMp3 ? '' : 'none';
        });
        dom.postVolumeSlider.addEventListener('input', () => {
            dom.postVolumeLabel.textContent = `${dom.postVolumeSlider.value}%`;
        });
        dom.startBatchProcessBtn.addEventListener('click', startBatchProcess);
        dom.downloadZipBtn.addEventListener('click', downloadZip);
    }
    
    function initAudioContext() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
        } catch (e) {
            alert('错误：您的浏览器不支持Web Audio API，无法使用此工具。');
            dom.settingsCard.style.display = 'none';
            dom.actionCard.style.display = 'none';
        }
    }

    // --- 主题切换 ---
    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        dom.themeToggleBtn.textContent = document.body.classList.contains('dark-mode') ? '切换为亮色主题' : '切换为暗色主题';
    }

    // --- 文件处理 ---
    function handleFileSelection(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        resetState();
        filesToProcess = Array.from(files).map((file, index) => ({
            id: `file-${Date.now()}-${index}`,
            file: file,
            status: '待处理',
            originalSize: file.size,
            processedBlob: null,
            processedSize: 0,
        }));

        renderFileList();
        setUIVisibility(true);
        dom.startBatchProcessBtn.disabled = false;
    }
    
    function renderFileList() {
        dom.fileListBody.innerHTML = '';
        filesToProcess.forEach(fileObj => {
            const row = document.createElement('tr');
            row.id = fileObj.id;
            row.innerHTML = `
                <td>${escapeHtml(fileObj.file.name)}</td>
                <td>${formatBytes(fileObj.originalSize)}</td>
                <td class="status-cell"><span>${fileObj.status}</span></td>
                <td class="processed-size-cell">--</td>
            `;
            dom.fileListBody.appendChild(row);
        });
    }

    async function startBatchProcess() {
        if (isProcessing || filesToProcess.length === 0) return;
        isProcessing = true;
        setBusyState(true);
        dom.downloadZipBtn.disabled = true;

        let processedCount = 0;
        for (const fileObj of filesToProcess) {
            updateFileStatus(fileObj.id, '处理中...', 'status-processing');
            try {
                const processedBlob = await processSingleFile(fileObj.file);
                fileObj.processedBlob = processedBlob;
                fileObj.processedSize = processedBlob.size;
                fileObj.status = '完成';
                updateFileStatus(fileObj.id, '完成', 'status-done', formatBytes(processedBlob.size));
            } catch (error) {
                console.error(`处理文件 ${fileObj.file.name} 失败:`, error);
                fileObj.status = '错误';
                updateFileStatus(fileObj.id, `错误: ${error.message.slice(0, 30)}...`, 'status-error');
            }
            processedCount++;
            dom.batchProgressBar.value = (processedCount / filesToProcess.length) * 100;
        }

        isProcessing = false;
        setBusyState(false);
        dom.batchStatusLabel.textContent = `批量处理完成！共处理 ${filesToProcess.length} 个文件。`;
        dom.downloadZipBtn.disabled = false;
    }

    async function processSingleFile(file) {
        if (!audioContext) throw new Error("AudioContext 未初始化");
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, decodedBuffer.length, decodedBuffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = decodedBuffer;

        const gainNode = offlineCtx.createGain();
        const now = offlineCtx.currentTime;
        const fadeIn = parseFloat(dom.fadeInInput.value) || 0;
        const fadeOut = parseFloat(dom.fadeOutInput.value) || 0;
        const volume = (parseFloat(dom.postVolumeSlider.value) || 100) / 100;
        const duration = decodedBuffer.duration;

        gainNode.gain.setValueAtTime(volume, now);
        if (fadeIn > 0) {
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(volume, now + Math.min(fadeIn, duration));
        }
        const fadeOutStart = duration - fadeOut;
        if (fadeOut > 0 && fadeOutStart > (now + fadeIn)) {
            gainNode.gain.setValueAtTime(volume, now + fadeOutStart);
            gainNode.gain.linearRampToValueAtTime(0, now + duration);
        }

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);
        source.start(0);

        const renderedBuffer = await offlineCtx.startRendering();
        
        if (dom.exportFormatSelect.value === 'wav') {
            return bufferToWav(renderedBuffer);
        } else {
            return bufferToMp3(renderedBuffer, parseInt(dom.mp3BitrateSelect.value));
        }
    }
    
    async function downloadZip() {
        const zip = new JSZip();
        let filesAdded = 0;
        
        dom.batchStatusLabel.textContent = '正在打包ZIP文件，请稍候...';
        dom.downloadZipBtn.disabled = true;

        filesToProcess.forEach(fileObj => {
            if (fileObj.processedBlob) {
                const originalName = fileObj.file.name;
                const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
                const newExtension = dom.exportFormatSelect.value;
                const newName = `${baseName}.${newExtension}`;
                zip.file(newName, fileObj.processedBlob);
                filesAdded++;
            }
        });
        
        if (filesAdded === 0) {
            alert('没有成功处理的文件可以打包。');
            dom.batchStatusLabel.textContent = '没有文件可打包。';
            dom.downloadZipBtn.disabled = false;
            return;
        }

        try {
            const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
                 dom.batchProgressBar.value = metadata.percent;
            });
            downloadBlob(content, `批量处理音频_${new Date().toISOString().slice(0,10)}.zip`);
            dom.batchStatusLabel.textContent = 'ZIP 文件已生成并开始下载！';
        } catch (error) {
            console.error('创建ZIP失败:', error);
            dom.batchStatusLabel.textContent = '创建ZIP文件失败！';
        } finally {
            dom.downloadZipBtn.disabled = false;
        }
    }

    // --- UI 更新与辅助函数 ---
    function resetState() {
        filesToProcess = [];
        dom.fileListBody.innerHTML = '';
        setUIVisibility(false);
        dom.startBatchProcessBtn.disabled = true;
        dom.downloadZipBtn.disabled = true;
        dom.batchProgressBar.style.display = 'none';
        dom.batchProgressBar.value = 0;
        dom.batchStatusLabel.textContent = '';
    }

    function setUIVisibility(visible) {
        dom.fileListCard.style.display = visible ? 'block' : 'none';
        dom.settingsCard.style.display = visible ? 'block' : 'none';
        dom.actionCard.style.display = visible ? 'block' : 'none';
    }
    
    function setBusyState(busy) {
        isProcessing = busy;
        dom.startBatchProcessBtn.disabled = busy;
        dom.fileInput.disabled = busy;
        dom.batchProgressBar.style.display = busy ? 'block' : 'none';
        if (busy) {
            dom.batchProgressBar.value = 0;
            dom.batchStatusLabel.textContent = '正在处理，请勿关闭页面...';
        }
    }

    function updateFileStatus(fileId, statusText, statusClass, processedSizeText = '--') {
        const row = document.getElementById(fileId);
        if (!row) return;
        const statusCell = row.querySelector('.status-cell span');
        const sizeCell = row.querySelector('.processed-size-cell');
        statusCell.textContent = statusText;
        statusCell.className = statusClass;
        sizeCell.textContent = processedSizeText;
    }
    
    // 从旧项目复制过来的辅助函数
    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    
    const escapeHtml = (unsafe) => {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#39;");
    };

    const bufferToMp3 = (audioBuffer, bitrate = 128) => {
        const encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, bitrate);
        const pcm = audioBuffer.getChannelData(0);
        const samples = new Int16Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) {
            samples[i] = pcm[i] * 32767.5;
        }
        const data = []; 
        const blockSize = 1152;
        for (let i = 0; i < samples.length; i += blockSize) {
            const chunk = samples.subarray(i, i + blockSize);
            const mp3buf = encoder.encodeBuffer(chunk);
            if (mp3buf.length > 0) {
                data.push(mp3buf);
            }
        }
        const mp3buf = encoder.flush();
        if (mp3buf.length > 0) {
            data.push(mp3buf);
        }
        return new Blob(data, { type: 'audio/mpeg' });
    };

    const bufferToWav = (buffer) => {
        function writeString(v, o, s) { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
        let n = buffer.numberOfChannels, l = buffer.length * n * 2 + 44, r = new DataView(new ArrayBuffer(l)), i = 0;
        writeString(r, i, 'RIFF'); i += 4; r.setUint32(i, l - 8, true); i += 4; writeString(r, i, 'WAVE'); i += 4;
        writeString(r, i, 'fmt '); i += 4; r.setUint32(i, 16, true); i += 4; r.setUint16(i, 1, true); i += 2;
        r.setUint16(i, n, true); i += 2; r.setUint32(i, buffer.sampleRate, true); i += 4;
        r.setUint32(i, buffer.sampleRate * 2 * n, true); i += 4;
        r.setUint16(i, n * 2, true); i += 2; r.setUint16(i, 16, true); i += 2; writeString(r, i, 'data'); i += 4; r.setUint32(i, l - i - 4, true); i += 4;
        for (let c = 0; c < n; c++) {
            let d = buffer.getChannelData(c);
            for (let j = 0; j < buffer.length; j++) {
                let s = Math.max(-1, Math.min(1, d[j]));
                r.setInt16(i, s < 0 ? s * 32768 : s * 32767, true); i += 2;
            }
        }
        return new Blob([r], { type: 'audio/wav' });
    };

    // --- 启动应用 ---
    init();
});