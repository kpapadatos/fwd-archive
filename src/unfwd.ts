import { log } from 'console';
import { createReadStream, createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { ArchiveReader } from './main';

const inputFile = process.argv[2];
const destDir = process.argv[3];
const reader = new ArchiveReader();

mkdirSync(destDir, { recursive: true });

pipeline(createReadStream(inputFile), reader, { end: true })
    .then(() => log('done reading archive'));

reader.on('file', file => {
    log(`writing ${file.fileName}...`);

    const destFile = `${destDir}/${file.fileName}`;

    pipeline(file, createWriteStream(destFile))
        .then(() => log(`done writing ${destFile}`));
});