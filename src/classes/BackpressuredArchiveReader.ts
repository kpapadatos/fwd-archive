import { defer } from '@lunarade/xtools';
import internal from 'stream';
import { FILE_NAME_LENGTH_BYTES, MAGIC_BYTES } from '../common/constants';
import { FileStream } from './FileStream';

export class BackpressuredArchiveReader extends internal.Writable {
    private currentFile: FileStream | null = null;
    private buffer: Buffer[] = [];
    private readonly completeFiles: FileStream[] = [];
    private lastWriteCallback?: (error?: Error | null) => void | undefined;
    private nextFiles = defer<FileStream[] | null>();
    public getNextFileOrNull() {
        const currentPromise = this.nextFiles.promise;

        const lastWriteCallback = this.lastWriteCallback;

        this.lastWriteCallback = undefined;

        lastWriteCallback?.();

        return currentPromise;
    }
    public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.buffer.push(chunk);

        this.checkBuffer();
        this.resolveNextFilePromiseIfNeeded();

        if (this.completeFiles.length === 0) {
            callback();
        } else {
            this.lastWriteCallback = callback;
        }
    }
    public _final(callback: (error?: Error | null) => void): void {
        this.checkBuffer(true);
        this.resolveNextFilePromiseIfNeeded();
        this.nextFiles.resolve(null);

        if (this.buffer.length) {
            throw new Error('Unexpected data after end');
        }

        callback();
    }
    public on(event: 'close', listener: () => void): this;
    public on(event: 'drain', listener: () => void): this;
    public on(event: 'error', listener: (err: Error) => void): this;
    public on(event: 'finish', listener: () => void): this;
    public on(event: 'pipe', listener: (src: internal.Readable) => void): this;
    public on(event: 'unpipe', listener: (src: internal.Readable) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;
    public on(event: any, listener: any): this {
        return super.on(event, listener);
    }
    private resolveNextFilePromiseIfNeeded() {
        if (this.completeFiles.length > 0) {
            this.nextFiles.resolve([...this.completeFiles]);
            this.nextFiles = defer<FileStream[] | null>();
            this.completeFiles.length = 0;
        }
    }
    private checkBuffer(final = false) {
        const buffer = Buffer.concat(this.buffer);
        const magicIndex = buffer.indexOf(MAGIC_BYTES);

        if (magicIndex === -1) {
            if (this.currentFile && buffer.byteLength > MAGIC_BYTES.byteLength) {
                this.currentFile.write(buffer.subarray(0, buffer.byteLength - MAGIC_BYTES.byteLength));
                const remainingDataWithPotentialMagicBytes = buffer.subarray(buffer.byteLength - MAGIC_BYTES.byteLength);
                this.buffer = [remainingDataWithPotentialMagicBytes];
            }

            if (final) {
                const buffer = Buffer.concat(this.buffer);

                if (this.currentFile) {
                    if (buffer.byteLength > 0) {
                        this.currentFile.write(buffer);
                    }

                    this.buffer = [];
                    this.currentFile.end();
                } else if (buffer.byteLength > 0) {
                    throw new Error('No current file but have more data');
                }
            }

            return;
        }

        const bytesBeforeMagic = buffer.subarray(0, magicIndex);
        let currentFile = this.currentFile;

        if (currentFile) {
            currentFile.write(bytesBeforeMagic);
        } else if (bytesBeforeMagic.byteLength > 0) {
            throw new Error('Unexpected data before magic bytes');
        }

        // Checkpoint at the magic bytes
        this.buffer = [buffer.subarray(magicIndex)];

        const bytesAfterMagic = buffer.subarray(magicIndex + MAGIC_BYTES.byteLength);
        const fileNameBytes = bytesAfterMagic.subarray(0, FILE_NAME_LENGTH_BYTES);

        if (fileNameBytes.byteLength < FILE_NAME_LENGTH_BYTES) {
            return;
        }

        const fileNameByteLength = fileNameBytes.readUInt32BE(0);
        const fileNameBuffer = bytesAfterMagic.subarray(FILE_NAME_LENGTH_BYTES, FILE_NAME_LENGTH_BYTES + fileNameByteLength);

        if (fileNameBuffer.byteLength < fileNameByteLength) {
            return;
        }

        const fileName = fileNameBuffer.toString('utf-8');

        currentFile?.end();

        this.currentFile = currentFile = new FileStream(fileName);
        this.completeFiles.push(currentFile);

        const bytesAfterFileName = bytesAfterMagic.subarray(FILE_NAME_LENGTH_BYTES + fileNameByteLength);

        if (bytesAfterFileName.byteLength > 0) {
            // Checkpoint at the end of the file name
            this.buffer = [bytesAfterFileName];

            this.checkBuffer();
        }
    }
}