import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pndikgqbgchzkrmlrmzo.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuZGlrZ3FiZ2NoemtybWxybXpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTY2MTgwNSwiZXhwIjoyMTA1MjM3ODA1fQ.zPBOv5Hxloq21DhIT1Xq1CVNKT_OQArNHmA8dMz-eV4';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function cleanBucket(bucketName) {
  console.log(`Checking bucket: ${bucketName}...`);
  
  // Recursively list all files
  async function listAllFiles(folder = '') {
    const { data, error } = await supabase.storage.from(bucketName).list(folder, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });
    
    if (error) {
      console.error(`Error listing folder ${folder} in ${bucketName}:`, error);
      return [];
    }
    
    let files = [];
    for (const item of data) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name;
      if (item.id === null) {
        // It's a folder
        const subFiles = await listAllFiles(fullPath);
        files = files.concat(subFiles);
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allFiles = await listAllFiles();
  console.log(`Found ${allFiles.length} files in ${bucketName}.`);

  if (allFiles.length > 0) {
    // Delete in chunks of 50
    for (let i = 0; i < allFiles.length; i += 50) {
      const chunk = allFiles.slice(i, i + 50);
      const { data, error } = await supabase.storage.from(bucketName).remove(chunk);
      if (error) {
        console.error(`Error removing files from ${bucketName}:`, error);
      } else {
        console.log(`Deleted ${chunk.length} files from ${bucketName}.`);
      }
    }
  }
}

async function main() {
  console.log('Starting Supabase Storage cleanup...');
  await cleanBucket('shop-photos');
  await cleanBucket('shop-documents');
  await cleanBucket('payment-proofs');
  await cleanBucket('prescriptions');
  console.log('Storage cleanup complete.');
}

main().catch((err) => {
  console.error('Fatal error during storage cleanup:', err);
  process.exit(1);
});
