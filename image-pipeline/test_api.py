import base64
import requests
import sys

# Read image
with open("/Users/putsuthisrisinlpa/.cache/sabaipics/eval-datasets/v1/index/10003_228A0001.jpg", "rb") as f:
    image_base64 = base64.b64encode(f.read()).decode()

# Call API
response = requests.post(
    "https://putto11262002--framefast-image-pipeline-process.modal.run",
    json={
        "image_base64": image_base64,
        "options": {
            "auto_edit": True,
            "style": "vibrant"
        }
    },
    timeout=60
)

print(f"Status: {response.status_code}")

if response.ok:
    data = response.json()
    print(f"Operations: {data.get('operations_applied')}")
    print(f"Output size: {data.get('width')}x{data.get('height')}")
    
    # Save result
    result_bytes = base64.b64decode(data["image_base64"])
    with open("output_api_test.jpg", "wb") as f:
        f.write(result_bytes)
    print("Saved to output_api_test.jpg")
else:
    print(f"Error: {response.text}")
