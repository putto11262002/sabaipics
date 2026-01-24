#!/usr/bin/env python3
"""
Generate face recognition evaluation dataset from Kaggle dataset.

Strategy:
1. Select top N people with most images across all events
2. Crop all faces with padding from original images
3. Run face detection on crops to evaluate quality
4. Keep top K quality selfies per person for query set
5. Remaining images go to index (full group photos)
6. Generate index.json with complete ground truth

Usage:
    python generate-eval-dataset.py --dataset /path/to/kaggle/dataset --output /path/to/output

    # With optional parameters:
    python generate-eval-dataset.py \
        --dataset /path/to/kaggle/dataset \
        --output /path/to/output \
        --num-people 100 \
        --selfies-per-person 5 \
        --min-images 20 \
        --padding-ratio 0.5
"""

import argparse
import json
import os
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Face detection for quality scoring (initialized lazily)
face_cascade = None


def init_face_detector():
    """Initialize OpenCV face detector for quality scoring."""
    global face_cascade
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)


def calculate_sharpness(image):
    """Calculate image sharpness using Laplacian variance."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def score_selfie_quality(image_bgr):
    """
    Score a face crop for quality.
    Returns (score, details) where higher is better.
    """
    if image_bgr is None or image_bgr.size == 0:
        return 0, {"error": "invalid image"}

    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Detect face
    faces = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(30, 30))

    if len(faces) == 0:
        # No face detected - low score but not zero
        return 10, {"face_detected": False, "size": w * h}

    # Get largest face
    largest_face = max(faces, key=lambda f: f[2] * f[3])
    fx, fy, fw, fh = largest_face

    # Score components
    face_size = fw * fh
    face_ratio = face_size / (w * h)  # How much of crop is face
    sharpness = calculate_sharpness(image_bgr)

    # Composite score
    score = (
        face_size * 0.001  # Larger face = better
        + face_ratio * 100  # Face fills frame = better
        + min(sharpness, 500)  # Sharper = better (capped)
    )

    return score, {
        "face_detected": True,
        "face_size": face_size,
        "face_ratio": face_ratio,
        "sharpness": sharpness,
    }


def load_all_data(dataset_root: str):
    """Load data from all event folders in the dataset."""
    print("Loading data from all event folders...")

    all_people = defaultdict(
        lambda: {
            "folder": None,
            "faces": [],  # List of {npz_index, face_id, image_name, score}
            "images": set(),
        }
    )

    folder_data = {}  # folder -> npz data

    for folder in sorted(os.listdir(dataset_root)):
        folder_path = os.path.join(dataset_root, folder)
        if not os.path.isdir(folder_path):
            continue

        npz_path = os.path.join(folder_path, "output.npz")
        ground_path = os.path.join(folder_path, "ground.npy")

        if not os.path.exists(npz_path) or not os.path.exists(ground_path):
            continue

        print(f"  Loading {folder}...")

        npz = np.load(npz_path, allow_pickle=True)
        ground = np.load(ground_path, allow_pickle=True)

        folder_data[folder] = npz

        # Build faceid -> person mapping
        faceid_to_person = {}
        for entry in ground:
            face_id, person_id = entry[0], entry[1]
            try:
                person_int = int(person_id)
            except:
                person_int = -1
            faceid_to_person[face_id] = person_int

        # Process faces
        for idx, face_id in enumerate(npz["data_faceid"]):
            face_id = str(face_id)
            person_id = faceid_to_person.get(face_id, -1)
            if person_id == -1:
                continue

            image_name = face_id.rsplit("_", 1)[0]
            key = f"{folder}_{person_id}"

            all_people[key]["folder"] = folder
            all_people[key]["faces"].append(
                {
                    "npz_index": idx,
                    "face_id": face_id,
                    "image_name": image_name,
                    "score": float(npz["data_face_score"][idx]),
                }
            )
            all_people[key]["images"].add(image_name)

    return all_people, folder_data


def select_people(all_people, num_people, min_images):
    """Select top N people with most images."""
    print(f"\nSelecting top {num_people} people with {min_images}+ images...")

    candidates = []
    for key, data in all_people.items():
        if len(data["images"]) >= min_images:
            candidates.append(
                {
                    "key": key,
                    "folder": data["folder"],
                    "num_images": len(data["images"]),
                    "num_faces": len(data["faces"]),
                }
            )

    candidates.sort(key=lambda x: -x["num_images"])
    selected = candidates[:num_people]

    print(f"  Found {len(candidates)} qualified, selected {len(selected)}")
    for c in selected[:10]:
        print(f"    {c['key']}: {c['num_images']} images")
    if len(selected) > 10:
        print(f"    ... and {len(selected) - 10} more")

    return [c["key"] for c in selected]


def add_border_padding(image_bgr, padding_pixels=20, color=(128, 128, 128)):
    """Add border padding to an image."""
    return cv2.copyMakeBorder(
        image_bgr,
        padding_pixels,
        padding_pixels,
        padding_pixels,
        padding_pixels,
        cv2.BORDER_CONSTANT,
        value=color,
    )


def match_and_crop_face(face_crop_bgr, original, faces_detected, padding_ratio):
    """Match the face crop to detected faces and return padded crop."""
    orig_h, orig_w = original.shape[:2]

    # Prepare crop histogram for matching
    crop_gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY)
    crop_hist = cv2.calcHist([crop_gray], [0], None, [64], [0, 256])
    cv2.normalize(crop_hist, crop_hist)

    best_face = None
    best_score = -1

    for x, y, w, h in faces_detected:
        # Bounds check
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(orig_w, x + w), min(orig_h, y + h)
        if x2 <= x1 or y2 <= y1:
            continue

        face_region = original[y1:y2, x1:x2]
        if face_region.size == 0:
            continue

        face_gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
        face_resized = cv2.resize(face_gray, (160, 160))
        face_hist = cv2.calcHist([face_resized], [0], None, [64], [0, 256])
        cv2.normalize(face_hist, face_hist)

        score = cv2.compareHist(crop_hist, face_hist, cv2.HISTCMP_CORREL)

        if score > best_score:
            best_score = score
            best_face = (x, y, w, h)

    if best_face is None or best_score < 0.3:
        return None

    x, y, w, h = best_face

    # Add padding
    pad_w = int(w * padding_ratio)
    pad_h = int(h * padding_ratio)

    x1 = max(0, x - pad_w)
    y1 = max(0, y - pad_h)
    x2 = min(orig_w, x + w + pad_w)
    y2 = min(orig_h, y + h + pad_h)

    return original[y1:y2, x1:x2]


def process_person(person_key, person_data, folder_data, dataset_root, padding_ratio):
    """
    Process a single person:
    1. Get pre-cropped faces from npz
    2. Find face in original image and re-crop with padding for more context
    3. Score each crop for quality
    4. Return scored crops and image list
    """
    folder = person_data["folder"]
    npz = folder_data[folder]

    scored_crops = []

    # Cache: image_name -> (original_bgr, detected_faces)
    image_cache = {}

    for face in person_data["faces"]:
        # Get original face crop from npz (160x160)
        face_img_bgr = npz["data_face_img"][face["npz_index"]]
        image_name = face["image_name"]

        # Check cache first
        if image_name not in image_cache:
            original_image_path = os.path.join(
                dataset_root, folder, f"{image_name}.jpg"
            )
            if os.path.exists(original_image_path):
                original = cv2.imread(original_image_path)
                if original is not None:
                    # Downscale for faster face detection
                    h, w = original.shape[:2]
                    scale = min(1.0, 1200 / max(h, w))
                    if scale < 1.0:
                        small = cv2.resize(original, None, fx=scale, fy=scale)
                    else:
                        small = original
                    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                    faces_detected = face_cascade.detectMultiScale(
                        gray, 1.1, 4, minSize=(20, 20)
                    )
                    # Scale back to original coordinates
                    faces_detected = [
                        (
                            int(x / scale),
                            int(y / scale),
                            int(fw / scale),
                            int(fh / scale),
                        )
                        for (x, y, fw, fh) in faces_detected
                    ]
                    image_cache[image_name] = (original, faces_detected)
                else:
                    image_cache[image_name] = (None, [])
            else:
                image_cache[image_name] = (None, [])

        original, faces_detected = image_cache[image_name]

        padded_crop = None
        if original is not None and len(faces_detected) > 0:
            padded_crop = match_and_crop_face(
                face_img_bgr, original, faces_detected, padding_ratio
            )

        # Fallback to gray border if detection fails
        if padded_crop is None:
            padded_crop = add_border_padding(face_img_bgr, padding_pixels=20)

        # Score quality
        quality_score, details = score_selfie_quality(padded_crop)

        scored_crops.append(
            {
                "face_id": face["face_id"],
                "image_name": face["image_name"],
                "crop": padded_crop,
                "quality_score": quality_score,
                "quality_details": details,
            }
        )

    return scored_crops


def generate_dataset(
    dataset_root: str,
    output_root: str,
    num_people: int = 100,
    selfies_per_person: int = 5,
    min_images_per_person: int = 20,
    padding_ratio: float = 0.5,
):
    """Main generation function."""
    print("=" * 60)
    print("Generating Face Recognition Evaluation Dataset")
    print("=" * 60)
    print(f"  Dataset: {dataset_root}")
    print(f"  Output:  {output_root}")
    print(f"  People:  {num_people}")
    print(f"  Selfies: {selfies_per_person}/person")
    print(f"  Min images: {min_images_per_person}")
    print(f"  Padding: {padding_ratio}")
    print("=" * 60)

    # Validate paths
    if not os.path.isdir(dataset_root):
        print(f"ERROR: Dataset path does not exist: {dataset_root}")
        sys.exit(1)

    # Initialize
    init_face_detector()

    # Load all data
    all_people, folder_data = load_all_data(dataset_root)

    if not all_people:
        print("ERROR: No valid event folders found in dataset")
        sys.exit(1)

    # Select people
    selected_keys = select_people(all_people, num_people, min_images_per_person)

    if not selected_keys:
        print(f"ERROR: No people found with {min_images_per_person}+ images")
        sys.exit(1)

    # Prepare output directories
    os.makedirs(output_root, exist_ok=True)
    selfies_dir = os.path.join(output_root, "selfies")
    index_dir = os.path.join(output_root, "index")

    if os.path.exists(selfies_dir):
        shutil.rmtree(selfies_dir)
    if os.path.exists(index_dir):
        shutil.rmtree(index_dir)

    os.makedirs(selfies_dir)
    os.makedirs(index_dir)

    # Process each person
    print(f"\nProcessing {len(selected_keys)} people...")

    index_json = {
        "description": "Face recognition evaluation dataset",
        "num_identities": len(selected_keys),
        "selfies_per_person": selfies_per_person,
        "index_images": [],
        "identities": {},
    }

    all_index_images = set()
    selfie_source_images = set()  # Images used for selfies - exclude from index

    for i, person_key in enumerate(selected_keys):
        person_data = all_people[person_key]
        folder = person_data["folder"]
        person_id = person_key.split("_", 1)[1]

        print(f"  [{i + 1}/{len(selected_keys)}] {person_key}...", end=" ", flush=True)

        # Process all crops and score them
        scored_crops = process_person(
            person_key, person_data, folder_data, dataset_root, padding_ratio
        )

        # Sort by quality (descending)
        scored_crops.sort(key=lambda x: -x["quality_score"])

        # Top N are selfies
        selfie_crops = scored_crops[:selfies_per_person]

        # Rest go to index (we'll copy the original images)
        index_crop_data = scored_crops[selfies_per_person:]

        # Track which images are used for selfies
        for crop in selfie_crops:
            selfie_source_images.add(f"{folder}_{crop['image_name']}")

        # Save selfies
        person_selfie_dir = os.path.join(selfies_dir, person_key)
        os.makedirs(person_selfie_dir, exist_ok=True)

        selfie_ids = []
        for crop in selfie_crops:
            # Convert BGR to RGB and save
            crop_rgb = cv2.cvtColor(crop["crop"], cv2.COLOR_BGR2RGB)
            img = Image.fromarray(crop_rgb)

            filename = f"{crop['face_id']}.jpg"
            filepath = os.path.join(person_selfie_dir, filename)
            img.save(filepath, "JPEG", quality=95)

            selfie_ids.append(crop["face_id"])

        # Track index images for this person (excluding selfie sources)
        person_index_images = []
        for crop in index_crop_data:
            img_key = f"{folder}_{crop['image_name']}"
            person_index_images.append(img_key)
            all_index_images.add((folder, crop["image_name"]))

        # Store in index.json
        index_json["identities"][person_key] = {
            "event": folder,
            "person_id": int(person_id) if person_id.isdigit() else person_id,
            "selfies": selfie_ids,
            "index_matches": person_index_images,
        }

        print(f"{len(selfie_ids)} selfies, {len(person_index_images)} index matches")

    # Copy index images
    print(f"\nCopying {len(all_index_images)} index images...")
    copied = 0
    for folder, image_name in all_index_images:
        src = os.path.join(dataset_root, folder, f"{image_name}.jpg")
        dst_name = f"{folder}_{image_name}.jpg"
        dst = os.path.join(index_dir, dst_name)

        if os.path.exists(src):
            shutil.copy2(src, dst)
            index_json["index_images"].append(f"{folder}_{image_name}")
            copied += 1

    print(f"  Copied {copied} images")

    # Sort index images for consistency
    index_json["index_images"].sort()
    index_json["num_index_images"] = len(index_json["index_images"])

    # Save index.json
    index_path = os.path.join(output_root, "index.json")
    with open(index_path, "w") as f:
        json.dump(index_json, f, indent=2)

    print(f"\nSaved index.json to {index_path}")

    # Summary
    print("\n" + "=" * 60)
    print("DATASET SUMMARY")
    print("=" * 60)
    print(f"Identities: {index_json['num_identities']}")
    print(f"Selfies per person: {selfies_per_person}")
    print(f"Total selfies: {index_json['num_identities'] * selfies_per_person}")
    print(f"Index images: {index_json['num_index_images']}")

    # Stats on index matches
    match_counts = [len(p["index_matches"]) for p in index_json["identities"].values()]
    print(
        f"Index matches per person: min={min(match_counts)}, max={max(match_counts)}, avg={sum(match_counts) / len(match_counts):.1f}"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Generate face recognition evaluation dataset from Kaggle dataset",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
    python generate-eval-dataset.py \\
        --dataset /path/to/kaggle/dataset \\
        --output /path/to/output

The Kaggle dataset should contain event folders, each with:
    - output.npz: Face embeddings and crops
    - ground.npy: Ground truth face-to-person mappings
    - *.jpg: Original images
        """,
    )

    parser.add_argument(
        "-d",
        "--dataset",
        required=True,
        help="Path to Kaggle dataset root (contains event folders)",
    )
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        help="Output directory for generated dataset",
    )
    parser.add_argument(
        "--num-people",
        type=int,
        default=100,
        help="Number of people to include (default: 100)",
    )
    parser.add_argument(
        "--selfies-per-person",
        type=int,
        default=5,
        help="Number of selfies per person (default: 5)",
    )
    parser.add_argument(
        "--min-images",
        type=int,
        default=20,
        help="Minimum images required per person (default: 20)",
    )
    parser.add_argument(
        "--padding-ratio",
        type=float,
        default=0.5,
        help="Padding ratio for face crops (default: 0.5 = 50%% on each side)",
    )

    args = parser.parse_args()

    generate_dataset(
        dataset_root=args.dataset,
        output_root=args.output,
        num_people=args.num_people,
        selfies_per_person=args.selfies_per_person,
        min_images_per_person=args.min_images,
        padding_ratio=args.padding_ratio,
    )


if __name__ == "__main__":
    main()
