import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RTSPDecoder extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.streamDir = path.join(__dirname, 'temp_streams');
        this.ffmpegPath = '/usr/bin/ffmpeg';
        
        // Создаем директорию для потоков
        if (!fs.existsSync(this.streamDir)) {
            fs.mkdirSync(this.streamDir, { recursive: true });
            console.log(`📁 Создана директория потоков: ${this.streamDir}`);
        }
        
        console.log('🎥 RTSP Decoder инициализирован');
        console.log(`📁 Директория потоков: ${this.streamDir}`);
        console.log(`🔧 FFmpeg путь: ${this.ffmpegPath}`);
    }

    async startStream(streamId, rtspUrl, quality = 'low') {
        console.log(`📡 Запуск RTSP потока: ${streamId} (${quality})`);
        console.log(`📡 RTSP URL: ${rtspUrl}`);
        
        if (!streamId || !rtspUrl) {
            throw new Error('Требуются параметры streamId и rtspUrl');
        }

        // Проверяем что поток не запущен
        if (this.activeStreams.has(streamId)) {
            console.log(`⚠️ Поток ${streamId} уже запущен`);
            return this.activeStreams.get(streamId);
        }

        // Создаем директорию для потока
        const streamPath = path.join(this.streamDir, streamId);
        
        // Убеждаемся что директория существует
        if (!fs.existsSync(streamPath)) {
            fs.mkdirSync(streamPath, { recursive: true });
            console.log(`📁 Создана директория потока: ${streamPath}`);
        }

        // Пути к файлам
        const playlistPath = path.join(streamPath, 'playlist.m3u8');
        const segmentPattern = path.join(streamPath, 'segment%03d.ts');

        // FFmpeg аргументы
        const ffmpegArgs = this.buildFFmpegArgs(rtspUrl, playlistPath, segmentPattern, quality);
        
        console.log(`🎬 FFmpeg команда: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);

        // Запускаем FFmpeg
        const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const streamData = {
            id: streamId,
            process: ffmpegProcess,
            rtspUrl: rtspUrl,
            quality: quality,
            status: 'starting',
            startTime: Date.now(),
            streamPath: streamPath,
            playlistPath: playlistPath
        };

        // Настраиваем обработчики
        this.setupFFmpegHandlers(streamData);

        // Сохраняем данные потока
        this.activeStreams.set(streamId, streamData);

        console.log(`✅ RTSP поток ${streamId} запущен`);
        return streamData;
    }

    buildFFmpegArgs(rtspUrl, playlistPath, segmentPattern, quality) {
        const baseArgs = [
            '-rtsp_transport', 'tcp',
            '-i', rtspUrl,
            '-fflags', '+genpts',
            '-avoid_negative_ts', 'make_zero',
            '-max_delay', '0',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '2'
        ];

        const qualityArgs = quality === 'high' ? [
            '-vf', 'scale=1920:1080',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-b:v', '2000k',
            '-maxrate', '2500k',
            '-bufsize', '3000k'
        ] : [
            '-vf', 'scale=854:480',
            '-c:v', 'libx264', 
            '-preset', 'veryfast',
            '-b:v', '800k',
            '-maxrate', '1000k',
            '-bufsize', '1500k'
        ];

        const hlsArgs = [
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '5',  // Увеличиваем количество сегментов
            '-hls_flags', 'delete_segments',
            '-hls_segment_filename', segmentPattern,
            '-hls_allow_cache', '1',
            '-y',
            playlistPath
        ];

        return [...baseArgs, ...qualityArgs, ...hlsArgs];
    }

    setupFFmpegHandlers(streamData) {
        const { process: ffmpegProcess, id: streamId } = streamData;

        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            if (output.includes('fps=') || output.includes('bitrate=')) {
                if (streamData.status === 'starting') {
                    console.log(`✅ RTSP поток подключен: ${streamId}`);
                    streamData.status = 'streaming';
                    this.emit('streamStarted', streamId);
                }
            }
            
            if (output.includes('Error') || output.includes('error')) {
                console.error(`❌ FFmpeg ошибка ${streamId}: ${output}`);
            }
            
            // Отладочный вывод
            if (output.includes('Opening') || output.includes('failed')) {
                console.log(`🔍 FFmpeg ${streamId}: ${output.trim()}`);
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🎬 FFmpeg процесс ${streamId} завершен с кодом ${code}`);
            
            // НЕ удаляем файлы сразу - даем время на загрузку
            setTimeout(() => {
                this.cleanupStream(streamId);
            }, 5000);
        });

        ffmpegProcess.on('error', (error) => {
            console.error(`❌ Ошибка FFmpeg процесса ${streamId}:`, error);
            this.emit('streamError', { streamId, error });
        });
    }

    async stopStream(streamId) {
        console.log(`🛑 Остановка потока: ${streamId}`);
        
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) {
            console.warn(`⚠️ Поток ${streamId} не найден`);
            return;
        }

        // Останавливаем FFmpeg процесс
        if (streamData.process && !streamData.process.killed) {
            streamData.process.kill('SIGTERM');
            
            // Даем время на корректное завершение
            setTimeout(() => {
                if (!streamData.process.killed) {
                    streamData.process.kill('SIGKILL');
                }
            }, 2000);
        }

        // Удаляем из активных потоков
        this.activeStreams.delete(streamId);
        
        // Очистка файлов через 5 секунд
        setTimeout(() => {
            this.cleanupStream(streamId);
        }, 5000);
    }

    cleanupStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        const streamPath = streamData ? streamData.streamPath : path.join(this.streamDir, streamId);
        
        if (fs.existsSync(streamPath)) {
            try {
                fs.rmSync(streamPath, { recursive: true, force: true });
                console.log(`🗑️ Очищены временные файлы для ${streamId}`);
            } catch (error) {
                console.error(`❌ Ошибка очистки файлов ${streamId}:`, error);
            }
        }
    }

    getStreamInfo(streamId) {
        return this.activeStreams.get(streamId);
    }

    getStreamURL(streamId) {
        return `/stream/${streamId}/playlist.m3u8`;
    }

    getStreamsStatus() {
        const status = {};
        this.activeStreams.forEach((stream, id) => {
            status[id] = {
                id: stream.id,
                status: stream.status,
                quality: stream.quality,
                startTime: stream.startTime,
                uptime: Date.now() - stream.startTime
            };
        });
        return status;
    }

    async stopAllStreams() {
        console.log('🛑 Остановка всех потоков...');
        const promises = Array.from(this.activeStreams.keys()).map(id => this.stopStream(id));
        await Promise.all(promises);
    }
}

export default RTSPDecoder;
