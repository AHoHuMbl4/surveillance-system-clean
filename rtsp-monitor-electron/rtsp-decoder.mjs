/**
 * RTSP Decoder - Исправленная версия с правильным созданием директорий
 * Решает проблему "Failed to open file" и "No such file or directory"
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RTSPDecoder extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.ffmpegPath = this.findFFmpeg();
        this.tempStreamsDir = path.join(__dirname, 'temp_streams');
        
        // КРИТИЧНО: Создаем главную директорию сразу
        this.ensureMainDirectory();
        
        console.log('🎥 RTSP Decoder инициализирован');
        console.log(`📁 Директория потоков: ${this.tempStreamsDir}`);
        console.log(`🔧 FFmpeg путь: ${this.ffmpegPath}`);
    }

    findFFmpeg() {
        const possiblePaths = [
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg', 
            'ffmpeg',
            path.join(__dirname, 'ffmpeg', 'linux-x64', 'ffmpeg'),
            path.join(__dirname, 'ffmpeg', 'win64', 'ffmpeg.exe'),
            path.join(__dirname, 'ffmpeg', 'macos-x64', 'ffmpeg'),
            path.join(__dirname, 'ffmpeg', 'macos-arm64', 'ffmpeg')
        ];

        for (const ffmpegPath of possiblePaths) {
            try {
                if (fs.existsSync(ffmpegPath)) {
                    fs.accessSync(ffmpegPath, fs.constants.X_OK);
                    console.log(`✅ Найден FFmpeg: ${ffmpegPath}`);
                    return ffmpegPath;
                }
            } catch (error) {
                // Пропускаем
            }
        }

        console.log('⚠️ FFmpeg не найден, используем системный');
        return 'ffmpeg';
    }

    ensureMainDirectory() {
        try {
            if (!fs.existsSync(this.tempStreamsDir)) {
                fs.mkdirSync(this.tempStreamsDir, { recursive: true });
                console.log(`📁 Создана главная директория: ${this.tempStreamsDir}`);
            }
            
            fs.accessSync(this.tempStreamsDir, fs.constants.W_OK);
            console.log('✅ Права записи в temp_streams подтверждены');
            
        } catch (error) {
            console.error(`❌ Критическая ошибка: ${error.message}`);
            throw new Error(`Невозможно создать temp_streams: ${error.message}`);
        }
    }

    ensureStreamDirectory(streamId) {
        const streamDir = path.join(this.tempStreamsDir, streamId);
        
        try {
            if (!fs.existsSync(streamDir)) {
                fs.mkdirSync(streamDir, { recursive: true });
                console.log(`📁 Создана директория потока: ${streamDir}`);
            }
            
            fs.accessSync(streamDir, fs.constants.W_OK);
            return streamDir;
            
        } catch (error) {
            console.error(`❌ Ошибка создания ${streamId}: ${error.message}`);
            throw new Error(`Невозможно создать директорию ${streamId}: ${error.message}`);
        }
    }

    async startStream(streamId, rtspUrl, quality = 'low') {
        try {
            console.log(`🚀 Запуск RTSP потока: ${streamId}`);
            console.log(`📡 RTSP URL: ${rtspUrl}`);

            if (this.activeStreams.has(streamId)) {
                await this.stopStream(streamId);
            }

            // КРИТИЧНО: Создаем директорию потока ПЕРЕД запуском FFmpeg
            const streamDir = this.ensureStreamDirectory(streamId);
            
            const playlistPath = path.join(streamDir, 'playlist.m3u8');
            const segmentPattern = path.join(streamDir, 'playlist%03d.ts');

            const ffmpegArgs = this.buildFFmpegArgs(rtspUrl, playlistPath, segmentPattern, quality);
            
            console.log(`🔧 FFmpeg команда: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);
            
            const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: __dirname
            });

            const streamData = {
                id: streamId,
                process: ffmpegProcess,
                rtspUrl: rtspUrl,
                quality: quality,
                status: 'starting',
                startTime: Date.now(),
                streamDir: streamDir,
                playlistPath: playlistPath
            };

            this.activeStreams.set(streamId, streamData);
            this.setupFFmpegHandlers(streamData);
            
            console.log(`✅ RTSP поток ${streamId} запущен`);
            return streamData;

        } catch (error) {
            console.error(`❌ Ошибка запуска ${streamId}:`, error);
            throw error;
        }
    }

    buildFFmpegArgs(rtspUrl, playlistPath, segmentPattern, quality) {
        const baseArgs = [
            '-rtsp_transport', 'tcp',
            '-allowed_media_types', 'video',
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
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments',
            '-hls_segment_filename', segmentPattern,
            '-hls_start_number_source', 'epoch',
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
            
            if (output.includes('Failed to open file') || output.includes('No such file or directory')) {
                console.error(`❌ FFmpeg error ${streamId}: Проблема с директориями`);
                try {
                    this.ensureStreamDirectory(streamId);
                    console.log(`🔄 Директория ${streamId} пересоздана`);
                } catch (error) {
                    console.error(`❌ Не удалось пересоздать: ${error.message}`);
                }
            }
            
            if (output.includes('error') || output.includes('failed')) {
                console.error(`❌ FFmpeg error ${streamId}:`, output.trim());
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🛑 FFmpeg процесс ${streamId} завершен с кодом ${code}`);
            this.activeStreams.delete(streamId);
            this.cleanupStream(streamData);
            this.emit('streamStopped', streamId, code);
        });

        ffmpegProcess.on('error', (error) => {
            console.error(`💥 Ошибка процесса FFmpeg ${streamId}:`, error);
            streamData.status = 'error';
            this.emit('streamError', streamId, error);
        });
    }

    async stopStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) {
            console.warn(`⚠️ Поток ${streamId} не найден`);
            return;
        }

        console.log(`🛑 Остановка потока ${streamId}`);
        
        if (streamData.process) {
            streamData.process.kill('SIGTERM');
            
            setTimeout(() => {
                if (!streamData.process.killed) {
                    streamData.process.kill('SIGKILL');
                }
            }, 5000);
        }

        this.cleanupStream(streamData);
        this.activeStreams.delete(streamId);
    }

    cleanupStream(streamData) {
        try {
            if (fs.existsSync(streamData.streamDir)) {
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

    getStreamsStatus() {
        const status = {};
        for (const [streamId, streamData] of this.activeStreams) {
            status[streamId] = {
                status: streamData.status,
                quality: streamData.quality,
                startTime: streamData.startTime,
                uptime: Date.now() - streamData.startTime,
                playlistExists: fs.existsSync(streamData.playlistPath)
            };
        }
        return status;
    }

    async stopAllStreams() {
        const streamIds = Array.from(this.activeStreams.keys());
        console.log(`🛑 Остановка всех потоков (${streamIds.length})`);
        
        for (const streamId of streamIds) {
            await this.stopStream(streamId);
        }
    }
}

export default RTSPDecoder;
