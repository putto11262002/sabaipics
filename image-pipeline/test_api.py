import base64
import requests
import sys


if len(sys.argv) < 2:
    print("Usage: python test_api.py <OUTPUT_URL>")
    print("Example output URL: presigned R2 PUT URL")
    sys.exit(1)

output_url = sys.argv[1]

# Read image
with open(
    "/Users/putsuthisrisinlpa/.cache/sabaipics/eval-datasets/v1/index/10003_228A0001.jpg", "rb"
) as f:
    image_base64 = base64.b64encode(f.read()).decode()

# Call API
response = requests.post(
    "https://putto11262002--framefast-image-pipeline-process.modal.run",
    json={
        "image_base64": image_base64,
        "output_url": output_url,
        "options": {"auto_edit": True, "style": "vibrant"},
    },
    timeout=60,
)

print(f"Status: {response.status_code}")

if response.ok:
    data = response.json()
    print(f"Operations: {data.get('operations_applied')}")
    print(f"Output URL: {output_url}")
else:
    print(f"Error: {response.text}")
