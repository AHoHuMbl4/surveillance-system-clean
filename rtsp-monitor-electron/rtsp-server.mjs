/**
 * RTSP Server - Исправленная версия с ES imports
 * Интегрированный HTTP сервер с поддержкой RTSP потоков
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import RTSPDecoder from './rtsp-decoder.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RTSPServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.rtspDecoder = new RTSPDecoder();
        this.port = 3000;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupStaticFiles();
        
        console.log('🌐 RTSP Server инициализирован');
    }

    setupMiddleware() {
        // CORS для всех запросов
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));
        
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Логирование запросов
        this.app.use((req, res, next) => {
            console.log(`📊 ${req.method} ${req.path}`);
            next();
        });
    }

    setupStaticFiles() {
        // Статические файлы HLS потоков
        this.app.use('/stream', express.static(path.join(__dirname, 'temp_streams'), {
            setHeaders: (res, filePath) => {
                if (filePath.endsWith('.m3u8')) {
                    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                    res.setHeader('Cache-Control', 'no-cache');
                } else if (filePath.endsWith('.ts')) {
                    res.setHeader('Content-Type', 'video/mp2t');
                    res.setHeader('Cache-Control', 'max-age=10');
                }
                
                // CORS заголовки для HLS
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET');
            }
        }));
        
        // Статические файлы интерфейса
        this.app.use(express.static(__dirname));
    }

    setupRoutes() {
        // Отдача статических файлов из libs
        this.app.get("/libs/:file", (req, res) => {
            const filePath = path.join(__dirname, "libs", req.params.file);
            if (fs.existsSync(filePath)) {
                res.sendFile(filePath);
            } else {
                res.status(404).send("File not found");
            }
        });
        // Главная страница
        this.app.get('/', (req, res) => {
            const indexPath = path.join(__dirname, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.send(`
                    <h1>🎥 RTSP Monitor Server</h1>
                    <p>Сервер запущен на порту ${this.port}</p>
                    <p>API доступен по адресу /api/</p>
                `);
            }
        });

        // API маршруты
        this.setupAPIRoutes();

        // Отдача HLS потоков
        this.app.get("/stream/:streamId/:file", (req, res) => {
            const { streamId, file } = req.params;
            const filePath = path.join(this.rtspDecoder.streamDir, streamId, file);
            
            console.log(`📁 Запрос HLS файла: ${filePath}`);
            
            if (!fs.existsSync(filePath)) {
                console.log(`❌ Файл не найден: ${filePath}`);
                return res.status(404).send("File not found");
            }
            
            const ext = path.extname(file);
            let contentType = "application/octet-stream";
            
            if (ext === ".m3u8") {
                contentType = "application/vnd.apple.mpegurl";
            } else if (ext === ".ts") {
                contentType = "video/mp2t";
            }
            
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Access-Control-Allow-Origin", "*");
            
            const stream = fs.createReadStream(filePath);
            stream.on("error", (error) => {
                console.error(`❌ Ошибка чтения файла: ${error}`);
                res.status(500).send("Internal server error");
            });
            
            stream.pipe(res);
        });
    }

    setupAPIRoutes() {
        // Получение списка квартир
        this.app.get('/api/apartments', (req, res) => {
            const apartments = this.getTestApartments();
            res.json(apartments);
        });

        // Получение списка камер
        this.app.get('/api/cameras', (req, res) => {
            const cameras = this.getTestCameras();
            res.json(cameras);
        });

        // Запуск RTSP потока
        this.app.post('/api/stream/start', async (req, res) => {
            try {
                const { streamId, rtspUrl, quality = 'low' } = req.body;
                
                if (!streamId || !rtspUrl) {
                    return res.status(400).json({
                        error: 'Требуются параметры streamId и rtspUrl'
                    });
                }

                console.log(`🚀 Запуск потока: ${streamId} (${quality})`);
                
                const streamData = await this.rtspDecoder.startStream(streamId, rtspUrl, quality);
                
                res.json({
                    success: true,
                    streamId: streamId,
                    quality: quality,
                    message: 'Поток запущен успешно',
                    streamData: {
                        status: streamData.status,
                        startTime: streamData.startTime
                    }
                });

            } catch (error) {
                console.error(`❌ Ошибка запуска потока:`, error);
                res.status(500).json({
                    error: 'Ошибка запуска потока',
                    details: error.message
                });
            }
        });

        // Остановка RTSP потока
        this.app.post('/api/stream/stop', async (req, res) => {
            try {
                const { streamId } = req.body;
                
                if (!streamId) {
                    return res.status(400).json({
                        error: 'Требуется параметр streamId'
                    });
                }

                console.log(`🛑 Остановка потока: ${streamId}`);
                
                await this.rtspDecoder.stopStream(streamId);
                
                res.json({
                    success: true,
                    streamId: streamId,
                    message: 'Поток остановлен успешно'
                });

            } catch (error) {
                console.error(`❌ Ошибка остановки потока:`, error);
                res.status(500).json({
                    error: 'Ошибка остановки потока',
                    details: error.message
                });
            }
        });

        // Статус всех потоков
        this.app.get('/api/streams/status', (req, res) => {
            try {
                const status = this.rtspDecoder.getStreamsStatus();
                res.json({
                    success: true,
                    streams: status,
                    count: Object.keys(status).length
                });
            } catch (error) {
                console.error(`❌ Ошибка получения статуса:`, error);
                res.status(500).json({
                    error: 'Ошибка получения статуса потоков',
                    details: error.message
                });
            }
        });

        // Здоровье сервера
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: '1.0.0'
            });
        });
    }

    getTestApartments() {
        return [
            {
                id: 1,
                apartment_name: 'Тайланд',
                apartment_number: '91'
            },
            {
                id: 2,
                apartment_name: 'Тестовая квартира',
                apartment_number: '12А'
            }
        ];
    }

    getTestCameras() {
        return [
            {
                id: 1,
                camera_name: 'Тестовая камера 1',
                apartment_name: 'Тайланд',
                rtsp_link: 'rtsp://185.70.184.101:8554/cam91-99',
                rtsp_link_high: 'rtsp://185.70.184.101:8554/cam91-99',
                status: 'offline'
            },
            {
                id: 2,
                camera_name: 'Demo BigBuckBunny',
                apartment_name: 'Тайланд',
                rtsp_link: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4',
                rtsp_link_high: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_175k.mp4',
                status: 'offline'
            },
            {
                id: 3,
                camera_name: 'Камера холла',
                apartment_name: 'Тестовая квартира',
                rtsp_link: 'rtsp://185.70.184.101:8554/cam91-99',
                status: 'offline'
            }
        ];
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, '0.0.0.0', (error) => {
                if (error) {
                    console.error('❌ Ошибка запуска сервера:', error);
                    reject(error);
                } else {
                    console.log(`✅ RTSP Server запущен на http://localhost:${this.port}`);
                    console.log(`📡 RTSP Decoder готов к обработке потоков`);
                    resolve();
                }
            });

            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`❌ Порт ${this.port} уже используется`);
                } else {
                    console.error('❌ Ошибка сервера:', error);
                }
                reject(error);
            });
        });
    }

    async stop() {
        console.log('🛑 Остановка RTSP сервера...');
        
        // Останавливаем все RTSP потоки
        try {
            await this.rtspDecoder.stopAllStreams();
        } catch (error) {
            console.warn('⚠️ Ошибка остановки RTSP потоков:', error);
        }

        // Останавливаем HTTP сервер
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    console.log('✅ RTSP сервер остановлен');
                    resolve();
                });
            });
        }
    }
}

// Запуск сервера если файл выполняется напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new RTSPServer();
    
    server.start().catch(error => {
        console.error('💥 Критическая ошибка запуска:', error);
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('📨 Получен сигнал SIGTERM, завершение работы...');
        await server.stop();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('📨 Получен сигнал SIGINT, завершение работы...');
        await server.stop();
        process.exit(0);
    });
}

export default RTSPServer;
