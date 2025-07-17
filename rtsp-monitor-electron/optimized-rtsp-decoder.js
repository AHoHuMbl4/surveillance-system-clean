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
