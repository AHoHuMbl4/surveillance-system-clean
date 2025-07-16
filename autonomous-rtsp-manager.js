/**
 * Embedded FFmpeg RTSP Manager - Автономная система с встроенным FFmpeg
 * Поддерживает реальные RTSP H.264 потоки без внешних зависимостей
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmbeddedFFmpegManager extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.streamProxies = new Map();
        this.ffmpegProcesses = new Map();
        this.connectionAttempts = new Map();
        this.reconnectTimers = new Map();
        
        this.config = {
            maxRetries: 5,
            retryInterval: 30000,
            connectionTimeout: 10000,
            proxyPort: 8080,
            quality: {
                low: { resolution: '640x480', fps: 15, bitrate: '500k' },
                high: { resolution: '1920x1080', fps: 25, bitrate: '2000k' }
            }
        };
        
        this.nextProxyPort = this.config.proxyPort;
        this.ffmpegPath = this.getEmbeddedFFmpegPath();
        
        console.log('🎥 Embedded FFmpeg RTSP Manager инициализирован');
        console.log(`📍 FFmpeg путь: ${this.ffmpegPath}`);
    }

    /**
     * Определение пути к встроенному FFmpeg для текущей платформы
     */
    getEmbeddedFFmpegPath() {
        const platform = process.platform;
        const arch = process.arch;
        
        let ffmpegName;
        let platformDir;
        
        switch (platform) {
            case 'win32':
                ffmpegName = 'ffmpeg.exe';
                platformDir = arch === 'x64' ? 'win64' : 'win32';
                break;
            case 'darwin':
                ffmpegName = 'ffmpeg';
                platformDir = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
                break;
            case 'linux':
                ffmpegName = 'ffmpeg';
                platformDir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
                break;
            default:
                throw new Error(`Неподдерживаемая платформа: ${platform}-${arch}`);
        }
        
        const ffmpegPath = path.join(__dirname, 'ffmpeg', platformDir, ffmpegName);
        
        // Проверяем существование файла
        if (!fs.existsSync(ffmpegPath)) {
            console.warn(`⚠️ FFmpeg не найден: ${ffmpegPath}`);
            console.warn(`📁 Создайте структуру: ffmpeg/${platformDir}/${ffmpegName}`);
        }
        
        return ffmpegPath;
    }

    /**
     * Проверка доступности встроенного FFmpeg
     */
    async checkFFmpegAvailability() {
        return new Promise((resolve) => {
            // Проверяем существование файла
            if (!fs.existsSync(this.ffmpegPath)) {
                resolve({
                    available: false,
                    error: 'FFmpeg binary not found',
                    path: this.ffmpegPath,
                    instructions: this.getFFmpegInstallInstructions()
                });
                return;
            }

            // Проверяем права на выполнение (Unix системы)
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(this.ffmpegPath, 0o755);
                } catch (error) {
                    console.warn('⚠️ Не удалось установить права на выполнение для FFmpeg');
                }
            }

            // Тестируем запуск FFmpeg
            const ffmpeg = spawn(this.ffmpegPath, ['-version']);
            
            let output = '';
            ffmpeg.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    const version = output.match(/ffmpeg version ([^\s]+)/)?.[1] || 'unknown';
                    console.log(`✅ Встроенный FFmpeg работает: версия ${version}`);
                    resolve({
                        available: true,
                        version: version,
                        path: this.ffmpegPath,
                        platform: process.platform,
                        arch: process.arch
                    });
                } else {
                    resolve({
                        available: false,
                        error: `FFmpeg exit code: ${code}`,
                        path: this.ffmpegPath
                    });
                }
            });
            
            ffmpeg.on('error', (error) => {
                resolve({
                    available: false,
                    error: error.message,
                    path: this.ffmpegPath
                });
            });
        });
    }

    /**
     * Инструкции по установке FFmpeg бинарников
     */
    getFFmpegInstallInstructions() {
        const platform = process.platform;
        const arch = process.arch;
        
        return {
            platform: `${platform}-${arch}`,
            downloadUrl: this.getFFmpegDownloadUrl(platform, arch),
            targetPath: this.ffmpegPath,
            instructions: [
                '1. Скачайте FFmpeg static build для вашей платформы',
                '2. Распакуйте архив',
                '3. Скопируйте ffmpeg в указанную папку',
                '4. Перезапустите приложение'
            ]
        };
    }

    /**
     * URL для скачивания FFmpeg по платформам
     */
    getFFmpegDownloadUrl(platform, arch) {
        const baseUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/';
        
        switch (platform) {
            case 'win32':
                return arch === 'x64' 
                    ? baseUrl + 'ffmpeg-master-latest-win64-gpl.zip'
                    : baseUrl + 'ffmpeg-master-latest-win32-gpl.zip';
            case 'linux':
                return arch === 'arm64'
                    ? baseUrl + 'ffmpeg-master-latest-linux64-gpl.tar.xz'
                    : baseUrl + 'ffmpeg-master-latest-linux64-gpl.tar.xz';
            case 'darwin':
                return 'https://evermeet.cx/ffmpeg/getrelease/zip'; // Для macOS
            default:
                return 'https://ffmpeg.org/download.html';
        }
    }

    /**
     * Тестирование RTSP подключения
     */
    async testRTSPConnection(rtspUrl, timeout = 10000) {
        console.log(`🔍 Тестирование RTSP: ${rtspUrl}`);
        
        return new Promise((resolve) => {
            const timeoutTimer = setTimeout(() => {
                if (ffmpeg && !ffmpeg.killed) {
                    ffmpeg.kill('SIGKILL');
                }
                resolve({
                    success: false,
                    error: 'Connection timeout',
                    duration: timeout
                });
            }, timeout);

            const startTime = Date.now();
            let hasVideo = false;
            let hasAudio = false;
            let resolution = null;
            let fps = null;

            const ffmpeg = spawn(this.ffmpegPath, [
                '-i', rtspUrl,
                '-t', '3', // Тестируем 3 секунды
                '-f', 'null',
                '-'
            ]);

            let errorOutput = '';
            
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                errorOutput += output;
                
                // Ищем информацию о потоке
                if (output.includes('Video:')) {
                    hasVideo = true;
                    const resMatch = output.match(/(\d{3,4}x\d{3,4})/);
                    if (resMatch) resolution = resMatch[1];
                    
                    const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*tbr/);
                    if (fpsMatch) fps = parseFloat(fpsMatch[1]);
                }
                
                if (output.includes('Audio:')) {
                    hasAudio = true;
                }
                
                // Проверяем на ошибки подключения
                if (output.includes('Connection refused') || 
                    output.includes('Connection timed out') ||
                    output.includes('No route to host') ||
                    output.includes('Invalid data found')) {
                    
                    clearTimeout(timeoutTimer);
                    ffmpeg.kill();
                    resolve({
                        success: false,
                        error: 'Connection failed',
                        details: output.trim(),
                        duration: Date.now() - startTime
                    });
                }
            });

            ffmpeg.on('close', (code) => {
                clearTimeout(timeoutTimer);
                
                const duration = Date.now() - startTime;
                
                if (hasVideo || hasAudio) {
                    resolve({
                        success: true,
                        hasVideo: hasVideo,
                        hasAudio: hasAudio,
                        resolution: resolution,
                        fps: fps,
                        duration: duration,
                        details: 'Stream accessible'
                    });
                } else {
                    resolve({
                        success: false,
                        error: 'No valid stream found',
                        details: errorOutput.slice(-500), // Последние 500 символов ошибки
                        duration: duration
                    });
                }
            });

            ffmpeg.on('error', (error) => {
                clearTimeout(timeoutTimer);
                resolve({
                    success: false,
                    error: 'FFmpeg process error',
                    details: error.message,
                    duration: Date.now() - startTime
                });
            });
        });
    }

    /**
     * Запуск RTSP потока с конвертацией в HTTP/MJPEG
     */
    async startStream(camera, quality = 'low') {
        const streamId = `${camera.id}_${quality}`;
        
        try {
            // Проверяем что поток не запущен
            if (this.activeStreams.has(streamId)) {
                console.log(`⚠️ Поток ${streamId} уже запущен`);
                return this.activeStreams.get(streamId);
            }

            console.log(`🚀 Запуск RTSP потока: ${camera.camera_name} (${quality})`);
            
            // Создаем HTTP прокси сервер для потока
            const proxyPort = this.nextProxyPort++;
            const proxyServer = await this.createStreamProxy(streamId, proxyPort, camera, quality);
            
            // Запускаем FFmpeg процесс
            const ffmpegProcess = this.startFFmpegProcess(streamId, camera.rtsp_link, quality, proxyPort);
            
            // Сохраняем информацию о потоке
            const streamData = {
                id: streamId,
                camera: camera,
                quality: quality,
                proxyPort: proxyPort,
                proxyServer: proxyServer,
                ffmpegProcess: ffmpegProcess,
                status: 'starting',
                startTime: new Date(),
                clientsConnected: 0,
                bytesTransferred: 0
            };
            
            this.activeStreams.set(streamId, streamData);
            this.streamProxies.set(proxyPort, streamData);
            this.ffmpegProcesses.set(streamId, ffmpegProcess);
            
            // Настраиваем обработчики событий FFmpeg
            this.setupFFmpegHandlers(streamId, ffmpegProcess, camera);
            
            console.log(`✅ Поток ${streamId} запущен на порту ${proxyPort}`);
            
            return {
                success: true,
                streamId: streamId,
                proxyUrl: `http://localhost:${proxyPort}/stream.mjpeg`,
                camera: camera.camera_name,
                quality: quality
            };
            
        } catch (error) {
            console.error(`❌ Ошибка запуска потока ${streamId}:`, error);
            return {
                success: false,
                error: error.message,
                streamId: streamId
            };
        }
    }

    /**
     * Создание HTTP прокси сервера для потока
     */
    async createStreamProxy(streamId, proxyPort, camera, quality) {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                this.handleProxyRequest(req, res, streamId);
            });

            server.listen(proxyPort, 'localhost', () => {
                console.log(`🔗 Прокси сервер для ${camera.camera_name} запущен на порту ${proxyPort}`);
                resolve(server);
            });

            server.on('error', (error) => {
                console.error(`❌ Ошибка прокси сервера:`, error);
                reject(error);
            });
        });
    }

    /**
     * Запуск FFmpeg процесса для конвертации RTSP в MJPEG
     */
    startFFmpegProcess(streamId, rtspUrl, quality, proxyPort) {
        const qualitySettings = this.config.quality[quality];
        
        const ffmpegArgs = [
            '-i', rtspUrl,
            '-f', 'mjpeg',
            '-vf', `scale=${qualitySettings.resolution}`,
            '-r', qualitySettings.fps.toString(),
            '-b:v', qualitySettings.bitrate,
            '-q:v', '3', // Качество JPEG (1-31, меньше = лучше)
            '-'
        ];
        
        console.log(`🎬 Запуск FFmpeg: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);
        
        const ffmpeg = spawn(this.ffmpegPath, ffmpegArgs);
        
        return ffmpeg;
    }

    /**
     * Настройка обработчиков событий FFmpeg
     */
    setupFFmpegHandlers(streamId, ffmpegProcess, camera) {
        const streamData = this.activeStreams.get(streamId);
        
        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Логируем важные события
            if (output.includes('fps=')) {
                streamData.status = 'streaming';
                this.emit('streamConnected', { streamId, camera });
            }
            
            // Обработка ошибок
            if (output.includes('Connection refused') || 
                output.includes('Connection timed out') ||
                output.includes('No route to host')) {
                this.handleStreamError(streamId, camera, new Error(output));
            }
        });

        ffmpegProcess.on('error', (error) => {
            console.error(`💥 FFmpeg процесс ошибка:`, error);
            this.handleStreamError(streamId, camera, error);
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🔌 FFmpeg процесс завершен (код ${code}): ${camera.camera_name}`);
            if (code !== 0 && streamData && streamData.status === 'streaming') {
                this.handleStreamError(streamId, camera, new Error(`FFmpeg завершен с кодом ${code}`));
            }
        });

        // Pipe MJPEG output к прокси серверу
        streamData.mjpegOutput = ffmpegProcess.stdout;
    }

    /**
     * Обработка HTTP запросов к прокси серверу
     */
    handleProxyRequest(req, res, streamId) {
        const streamData = this.activeStreams.get(streamId);
        
        if (!streamData || !streamData.mjpegOutput) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Stream not found');
            return;
        }

        // CORS заголовки
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // MJPEG заголовки
        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=--myboundary',
            'Cache-Control': 'no-cache',
            'Connection': 'close'
        });

        // Подключаем клиента к потоку
        streamData.clientsConnected++;
        console.log(`👤 Клиент подключился к потоку ${streamId} (всего: ${streamData.clientsConnected})`);

        // Pipe MJPEG данные к клиенту
        streamData.mjpegOutput.pipe(res);

        // Обработка отключения клиента
        req.on('close', () => {
            streamData.clientsConnected--;
            console.log(`👤 Клиент отключился от потока ${streamId} (осталось: ${streamData.clientsConnected})`);
            
            // Если нет клиентов, можно остановить поток (опционально)
            if (streamData.clientsConnected === 0) {
                console.log(`💤 Нет клиентов для потока ${streamId}`);
            }
        });

        req.on('error', () => {
            streamData.clientsConnected--;
        });
    }

    /**
     * Остановка потока
     */
    async stopStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        
        if (!streamData) {
            console.log(`⚠️ Поток ${streamId} не найден`);
            return false;
        }

        console.log(`🛑 Остановка потока ${streamId}`);

        try {
            // Останавливаем FFmpeg процесс
            if (streamData.ffmpegProcess && !streamData.ffmpegProcess.killed) {
                streamData.ffmpegProcess.kill('SIGTERM');
                
                // Принудительное завершение через 5 секунд
                setTimeout(() => {
                    if (!streamData.ffmpegProcess.killed) {
                        streamData.ffmpegProcess.kill('SIGKILL');
                    }
                }, 5000);
            }

            // Закрываем прокси сервер
            if (streamData.proxyServer) {
                streamData.proxyServer.close();
            }

            // Убираем из коллекций
            this.activeStreams.delete(streamId);
            this.streamProxies.delete(streamData.proxyPort);
            this.ffmpegProcesses.delete(streamId);

            console.log(`✅ Поток ${streamId} остановлен`);
            return true;

        } catch (error) {
            console.error(`❌ Ошибка остановки потока ${streamId}:`, error);
            return false;
        }
    }

    /**
     * Обработка ошибок потока
     */
    handleStreamError(streamId, camera, error) {
        console.error(`❌ Ошибка потока ${streamId}:`, error.message);
        
        const attempts = this.connectionAttempts.get(streamId) || 0;
        
        if (attempts < this.config.maxRetries) {
            this.connectionAttempts.set(streamId, attempts + 1);
            
            console.log(`🔄 Попытка переподключения ${attempts + 1}/${this.config.maxRetries} для ${camera.camera_name}`);
            
            // Переподключение через интервал
            setTimeout(() => {
                this.stopStream(streamId).then(() => {
                    this.startStream(camera, 'low');
                });
            }, this.config.retryInterval);
            
        } else {
            console.error(`💥 Превышено количество попыток для ${camera.camera_name}, поток отключен`);
            this.emit('streamFailed', { streamId, camera, error });
        }
    }

    /**
     * Получение статуса всех потоков
     */
    getStreamsStatus() {
        const streams = [];
        
        for (const [streamId, streamData] of this.activeStreams) {
            streams.push({
                id: streamId,
                camera: streamData.camera.camera_name,
                quality: streamData.quality,
                status: streamData.status,
                proxyUrl: `http://localhost:${streamData.proxyPort}/stream.mjpeg`,
                clientsConnected: streamData.clientsConnected,
                bytesTransferred: streamData.bytesTransferred,
                uptime: Date.now() - streamData.startTime.getTime()
            });
        }
        
        return {
            totalStreams: streams.length,
            activeStreams: streams.filter(s => s.status === 'streaming').length,
            streams: streams
        };
    }

    /**
     * Очистка всех ресурсов
     */
    async cleanup() {
        console.log('🧹 Очистка RTSP Manager...');
        
        // Останавливаем все потоки
        const stopPromises = Array.from(this.activeStreams.keys()).map(streamId => 
            this.stopStream(streamId)
        );
        
        await Promise.all(stopPromises);
        
        // Очищаем таймеры
        for (const timer of this.reconnectTimers.values()) {
            clearTimeout(timer);
        }
        
        this.reconnectTimers.clear();
        this.connectionAttempts.clear();
        
        console.log('✅ RTSP Manager очищен');
    }
}

export default EmbeddedFFmpegManager;
