# Test Images for Face Detection

This directory contains test images for face detection integration tests.

## Required Test Images

To run the full integration test suite, add the following test images:

### 1. `test-face-1.jpg`
- **Description:** Single clear face, frontal view
- **Purpose:** Basic face detection test
- **Requirements:**
  - One person's face
  - Clear, well-lit
  - Frontal view
  - Minimum 200x200 pixels

### 2. `test-faces-multiple.jpg`
- **Description:** Multiple faces in one image
- **Purpose:** Multi-face detection test
- **Requirements:**
  - 2-5 people's faces
  - All faces clearly visible
  - Various angles acceptable

## Where to Get Test Images

You can use:
1. **Public datasets:**
   - [Labeled Faces in the Wild (LFW)](http://vis-www.cs.umass.edu/lfw/)
   - [CelebA Dataset](http://mmlab.ie.cuhk.edu.hk/projects/CelebA.html)

2. **Stock photos:**
   - [Unsplash](https://unsplash.com/) (search "portrait" or "face")
   - [Pexels](https://www.pexels.com/)

3. **Your own photos:**
   - Use personal photos (with consent)
   - Ensure faces are clearly visible

## Privacy Note

**IMPORTANT:** Never commit real personal photos to the repository unless:
- You have explicit consent from all people in the photos
- The photos are public domain or properly licensed
- The photos are from public datasets with appropriate usage rights

For local testing only, you can use any images, but add them to `.gitignore`.

## Running Tests Without Images

If test images are not available, the integration tests will:
- Log a warning: "Test image not found, skipping test"
- Skip the test gracefully
- Continue with other tests

This allows CI/CD to run even without test images in the repository.

## Adding Test Images

1. Add images to this directory
2. Ensure filenames match those expected by tests:
   - `test-face-1.jpg`
   - `test-faces-multiple.jpg`
3. Run tests: `pnpm test`

## Image Format

- **Supported formats:** JPEG, PNG, WebP
- **Recommended size:** 640x480 to 1920x1080
- **File size:** < 2 MB per image
