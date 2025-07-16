/**
 * RTSP Server с реальным декодированием потоков
 * Интеграция RTSPDecoder в HTTP сервер
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const RTSPDecoder = require('./rtsp-decoder');

class RTSPServer {
    constructor() {
        this.port = 3000;
        this.rtspDecoder = new RTSPDecoder();
        
        // Тестовые данные
        this.users = [
            { login: 'admin', password: 'admin123', role: 'admin' },
            { login: 'operator', password: 'operator123', role: 'operator' }
        ];
        
        this.cameras = [
            {
                id: 1,
                camera_name: 'Тестовая камера 1',
                apartment_name: 'Тайланд',
                rtsp_link: 'rtsp://185.70.184.101:8554/cam91-99'
            },
            {
                id: 2,
                camera_name: 'Demo BigBuckBunny',
                apartment_name: 'Тайланд',
                rtsp_link: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4'
            }
        ];
        
        this.apartments = [
            { id: 1, apartment_name: 'Тайланд', apartment_number: '91' }
        ];
        
        console.log('🎥 RTSP Server с реальным декодированием инициализирован');
    }

    /**
     * Создание HTTP сервера
     */
    createServer() {
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        
        return server;
    }

    /**
     * Обработка HTTP запросов
     */
    handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;
        
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        console.log(`📊 ${req.method} ${pathname}`);

        // Маршрутизация
        if (pathname.startsWith('/api/')) {
            this.handleAPI(req, res, pathname);
        } else if (pathname.startsWith('/stream/')) {
            this.handleStreamRequest(req, res, pathname);
        } else if (pathname === '/' || pathname === '/index.html') {
            this.serveIndexHTML(res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    /**
     * Обработка запросов к потокам
     */
    async handleStreamRequest(req, res, pathname) {
        // Формат: /stream/{streamId}/playlist.m3u8 или /stream/{streamId}/{segment}.ts
        const pathParts = pathname.split('/');
        
        if (pathParts.length < 3) {
            res.writeHead(404);
            res.end('Invalid stream path');
            return;
        }
        
        const streamId = pathParts[2];
        const filename = pathParts[3] || 'playlist.m3u8';
        
        const streamData = this.rtspDecoder.activeStreams.get(streamId);
        if (!streamData) {
            res.writeHead(404);
            res.end('Stream not found');
            return;
        }
        
        const filePath = path.join(streamData.streamDir, filename);
        
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        // Определяем MIME тип
        let contentType = 'application/octet-stream';
        if (filename.endsWith('.m3u8')) {
            contentType = 'application/x-mpegURL';
        } else if (filename.endsWith('.ts')) {
            contentType = 'video/MP2T';
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache');
        
        // Отдаем файл
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error('❌ Ошибка чтения файла потока:', error);
            res.writeHead(500);
            res.end('Stream read error');
        });
    }

    /**
     * Обработка API
     */
    async handleAPI(req, res, pathname) {
        res.setHeader('Content-Type', 'application/json');
        
        try {
            switch (pathname) {
                case '/api/cameras':
                    res.writeHead(200);
                    res.end(JSON.stringify(this.cameras));
                    break;
                    
                case '/api/apartments':
                    res.writeHead(200);
                    res.end(JSON.stringify(this.apartments));
                    break;
                    
                case '/api/stream/start':
                    if (req.method === 'POST') {
                        await this.handleStreamStart(req, res);
                    } else {
                        res.writeHead(405);
                        res.end(JSON.stringify({ error: 'Method not allowed' }));
                    }
                    break;
                    
                case '/api/stream/stop':
                    if (req.method === 'POST') {
                        await this.handleStreamStop(req, res);
                    } else {
                        res.writeHead(405);
                        res.end(JSON.stringify({ error: 'Method not allowed' }));
                    }
                    break;
                    
                case '/api/streams/status':
                    res.writeHead(200);
                    res.end(JSON.stringify(this.rtspDecoder.getStreamsStatus()));
                    break;
                    
                case '/api/system-status':
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        status: 'running',
                        version: '1.0.0',
                        rtsp_decoder: 'active',
                        active_streams: this.rtspDecoder.activeStreams.size,
                        cameras_count: this.cameras.length,
                        uptime: process.uptime()
                    }));
                    break;
                    
                default:
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'API endpoint not found' }));
            }
        } catch (error) {
            console.error('❌ API Error:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    /**
     * Запуск потока
     */
    async handleStreamStart(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        
        req.on('end', async () => {
            try {
                const { cameraId, quality = 'low' } = JSON.parse(body);
                const camera = this.cameras.find(c => c.id == cameraId);
                
                if (!camera) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Camera not found' }));
                    return;
                }
                
                console.log(`🚀 Запрос запуска потока: камера ${camera.camera_name}, качество ${quality}`);
                
                const streamData = await this.rtspDecoder.startStream(camera, quality);
                
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    streamId: streamData.id,
                    streamUrl: this.rtspDecoder.getStreamURL(streamData.id),
                    camera: camera.camera_name
                }));
                
            } catch (error) {
                console.error('❌ Ошибка запуска потока:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    /**
     * Остановка потока
     */
    async handleStreamStop(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        
        req.on('end', async () => {
            try {
                const { streamId } = JSON.parse(body);
                
                await this.rtspDecoder.stopStream(streamId);
                
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                
            } catch (error) {
                console.error('❌ Ошибка остановки потока:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    }

    /**
     * Отдача HTML интерфейса
     */
    serveIndexHTML(res) {
        const indexPath = path.join(__dirname, 'index.html');
        
        if (fs.existsSync(indexPath)) {
            const content = fs.readFileSync(indexPath, 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(content);
        } else {
            // Fallback HTML
            const html = this.generateFallbackHTML();
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(html);
        }
    }

    /**
     * Генерация fallback HTML с реальным видео плеером
     */
    generateFallbackHTML() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>RTSP Monitor - Реальные потоки</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #2c3e50; color: white; }
        .container { max-width: 1200px; margin: 0 auto; }
        .camera-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin: 20px 0; }
        .camera-card { background: #34495e; border-radius: 10px; padding: 20px; }
        .video-container { position: relative; background: #000; border-radius: 5px; }
        video { width: 100%; height: 300px; object-fit: cover; }
        .camera-title { margin: 0 0 10px 0; color: #ecf0f1; }
        .controls { margin: 10px 0; }
        button { background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; margin: 5px; }
        button:hover { background: #2980b9; }
        button:disabled { background: #7f8c8d; cursor: not-allowed; }
        .status { padding: 5px 10px; border-radius: 3px; font-size: 12px; }
        .status.online { background: #27ae60; }
        .status.offline { background: #e74c3c; }
        .status.connecting { background: #f39c12; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎥 RTSP Monitor - Реальные потоки</h1>
        
        <div id="system-status">
            <p>🔄 Загрузка системного статуса...</p>
        </div>
        
        <div class="camera-grid" id="cameraGrid">
            <!-- Камеры будут добавлены через JavaScript -->
        </div>
    </div>

    <script>
        console.log('🚀 RTSP Monitor с реальными потоками загружен');
        
        let cameras = [];
        let activeStreams = new Map();

        // Загрузка камер
        async function loadCameras() {
            try {
                const response = await fetch('/api/cameras');
                cameras = await response.json();
                console.log('📹 Загружены камеры:', cameras);
                renderCameras();
            } catch (error) {
                console.error('❌ Ошибка загрузки камер:', error);
            }
        }

        // Загрузка системного статуса
        async function loadSystemStatus() {
            try {
                const response = await fetch('/api/system-status');
                const status = await response.json();
                document.getElementById('system-status').innerHTML = \`
                    <p><strong>📊 Статус:</strong> \${status.status} | 
                    <strong>🎬 Активных потоков:</strong> \${status.active_streams} | 
                    <strong>📹 Камер:</strong> \${status.cameras_count}</p>
                \`;
            } catch (error) {
                console.error('❌ Ошибка загрузки статуса:', error);
            }
        }

        // Отрисовка камер
        function renderCameras() {
            const grid = document.getElementById('cameraGrid');
            grid.innerHTML = '';

            cameras.forEach(camera => {
                const cameraCard = document.createElement('div');
                cameraCard.className = 'camera-card';
                cameraCard.innerHTML = \`
                    <h3 class="camera-title">\${camera.camera_name}</h3>
                    <div class="video-container">
                        <video id="video-\${camera.id}" controls muted></video>
                    </div>
                    <div class="controls">
                        <button onclick="startStream(\${camera.id}, 'low')">▶️ Запустить (480p)</button>
                        <button onclick="startStream(\${camera.id}, 'high')">▶️ Запустить (1080p)</button>
                        <button onclick="stopStream(\${camera.id})">⏹️ Остановить</button>
                        <span class="status offline" id="status-\${camera.id}">Остановлен</span>
                    </div>
                    <div>
                        <small>RTSP: \${camera.rtsp_link}</small>
                    </div>
                \`;
                grid.appendChild(cameraCard);
            });
        }

        // Запуск потока
        async function startStream(cameraId, quality) {
            console.log(\`🚀 Запуск потока камеры \${cameraId} (\${quality})\`);
            
            const statusEl = document.getElementById(\`status-\${cameraId}\`);
            statusEl.className = 'status connecting';
            statusEl.textContent = 'Подключение...';

            try {
                const response = await fetch('/api/stream/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cameraId, quality })
                });

                const result = await response.json();
                
                if (result.success) {
                    console.log(\`✅ Поток запущен: \${result.streamId}\`);
                    
                    // Запускаем HLS плеер
                    setupHLSPlayer(cameraId, result.streamUrl);
                    
                    activeStreams.set(cameraId, result.streamId);
                    statusEl.className = 'status online';
                    statusEl.textContent = \`Онлайн (\${quality})\`;
                } else {
                    throw new Error(result.error || 'Неизвестная ошибка');
                }
            } catch (error) {
                console.error(\`❌ Ошибка запуска потока \${cameraId}:\`, error);
                statusEl.className = 'status offline';
                statusEl.textContent = 'Ошибка';
            }
        }

        // Настройка HLS плеера
        function setupHLSPlayer(cameraId, streamUrl) {
            const video = document.getElementById(\`video-\${cameraId}\`);
            
            if (Hls.isSupported()) {
                const hls = new Hls({
                    liveSyncDurationCount: 1,
                    liveMaxLatencyDurationCount: 2,
                    enableWorker: true,
                    lowLatencyMode: true
                });
                
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log(\`✅ HLS манифест загружен для камеры \${cameraId}\`);
                    video.play().catch(console.warn);
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error(\`❌ HLS ошибка для камеры \${cameraId}:\`, data);
                });
                
                // Сохраняем ссылку на HLS для очистки
                video.hlsInstance = hls;
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Нативная поддержка HLS (Safari)
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', () => {
                    video.play().catch(console.warn);
                });
            }
        }

        // Остановка потока
        async function stopStream(cameraId) {
            console.log(\`🛑 Остановка потока камеры \${cameraId}\`);
            
            const streamId = activeStreams.get(cameraId);
            if (!streamId) {
                console.warn(\`⚠️ Активный поток для камеры \${cameraId} не найден\`);
                return;
            }

            try {
                const response = await fetch('/api/stream/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ streamId })
                });

                const result = await response.json();
                
                if (result.success) {
                    console.log(\`✅ Поток остановлен: \${streamId}\`);
                    
                    // Останавливаем видео
                    const video = document.getElementById(\`video-\${cameraId}\`);
                    if (video.hlsInstance) {
                        video.hlsInstance.destroy();
                    }
                    video.src = '';
                    
                    activeStreams.delete(cameraId);
                    
                    const statusEl = document.getElementById(\`status-\${cameraId}\`);
                    statusEl.className = 'status offline';
                    statusEl.textContent = 'Остановлен';
                }
            } catch (error) {
                console.error(\`❌ Ошибка остановки потока \${cameraId}:\`, error);
            }
        }

        // Инициализация
        loadSystemStatus();
        loadCameras();
        
        // Обновление статуса каждые 10 секунд
        setInterval(() => {
            loadSystemStatus();
        }, 10000);
    </script>
</body>
</html>`;
    }

    /**
     * Запуск сервера
     */
    start(port = 3000) {
        this.port = port;
        const server = this.createServer();
        
        server.listen(port, 'localhost', () => {
            console.log(`🌐 RTSP Server с реальным декодированием запущен на http://localhost:${port}`);
            console.log(`🎬 FFmpeg поддержка: активна`);
            console.log(`🔐 Тестовые логины: admin/admin123, operator/operator123`);
            console.log(`✅ Готов к обработке реальных RTSP потоков`);
        });

        server.on('error', (error) => {
            console.error('❌ Ошибка сервера:', error);
        });

        // Обработка завершения
        process.on('SIGINT', async () => {
            console.log('\n🛑 Получен SIGINT, остановка всех потоков...');
            await this.rtspDecoder.stopAllStreams();
            process.exit(0);
        });

        return server;
    }
}

// Запуск сервера
if (require.main === module) {
    const server = new RTSPServer();
    server.start(3000);
}

module.exports = RTSPServer;
