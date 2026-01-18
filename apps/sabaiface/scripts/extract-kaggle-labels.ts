#!/usr/bin/env tsx
/**
 * Extract Face Detection Labels from Kaggle Dataset
 *
 * Parses ground.npy files to create detection test labels.
 *
 * Usage:
 *   pnpm eval:extract-kaggle-labels
 *
 * Source: Kaggle Face Recognition Dataset
 */

import fs from 'fs';
import path from 'path';

const DATASET_PATH = path.join(process.cwd(), '../dataset');
const OUTPUT_PATH = path.join(process.cwd(), 'tests/fixtures/eval/dataset/detection/kaggle-labels.json');

interface GroundEntry {
  faceId: string;
  personId: number;
}

interface DetectionLabel {
  image: string;
  faceCount: number;
  category: 'single' | 'multiple' | 'crowd';
  source: string; // which person folder
  notes: string;
}

/**
 * Parse face_id to extract image name
 * Format: "IMAGE_NAME_FACE_INDEX" (e.g., "GE3A1048_0")
 */
function parseFaceId(faceId: string): { imageName: string; faceIndex: number } {
  const lastUnderscore = faceId.lastIndexOf('_');
  const imageName = faceId.substring(0, lastUnderscore);
  const faceIndex = parseInt(faceId.substring(lastUnderscore + 1));
  return { imageName, faceIndex };
}

/**
 * Load and parse ground.npy file
 * Note: This is a simplified version - actual .npy parsing requires special handling
 */
function loadGroundNpy(personPath: string): GroundEntry[] {
  const groundFile = path.join(personPath, 'ground.npy');

  if (!fs.existsSync(groundFile)) {
    console.error(`  ✗ ground.npy not found for ${personPath}`);
    return [];
  }

  // For now, we'll need to use a Python script to parse .npy files
  // This is a placeholder that shows the logic
  console.error(`  ⚠️  .npy parsing requires Python - use extract-labels-python.py`);

  return [];
}

/**
 * Categorize by face count
 */
function categorizeFaceCount(count: number): 'single' | 'multiple' | 'crowd' {
  if (count === 1) return 'single';
  if (count <= 10) return 'multiple';
  return 'crowd';
}

/**
 * Main extraction function
 */
async function extractLabels(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           Extract Face Detection Labels from Kaggle Dataset                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Check dataset exists
  if (!fs.existsSync(DATASET_PATH)) {
    console.error('\n❌ Dataset not found at:', DATASET_PATH);
    console.error('   Make sure the symlink ./dataset points to the Kaggle dataset');
    process.exit(1);
  }

  console.log(`\nDataset path: ${DATASET_PATH}`);

  // Get all person folders
  const personFolders = fs.readdirSync(DATASET_PATH)
    .filter(name => name.match(/^\d+$/))
    .map(name => path.join(DATASET_PATH, name))
    .filter(p => fs.statSync(p).isDirectory());

  console.log(`Found ${personFolders.length} person folders\n`);

  // For now, we need to use Python to parse .npy files
  console.log('⚠️  NumPy .npy parsing requires Python');
  console.log('📝 Creating Python script to extract labels...\n');

  const pythonScript = `#!/usr/bin/env python3
"""
Extract face detection labels from Kaggle dataset.
"""
import os
import sys
import numpy as np
import json

dataset_path = os.path.abspath('../dataset')
output_path = 'tests/fixtures/eval/dataset/detection/kaggle-labels.json'

labels = []

for person_folder in sorted(os.listdir(dataset_path)):
    person_path = os.path.join(dataset_path, person_folder)
    if not os.path.isdir(person_path):
        continue

    ground_file = os.path.join(person_path, 'ground.npy')
    if not os.path.exists(ground_file):
        continue

    # Load ground truth
    ground = np.load(ground_file, allow_pickle=True)

    # Count faces per image
    image_counts = {}
    for face_id, person_id in ground:
        # Parse face_id: "IMAGE_NAME_FACE_INDEX"
        parts = face_id.rsplit('_', 1)
        if len(parts) == 2:
            image_name = parts[0]
            image_counts[image_name] = image_counts.get(image_name, 0) + 1

    # Create labels
    for image_name, count in sorted(image_counts.items()):
        category = 'single' if count == 1 else ('multiple' if count <= 10 else 'crowd')
        labels.append({
            'image': image_name,
            'faceCount': count,
            'category': category,
            'source': person_folder,
            'notes': f'Kaggle dataset - person {person_folder}'
        })

# Sort by image name
labels.sort(key=lambda x: x['image'])

# Output
with open(output_path, 'w') as f:
    json.dump(labels, f, indent=2)

print(f'✅ Extracted {len(labels)} image labels')
print(f'   Single: {sum(1 for l in labels if l["category"] == "single")}')
print(f'   Multiple: {sum(1 for l in labels if l["category"] == "multiple")}')
print(f'   Crowd: {sum(1 for l in labels if l["category"] == "crowd")}')
print(f'   Output: {output_path}')
`;

  const scriptPath = path.join(process.cwd(), 'scripts/extract-labels-python.py');
  fs.writeFileSync(scriptPath, pythonScript);

  console.log(`\n📝 Python script created: ${scriptPath}`);
  console.log(`\nNext steps:`);
  console.log(`   1. cd ${path.dirname(scriptPath)}`);
  console.log(`   2. python3 extract-labels-python.py`);
  console.log(`   3. Labels will be saved to: kaggle-labels.json\n`);
}

extractLabels().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
