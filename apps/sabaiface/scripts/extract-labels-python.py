#!/usr/bin/env python3
"""
Extract face detection labels from Kaggle dataset.

Parses ground.npy files from each person folder to create
face detection test labels.

Usage:
  cd apps/sabaiface
  python3 scripts/extract-labels-python.py
"""

import os
import sys
import json
import numpy as np

# Paths
DATASET_PATH = os.path.abspath('../../../dataset')
OUTPUT_PATH = 'tests/fixtures/eval/dataset/detection/kaggle-labels.json'

def main():
    print('╔══════════════════════════════════════════════════════════════════════════════╗')
    print('║           Extract Face Detection Labels from Kaggle Dataset                     ║')
    print('╚══════════════════════════════════════════════════════════════════════════════╝')

    # Check dataset exists
    if not os.path.exists(DATASET_PATH):
        print(f'\n❌ Dataset not found at: {DATASET_PATH}')
        print('   Make sure the symlink ./dataset points to the Kaggle dataset')
        sys.exit(1)

    print(f'\nDataset path: {DATASET_PATH}\n')

    # Get all person folders
    person_folders = [
        os.path.join(DATASET_PATH, d)
        for d in sorted(os.listdir(DATASET_PATH))
        if d.isdigit() and os.path.isdir(os.path.join(DATASET_PATH, d))
    ]

    print(f'Found {len(person_folders)} person folders\n')

    labels = []

    # Process each person folder
    for i, person_path in enumerate(person_folders, 1):
        person_folder = os.path.basename(person_path)
        ground_file = os.path.join(person_path, 'ground.npy')

        if not os.path.exists(ground_file):
            print(f"  [{i}/{len(person_folders)}] {person_folder}: No ground.npy, skipping")
            continue

        # Load ground truth
        try:
            ground = np.load(ground_file, allow_pickle=True)

            # Count faces per image
            image_counts = {}
            for face_id, person_id in ground:
                # Parse face_id: "IMAGE_NAME_FACE_INDEX"
                parts = face_id.rsplit('_', 1)
                if len(parts) == 2:
                    image_name = parts[0]
                    image_counts[image_name] = image_counts.get(image_name, 0) + 1

            # Create labels for this person
            for image_name, count in sorted(image_counts.items()):
                category = 'single' if count == 1 else ('multiple' if count <= 10 else 'crowd')

                labels.append({
                    'image': f'{image_name}.jpg',
                    'faceCount': count,
                    'category': category,
                    'source': person_folder,
                    'notes': f'Kaggle dataset - person {person_folder}'
                })

            print(f"  [{i}/{len(person_folders)}] {person_folder}: {len(image_counts)} images")

        except Exception as e:
            print(f"  [{i}/{len(person_folders)}] {person_folder}: Error - {e}")
            continue

    # Sort by image name
    labels.sort(key=lambda x: x['image'])

    # Output
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(labels, f, indent=2)

    # Summary
    print(f'\n{"=" * 80}')
    print(f'✅ Extracted {len(labels)} image labels')
    print(f'   Single:   {sum(1 for l in labels if l["category"] == "single")}')
    print(f'   Multiple: {sum(1 for l in labels if l["category"] == "multiple")}')
    print(f'   Crowd:    {sum(1 for l in labels if l["category"] == "crowd")}')
    print(f'\n   Output: {OUTPUT_PATH}\n')

if __name__ == '__main__':
    main()
