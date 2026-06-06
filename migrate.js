import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const tripData = JSON.parse(fs.readFileSync('./src/tripsData.json', 'utf8'));

async function uploadFile(filePath) {
  // filePath like "/photos/1南宁起点/IMG_5427.jpg"
  // Needs to be URI decoded to read the correct file path locally
  const decodedPath = decodeURIComponent(filePath);
  const localPath = path.join('./public', decodedPath);
  
  if (!fs.existsSync(localPath)) {
    console.warn('File not found:', localPath);
    return null;
  }
  
  const fileContent = fs.readFileSync(localPath);
  // remove leading slash
  const storagePath = decodedPath.startsWith('/') ? decodedPath.substring(1) : decodedPath;
  
  const { data, error } = await supabase.storage.from('memories').upload(storagePath, fileContent, {
    upsert: true,
    contentType: 'image/jpeg'
  });
  
  if (error) {
    console.error('Error uploading', decodedPath, error);
    return null;
  }
  
  const { data: publicUrlData } = supabase.storage.from('memories').getPublicUrl(storagePath);
  return publicUrlData.publicUrl;
}

async function migrate() {
  console.log('Starting migration...');
  const stations = tripData[0].stations;
  for (const trip of stations) {
    console.log(`Migrating trip: ${trip.name}`);
    
    const newPhotos = [];
    for (const photoPath of trip.photos) {
      const publicUrl = await uploadFile(photoPath);
      if (publicUrl) {
        newPhotos.push(publicUrl);
      }
    }
    
    const { error } = await supabase.from('trips').upsert({
      id: trip.id,
      name: trip.name,
      folder_name: trip.folderName,
      lng: trip.coordinates[0],
      lat: trip.coordinates[1],
      photos: newPhotos
    });
    
    if (error) {
      console.error('Error inserting trip', trip.name, error);
    } else {
      console.log(`Inserted trip ${trip.name}`);
    }
  }
  console.log('Migration complete!');
}

migrate();
