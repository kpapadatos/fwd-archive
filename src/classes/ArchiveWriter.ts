import { Duplex } from 'stream';
import { FILE_NAME_LENGTH_BYTES, MAGIC_BYTES } from '../common/constants';

export class ArchiveWriter extends Duplex {
    public archiveSizeBytes = 0;
    private readonly buffer: Buffer[] = [];
    private shouldPush = false;
    public addFile(fileName: string) {
        const nameBuffer = Buffer.from(fileName, 'utf-8');
        const nameLengthBuffer = Buffer.alloc(FILE_NAME_LENGTH_BYTES);

        nameLengthBuffer.writeUInt32BE(nameBuffer.byteLength, 0);

        const entryBuffer = Buffer.concat([MAGIC_BYTES, nameLengthBuffer, nameBuffer]);

        this.buffer.push(entryBuffer);

        if (this.shouldPush) {
            this.shouldPush = this.pushBuffer(this.buffer.shift()!);
        }
    }
    public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.buffer.push(chunk);

        if (this.shouldPush) {
            this.shouldPush = this.pushBuffer(this.buffer.shift()!);
        }

        callback();
    }
    public _read(size: number) {
        let buffer: Buffer | undefined;
        let shouldPush = true;

        while ((buffer = this.buffer.shift()) &&
            (shouldPush = this.pushBuffer(buffer))) { }

        this.shouldPush = shouldPush;
    }
    public _final(callback: (error?: Error | null) => void): void {
        for (const buffer of this.buffer) {
            this.pushBuffer(buffer);
        }

        this.push(null);

        callback();
    }
    private pushBuffer(buffer: Buffer) {
        this.archiveSizeBytes += buffer.byteLength;
        return this.push(buffer);
    }
}
