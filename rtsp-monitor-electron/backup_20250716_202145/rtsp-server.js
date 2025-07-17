const http = require('http');
const path = require('path');
const fs = require('fs');
const OptimizedRTSPDecoder = require('./optimized-rtsp-decoder');

class SimpleRTSPServer {
    constructor() {
        this.rtspDecoder = new OptimizedRTSPDecoder();
        this.cameras = [
            { id: 1, camera_name: "Тестовая камера (рабочая)", apartment_name: "Тест зона", rtsp_main: "rtsp://185.70.184.101:8554/cam91-99", rtsp_sub: "rtsp://185.70.184.101:8554/cam91-99" },
            { id: 2, camera_name: "Hikvision 1", apartment_name: "Офис 1", rtsp_main: "rtsp://admin:Hikvision@192.168.12.107:554/h264", rtsp_sub: "rtsp://admin:Hikvision@192.168.12.107:554/h264" },
            { id: 3, camera_name: "Hikvision 2", apartment_name: "Офис 2", rtsp_main: "rtsp://admin:Hikvision@192.168.11.107:554/h264", rtsp_sub: "rtsp://admin:Hikvision@192.168.11.107:554/h264" },
            { id: 4, camera_name: "Hikvision 3", apartment_name: "Офис 3", rtsp_main: "rtsp://admin:Hikvision@192.168.29.107:554/h264", rtsp_sub: "rtsp://admin:Hikvision@192.168.29.107:554/h264" },
            { id: 5, camera_name: "Hikvision 4", apartment_name: "Офис 4", rtsp_main: "rtsp://admin:Hikvision@192.168.28.107:554/h264", rtsp_sub: "rtsp://admin:Hikvision@192.168.28.107:554/h264" }
        ];
    }

    start() {
        const server = http.createServer((req, res) => {
            const url = req.url;
            
            console.log(`🌐 Запрос: ${req.method} ${url}`);

            // CORS заголовки
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (url === '/') {
                // ПРИНУДИТЕЛЬНО читаем index.html
                const indexPath = path.join(__dirname, 'index.html');
                console.log(`📄 Читаем index.html из: ${indexPath}`);
                
                try {
                    const content = fs.readFileSync(indexPath, 'utf8');
                    console.log(`📄 Размер файла: ${content.length} байт`);
                    console.log(`📄 Первые 100 символов: ${content.substring(0, 100)}`);
                    
                    res.writeHead(200, {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    });
                    res.end(content);
                } catch (error) {
                    console.error(`❌ Ошибка чтения index.html:`, error);
                    res.writeHead(500);
                    res.end('Error reading index.html');
                }
                
            } else if (url === '/api/cameras') {
                console.log(`📋 Отдаем ${this.cameras.length} камер`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(this.cameras));
                
            } else if (url === '/api/stream/start') {
                this.handleStreamStart(req, res);
                
            } else if (url === '/api/stream/stop') {
                this.handleStreamStop(req, res);
                
            } else if (url === '/api/streams/status') {
                const status = this.rtspDecoder.getStreamsStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status));
                
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        server.listen(3000, () => {
            console.log('🌐 Простой RTSP сервер запущен на http://localhost:3000');
            console.log('📄 Принудительное чтение index.html активно');
            console.log(`📋 Настроено ${this.cameras.length} камер`);
        });

        process.on('SIGINT', () => {
            console.log('\n🛑 Остановка сервера...');
            this.rtspDecoder.stopAllStreams();
            server.close();
            process.exit(0);
        });

        return server;
    }

    handleStreamStart(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const { cameraId, rtspUrl, quality } = JSON.parse(body);
                console.log(`📡 Запуск потока: камера ${cameraId}, качество ${quality}`);
                
                const streamId = `stream-${cameraId}-${quality}-${Date.now()}`;
                const result = await this.rtspDecoder.startStreamOptimized(streamId, rtspUrl, quality);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    streamId: result.streamId,
                    url: result.url,
                    quality: quality
                }));
            } catch (error) {
                console.error('❌ Ошибка запуска потока:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
    }

    handleStreamStop(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const { streamId } = JSON.parse(body);
                console.log(`🛑 Остановка потока: ${streamId}`);
                
                await this.rtspDecoder.stopStream(streamId);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('❌ Ошибка остановки потока:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
    }
}

if (require.main === module) {
    const server = new SimpleRTSPServer();
    server.start();
}

module.exports = SimpleRTSPServer;
