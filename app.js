document.addEventListener('DOMContentLoaded', () => {
    // --- 元素获取 ---
    const dom = {
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        appidInput: document.getElementById('appid'),
        apikeyInput: document.getElementById('apikey'),
        apisecretInput: document.getElementById('apisecret'),
        textInput: document.getElementById('text-input'),
        charCounter: document.getElementById('char-counter'),
        volumeSlider: document.getElementById('volume'),
        volumeLabel: document.getElementById('volume-label'),
        speedSlider: document.getElementById('speed'),
        speedLabel: document.getElementById('speed-label'),
        pitchSlider: document.getElementById('pitch'),
        pitchLabel: document.getElementById('pitch-label'),
        voiceSelect: document.getElementById('voice'),
        oralLevelSelect: document.getElementById('oral-level'),
        sparkAssistCheck: document.getElementById('spark-assist'),
        remainCheck: document.getElementById('remain'),
        oralWidgets: [ document.getElementById('oral-level-label'), document.getElementById('oral-level'), document.getElementById('spark-assist-label'), document.getElementById('spark-assist').parentElement, document.getElementById('remain-label'), document.getElementById('remain').parentElement ],
        encodingSelect: document.getElementById('encoding'),
        sampleRateSelect: document.getElementById('sample-rate'),
        generateBtn: document.getElementById('generate-btn'),
        playBtn: document.getElementById('play-btn'),
        stopBtn: document.getElementById('stop-btn'),
        audioPlayer: document.getElementById('audio-player'),
        statusOutput: document.getElementById('status-output'),
        progressBar: document.getElementById('progress-bar'),
        postProcessingCard: document.getElementById('post-processing-card'),
        exportFormatSelect: document.getElementById('export-format'),
        mp3BitrateLabel: document.getElementById('mp3-bitrate-label'),
        mp3BitrateSelect: document.getElementById('mp3-bitrate'),
        postVolumeSlider: document.getElementById('post-volume'),
        postVolumeLabel: document.getElementById('post-volume-label'),
        fadeInInput: document.getElementById('fade-in'),
        fadeOutInput: document.getElementById('fade-out'),
        processBtn: document.getElementById('process-btn'),
        processingStatus: document.getElementById('processing-status'),
        insertPauseBtn: document.getElementById('insert-pause-btn'),
        insertPinyinBtn: document.getElementById('insert-pinyin-btn'),
        modal: document.getElementById('tag-editor-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalPauseSection: document.getElementById('modal-pause-section'),
        modalPauseInput: document.getElementById('modal-pause-input'),
        modalPinyinSection: document.getElementById('modal-pinyin-section'),
        modalCharDisplay: document.getElementById('modal-char-display'),
        modalPinyinInput: document.getElementById('modal-pinyin-input'),
        modalToneSelect: document.getElementById('modal-tone-select'),
        modalSaveBtn: document.getElementById('modal-save-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        originalAudioInfoBox: document.getElementById('original-audio-info'),
        originalSizeLabel: document.getElementById('original-size-label'),
        downloadOriginalBtn: document.getElementById('download-original-btn'),
        downloadProcessedBtn: document.getElementById('download-processed-btn'),
    };

    // --- 全局状态 ---
    let websocket, originalAudioBlob, processedAudioBlob, isSynthesizing, audioContext;
    let currentEditingTag = null, savedRange = null;

    // --- 数据常量 ---
    const voiceMap = { '聆飞逸(成年男) x5': 'x5_lingfeiyi_flow', '聆玉言(成年女) x5': 'x5_lingyuyan_flow', '聆小玥(成年女) x5': 'x5_lingxiaoyue_flow', '聆小璇(成年女) x5': 'x5_lingxiaoxuan_flow', '聆玉昭(成年女) x5': 'x5_lingyuzhao_flow', '聆小璃(成年女) x4': 'x4_lingxiaoli_oral', '聆小琪(成年女) x4': 'x4_lingxiaoqi_oral', '聆佑佑(童年女) x4': 'x4_lingyouyou_oral', '聆飞哲(成年男) x4': 'x4_lingfeizhe_oral' };

    // --- [已修复] 将函数定义移到使用它们的代码之前 ---

    // --- 下载逻辑 ---
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logMessage(`下载链接已创建: ${filename}`, "info");
    }

    function downloadOriginalAudio() {
        if (!originalAudioBlob) { alert("没有可下载的原始音频。"); return; }
        const extension = dom.encodingSelect.value === 'raw' ? 'wav' : 'mp3';
        downloadBlob(originalAudioBlob, `原始音频_${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`);
    }

    function downloadProcessedAudio() {
        if (!processedAudioBlob) { alert("没有可下载的处理后音频。"); return; }
        const extension = dom.exportFormatSelect.value;
        downloadBlob(processedAudioBlob, `处理后音频_${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`);
    }

    // --- 初始化函数 ---
    function init() {
        loadApiConfig();
        setupEventListeners();
        populateVoiceSelect();
        onVoiceChange();
        initAudioContext();
        updateCharCounter();
    }
    
    function setupEventListeners() {
        dom.themeToggleBtn.addEventListener('click', toggleTheme);
        if (window.matchMedia?.dark?.matches) { document.body.classList.add('dark-mode'); dom.themeToggleBtn.textContent = '切换为亮色主题'; }
        dom.appidInput.addEventListener('input', saveApiConfig);
        dom.apikeyInput.addEventListener('input', saveApiConfig);
        dom.apisecretInput.addEventListener('input', saveApiConfig);
        ['volume', 'speed', 'pitch'].forEach(type => { const slider = dom[`${type}Slider`], label = dom[`${type}Label`]; slider.addEventListener('input', () => label.textContent = slider.value); });
        dom.generateBtn.addEventListener('click', startSynthesis);
        dom.playBtn.addEventListener('click', playAudio);
        dom.stopBtn.addEventListener('click', stopAudio);
        dom.audioPlayer.addEventListener('ended', onPlayEnded);
        dom.textInput.addEventListener('input', updateCharCounter);
        dom.insertPauseBtn.addEventListener('click', handleInsertPause);
        dom.insertPinyinBtn.addEventListener('click', handleInsertPinyin);
        dom.textInput.addEventListener('click', (e) => {
            if (e.target.classList.contains('tts-tag')) { showEditModal(e.target); }
            else if (e.target.classList.contains('delete-tag')) {
                const tagElement = e.target.parentElement;
                if (tagElement.dataset.type === 'pinyin') {
                    const charElement = tagElement.previousElementSibling;
                    if (charElement?.classList.contains('char-modified')) {
                        const textNode = document.createTextNode(charElement.textContent);
                        charElement.parentNode.replaceChild(textNode, charElement);
                    }
                }
                tagElement.remove();
                updateCharCounter();
            }
        });
        dom.modalCancelBtn.addEventListener('click', () => dom.modal.style.display = 'none');
        dom.modalSaveBtn.addEventListener('click', saveTagChanges);
        dom.postVolumeSlider.addEventListener('input', () => dom.postVolumeLabel.textContent = `${dom.postVolumeSlider.value}%`);
        dom.exportFormatSelect.addEventListener('change', () => { const isMp3 = dom.exportFormatSelect.value === 'mp3'; dom.mp3BitrateLabel.style.display = dom.mp3BitrateSelect.style.display = isMp3 ? '' : 'none'; });
        dom.processBtn.addEventListener('click', async () => { logMessage('开始应用后期处理...', 'info'); await processAudio(); logMessage('后期处理完成。', 'success'); playAudio(); });
        dom.downloadOriginalBtn.addEventListener('click', downloadOriginalAudio);
        dom.downloadProcessedBtn.addEventListener('click', downloadProcessedAudio);
    }
    
    function populateVoiceSelect() {
        Object.keys(voiceMap).forEach(key => { const option = document.createElement('option'); option.value = voiceMap[key]; option.textContent = key; dom.voiceSelect.appendChild(option); });
        dom.voiceSelect.addEventListener('change', onVoiceChange);
    }
    
    function initAudioContext() {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        try { audioContext = new AudioContext(); }
        catch (e) { alert('您的浏览器不支持 Web Audio API，后期处理功能将不可用。'); dom.postProcessingCard.style.display = 'none'; }
    }

    // --- 本地存储 ---
    function saveApiConfig() {
        localStorage.setItem('xf-tts-tool-config', JSON.stringify({ appid: dom.appidInput.value, apikey: dom.apikeyInput.value, apisecret: dom.apisecretInput.value }));
    }

    function loadApiConfig() {
        const savedConfig = localStorage.getItem('xf-tts-tool-config');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                dom.appidInput.value = config.appid || '';
                dom.apikeyInput.value = config.apikey || '';
                dom.apisecretInput.value = config.apisecret || '';
                logMessage('已从浏览器加载保存的API配置。', 'info');
            } catch (e) { console.error("解析本地存储配置失败:", e); }
        }
    }

    // --- 富文本编辑器核心逻辑 ---
    function saveSelection() {
        const selection = window.getSelection();
        if (selection.getRangeAt && selection.rangeCount) { savedRange = selection.getRangeAt(0); }
        else { savedRange = null; }
    }

    function handleInsertPause() {
        saveSelection();
        const duration = prompt("请输入停顿时长（毫秒）:", "500");
        if (savedRange && duration && !isNaN(duration) && duration > 0) { insertTag('pause', { value: duration }, savedRange); }
        savedRange = null;
    }

    function handleInsertPinyin() {
        saveSelection();
        const selectedText = savedRange?.toString().trim();
        if (selectedText?.length !== 1 || !/[\u3400-\u4DBF\u4E00-\u9FFF]/.test(selectedText)) {
            alert("请先在编辑框中精确选中一个汉字！");
            savedRange = null;
            return;
        }
        currentEditingTag = null;
        showEditModal(null, selectedText);
    }

    function insertTag(type, data, range) {
        if (!range) return;
        const tag = document.createElement('span');
        tag.className = 'tts-tag';
        tag.setAttribute('contenteditable', 'false');
        tag.dataset.type = type;
        if (type === 'pause') {
            tag.dataset.value = data.value;
            tag.innerHTML = `停顿 ${data.value}ms<span class="delete-tag">×</span>`;
            range.deleteContents();
            range.insertNode(tag);
        } else if (type === 'pinyin') {
            tag.dataset.pinyin = data.pinyin;
            tag.dataset.tone = data.tone;
            tag.innerHTML = `读音: ${data.pinyin}${data.tone}<span class="delete-tag">×</span>`;
            const charSpan = document.createElement('span');
            charSpan.className = 'char-modified';
            charSpan.textContent = data.char;
            range.deleteContents();
            range.insertNode(tag);
            range.insertNode(charSpan);
        }
        range.setStartAfter(tag);
        range.collapse(true);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        updateCharCounter();
    }
    
    function showEditModal(tagElement, newChar = null) {
        currentEditingTag = tagElement;
        if (tagElement) {
            const type = tagElement.dataset.type;
            if (type === 'pause') {
                dom.modalTitle.textContent = '编辑停顿';
                dom.modalPauseSection.style.display = 'block'; dom.modalPinyinSection.style.display = 'none';
                dom.modalPauseInput.value = tagElement.dataset.value;
            } else if (type === 'pinyin') {
                dom.modalTitle.textContent = '编辑读音';
                dom.modalPauseSection.style.display = 'none'; dom.modalPinyinSection.style.display = 'block';
                const charNode = tagElement.previousElementSibling;
                if (charNode?.classList.contains('char-modified')) { dom.modalCharDisplay.textContent = charNode.textContent; }
                dom.modalPinyinInput.value = tagElement.dataset.pinyin;
                dom.modalToneSelect.value = tagElement.dataset.tone;
            }
        } else if (newChar) {
            dom.modalTitle.textContent = '指定读音';
            dom.modalPauseSection.style.display = 'none'; dom.modalPinyinSection.style.display = 'block';
            dom.modalCharDisplay.textContent = newChar;
            dom.modalPinyinInput.value = ''; dom.modalToneSelect.value = '1';
        }
        dom.modal.style.display = 'flex';
        (dom.modalPauseSection.style.display !== 'none' ? dom.modalPauseInput : dom.modalPinyinInput).focus();
    }

    function saveTagChanges() {
        if (currentEditingTag) {
            const type = currentEditingTag.dataset.type;
            if (type === 'pause') {
                currentEditingTag.dataset.value = dom.modalPauseInput.value;
                currentEditingTag.innerHTML = `停顿 ${dom.modalPauseInput.value}ms<span class="delete-tag">×</span>`;
            } else if (type === 'pinyin') {
                const newPinyin = dom.modalPinyinInput.value.trim();
                if (newPinyin) {
                    currentEditingTag.dataset.pinyin = newPinyin;
                    currentEditingTag.dataset.tone = dom.modalToneSelect.value;
                    currentEditingTag.innerHTML = `读音: ${newPinyin}${dom.modalToneSelect.value}<span class="delete-tag">×</span>`;
                }
            }
        } else if (savedRange) {
            const pinyin = dom.modalPinyinInput.value.trim();
            if (pinyin) {
                insertTag('pinyin', { char: dom.modalCharDisplay.textContent, pinyin: pinyin, tone: dom.modalToneSelect.value }, savedRange);
            }
        }
        dom.modal.style.display = 'none';
        currentEditingTag = null;
        savedRange = null;
        updateCharCounter();
    }

    function serializeEditorContent() {
        let result = '';
        const nodes = dom.textInput.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.nodeType === Node.TEXT_NODE) { result += node.textContent; }
            else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'SPAN' && node.classList.contains('char-modified')) {
                    const char = node.textContent;
                    const nextNode = node.nextSibling;
                    if (nextNode?.nodeType === Node.ELEMENT_NODE && nextNode.classList.contains('tts-tag') && nextNode.dataset.type === 'pinyin') {
                        result += `${char}[=${nextNode.dataset.pinyin}${nextNode.dataset.tone}]`;
                        i++;
                    } else { result += char; }
                } else if (node.tagName === 'SPAN' && node.classList.contains('tts-tag') && node.dataset.type === 'pause') {
                    result += `[p${node.dataset.value}]`;
                } else if (node.tagName === 'BR') { result += '\n'; }
            }
        }
        return result;
    }

    function updateCharCounter() {
        const serializedText = serializeEditorContent();
        const byteLength = new TextEncoder().encode(serializedText).length;
        dom.charCounter.textContent = `合成字节数: ${byteLength} B`;
        dom.charCounter.classList.toggle('error', byteLength > 8000);
    }

    // --- UI & 状态更新 ---
    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        dom.themeToggleBtn.textContent = document.body.classList.contains('dark-mode') ? '切换为亮色主题' : '切换为暗色主题';
    }

    function onVoiceChange() {
        const isX5 = dom.voiceSelect.value.startsWith('x5_');
        dom.oralWidgets.forEach(w => w.style.display = isX5 ? 'none' : '');
        if (isX5) { logMessage('提示：x5系列发音人不支持口语化配置。', 'info'); }
    }

    function logMessage(message, level = 'normal') {
        const timestamp = new Date().toLocaleTimeString();
        const msgDiv = document.createElement('div');
        msgDiv.className = level;
        msgDiv.textContent = `[${timestamp}] ${message}`;
        dom.statusOutput.appendChild(msgDiv);
        dom.statusOutput.scrollTop = dom.statusOutput.scrollHeight;
    }

    function setUIState(isBusy) {
        isSynthesizing = isBusy;
        dom.generateBtn.disabled = isBusy;
        dom.progressBar.style.display = isBusy ? 'block' : 'none';
        if (!isBusy) dom.progressBar.removeAttribute('value');
    }
    
    function updatePlayerState(state) {
        if (state === 'idle') {
            dom.playBtn.disabled = true;
            dom.stopBtn.disabled = true;
            dom.postProcessingCard.style.display = 'none';
            dom.originalAudioInfoBox.style.display = 'none';
        } else if (state === 'generated') {
            dom.playBtn.disabled = false;
            dom.stopBtn.disabled = true;
            dom.postProcessingCard.style.display = 'block';
            dom.originalAudioInfoBox.style.display = 'flex';
        }
    }

    // --- 语音合成与 WebSocket 通信 ---
    async function startSynthesis() {
        if (isSynthesizing) return;
        const text = serializeEditorContent().trim();
        const byteLength = new TextEncoder().encode(text).length;
        if (!text) { alert('请输入要合成的文本内容！'); return; }
        if (byteLength > 8000) { alert(`文本内容过长(${byteLength}字节)，已超出8000字节限制！`); return; }
        
        stopAudio();
        updatePlayerState('idle');
        originalAudioBlob = null;
        processedAudioBlob = null;
        dom.processingStatus.textContent = '';
        
        const appid = dom.appidInput.value.trim(), apikey = dom.apikeyInput.value.trim(), apisecret = dom.apisecretInput.value.trim();
        if (!appid || !apikey || !apisecret) { alert('API配置不完整!'); return; }
        
        setUIState(true);
        logMessage('开始语音合成...', 'info');
        try {
            const wsUrl = await assembleWsAuthUrl(apikey, apisecret);
            websocket = new WebSocket(wsUrl);
            let audioChunks = [];
            websocket.onopen = () => sendData(text, appid);
            websocket.onmessage = (event) => { const res = JSON.parse(event.data); if (res.header.code !== 0) { logMessage(`错误: ${res.header.code}, ${res.header.message}`, 'error'); alert(`API 错误: ${res.header.message}`); websocket.close(); return; } if (res.payload?.audio?.audio) { const audioData = atob(res.payload.audio.audio); const byteArray = new Uint8Array(audioData.length); for (let i = 0; i < audioData.length; i++) byteArray[i] = audioData.charCodeAt(i); audioChunks.push(byteArray); } };
            websocket.onerror = () => { logMessage('WebSocket 连接错误', 'error'); synthesisCompleted(false); };
            websocket.onclose = () => {
                logMessage('WebSocket 连接关闭');
                const success = audioChunks.length > 0;
                if (success) {
                    originalAudioBlob = new Blob(audioChunks, { type: dom.encodingSelect.value === 'raw' ? 'audio/wav' : 'audio/mpeg' });
                    dom.originalSizeLabel.textContent = formatBytes(originalAudioBlob.size);
                }
                synthesisCompleted(success);
            };
        } catch (error) { logMessage(`认证URL生成失败: ${error}`, 'error'); setUIState(false); }
    }
    
    function sendData(text, appid) {
        const vcn = dom.voiceSelect.value;
        
        // 初始化 businessArgs，先只包含 tts
        const businessArgs = {
            tts: {
                vcn,
                speed: parseInt(dom.speedSlider.value),
                volume: parseInt(dom.volumeSlider.value),
                pitch: parseInt(dom.pitchSlider.value),
                audio: {
                    encoding: dom.encodingSelect.value,
                    sample_rate: parseInt(dom.sampleRateSelect.value),
                    channels: 1,
                    bit_depth: 16,
                    frame_size: 0
                }
            }
        };
    
        // 如果不是 x5 系列发音人，再添加 oral 对象，使其与 tts 平级
        if (!vcn.startsWith('x5_')) {
            // [核心修改]：从 businessArgs.tts.oral 改为 businessArgs.oral
            businessArgs.oral = {
                oral_level: dom.oralLevelSelect.value,
                spark_assist: dom.sparkAssistCheck.checked ? 1 : 0,
                remain: dom.remainCheck.checked ? 1 : 0
            };
        }
    
        const dataPayload = {
            text: {
                encoding: "utf8",
                compress: "raw",
                format: "plain",
                status: 2,
                text: btoa(unescape(encodeURIComponent(text)))
            }
        };
    
        const params = {
            header: { app_id: appid, status: 2 },
            parameter: businessArgs,
            payload: dataPayload
        };
        
        websocket.send(JSON.stringify(params));
    }
    
    async function synthesisCompleted(success) {
        setUIState(false);
        if (success) {
            logMessage('语音合成成功！准备后期处理...', 'success');
            updatePlayerState('generated');
            await processAudio();
            playAudio();
        } else {
            logMessage('语音合成失败。', 'error');
            updatePlayerState('idle');
        }
    }
    
    async function assembleWsAuthUrl(apiKey, apiSecret) {
        const url = new URL('wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/mcd9m97e6');
        const date = new Date().toUTCString();
        const signatureOrigin = `host: ${url.host}\ndate: ${date}\nGET ${url.pathname} HTTP/1.1`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureOrigin));
        const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
        const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureB64}"`;
        const authorization = btoa(authorizationOrigin);
        return `${url.href}?${new URLSearchParams({ host: url.host, date, authorization })}`;
    }

    // --- 音频处理与播放 ---
    function formatBytes(bytes, decimals = 2) { if (bytes === 0) return '0 Bytes'; const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]; }

    async function processAudio() {
        if (!originalAudioBlob || !audioContext) return;
        dom.processBtn.disabled = true;
        dom.downloadProcessedBtn.disabled = true;
        dom.processingStatus.textContent = '处理中...';
        try {
            const decodedBuffer = await audioContext.decodeAudioData(await originalAudioBlob.arrayBuffer());
            const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, decodedBuffer.length, decodedBuffer.sampleRate);
            const source = offlineCtx.createBufferSource(); source.buffer = decodedBuffer;
            const gainNode = offlineCtx.createGain();
            const now = offlineCtx.currentTime, fadeIn = parseFloat(dom.fadeInInput.value) || 0, fadeOut = parseFloat(dom.fadeOutInput.value) || 0, volume = (parseFloat(dom.postVolumeSlider.value) || 100) / 100, duration = decodedBuffer.duration;
            gainNode.gain.setValueAtTime(volume, now);
            if (fadeIn > 0) { gainNode.gain.setValueAtTime(0, now); gainNode.gain.linearRampToValueAtTime(volume, now + Math.min(fadeIn, duration)); }
            const fadeOutStart = duration - fadeOut;
            if (fadeOut > 0 && fadeOutStart > fadeIn) { gainNode.gain.setValueAtTime(volume, now + fadeOutStart); gainNode.gain.linearRampToValueAtTime(0, now + duration); }
            source.connect(gainNode); gainNode.connect(offlineCtx.destination);
            source.start(0);
            const renderedBuffer = await offlineCtx.startRendering();
            processedAudioBlob = dom.exportFormatSelect.value === 'wav' ? bufferToWav(renderedBuffer) : bufferToMp3(renderedBuffer, parseInt(dom.mp3BitrateSelect.value));
            dom.processingStatus.textContent = `预览大小: ${formatBytes(processedAudioBlob.size)}`;
        } catch (e) {
            logMessage(`后期处理失败: ${e}`, 'error');
            dom.processingStatus.textContent = '处理失败!';
        } finally {
            dom.processBtn.disabled = false;
            dom.downloadProcessedBtn.disabled = false;
        }
    }

    function playAudio() {
        const blobToPlay = processedAudioBlob || originalAudioBlob;
        if (!blobToPlay) return;

        stopAudio();
        const url = URL.createObjectURL(blobToPlay);
        dom.audioPlayer.src = url;
        dom.audioPlayer.play();
        logMessage(processedAudioBlob ? "播放预览音频..." : "播放原始音频...", "info");
        dom.playBtn.disabled = true;
        dom.stopBtn.disabled = false;
    }

    function stopAudio() {
        if (!dom.audioPlayer.paused) {
            dom.audioPlayer.pause();
            dom.audioPlayer.currentTime = 0;
            logMessage("播放已停止。");
        }
        dom.playBtn.disabled = !originalAudioBlob;
        dom.stopBtn.disabled = true;
    }

    function onPlayEnded() {
        dom.playBtn.disabled = !originalAudioBlob;
        dom.stopBtn.disabled = true;
        logMessage("播放结束。");
    }

    // --- 音频编码辅助函数 ---
    function bufferToMp3(audioBuffer, bitrate = 128) {
        const encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, bitrate);
        const pcm = audioBuffer.getChannelData(0);
        const samples = new Int16Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] * 32767.5;
        const data = [];
        const blockSize = 1152;
        for (let i = 0; i < samples.length; i += blockSize) {
            const chunk = samples.subarray(i, i + blockSize);
            const mp3buf = encoder.encodeBuffer(chunk);
            if (mp3buf.length > 0) data.push(mp3buf);
        }
        const mp3buf = encoder.flush();
        if (mp3buf.length > 0) data.push(mp3buf);
        return new Blob(data, { type: 'audio/mpeg' });
    }

    function bufferToWav(buffer) {
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
                r.setInt16(i, s < 0 ? s * 32768 : s * 32767, true);
                i += 2;
            }
        }
        return new Blob([r], { type: 'audio/wav' });
    }

    // --- 启动应用 ---
    init();
});
