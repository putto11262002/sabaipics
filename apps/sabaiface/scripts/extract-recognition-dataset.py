#!/usr/bin/env python3
"""
Extract Recognition Dataset from Kaggle.

Recognition testing strategy:
- Index: Group photos (full images containing multiple people)
- Query: Individual faces (to search against indexed photos)
- Expected: Query face finds all index images containing that person

Key: Index images are deduplicated (one image may contain multiple selected people)

Usage:
  cd apps/sabaiface
  python3 scripts/extract-recognition-dataset.py

Output:
  tests/fixtures/eval/dataset/recognition/ground-truth.json
"""

import os
import sys
import json
import random
import argparse
from collections import defaultdict
from pathlib import Path

# ========== CONFIGURATION ==========
# Default: 10 people, 10 images per person, 80% index / 20% query
DEFAULT_NUM_PEOPLE = 10
DEFAULT_IMAGES_PER_PERSON = 10
DEFAULT_INDEX_RATIO = 0.8

# Paths
OUTPUT_DIR = os.path.abspath('tests/fixtures/eval/dataset/recognition')
OUTPUT_FILE = os.path.join(OUTPUT_DIR, 'ground-truth.local.json')


def parse_ground_truth(dataset_path):
    """
    Parse ground.npy files to build:
    - person_id → dict of {image_name: full_image_path}
    - image_name → dict of {full_path: set of person_ids}

    Args:
        dataset_path: Absolute path to Kaggle dataset root
    """
    print(f'📂 Parsing ground truth files from: {dataset_path}')

    person_to_images = defaultdict(dict)  # person_id → {image_name: full_path}
    image_to_people = defaultdict(lambda: defaultdict(set))  # image_name → {full_path: set of person_ids}

    for person_folder in sorted(os.listdir(dataset_path)):
        person_path = os.path.join(dataset_path, person_folder)
        if not os.path.isdir(person_path):
            continue

        ground_file = os.path.join(person_path, 'ground.npy')
        if not os.path.exists(ground_file):
            continue

        try:
            import numpy as np
            ground = np.load(ground_file, allow_pickle=True)

            for face_id, person_id in ground:
                # Convert person_id to int (numpy stores as string)
                person_id = int(person_id)

                if person_id == -1:
                    continue  # Skip unknown faces

                # face_id format: "IMAGE_NAME_FACE_INDEX"
                # Extract image name (part before last underscore)
                image_name = face_id.rsplit('_', 1)[0]

                # Find the actual image file (try .jpg extension)
                image_path = os.path.join(person_path, f'{image_name}.jpg')

                if os.path.exists(image_path):
                    person_to_images[person_id][image_name] = image_path
                    image_to_people[image_name][image_path].add(person_id)

        except Exception as e:
            print(f'  ⚠️  Error loading {person_folder}: {e}')
            continue

    total_people = len(person_to_images)
    total_images = len(image_to_people)
    total_face_instances = sum(len(imgs) for imgs in person_to_images.values())

    print(f'  Found {total_people} people')
    print(f'  Found {total_images} images')
    print(f'  Total face instances: {total_face_instances}\n')

    return person_to_images, image_to_people


def select_people(person_to_images, num_people, min_images):
    """
    Select people with at least min_images.

    Args:
        person_to_images: {person_id: {image_name: full_path}}

    Returns:
        {person_id: {image_name: full_path}}
    """
    print(f'👥 Selecting {num_people} people with {min_images}+ images each...')

    # Filter people with enough images
    qualified = {
        pid: dict(images) for pid, images in person_to_images.items()
        if len(images) >= min_images
    }

    if len(qualified) < num_people:
        print(f'  ❌ Not enough people! Only {len(qualified)} have {min_images}+ images')
        counts = sorted([len(imgs) for imgs in person_to_images.values()], reverse=True)
        print(f'  Max: {counts[0] if counts else 0}, Median: {counts[len(counts)//2] if counts else 0}')
        sys.exit(1)

    # Select people with most images
    sorted_people = sorted(qualified.items(), key=lambda x: len(x[1]), reverse=True)
    selected = dict(sorted_people[:num_people])

    print(f'  ✅ Selected {len(selected)} people:')
    for pid, images in sorted(selected.items(), key=lambda x: x[0]):
        print(f'      Person {pid}: {len(images)} images')

    print()

    return selected


def create_splits(selected_people, image_to_people, images_per_person, index_ratio):
    """
    Create recognition dataset with full paths:
    - indexSet: list of {name, path} objects (deduplicated)
    - identities: query images + which index images contain that person (with paths)

    Args:
        selected_people: {person_id: {image_name: full_path}}
        image_to_people: {image_name: {full_path: set of person_ids}}
    """
    print(f'✂️  Creating splits: {int(index_ratio*100)}% index, {int((1-index_ratio)*100)}% query')

    index_size = int(images_per_person * index_ratio)
    query_size = images_per_person - index_size

    # Track all data with full paths
    all_index_images = {}  # image_name -> full_path (deduplicated)
    identities = {}

    for person_id, name_to_path in selected_people.items():
        # Get image names and paths
        image_names = list(name_to_path.keys())

        # Randomly sample and split
        sampled = random.sample(image_names, min(images_per_person, len(image_names)))
        random.shuffle(sampled)

        person_index_names = set(sampled[:index_size])
        person_query_names = sampled[index_size:index_size + query_size]

        # Add to global index set (deduplicated)
        for name in person_index_names:
            all_index_images[name] = name_to_path[name]

        # Store person data with both names and paths
        identities[str(person_id)] = {
            'personId': int(person_id),
            'name': f'Person {person_id}',
            'totalImages': len(name_to_path),
            'selectedImages': images_per_person,
            'indexImageCount': len(person_index_names),
            'queryImageCount': len(person_query_names),
            'indexImages': sorted(person_index_names),
            'indexImagePaths': [name_to_path[name] for name in sorted(person_index_names)],
            'queryImages': person_query_names,
            'queryImagePaths': [name_to_path[name] for name in person_query_names]
        }

    # Convert index set to sorted list of {name, path} objects
    index_set = [{'name': name, 'path': path} for name, path in sorted(all_index_images.items())]

    # For each person, find which index images contain them
    for person_id, person_data in identities.items():
        pid = int(person_id)

        # Find which global index images contain this person
        contained_in = []
        contained_in_paths = []

        for img_obj in index_set:
            image_name = img_obj['name']
            # Check if this person is in this image
            if image_name in image_to_people:
                for img_path, people in image_to_people[image_name].items():
                    if pid in people:
                        contained_in.append(image_name)
                        contained_in_paths.append(img_path)
                        break

        person_data['containedInIndexImages'] = contained_in
        person_data['containedInIndexPaths'] = contained_in_paths

    dataset = {
        'metadata': {
            'datasetPath': 'N/A',  # Will be set by main()
            'generatedAt': None,  # Will be set by main()
            'numPeople': len(identities),
            'imagesPerPerson': images_per_person,
            'indexSize': index_size,
            'querySize': query_size,
            'indexRatio': index_ratio,
            'totalUniqueIndexImages': len(index_set),
            'totalQueryImages': len(identities) * query_size
        },
        'indexSet': index_set,
        'identities': identities
    }

    print(f'  ✅ Index set: {len(index_set)} unique images')
    print(f'  ✅ Query set: {len(identities) * query_size} images\n')

    # Show deduplication stats
    total_raw_index = sum(p['indexImageCount'] for p in identities.values())
    dedup_count = total_raw_index - len(index_set)
    print(f'  📊 Deduplication: {dedup_count} duplicate images removed')
    print(f'     (Raw: {total_raw_index}, Unique: {len(index_set)})\n')

    return dataset


def save_dataset(dataset, dataset_path):
    """
    Save the dataset to JSON.

    Args:
        dataset: The dataset object
        dataset_path: Original dataset path (for metadata)
    """
    from datetime import datetime

    # Add metadata
    dataset['metadata']['datasetPath'] = dataset_path
    dataset['metadata']['generatedAt'] = datetime.utcnow().isoformat() + 'Z'

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(dataset, f, indent=2)

    print('📝 Dataset saved!')
    print(f'   Location: {OUTPUT_FILE}')
    print()
    print('📊 Summary:')
    print(f'   Dataset path:        {dataset_path}')
    print(f'   People:              {dataset["metadata"]["numPeople"]}')
    print(f'   Images per person:   {dataset["metadata"]["imagesPerPerson"]}')
    print(f'   Index images:        {dataset["metadata"]["indexSize"]} /person')
    print(f'   Query images:        {dataset["metadata"]["querySize"]} /person')
    print(f'   Total unique index:  {dataset["metadata"]["totalUniqueIndexImages"]} images')
    print(f'   Total query:         {dataset["metadata"]["totalQueryImages"]} images')
    print()


def main():
    print('╔══════════════════════════════════════════════════════════════════════════════╗')
    print('║           Extract Recognition Dataset from Kaggle                             ║')
    print('╚══════════════════════════════════════════════════════════════════════════════╝')
    print()

    # Parse arguments
    parser = argparse.ArgumentParser(
        description='Extract recognition dataset from Kaggle with full paths',
        epilog='Example: python3 scripts/extract-recognition-dataset.py --dataset /path/to/kaggle'
    )
    parser.add_argument('--dataset', type=str,
                        help='Path to Kaggle dataset root (folder containing 10002/, 10003/, etc.)')
    parser.add_argument('--people', type=int, default=DEFAULT_NUM_PEOPLE,
                        help=f'Number of people (default: {DEFAULT_NUM_PEOPLE})')
    parser.add_argument('--images', type=int, default=DEFAULT_IMAGES_PER_PERSON,
                        help=f'Images per person (default: {DEFAULT_IMAGES_PER_PERSON})')
    parser.add_argument('--ratio', type=float, default=DEFAULT_INDEX_RATIO,
                        help=f'Index ratio 0-1 (default: {DEFAULT_INDEX_RATIO})')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed for reproducibility')

    args = parser.parse_args()

    # Get dataset path from arg, env var, or error
    dataset_path = args.dataset
    if not dataset_path:
        dataset_path = os.environ.get('SABAIFACE_DATASET_PATH')

    if not dataset_path:
        print('❌ Dataset path not specified!')
        print()
        print('Usage:')
        print('  1. Pass --dataset argument:')
        print('     python3 scripts/extract-recognition-dataset.py --dataset /path/to/kaggle')
        print()
        print('  2. Or set SABAIFACE_DATASET_PATH environment variable:')
        print('     export SABAIFACE_DATASET_PATH=/path/to/kaggle')
        print('     python3 scripts/extract-recognition-dataset.py')
        sys.exit(1)

    # Convert to absolute path
    dataset_path = os.path.abspath(dataset_path)

    # Check dataset exists
    if not os.path.exists(dataset_path):
        print(f'❌ Dataset not found at: {dataset_path}')
        sys.exit(1)

    # Validate
    if args.ratio <= 0 or args.ratio >= 1:
        print('❌ Ratio must be between 0 and 1')
        sys.exit(1)

    print(f'⚙️  Configuration:')
    print(f'   Dataset:          {dataset_path}')
    print(f'   People:           {args.people}')
    print(f'   Images per person: {args.images}')
    print(f'   Index ratio:      {args.ratio*100:.0f}%')
    print(f'   Random seed:      {args.seed}')
    print()

    # Set seed for reproducibility
    random.seed(args.seed)

    # Build dataset
    person_to_images, image_to_people = parse_ground_truth(dataset_path)
    selected = select_people(person_to_images, args.people, args.images)
    dataset = create_splits(selected, image_to_people, args.images, args.ratio)
    save_dataset(dataset, dataset_path)

    print('✅ Done! Next steps:')
    print('  Run tests with: pnpm test:recognition-eval')
    print('  Or: pnpm test:aws-vs-recognition')


if __name__ == '__main__':
    main()
