// Deletes the saved data so the next start creates fresh demo data.
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'db.json');
fs.rmSync(file, { force: true });
console.log(`Removed ${path.relative(process.cwd(), file)}. Fresh demo data will be created on the next start.`);
