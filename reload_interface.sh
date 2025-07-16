#!/bin/bash

# Перезагрузка интерфейса с рабочим видео плеером
# Заменяем старый index.html на новый с HLS поддержкой

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_step() { echo -e "${BLUE}🔧 $1${NC}"; }

echo "🎥 Обновление интерфейса с HLS видео плеером"
echo "============================================"

cd rtsp-monitor-electron

# Сохраняем старый интерфейс
if [ -f "index.html" ]; then
    cp index.html index.html.backup
    log_info "Старый интерфейс сохранен как index.html.backup"
fi

# Создаем новый интерфейс с рабочим видео плеером
log_step "Создание нового интерфейса с HLS плеером..."

cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>RTSP Monitor - Реальные потоки</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
        }
        
        .header {
            background: rgba(0,0,0,0.2);
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(10px);
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .status-bar {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 10px 0;
            font-size: 14px;
        }
        
        .status-item {
            background: rgba(255,255,255,0.1);
            padding: 5px 15px;
            border-radius: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .camera-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 30px;
            margin: 20px 0;
        }
        
        .camera-card {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 25px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            transition: transform 0.3s ease;
        }
        
        .camera-card:hover {
            transform: translateY(-5px);
        }
        
        .camera-title {
            font-size: 1.4em;
            margin-bottom: 15px;
            color: #ecf0f1;
            text-align: center;
        }
        
        .video-container {
            position: relative;
            background: #000;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        
        video {
            width: 100%;
            height: 300px;
            object-fit: cover;
            display: block;
        }
        
        .video-overlay {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #bdc3c7;
            pointer-events: none;
        }
        
        .video-overlay.hidden {
            display: none;
        }
        
        .controls {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin: 15px 0;
        }
        
        button {
            background: #3498db;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
            min-width: 120px;
        }
        
        button:hover {
            background: #2980b9;
            transform: translateY(-2px);
        }
        
        button:disabled {
            background: #7f8c8d;
            cursor: not-allowed;
            transform: none;
        }
        
        button.success {
            background: #27ae60;
        }
        
        button.danger {
            background: #e74c3c;
        }
        
        .status {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 15px;
            font-size: 12px;
            font-weight: 500;
            margin: 5px;
        }
        
        .status.online {
            background: #27ae60;
            color: white;
        }
        
        .status.offline {
            background: #e74c3c;
            color: white;
        }
        
        .status.connecting {
            background: #f39c12;
            color: white;
        }
        
        .camera-info {
            background: rgba(0,0,0,0.2);
            padding: 15px;
            border-radius: 10px;
            margin-top: 10px;
            font-size: 13px;
        }
        
        .camera-info div {
            margin: 5px 0;
        }
        
        .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #ffffff;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .logs {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
            max-height: 200px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }
        
        .log-entry {
            margin: 2px 0;
            word-break: break-all;
        }
        
        .log-entry.error {
            color: #ff6b6b;
        }
        
        .log-entry.success {
            color: #51cf66;
        }
        
        .log-entry.info {
            color: #74c0fc;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎥 RTSP Monitor</h1>
        <div class="status-bar">
            <div class="status-item" id="serverStatus">🔄 Загрузка...</div>
            <div class="status-item" id="streamCount">Потоков: 0</div>
            <div class="status-item" id="cameraCount">Камер: 0</div>
        </div>
    </div>

    <div class="container">
        <div class="camera-grid" id="cameraGrid">
            <!-- Камеры будут добавлены через JavaScript -->
        </div>
        
        <div class="logs" id="logs">
            <div class="log-entry info">🚀 RTSP Monitor загружен. Ожидание камер...</div>
        </div>
    </div>

    <script>
        console.log('🚀 RTSP Monitor с HLS плеером загружен');
        
        let cameras = [];
        let activeStreams = new Map();
        let hlsInstances = new Map();
        
        // Логирование
        function addLog(message, type = 'info') {
            const logs = document.getElementById('logs');
            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            logs.appendChild(entry);
            logs.scrollTop = logs.scrollHeight;
            
            // Ограничиваем количество логов
            if (logs.children.length > 50) {
                logs.removeChild(logs.firstChild);
            }
        }

        // Загрузка камер
        async function loadCameras() {
            try {
                addLog('📹 Загрузка списка камер...', 'info');
                const response = await fetch('/api/cameras');
                cameras = await response.json();
                
                addLog(`✅ Загружено ${cameras.length} камер`, 'success');
                console.log('📹 Камеры:', cameras);
                
                document.getElementById('cameraCount').textContent = `Камер: ${cameras.length}`;
                renderCameras();
            } catch (error) {
                addLog(`❌ Ошибка загрузки камер: ${error.message}`, 'error');
                console.error('❌ Ошибка загрузки камер:', error);
            }
        }

        // Загрузка системного статуса
        async function loadSystemStatus() {
            try {
                const response = await fetch('/api/system-status');
                const status = await response.json();
                
                document.getElementById('serverStatus').textContent = 
                    `🟢 ${status.status} (v${status.version})`;
                document.getElementById('streamCount').textContent = 
                    `Потоков: ${status.active_streams}`;
                
            } catch (error) {
                document.getElementById('serverStatus').textContent = '🔴 Ошибка';
                addLog(`❌ Ошибка статуса: ${error.message}`, 'error');
            }
        }

        // Отрисовка камер
        function renderCameras() {
            const grid = document.getElementById('cameraGrid');
            grid.innerHTML = '';

            cameras.forEach(camera => {
                const cameraCard = document.createElement('div');
                cameraCard.className = 'camera-card';
                cameraCard.innerHTML = `
                    <h3 class="camera-title">${camera.camera_name}</h3>
                    <div class="video-container">
                        <video id="video-${camera.id}" controls muted playsinline></video>
                        <div class="video-overlay" id="overlay-${camera.id}">
                            <div style="font-size: 48px; margin-bottom: 10px;">📹</div>
                            <div>Нажмите "Запустить" для просмотра</div>
                        </div>
                    </div>
                    <div class="controls">
                        <button onclick="startStream(${camera.id}, 'low')" id="btn-low-${camera.id}">
                            ▶️ 480p
                        </button>
                        <button onclick="startStream(${camera.id}, 'high')" id="btn-high-${camera.id}">
                            ▶️ 1080p
                        </button>
                        <button onclick="stopStream(${camera.id})" id="btn-stop-${camera.id}" class="danger" disabled>
                            ⏹️ Стоп
                        </button>
                    </div>
                    <div>
                        <span class="status offline" id="status-${camera.id}">Остановлен</span>
                    </div>
                    <div class="camera-info">
                        <div><strong>Квартира:</strong> ${camera.apartment_name}</div>
                        <div><strong>RTSP:</strong> ${camera.rtsp_link}</div>
                    </div>
                `;
                grid.appendChild(cameraCard);
            });
            
            addLog(`🎬 Отрисовано ${cameras.length} камер`, 'success');
        }

        // Запуск потока
        async function startStream(cameraId, quality) {
            const camera = cameras.find(c => c.id === cameraId);
            if (!camera) return;
            
            addLog(`🚀 Запуск потока: ${camera.camera_name} (${quality})`, 'info');
            
            // Обновляем UI
            const statusEl = document.getElementById(`status-${cameraId}`);
            const btnLow = document.getElementById(`btn-low-${cameraId}`);
            const btnHigh = document.getElementById(`btn-high-${cameraId}`);
            const btnStop = document.getElementById(`btn-stop-${cameraId}`);
            
            statusEl.className = 'status connecting';
            statusEl.innerHTML = '<span class="loading"></span> Подключение...';
            btnLow.disabled = true;
            btnHigh.disabled = true;

            try {
                const response = await fetch('/api/stream/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cameraId, quality })
                });

                const result = await response.json();
                
                if (result.success) {
                    addLog(`✅ Поток запущен: ${result.streamId}`, 'success');
                    
                    // Настраиваем HLS плеер
                    setupHLSPlayer(cameraId, result.streamUrl, quality);
                    
                    activeStreams.set(cameraId, { streamId: result.streamId, quality });
                    
                    statusEl.className = 'status online';
                    statusEl.textContent = `Онлайн (${quality === 'high' ? '1080p' : '480p'})`;
                    btnStop.disabled = false;
                    
                } else {
                    throw new Error(result.error || 'Неизвестная ошибка');
                }
            } catch (error) {
                addLog(`❌ Ошибка запуска: ${error.message}`, 'error');
                console.error(`❌ Ошибка запуска потока ${cameraId}:`, error);
                
                statusEl.className = 'status offline';
                statusEl.textContent = 'Ошибка';
                btnLow.disabled = false;
                btnHigh.disabled = false;
            }
        }

        // Настройка HLS плеера
        function setupHLSPlayer(cameraId, streamUrl, quality) {
            const video = document.getElementById(`video-${cameraId}`);
            const overlay = document.getElementById(`overlay-${cameraId}`);
            
            // Останавливаем предыдущий HLS
            if (hlsInstances.has(cameraId)) {
                hlsInstances.get(cameraId).destroy();
                hlsInstances.delete(cameraId);
            }
            
            addLog(`🎬 Настройка HLS плеера для камеры ${cameraId}`, 'info');
            
            if (Hls.isSupported()) {
                const hls = new Hls({
                    liveSyncDurationCount: 1,
                    liveMaxLatencyDurationCount: 2,
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 10,
                    maxBufferLength: 20
                });
                
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hlsInstances.set(cameraId, hls);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    addLog(`✅ HLS манифест загружен для камеры ${cameraId}`, 'success');
                    overlay.classList.add('hidden');
                    video.play().catch(e => {
                        addLog(`⚠️ Автозапуск заблокирован для камеры ${cameraId}`, 'info');
                    });
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error(`❌ HLS ошибка для камеры ${cameraId}:`, data);
                    if (data.fatal) {
                        addLog(`❌ Критическая HLS ошибка: ${data.type}`, 'error');
                    }
                });
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Нативная поддержка HLS (Safari)
                addLog(`🍎 Использование нативного HLS для камеры ${cameraId}`, 'info');
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', () => {
                    overlay.classList.add('hidden');
                    video.play().catch(console.warn);
                });
            } else {
                addLog(`❌ HLS не поддерживается в этом браузере`, 'error');
            }
        }

        // Остановка потока
        async function stopStream(cameraId) {
            const streamData = activeStreams.get(cameraId);
            if (!streamData) return;
            
            const camera = cameras.find(c => c.id === cameraId);
            addLog(`🛑 Остановка потока: ${camera.camera_name}`, 'info');

            try {
                const response = await fetch('/api/stream/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ streamId: streamData.streamId })
                });

                const result = await response.json();
                
                if (result.success) {
                    addLog(`✅ Поток остановлен: ${streamData.streamId}`, 'success');
                    
                    // Останавливаем видео
                    const video = document.getElementById(`video-${cameraId}`);
                    const overlay = document.getElementById(`overlay-${cameraId}`);
                    
                    if (hlsInstances.has(cameraId)) {
                        hlsInstances.get(cameraId).destroy();
                        hlsInstances.delete(cameraId);
                    }
                    
                    video.src = '';
                    overlay.classList.remove('hidden');
                    
                    activeStreams.delete(cameraId);
                    
                    // Обновляем UI
                    document.getElementById(`status-${cameraId}`).className = 'status offline';
                    document.getElementById(`status-${cameraId}`).textContent = 'Остановлен';
                    document.getElementById(`btn-low-${cameraId}`).disabled = false;
                    document.getElementById(`btn-high-${cameraId}`).disabled = false;
                    document.getElementById(`btn-stop-${cameraId}`).disabled = true;
                }
            } catch (error) {
                addLog(`❌ Ошибка остановки: ${error.message}`, 'error');
                console.error(`❌ Ошибка остановки потока ${cameraId}:`, error);
            }
        }

        // Инициализация
        loadSystemStatus();
        loadCameras();
        
        // Обновление статуса каждые 10 секунд
        setInterval(() => {
            loadSystemStatus();
        }, 10000);
        
        addLog('✅ Интерфейс готов к работе', 'success');
    </script>
</body>
</html>
EOF

log_info "Новый интерфейс создан с поддержкой HLS видео"

echo ""
log_info "🎉 Интерфейс обновлен!"
echo ""
echo "📋 Что нужно сделать:"
echo "  1. В окне Electron нажмите Ctrl+R (перезагрузить страницу)"
echo "  2. Или перезапустите: npm start"
echo "  3. Нажмите кнопку '▶️ 480p' для запуска видео"
echo ""
echo "🎬 Новые возможности:"
echo "  ✅ Кнопки управления потоками"
echo "  ✅ HLS видео плеер"
echo "  ✅ Статус потоков в реальном времени"
echo "  ✅ Логи действий"
echo "  ✅ Поддержка 480p и 1080p качества"
