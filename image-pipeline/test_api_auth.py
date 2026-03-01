import base64
import os
import requests

# Read image
with open("/Users/putsuthisrisinlpa/.cache/sabaipics/eval-datasets/v1/index/10003_228A0001.jpg", "rb") as f:
    image_base64 = base64.b64encode(f.read()).decode()

# Get auth from env
modal_key = os.environ.get("MODAL_KEY")
modal_secret = os.environ.get("MODAL_SECRET")

print(f"MODAL_KEY: {modal_key[:8] if modal_key else 'NOT SET'}...")
print(f"MODAL_SECRET: {modal_secret[:8] if modal_secret else 'NOT SET'}...")

# Call API with auth
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
            "style": "vibrant"
        }
    },
    timeout=60
)

print(f"\nStatus: {response.status_code}")

if response.ok:
    data = response.json()
    print(f"Operations: {data.get('operations_applied')}")
    print(f"Output size: {data.get('width')}x{data.get('height')}")
    
    # Save result
    result_bytes = base64.b64decode(data["image_base64"])
    with open("output_api_auth_test.jpg", "wb") as f:
        f.write(result_bytes)
    print("Saved to output_api_auth_test.jpg")
else:
    print(f"Error: {response.text}")
