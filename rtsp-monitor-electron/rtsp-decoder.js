/**
 * Реальный RTSP декодер для Electron приложения
 * Использует FFmpeg для конвертации RTSP в HLS потоки
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class RTSPDecoder {
    constructor() {
        this.activeStreams = new Map();
        this.outputDir = './temp_streams';
        this.ffmpegPath = this.getFFmpegPath();
        
        // Создаем директорию для временных файлов
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        console.log('🎥 RTSP Decoder инициализирован');
        console.log('🎬 FFmpeg путь:', this.ffmpegPath);
    }

    /**
     * Определение пути к FFmpeg
     */
    getFFmpegPath() {
        // Сначала проверяем системный FFmpeg
        const systemPaths = [
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            'ffmpeg'  // В PATH
        ];
        
        for (const ffmpegPath of systemPaths) {
            try {
                // Проверяем доступность
                require('child_process').execSync(`${ffmpegPath} -version`, { 
                    stdio: 'pipe',
                    timeout: 5000 
                });
                console.log(`✅ Найден системный FFmpeg: ${ffmpegPath}`);
                return ffmpegPath;
            } catch (error) {
                // Продолжаем поиск
            }
        }
        
        // Если системный не найден, используем встроенный
        const platform = process.platform;
        const arch = process.arch;
        
        let platformDir = '';
        let ffmpegName = 'ffmpeg';
        
        switch (platform) {
            case 'linux':
                platformDir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
                break;
            case 'win32':
                platformDir = arch === 'x64' ? 'win64' : 'win32';
                ffmpegName = 'ffmpeg.exe';
                break;
            case 'darwin':
                platformDir = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
                break;
            default:
                platformDir = 'linux-x64';
        }
        
        const embeddedPath = path.join(__dirname, 'ffmpeg', platformDir, ffmpegName);
        console.log(`🔧 Используем встроенный FFmpeg: ${embeddedPath}`);
        return embeddedPath;
    }

    /**
     * Запуск RTSP потока и конвертация в HLS
     */
    async startStream(camera, quality = 'low') {
        const streamId = `${camera.id}_${quality}`;
        
        if (this.activeStreams.has(streamId)) {
            console.log(`⚠️ Поток ${streamId} уже активен`);
            return this.activeStreams.get(streamId);
        }

        console.log(`🚀 Запуск RTSP потока: ${camera.camera_name} (${quality})`);
        console.log(`📡 RTSP URL: ${camera.rtsp_link}`);

        // Создаем директорию для потока
        const streamDir = path.join(this.outputDir, streamId);
        if (!fs.existsSync(streamDir)) {
            fs.mkdirSync(streamDir, { recursive: true });
        }

        const playlistPath = path.join(streamDir, 'playlist.m3u8');

        // Параметры качества
        const qualitySettings = quality === 'high' ? {
            resolution: '1920x1080',
            bitrate: '2M',
            fps: '25'
        } : {
            resolution: '854x480', 
            bitrate: '800k',
            fps: '15'
        };

        // FFmpeg команда для RTSP → HLS
        const ffmpegArgs = [
            '-re',  // Читать входной поток с нативным frame rate
            '-rtsp_transport', 'tcp',
            '-i', camera.rtsp_link,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-s', qualitySettings.resolution,
            '-b:v', qualitySettings.bitrate,
            '-r', qualitySettings.fps,
            '-g', '30',
            '-sc_threshold', '0',
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments+independent_segments',
            '-hls_allow_cache', '0',
            playlistPath
        ];

        console.log(`🎬 FFmpeg команда: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);

        try {
            const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const streamData = {
                id: streamId,
                camera: camera,
                quality: quality,
                process: ffmpegProcess,
                playlistPath: playlistPath,
                streamDir: streamDir,
                status: 'connecting',
                startTime: Date.now()
            };

            // Обработчики процесса
            this.setupFFmpegHandlers(streamData);

            this.activeStreams.set(streamId, streamData);
            
            console.log(`✅ RTSP поток ${streamId} запущен`);
            return streamData;

        } catch (error) {
            console.error(`❌ Ошибка запуска FFmpeg для ${streamId}:`, error);
            throw error;
        }
    }

    /**
     * Настройка обработчиков FFmpeg процесса
     */
    setupFFmpegHandlers(streamData) {
        const { process: ffmpegProcess, id: streamId, camera } = streamData;

        ffmpegProcess.stdout.on('data', (data) => {
            // FFmpeg обычно выводит в stderr, но на всякий случай
            console.log(`📊 FFmpeg stdout ${streamId}:`, data.toString().trim());
        });

        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Ищем признаки успешного подключения
            if (output.includes('fps=') || output.includes('bitrate=')) {
                if (streamData.status === 'connecting') {
                    console.log(`✅ RTSP поток подключен: ${camera.camera_name}`);
                    streamData.status = 'streaming';
                }
            }
            
            // Логируем только важные сообщения
            if (output.includes('error') || output.includes('failed')) {
                console.error(`❌ FFmpeg error ${streamId}:`, output.trim());
                streamData.status = 'error';
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🛑 FFmpeg процесс ${streamId} завершен с кодом ${code}`);
            this.activeStreams.delete(streamId);
            
            // Очистка временных файлов
            this.cleanupStream(streamData);
        });

        ffmpegProcess.on('error', (error) => {
            console.error(`💥 Ошибка процесса FFmpeg ${streamId}:`, error);
            streamData.status = 'error';
        });
    }

    /**
     * Остановка потока
     */
    async stopStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) {
            console.warn(`⚠️ Поток ${streamId} не найден для остановки`);
            return;
        }

        console.log(`🛑 Остановка потока ${streamId}`);
        
        if (streamData.process) {
            streamData.process.kill('SIGTERM');
            
            // Принудительное завершение через 5 сек
            setTimeout(() => {
                if (!streamData.process.killed) {
                    streamData.process.kill('SIGKILL');
                }
            }, 5000);
        }

        this.cleanupStream(streamData);
        this.activeStreams.delete(streamId);
    }

    /**
     * Очистка временных файлов потока
     */
    cleanupStream(streamData) {
        try {
            if (fs.existsSync(streamData.streamDir)) {
                // Удаляем все файлы потока
                const files = fs.readdirSync(streamData.streamDir);
                files.forEach(file => {
                    fs.unlinkSync(path.join(streamData.streamDir, file));
                });
                fs.rmdirSync(streamData.streamDir);
                
                console.log(`🧹 Очищены временные файлы для ${streamData.id}`);
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка очистки ${streamData.id}:`, error.message);
        }
    }

    /**
     * Получение URL HLS потока
     */
    getStreamURL(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) {
            return null;
        }
        
        return `/stream/${streamId}/playlist.m3u8`;
    }

    /**
     * Проверка доступности HLS файла
     */
    isStreamReady(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) {
            return false;
        }
        
        return fs.existsSync(streamData.playlistPath);
    }

    /**
     * Остановка всех потоков
     */
    async stopAllStreams() {
        console.log('🛑 Остановка всех RTSP потоков...');
        
        const streamIds = Array.from(this.activeStreams.keys());
        for (const streamId of streamIds) {
            await this.stopStream(streamId);
        }
        
        console.log('✅ Все потоки остановлены');
    }

    /**
     * Получение статуса всех потоков
     */
    getStreamsStatus() {
        const status = [];
        
        for (const [streamId, streamData] of this.activeStreams.entries()) {
            status.push({
                id: streamId,
                camera: streamData.camera.camera_name,
                quality: streamData.quality,
                status: streamData.status,
                uptime: Date.now() - streamData.startTime,
                url: this.getStreamURL(streamId),
                ready: this.isStreamReady(streamId)
            });
        }
        
        return status;
    }
}

module.exports = RTSPDecoder;
