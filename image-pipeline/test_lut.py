import base64
import os
import requests

# Read image
with open("/Users/putsuthisrisinlpa/.cache/sabaipics/eval-datasets/v1/index/10003_228A0001.jpg", "rb") as f:
    image_base64 = base64.b64encode(f.read()).decode()

# Read LUT file
with open("/Users/putsuthisrisinlpa/Downloads/Cinematic-Teal.cube", "rb") as f:
    lut_base64 = base64.b64encode(f.read()).decode()

print(f"LUT size: {len(lut_base64)} bytes (base64)")

# Get auth from env
modal_key = os.environ.get("MODAL_KEY")
modal_secret = os.environ.get("MODAL_SECRET")

# Test 1: LUT only
print("\n=== Test 1: LUT only ===")
response = requests.post(
    "https://putto11262002--framefast-image-pipeline-process.modal.run",
    headers={
        "Modal-Key": modal_key,
        "Modal-Secret": modal_secret,
        "Content-Type": "application/json",
    },
    json={
        "image_base64": image_base64,
        "options": {
            "lut_base64": lut_base64,
            "lut_intensity": 100
        }
    },
    timeout=120
)
print(f"Status: {response.status_code}")
if response.ok:
    data = response.json()
    print(f"Operations: {data.get('operations_applied')}")
    result_bytes = base64.b64decode(data["image_base64"])
    with open("output_lut_only.jpg", "wb") as f:
        f.write(result_bytes)
    print("Saved to output_lut_only.jpg")

# Test 2: Auto-edit + LUT
print("\n=== Test 2: Auto-edit + LUT ===")
response = requests.post(
    "https://putto11262002--framefast-image-pipeline-process.modal.run",
    headers={
        "Modal-Key": modal_key,
        "Modal-Secret": modal_secret,
        "Content-Type": "application/json",
    },
    json={
        "image_base64": image_base64,
        "options": {
            "auto_edit": True,
            "style": "neutral",
            "lut_base64": lut_base64,
            "lut_intensity": 80
        }
    },
    timeout=120
)
print(f"Status: {response.status_code}")
if response.ok:
    data = response.json()
    print(f"Operations: {data.get('operations_applied')}")
    result_bytes = base64.b64decode(data["image_base64"])
    with open("output_autoedit_lut.jpg", "wb") as f:
        f.write(result_bytes)
    print("Saved to output_autoedit_lut.jpg")

# Test 3: LUT at 50% intensity
print("\n=== Test 3: LUT at 50% intensity ===")
response = requests.post(
    "https://putto11262002--framefast-image-pipeline-process.modal.run",
    headers={
        "Modal-Key": modal_key,
        "Modal-Secret": modal_secret,
        "Content-Type": "application/json",
    },
    json={
        "image_base64": image_base64,
        "options": {
            "lut_base64": lut_base64,
            "lut_intensity": 50
        }
    },
    timeout=120
)
print(f"Status: {response.status_code}")
if response.ok:
    data = response.json()
    print(f"Operations: {data.get('operations_applied')}")
    result_bytes = base64.b64decode(data["image_base64"])
    with open("output_lut_50percent.jpg", "wb") as f:
        f.write(result_bytes)
    print("Saved to output_lut_50percent.jpg")
