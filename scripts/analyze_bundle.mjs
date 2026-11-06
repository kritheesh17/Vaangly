import { build } from 'vite';

let chunkModules = {};

await build({
  plugins: [{
    name: 'bundle-analyzer',
    generateBundle(options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && fileName.includes('index-')) {
          chunkModules[fileName] = Object.keys(chunk.modules).map(m => {
            const size = chunk.modules[m].renderedLength;
            return { id: m.replace(process.cwd().replace(/\\/g, '/'), ''), size };
          }).sort((a, b) => b.size - a.size);
        }
      }
    }
  }]
});

for (const [chunk, mods] of Object.entries(chunkModules)) {
  console.log(`\n=== Chunk: ${chunk} (${mods.length} modules) ===`);
  const top = mods.slice(0, 35);
  for (const m of top) {
    console.log(`${(m.size / 1024).toFixed(2).padStart(7)} kB  ${m.id}`);
  }
  const total = mods.reduce((acc, m) => acc + m.size, 0);
  console.log(`Total rendered: ${(total / 1024).toFixed(2)} kB`);
}
