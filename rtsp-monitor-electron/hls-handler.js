const fs = require('fs');
const path = require('path');

class HLSHandler {
    constructor(tempStreamsPath) {
        this.tempStreamsPath = tempStreamsPath || path.join(__dirname, 'temp_streams');
    }

    /**
     * Обработка HLS запросов
     */
    handleRequest(req, res, pathname) {
        // Парсинг пути: /stream/{streamId}/{filename}
        const parts = pathname.split('/').filter(p => p);
        
        if (parts.length < 3) {
            return false;
        }
        
        const streamId = parts[1];
        const fileName = parts.slice(2).join('/');
        
        console.log(`🎥 HLS запрос: streamId=${streamId}, file=${fileName}`);
        
        // Путь к файлу
        const filePath = path.join(this.tempStreamsPath, streamId, fileName);
        
        // Проверка существования
        if (!fs.existsSync(filePath)) {
            console.log(`❌ HLS файл не найден: ${filePath}`);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('HLS file not found');
            return true;
        }
        
        // Определение MIME типа
        const ext = path.extname(fileName).toLowerCase();
        let contentType = 'application/octet-stream';
        
        if (ext === '.m3u8') {
            contentType = 'application/vnd.apple.mpegurl';
        } else if (ext === '.ts') {
            contentType = 'video/mp2t';
        }
        
        // Чтение и отправка файла
        try {
            const stat = fs.statSync(filePath);
            
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stat.size,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Range'
            });
            
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            
            stream.on('error', (error) => {
                console.error(`❌ Ошибка чтения HLS файла: ${error}`);
                res.end();
            });
            
            return true;
            
        } catch (error) {
            console.error(`❌ Ошибка обработки HLS: ${error}`);
            res.writeHead(500);
            res.end('Internal Server Error');
            return true;
        }
    }
    
    /**
     * Проверка доступности потока
     */
    isStreamAvailable(streamId) {
        const streamPath = path.join(this.tempStreamsPath, streamId);
        const playlistPath = path.join(streamPath, 'playlist.m3u8');
        return fs.existsSync(playlistPath);
    }
    
    /**
     * Получение информации о потоке
     */
    getStreamInfo(streamId) {
        const streamPath = path.join(this.tempStreamsPath, streamId);
        
        if (!fs.existsSync(streamPath)) {
            return null;
        }
        
        try {
            const files = fs.readdirSync(streamPath);
            const segments = files.filter(f => f.endsWith('.ts')).length;
            const hasPlaylist = files.includes('playlist.m3u8');
            
            return {
                id: streamId,
                path: streamPath,
                hasPlaylist,
                segments,
                files: files.length
            };
        } catch (error) {
            console.error(`❌ Ошибка получения информации о потоке: ${error}`);
            return null;
        }
    }
}

module.exports = HLSHandler;
