import { Duplex } from 'stream';
import { FILE_NAME_LENGTH_BYTES, MAGIC_BYTES } from '../common/constants';

export class ArchiveWriter extends Duplex {
    public archiveSizeBytes = 0;
    public isBackpressured = false;
    private readonly buffer: Buffer[] = [];
    public addFile(fileName: string) {
        const nameBuffer = Buffer.from(fileName, 'utf-8');
        const nameLengthBuffer = Buffer.alloc(FILE_NAME_LENGTH_BYTES);

        nameLengthBuffer.writeUInt32BE(nameBuffer.byteLength, 0);

        const entryBuffer = Buffer.concat([MAGIC_BYTES, nameLengthBuffer, nameBuffer]);

        this.write(entryBuffer);
    }
    public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.buffer.push(chunk);

        this.drain();

        callback();
    }
    public _read(size: number) {
        this.drain();
    }
    public _final(callback: (error?: Error | null) => void): void {
        this.drain();

        this.push(null);

        callback();
    }
    private drain() {
        let buffer: Buffer | undefined;

        while ((buffer = this.buffer.shift())) {
            this.pushBuffer(buffer);
        }
    }
    private pushBuffer(buffer: Buffer) {
        this.archiveSizeBytes += buffer.byteLength;
        this.isBackpressured = this.push(buffer) === false;
    }
}