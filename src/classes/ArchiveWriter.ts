import { Duplex } from 'stream';
import { FILE_NAME_LENGTH_BYTES, MAGIC_BYTES } from '../common/constants';

export class ArchiveWriter extends Duplex {
    public archiveSizeBytes = 0;
    private readonly queue: { buffer: Buffer; cb?: (error?: Error | null) => void }[] = [];
    private shouldPush = false;
    private isFinalizing = false;
    private finalizeCallback: ((error?: Error | null) => void) | null = null;
    public addFile(fileName: string) {
        const nameBuffer = Buffer.from(fileName, 'utf-8');
        const nameLengthBuffer = Buffer.alloc(FILE_NAME_LENGTH_BYTES);

        nameLengthBuffer.writeUInt32BE(nameBuffer.byteLength, 0);

        const entryBuffer = Buffer.concat([MAGIC_BYTES, nameLengthBuffer, nameBuffer]);

        this.enqueue(entryBuffer);
    }
    public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const buffer = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk), encoding);

        this.enqueue(buffer, callback);
    }
    public _read(size: number) {
        this.shouldPush = true;
        this.flush();
    }
    public _final(callback: (error?: Error | null) => void): void {
        this.isFinalizing = true;
        this.finalizeCallback = callback;
        this.flush();
    }
    private pushBuffer(buffer: Buffer) {
        this.archiveSizeBytes += buffer.byteLength;
        return this.push(buffer);
    }
    private enqueue(buffer: Buffer, cb?: (error?: Error | null) => void) {
        this.queue.push({ buffer, cb });

        if (this.shouldPush) {
            this.flush();
        }
    }
    private flush() {
        if (!this.shouldPush) {
            return;
        }

        let item: { buffer: Buffer; cb?: (error?: Error | null) => void } | undefined;
        while ((item = this.queue.shift())) {
            const pushed = this.pushBuffer(item.buffer);

            // Signal the writer that this chunk has been processed
            if (item.cb) {
                item.cb();
            }

            if (!pushed) {
                this.shouldPush = false;
                break;
            }
        }

        if (this.queue.length === 0 && this.isFinalizing && this.finalizeCallback) {
            this.push(null);
            const cb = this.finalizeCallback;
            this.finalizeCallback = null;
            this.isFinalizing = false;
            cb();
        }
    }
}

