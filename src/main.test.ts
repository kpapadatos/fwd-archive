import { expect } from 'chai';
import { randomBytes, randomUUID } from 'crypto';
import { once } from 'stream';
import { pipeline } from 'stream/promises';
import { ArchiveWriter } from './classes/ArchiveWriter';
import { FileStream } from './classes/FileStream';
import { FILE_NAME_LENGTH_BYTES, MAGIC_BYTES } from './common/constants';
import { ArchiveReader } from './main';

describe('ArchiveWriter', () => {
    it('should use 32 magic bytes', () => expect(MAGIC_BYTES.byteLength).to.equal(32));
    it('should write file', async () => {
        const archive = new ArchiveWriter();
        let archiveFileBuffer = Buffer.alloc(0);

        archive.on('data', (chunk) => {
            archiveFileBuffer = Buffer.concat([archiveFileBuffer, chunk]);
        });

        const files = [makeRandomFile(), makeRandomFile(), makeRandomFile()];

        for (const { fileName, stream } of files) {
            archive.addFile(fileName);

            const pipe = pipeline(stream, archive, { end: false });

            await pipe;
        }

        archive.end();

        await once(archive, 'finish');

        expect(archiveFileBuffer.subarray(0, MAGIC_BYTES.byteLength)).to.deep.equal(MAGIC_BYTES);
        expect(archiveFileBuffer.byteLength).to.equal(files.reduce((acc, { archiveByteLength }) => acc + archiveByteLength, 0));
    });

    it('should read file', async () => {
        const archive = new ArchiveWriter();
        let archiveFileBuffer = Buffer.alloc(0);

        archive.on('data', (chunk) => {
            archiveFileBuffer = Buffer.concat([archiveFileBuffer, chunk]);
        });

        const files = [makeRandomFile(), makeRandomFile(), makeRandomFile()];

        for (const { fileName, stream } of files) {
            archive.addFile(fileName);

            const pipe = pipeline(stream, archive, { end: false });

            await pipe;
        }

        archive.end();

        await once(archive, 'finish');

        const reader = new ArchiveReader();
        const archiveFile = new FileStream('archive');

        archiveFile.write(archiveFileBuffer);
        archiveFile.end();

        expect(archiveFile.getBuffer()).to.deep.equal(archiveFileBuffer);

        const fileStreams: FileStream[] = [];

        reader.on('file', (fileStream) => {
            fileStreams.push(fileStream);
        });

        await pipeline(archiveFile, reader);

        expect(fileStreams.length).to.equal(files.length);

        for (const fileStream of fileStreams) {
            const file = files.find(({ fileName }) => fileName === fileStream.fileName);
            const fileStreamBuffer = fileStream.getBuffer();

            expect(file).to.exist;
            expect(fileStreamBuffer).to.deep.equal(file?.content);
        }
    });

    function makeRandomFile() {
        const fileName = randomUUID();
        const content = randomBytes(1024);
        const stream = new FileStream(fileName);

        let index = 0;

        while (index < content.byteLength) {
            const chunkSize = Math.min(100, content.byteLength - index);
            const chunk = content.subarray(index, index + chunkSize);

            stream.write(chunk);

            index += chunkSize;
        }

        stream.end();

        return {
            fileName,
            content,
            stream,
            archiveByteLength: MAGIC_BYTES.byteLength + FILE_NAME_LENGTH_BYTES + Buffer.from(fileName, 'utf-8').byteLength + content.byteLength
        };
    }
});
