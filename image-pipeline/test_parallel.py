import base64
import concurrent.futures
import time
import requests
import os

# Get 10 test images
image_dir = "/Users/putsuthisrisinlpa/.cache/sabaipics/eval-datasets/v1/index"
images = sorted([f for f in os.listdir(image_dir) if f.endswith('.jpg')])[:10]

print(f"Testing with {len(images)} images in parallel...")

def process_image(img_name):
    with open(os.path.join(image_dir, img_name), "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode()
    
    start = time.time()
    response = requests.post(
        "https://putto11262002--framefast-image-pipeline-process.modal.run",
        json={
            "image_base64": image_base64,
            "options": {"auto_edit": True, "style": "vibrant"}
        },
        timeout=120
    )
    elapsed = time.time() - start
    
    return {
        "image": img_name,
        "status": response.status_code,
        "time": round(elapsed, 2),
        "success": response.ok
    }

start_total = time.time()

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
    futures = [executor.submit(process_image, img) for img in images]
    results = [f.result() for f in concurrent.futures.as_completed(futures)]

total_time = time.time() - start_total

print(f"\nResults:")
for r in sorted(results, key=lambda x: x['image']):
    status = "✅" if r['success'] else "❌"
    print(f"  {status} {r['image']}: {r['time']}s")

print(f"\nTotal time: {round(total_time, 2)}s")
print(f"Avg per image: {round(total_time/len(images), 2)}s")
print(f"Success rate: {sum(1 for r in results if r['success'])}/{len(results)}")
