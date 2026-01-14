import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LABELS_FILE = join(__dirname, 'labels.json');

const app = new Hono();

// Serve images
app.get('/images/:filename', async (c) => {
  const filename = c.req.param('filename');
  const filePath = join(__dirname, filename);

  try {
    const imageBuffer = readFileSync(filePath);
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif'
    };
    const contentType = mimeTypes[ext || 'jpg'] || 'image/jpeg';

    return c.body(imageBuffer, 200, {
      'Content-Type': contentType
    });
  } catch (e) {
    return c.text('Image not found', 404);
  }
});

// API: Get labels
app.get('/api/labels', (c) => {
  const labels = JSON.parse(readFileSync(LABELS_FILE, 'utf-8'));
  return c.json(labels);
});

// API: Update labels
app.post('/api/labels', async (c) => {
  const labels = await c.req.json();
  writeFileSync(LABELS_FILE, JSON.stringify(labels, null, 2));
  return c.json({ success: true });
});

// Serve the labeling UI
app.get('/', (c) => {
  const labels = JSON.parse(readFileSync(LABELS_FILE, 'utf-8'));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Face Labeling</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .image-container { position: relative; cursor: crosshair; }
    .marker {
      position: absolute;
      width: 24px;
      height: 24px;
      background: rgba(59, 130, 246, 0.8);
      border: 2px solid white;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: pop 0.2s ease-out;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    @keyframes pop {
      0% { transform: translate(-50%, -50%) scale(0); }
      50% { transform: translate(-50%, -50%) scale(1.2); }
      100% { transform: translate(-50%, -50%) scale(1); }
    }
    .click-ripple {
      position: absolute;
      width: 40px;
      height: 40px;
      background: rgba(59, 130, 246, 0.4);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: ripple 0.4s ease-out forwards;
    }
    @keyframes ripple {
      0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(2); }
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen p-8">
  <div class="max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-gray-800">Face Labeling Tool</h1>
      <div class="flex gap-4 items-center">
        <span class="text-sm text-gray-500">Click on faces to count them</span>
        <span id="counter" class="text-lg text-gray-600">0 / ${labels.length} labeled</span>
        <button id="saveBtn" class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors">
          Save Labels (Cmd+S)
        </button>
      </div>
    </div>

    <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
  </div>

  <script>
    const initialLabels = ${JSON.stringify(labels)};
    let labels = JSON.parse(JSON.stringify(initialLabels));
    let markers = initialLabels.map(function() { return []; });

    function render() {
      var grid = document.getElementById('grid');
      grid.innerHTML = labels.map(function(label, i) {
        var imageName = label.image.split('/').pop();
        return '<div class="bg-white rounded-lg shadow-md p-4">' +
          '<div class="image-container relative" data-index="' + i + '">' +
            '<img src="/images/' + imageName + '" alt="Image ' + (i+1) + '" class="w-full h-64 object-cover rounded-lg mb-4">' +
            '<div class="marker-container" id="markers-' + i + '"></div>' +
          '</div>' +
          '<div class="flex items-center justify-between">' +
            '<span class="text-gray-600 font-medium text-sm">' + imageName + '</span>' +
            '<div class="flex items-center gap-2">' +
              '<button class="decrement-btn w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition-colors" data-index="' + i + '">-</button>' +
              '<input type="number" min="0" value="' + label.faceCount + '" id="input-' + i + '" class="face-input w-16 px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center">' +
              '<button class="increment-btn w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold transition-colors" data-index="' + i + '">+</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      attachEventListeners();
    }

    function attachEventListeners() {
      document.querySelectorAll('.image-container').forEach(function(container) {
        container.addEventListener('click', handleImageClick);
      });

      document.querySelectorAll('.increment-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          incrementCount(parseInt(btn.dataset.index));
        });
      });

      document.querySelectorAll('.decrement-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          decrementCount(parseInt(btn.dataset.index));
        });
      });

      document.querySelectorAll('.face-input').forEach(function(input) {
        input.addEventListener('change', function(e) {
          var index = parseInt(input.id.replace('input-', ''));
          updateLabel(index, input.value);
        });
      });

      var saveBtn = document.getElementById('saveBtn');
      if (saveBtn) saveBtn.addEventListener('click', saveLabels);
    }

    function handleImageClick(event) {
      var container = event.currentTarget;
      var index = parseInt(container.dataset.index);
      var rect = container.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;

      addMarker(container, x, y);
      markers[index].push({ x: x, y: y });
      incrementCount(index);
    }

    function addMarker(container, x, y) {
      var ripple = document.createElement('div');
      ripple.className = 'click-ripple';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      container.appendChild(ripple);
      setTimeout(function() { ripple.remove(); }, 400);

      var marker = document.createElement('div');
      marker.className = 'marker';
      marker.style.left = x + 'px';
      marker.style.top = y + 'px';
      container.querySelector('.marker-container').appendChild(marker);
    }

    function updateLabel(index, value) {
      labels[index].faceCount = parseInt(value) || 0;
      updateCounter();
    }

    function incrementCount(index) {
      labels[index].faceCount++;
      document.getElementById('input-' + index).value = labels[index].faceCount;
      updateCounter();
    }

    function decrementCount(index) {
      if (labels[index].faceCount > 0) {
        labels[index].faceCount--;
        document.getElementById('input-' + index).value = labels[index].faceCount;
        updateCounter();
      }
    }

    function updateCounter() {
      var labeled = labels.filter(function(l) { return l.faceCount > 0; }).length;
      document.getElementById('counter').textContent = labeled + ' / ' + labels.length + ' labeled';
    }

    function saveLabels() {
      fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(labels)
      })
      .then(function(response) {
        if (response.ok) {
          alert('Labels saved successfully!');
        } else {
          alert('Failed to save labels');
        }
      })
      .catch(function(error) {
        alert('Error saving labels: ' + error.message);
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveLabels();
      }
    });

    render();
    updateCounter();
  </script>
</body>
</html>`;

  return c.html(html);
});

const port = 3001;
console.log(`Labeling server running at http://localhost:${port}`);
console.log('Click on faces to count them!');

serve({
  fetch: app.fetch,
  port,
});
