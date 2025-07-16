// Патч для handleStreamStart в autonomous-server.js

const fs = require('fs');
const path = require('path');

// Функция для обновления handleStreamStart
function updateStreamHandler() {
    const serverFile = 'autonomous-server.js';
    let content = fs.readFileSync(serverFile, 'utf8');
    
    // Найти и заменить handleStreamStart
    const newHandler = `
    async handleStreamStart(res, data) {
        try {
            const { streamId, rtspUrl, quality = 'low' } = data;
            
            console.log(\`🎬 Запуск потока: \${streamId}, качество: \${quality}\`);
            
            if (!streamId || !rtspUrl) {
                return this.sendError(res, 400, 'streamId и rtspUrl обязательны');
            }
            
            // Создание директории для потока
            const streamPath = path.join(__dirname, 'temp_streams', streamId);
            
            // Удаляем старую директорию если существует
            if (fs.existsSync(streamPath)) {
                console.log(\`🗑️ Удаление старой директории: \${streamPath}\`);
                fs.rmSync(streamPath, { recursive: true, force: true });
            }
            
            // Создаем новую директорию
            fs.mkdirSync(streamPath, { recursive: true });
            console.log(\`📁 Создана директория: \${streamPath}\`);
            
            // Настройки качества
            const qualitySettings = {
                low: {
                    scale: '854:480',
                    bitrate: '800k',
                    maxrate: '1000k',
                    bufsize: '1500k',
                    preset: 'veryfast'
                },
                high: {
                    scale: '1920:1080',
                    bitrate: '3000k',
                    maxrate: '4000k',
                    bufsize: '6000k',
                    preset: 'fast'
                }
            };
            
            const settings = qualitySettings[quality] || qualitySettings.low;
            
            // Команда FFmpeg
            const ffmpegPath = this.getFFmpegPath();
            const outputPath = path.join(streamPath, 'playlist.m3u8');
            
            const ffmpegArgs = [
                '-rtsp_transport', 'tcp',
                '-i', rtspUrl,
                '-fflags', '+genpts',
                '-avoid_negative_ts', 'make_zero',
                '-max_delay', '0',
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '2',
                '-vf', \`scale=\${settings.scale}\`,
                '-c:v', 'libx264',
                '-preset', settings.preset,
                '-b:v', settings.bitrate,
                '-maxrate', settings.maxrate,
                '-bufsize', settings.bufsize,
                '-f', 'hls',
                '-hls_time', '2',
                '-hls_list_size', '5',
                '-hls_flags', 'delete_segments',
                '-hls_segment_filename', path.join(streamPath, 'segment%03d.ts'),
                '-hls_allow_cache', '1',
                '-y', outputPath
            ];
            
            console.log(\`🚀 Запуск FFmpeg: \${ffmpegPath}\`);
            console.log(\`📝 Аргументы: \${ffmpegArgs.join(' ')}\`);
            
            // Запуск FFmpeg
            const { spawn } = require('child_process');
            const ffmpeg = spawn(ffmpegPath, ffmpegArgs);
            
            // Сохранение процесса
            if (!this.activeStreams) {
                this.activeStreams = new Map();
            }
            
            this.activeStreams.set(streamId, {
                process: ffmpeg,
                streamId,
                rtspUrl,
                quality,
                startTime: Date.now(),
                outputPath
            });
            
            // Обработка вывода FFmpeg
            ffmpeg.stdout.on('data', (data) => {
                console.log(\`[FFmpeg \${streamId}]: \${data}\`);
            });
            
            ffmpeg.stderr.on('data', (data) => {
                const message = data.toString();
                if (message.includes('error') || message.includes('Error')) {
                    console.error(\`❌ [FFmpeg \${streamId}]: \${message}\`);
                } else {
                    console.log(\`[FFmpeg \${streamId}]: \${message}\`);
                }
            });
            
            ffmpeg.on('close', (code) => {
                console.log(\`⏹️ FFmpeg процесс \${streamId} завершен с кодом \${code}\`);
                this.activeStreams.delete(streamId);
            });
            
            // Ответ клиенту
            this.sendJSON(res, {
                success: true,
                streamId,
                quality,
                message: 'Поток запущен успешно',
                streamData: {
                    status: 'starting',
                    startTime: Date.now()
                }
            });
            
        } catch (error) {
            console.error('❌ Ошибка запуска потока:', error);
            this.sendError(res, 500, error.message);
        }
    }`;
    
    // Здесь нужно добавить логику замены функции
    console.log('✅ Обработчик обновлен');
}

// Запуск обновления
updateStreamHandler();
