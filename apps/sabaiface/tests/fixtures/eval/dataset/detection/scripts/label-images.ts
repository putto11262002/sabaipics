#!/usr/bin/env node
import readline from 'readline';
import { readFileSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const LABELS_FILE = './tests/fixtures/images/labels.json';
const IMAGES_DIR = './tests/fixtures/images';

interface Label {
  image: string;
  faceCount: number;
}

// Read labels
const labels: Label[] = JSON.parse(readFileSync(LABELS_FILE, 'utf-8'));

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

async function openImage(imagePath: string) {
  const fullPath = `${IMAGES_DIR}/${imagePath.split('/').pop()}`;
  // Open with default image viewer (macOS)
  try {
    await execAsync(`open "${fullPath}"`);
  } catch (e) {
    console.log(`Could not open image automatically. Please open: ${fullPath}`);
  }
}

async function main() {
  console.log('\n=== Image Face Labeling Tool ===\n');
  console.log(`Total images: ${labels.length}\n`);
  
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const imageName = label.image.split('/').pop() || '';
    
    console.log(`[${i + 1}/${labels.length}] ${imageName}`);
    console.log(`Current faceCount: ${label.faceCount}`);
    
    const answer = await question('Enter face count (or press Enter to keep, q to quit): ');
    
    if (answer === 'q' || answer === 'Q') {
      break;
    }
    
    if (answer.trim() !== '' && !isNaN(parseInt(answer))) {
      label.faceCount = parseInt(answer);
    }
    
    // Open next image
    if (i < labels.length - 1) {
      const nextImage = labels[i + 1].image.split('/').pop() || '';
      await openImage(nextImage);
    }
    
    console.log('---\n');
  }
  
  // Save updated labels
  writeFileSync(LABELS_FILE, JSON.stringify(labels, null, 2));
  console.log('\n✓ Labels saved!\n');
  
  rl.close();
}

main().catch(console.error);
