#!/bin/bash

# Быстрое внедрение оптимизированного RTSP решения
# Для проекта в /srv/surveillance-system/surveillance-system-clean/rtsp-monitor-electron

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_step() { echo -e "\n${PURPLE}🔧 $1${NC}"; }

echo "🎥 RTSP Monitor - Быстрое внедрение оптимизации"
echo "==============================================="

# Проверка директории
if [ ! -f "package.json" ]; then
    log_error "package.json не найден. Запустите скрипт в папке rtsp-monitor-electron/"
    exit 1
fi

log_success "Найдена правильная директория: $(pwd)"

# 1. Создание backup
log_step "Создание резервных копий"
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup ключевых файлов
for file in "rtsp-decoder.js" "rtsp-server.js" "index.html" "electron-main.js"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        log_info "Backup: $file → $BACKUP_DIR/"
    fi
done

log_success "Backup создан в: $BACKUP_DIR"

# 2. Остановка процессов
log_step "Остановка активных процессов"

# Останавливаем FFmpeg
FFMPEG_PIDS=$(pgrep -f "ffmpeg.*rtsp" 2>/dev/null || true)
if [ ! -z "$FFMPEG_PIDS" ]; then
    echo "$FFMPEG_PIDS" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    echo "$FFMPEG_PIDS" | xargs kill -KILL 2>/dev/null || true
    log_info "FFmpeg процессы остановлены"
fi

# Останавливаем Node.js на порту 3000
NODE_PID=$(lsof -ti:3000 2>/dev/null || true)
if [ ! -z "$NODE_PID" ]; then
    kill -TERM "$NODE_PID" 2>/dev/null || true
    sleep 1
    kill -KILL "$NODE_PID" 2>/dev/null || true
    log_info "Node.js процесс остановлен"
fi

# 3. Очистка временных файлов
log_step "Очистка временных файлов"
if [ -d "temp_streams" ]; then
    rm -rf temp_streams/*
    log_info "Старые потоки очищены"
fi
mkdir -p temp_streams

# 4. Создание оптимизированного декодера
log_step "Создание оптимизированного RTSP декодера"

cat > optimized-rtsp-decoder.js << 'EOF'
/**
 * Оптимизированный RTSP декодер - прямой MJPEG streaming
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const http = require('http');

class OptimizedRTSPDecoder extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.ffmpegPath = this.findFFmpeg();
        this.streamPort = 8000;
        
        console.log('🎥 Оптимизированный RTSP Decoder готов');
        console.log(`🔧 FFmpeg: ${this.ffmpegPath}`);
    }

    findFFmpeg() {
        const paths = [
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            'ffmpeg',
            path.join(__dirname, '..', 'ffmpeg', 'linux-x64', 'ffmpeg'),
            path.join(__dirname, '..', 'ffmpeg', 'win64', 'ffmpeg.exe')
        ];

        for (const ffmpegPath of paths) {
            try {
                if (fs.existsSync(ffmpegPath)) {
                    require('child_process').execSync(`${ffmpegPath} -version`, { 
                        stdio: 'pipe', 
                        timeout: 3000 
                    });
                    return ffmpegPath;
                }
            } catch (error) {
                continue;
            }
        }

        return 'ffmpeg'; // Fallback на системный PATH
    }

    async startStreamOptimized(streamId, rtspUrl, quality = 'sub') {
        console.log(`📡 Запуск потока: ${streamId} (${quality})`);
        
        if (this.activeStreams.has(streamId)) {
            return this.activeStreams.get(streamId);
        }

        const port = this.streamPort++;
        const streamData = {
            id: streamId,
            rtspUrl,
            quality,
            port,
            process: null,
            httpServer: null,
            clients: new Set(),
            status: 'starting',
            startTime: Date.now()
        };

        try {
            // HTTP сервер для MJPEG потока
            const httpServer = http.createServer((req, res) => {
                if (req.url === `/${streamId}.mjpeg`) {
                    this.handleMJPEGRequest(res, streamData);
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });

            httpServer.listen(port, () => {
                console.log(`🌐 MJPEG сервер на порту ${port}`);
            });

            streamData.httpServer = httpServer;

            // FFmpeg для MJPEG
            const ffmpegArgs = [
                '-fflags', '+genpts',
                '-rtsp_transport', 'tcp',
                '-i', rtspUrl,
                '-f', 'mjpeg',
                '-q:v', '3',
                '-r', quality === 'main' ? '25' : '15',
                '-vf', quality === 'main' ? 'scale=1920:1080' : 'scale=640:480',
                '-'
            ];

            const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs);
            streamData.process = ffmpegProcess;
            this.activeStreams.set(streamId, streamData);

            this.setupHandlers(streamData, ffmpegProcess);

            return {
                streamId,
                url: `http://localhost:${port}/${streamId}.mjpeg`,
                status: 'starting'
            };

        } catch (error) {
            console.error(`❌ Ошибка запуска потока:`, error);
            if (streamData.httpServer) {
                streamData.httpServer.close();
            }
            throw error;
        }
    }

    handleMJPEGRequest(res, streamData) {
        console.log(`🎬 Клиент подключился: ${streamData.id}`);

        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        streamData.clients.add(res);

        res.on('close', () => {
            streamData.clients.delete(res);
        });

        res.on('error', () => {
            streamData.clients.delete(res);
        });
    }

    setupHandlers(streamData, ffmpegProcess) {
        let frameBuffer = Buffer.alloc(0);
        let frameStart = -1;

        ffmpegProcess.stdout.on('data', (chunk) => {
            frameBuffer = Buffer.concat([frameBuffer, chunk]);

            while (true) {
                if (frameStart === -1) {
                    frameStart = frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
                    if (frameStart === -1) break;
                }

                const frameEnd = frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]), frameStart + 2);
                if (frameEnd === -1) break;

                const frame = frameBuffer.subarray(frameStart, frameEnd + 2);
                this.broadcastFrame(streamData, frame);

                frameBuffer = frameBuffer.subarray(frameEnd + 2);
                frameStart = -1;
            }
        });

        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            if (output.includes('fps=')) {
                if (streamData.status === 'starting') {
                    streamData.status = 'streaming';
                    console.log(`✅ Поток активен: ${streamData.id}`);
                    this.emit('streamStarted', streamData.id);
                }
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🔌 FFmpeg завершен: ${streamData.id} (код: ${code})`);
            this.cleanupStream(streamData.id);
        });

        ffmpegProcess.on('error', (error) => {
            console.error(`💥 FFmpeg ошибка: ${streamData.id}`, error);
            this.emit('streamError', { streamId: streamData.id, error });
        });
    }

    broadcastFrame(streamData, frame) {
        const boundary = '\r\n--frame\r\n';
        const header = `Content-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
        
        const frameData = Buffer.concat([
            Buffer.from(boundary),
            Buffer.from(header),
            frame
        ]);

        for (const client of streamData.clients) {
            try {
                client.write(frameData);
            } catch (error) {
                streamData.clients.delete(client);
            }
        }
    }

    async stopStream(streamId) {
        console.log(`🛑 Остановка потока: ${streamId}`);
        
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) return;

        for (const client of streamData.clients) {
            try {
                client.end();
            } catch (error) {}
        }

        if (streamData.httpServer) {
            streamData.httpServer.close();
        }

        if (streamData.process && !streamData.process.killed) {
            streamData.process.kill('SIGTERM');
            setTimeout(() => {
                if (!streamData.process.killed) {
                    streamData.process.kill('SIGKILL');
                }
            }, 2000);
        }

        this.activeStreams.delete(streamId);
    }

    async stopAllStreams() {
        console.log('🛑 Остановка всех потоков...');
        
        const streamIds = Array.from(this.activeStreams.keys());
        for (const streamId of streamIds) {
            await this.stopStream(streamId);
        }
    }

    getStreamsStatus() {
        const status = [];
        
        for (const [streamId, streamData] of this.activeStreams.entries()) {
            status.push({
                id: streamId,
                quality: streamData.quality,
                status: streamData.status,
                clients: streamData.clients.size,
                uptime: Date.now() - streamData.startTime,
                url: `http://localhost:${streamData.port}/${streamId}.mjpeg`
            });
        }
        
        return status;
    }

    cleanupStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (streamData) {
            if (streamData.httpServer) {
                streamData.httpServer.close();
            }
            this.activeStreams.delete(streamId);
        }
    }
}

module.exports = OptimizedRTSPDecoder;
EOF

log_success "Оптимизированный декодер создан"

# 5. Обновление сервера
log_step "Обновление RTSP сервера"

if [ -f "rtsp-server.js" ]; then
    mv rtsp-server.js rtsp-server.js.old
fi

cat > rtsp-server.js << 'EOF'
/**
 * Оптимизированный RTSP сервер с циклическим интерфейсом
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const OptimizedRTSPDecoder = require('./optimized-rtsp-decoder');

class OptimizedRTSPServer {
    constructor() {
        this.rtspDecoder = new OptimizedRTSPDecoder();
        this.server = null;
        
        this.config = {
            cameras: [
                { 
                    id: 1, 
                    camera_name: 'Тестовая камера 1', 
                    apartment_name: 'Тайланд', 
                    rtsp_main: 'rtsp://185.70.184.101:8554/cam91-99', 
                    rtsp_sub: 'rtsp://185.70.184.101:8554/cam91-99' 
                },
                { 
                    id: 2, 
                    camera_name: 'Тестовая камера 2', 
                    apartment_name: 'Тайланд', 
                    rtsp_main: 'rtsp://185.70.184.101:8554/cam91-99', 
                    rtsp_sub: 'rtsp://185.70.184.101:8554/cam91-99' 
                },
                { 
                    id: 3, 
                    camera_name: 'Вход', 
                    apartment_name: 'Квартира 1', 
                    rtsp_main: 'rtsp://demo:demo@test.camera/main', 
                    rtsp_sub: 'rtsp://demo:demo@test.camera/sub' 
                },
                { 
                    id: 4, 
                    camera_name: 'Кухня', 
                    apartment_name: 'Квартира 1', 
                    rtsp_main: 'rtsp://demo:demo@test.camera/main', 
                    rtsp_sub: 'rtsp://demo:demo@test.camera/sub' 
                }
            ]
        };

        this.setupDecoderHandlers();
    }

    setupDecoderHandlers() {
        this.rtspDecoder.on('streamStarted', (streamId) => {
            console.log(`✅ Поток запущен: ${streamId}`);
        });

        this.rtspDecoder.on('streamError', ({ streamId, error }) => {
            console.error(`❌ Ошибка потока ${streamId}:`, error);
        });
    }

    createServer() {
        return http.createServer(async (req, res) => {
            try {
                await this.handleRequest(req, res);
            } catch (error) {
                console.error('❌ Ошибка запроса:', error);
                this.sendError(res, 500, 'Internal Server Error');
            }
        });
    }

    async handleRequest(req, res) {
        const url = new URL(req.url, `http://localhost:3000`);
        const pathname = url.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        console.log(`📡 ${req.method} ${pathname}`);

        if (pathname === '/') {
            await this.serveIndexHTML(res);
        } else if (pathname === '/api/cameras') {
            this.sendJSON(res, this.config.cameras);
        } else if (pathname === '/api/stream/start') {
            await this.handleStartStream(req, res);
        } else if (pathname === '/api/stream/stop') {
            await this.handleStopStream(req, res);
        } else if (pathname === '/api/streams/status') {
            const status = this.rtspDecoder.getStreamsStatus();
            this.sendJSON(res, status);
        } else {
            this.sendError(res, 404, 'Not Found');
        }
    }

    async serveIndexHTML(res) {
        const indexPath = path.join(__dirname, 'index.html');
        
        try {
            if (fs.existsSync(indexPath)) {
                const content = fs.readFileSync(indexPath, 'utf8');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(200);
                res.end(content);
            } else {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(200);
                res.end(this.getDefaultHTML());
            }
        } catch (error) {
            this.sendError(res, 500, 'Error loading interface');
        }
    }

    getDefaultHTML() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>RTSP Monitor - Быстрый тест</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1a1a1a; color: white; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
        .camera { background: #2c3e50; padding: 20px; border-radius: 10px; }
        .video-container { height: 300px; background: #34495e; border-radius: 8px; margin: 15px 0; }
        .camera-video { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
        .placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: #bdc3c7; }
        .btn { background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; margin: 5px; cursor: pointer; }
        .btn:hover { background: #2980b9; }
        .btn.stop { background: #e74c3c; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎥 RTSP Monitor - Оптимизированная версия</h1>
        <p>✅ Система готова. MJPEG streaming активен.</p>
        
        <div class="grid" id="cameras"></div>
    </div>

    <script>
        let cameras = [];
        let activeStreams = new Map();

        async function loadCameras() {
            try {
                const response = await fetch('/api/cameras');
                cameras = await response.json();
                renderCameras();
                console.log('✅ Камеры загружены:', cameras.length);
            } catch (error) {
                console.error('❌ Ошибка загрузки:', error);
            }
        }

        function renderCameras() {
            const container = document.getElementById('cameras');
            container.innerHTML = '';

            cameras.forEach(camera => {
                const cameraDiv = document.createElement('div');
                cameraDiv.className = 'camera';
                cameraDiv.innerHTML = \`
                    <h3>\${camera.camera_name}</h3>
                    <p>Квартира: \${camera.apartment_name}</p>
                    <div class="video-container">
                        <img class="camera-video" id="video-\${camera.id}" style="display: none;" />
                        <div class="placeholder" id="placeholder-\${camera.id}">
                            📹 Нажмите кнопку для запуска
                        </div>
                    </div>
                    <button class="btn" onclick="startStream(\${camera.id}, 'sub')">📺 480p</button>
                    <button class="btn" onclick="startStream(\${camera.id}, 'main')">🖥️ 1080p</button>
                    <button class="btn stop" onclick="stopStream(\${camera.id})">⏹️ Стоп</button>
                \`;
                container.appendChild(cameraDiv);
            });
        }

        async function startStream(cameraId, quality) {
            const camera = cameras.find(c => c.id === cameraId);
            if (!camera) return;

            console.log(\`📡 Запуск: \${camera.camera_name} (\${quality})\`);
            
            try {
                const response = await fetch('/api/stream/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        cameraId, 
                        rtspUrl: quality === 'main' ? camera.rtsp_main : camera.rtsp_sub,
                        quality 
                    })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(\`✅ Поток запущен: \${result.url}\`);
                    
                    const video = document.getElementById(\`video-\${cameraId}\`);
                    const placeholder = document.getElementById(\`placeholder-\${cameraId}\`);
                    
                    if (video && placeholder) {
                        video.src = result.url;
                        video.style.display = 'block';
                        placeholder.style.display = 'none';
                        
                        activeStreams.set(cameraId, result);
                    }
                } else {
                    console.error('❌ Ошибка:', result.error);
                }
            } catch (error) {
                console.error('❌ Ошибка запуска:', error);
            }
        }

        async function stopStream(cameraId) {
            const streamData = activeStreams.get(cameraId);
            if (!streamData) return;

            try {
                const response = await fetch('/api/stream/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ streamId: streamData.streamId })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(\`✅ Поток остановлен\`);
                    
                    const video = document.getElementById(\`video-\${cameraId}\`);
                    const placeholder = document.getElementById(\`placeholder-\${cameraId}\`);
                    
                    if (video && placeholder) {
                        video.src = '';
                        video.style.display = 'none';
                        placeholder.style.display = 'block';
                        
                        activeStreams.delete(cameraId);
                    }
                }
            } catch (error) {
                console.error('❌ Ошибка остановки:', error);
            }
        }

        document.addEventListener('DOMContentLoaded', loadCameras);
    </script>
</body>
</html>
        `;
    }

    async handleStartStream(req, res) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Method Not Allowed');
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { cameraId, rtspUrl, quality = 'sub' } = JSON.parse(body);
                
                console.log(`📡 API запуск потока: ${cameraId} (${quality})`);

                const streamId = `stream-${cameraId}-${quality}-${Date.now()}`;
                const streamData = await this.rtspDecoder.startStreamOptimized(streamId, rtspUrl, quality);

                this.sendJSON(res, {
                    success: true,
                    streamId: streamData.streamId,
                    url: streamData.url,
                    quality: quality
                });

            } catch (error) {
                console.error('❌ Ошибка API запуска:', error);
                this.sendJSON(res, {
                    success: false,
                    error: error.message
                }, 500);
            }
        });
    }

    async handleStopStream(req, res) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Method Not Allowed');
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { streamId } = JSON.parse(body);
                
                console.log(`🛑 API остановка потока: ${streamId}`);
                await this.rtspDecoder.stopStream(streamId);

                this.sendJSON(res, {
                    success: true,
                    message: 'Stream stopped'
                });

            } catch (error) {
                console.error('❌ Ошибка API остановки:', error);
                this.sendJSON(res, {
                    success: false,
                    error: error.message
                }, 500);
            }
        });
    }

    sendJSON(res, data, statusCode = 200) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(statusCode);
        res.end(JSON.stringify(data));
    }

    sendError(res, statusCode, message) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(statusCode);
        res.end(JSON.stringify({ error: message }));
    }

    start(port = 3000) {
        this.server = this.createServer();

        this.server.listen(port, () => {
            console.log(`🌐 Оптимизированный RTSP Server: http://localhost:${port}`);
            console.log(`🎬 MJPEG streaming готов`);
            console.log(`✅ Тестовые камеры настроены`);
        });

        this.server.on('error', (error) => {
            console.error('❌ Ошибка сервера:', error);
        });

        process.on('SIGINT', async () => {
            console.log('\n🛑 Остановка всех потоков...');
            await this.rtspDecoder.stopAllStreams();
            if (this.server) {
                this.server.close();
            }
            process.exit(0);
        });

        return this.server;
    }
}

if (require.main === module) {
    const server = new OptimizedRTSPServer();
    server.start(3000);
}

module.exports = OptimizedRTSPServer;
EOF

log_success "Оптимизированный сервер создан"

# 6. Обновление Electron main
log_step "Обновление Electron main"

if [ -f "electron-main.js" ]; then
    sed -i.bak 's/autonomous-server.js/rtsp-server.js/g' electron-main.js
    log_info "electron-main.js обновлен для нового сервера"
fi

# 7. Создание скриптов запуска
log_step "Создание скриптов запуска"

cat > test-optimized.sh << 'EOF'
#!/bin/bash
echo "🎥 Тестирование оптимизированного RTSP сервера"
echo "=============================================="
echo ""
echo "🌐 Сервер запускается на: http://localhost:3000"
echo "📺 Нажмите кнопку '📺 480p' для тестирования"
echo "🎬 Ожидается: быстрое отображение MJPEG видео"
echo ""
echo "⚠️  Для остановки: Ctrl+C"
echo ""

node rtsp-server.js
EOF

chmod +x test-optimized.sh

cat > run-electron.sh << 'EOF'
#!/bin/bash
echo "🎥 Запуск Electron с оптимизированным RTSP"
echo "========================================="
echo ""
echo "🚀 Запуск Electron приложения..."
echo "📺 Ожидается автоматический запуск интерфейса"
echo ""

npm start
EOF

chmod +x run-electron.sh

log_success "Скрипты запуска созданы"

# 8. Финальная проверка
log_step "Финальная проверка"

# Проверяем синтаксис
for file in "optimized-rtsp-decoder.js" "rtsp-server.js"; do
    if node -c "$file" 2>/dev/null; then
        log_success "✅ $file - синтаксис OK"
    else
        log_error "❌ $file - ошибка синтаксиса"
        exit 1
    fi
done

# Проверяем структуру
EXPECTED_FILES=("optimized-rtsp-decoder.js" "rtsp-server.js" "test-optimized.sh" "run-electron.sh")
for file in "${EXPECTED_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_success "✅ $file создан"
    else
        log_error "❌ $file отсутствует"
    fi
done

# 9. Финальное сообщение
log_step "Оптимизация завершена"

echo ""
log_success "🎉 Оптимизированное решение готово!"
echo ""
echo "📋 Что изменилось:"
echo "  ✅ Создан optimized-rtsp-decoder.js (прямой MJPEG)"
echo "  ✅ Обновлен rtsp-server.js (новая архитектура)"
echo "  ✅ Electron настроен на новый сервер"
echo "  ✅ Backup в: $BACKUP_DIR"
echo ""
echo "🚀 Варианты тестирования:"
echo "  1. Быстрый тест: ./test-optimized.sh"
echo "  2. Electron: ./run-electron.sh (или npm start)"
echo "  3. Веб-браузер: откройте http://localhost:3000"
echo ""
echo "🎬 Ожидаемые результаты:"
echo "  • Быстрый запуск потоков (< 2 сек)"
echo "  • Стабильное MJPEG видео"
echo "  • Низкая нагрузка на CPU"
echo "  • Нет файлов в temp_streams/"
echo ""
echo "🔧 Следующий этап: интеграция циклического интерфейса"
echo "   (запустите после успешного тестирования)"
