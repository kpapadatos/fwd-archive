import { Duplex } from 'stream';

export class FileStream extends Duplex {
    private static readonly MAX_BUFFER_SIZE = 1024 * 1024;
    private readonly buffer: Buffer[] = [];
    public constructor(public readonly fileName: string) {
        super();
    }
    public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.buffer.push(chunk);

        callback();
    }
    public _read(size: number) {
        const buffer = this.buffer.shift();

        if (buffer) {
            this.push(buffer);
        }
    }
    public end() {
        for (const buffer of this.buffer) {
            this.push(buffer);
        }

        this.push(null);

        return this;
    }
    public getBuffer() {
        return Buffer.concat(this.buffer);
    }
}
