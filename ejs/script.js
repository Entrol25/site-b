const folderInput = document.getElementById('folderInput');
const dropZone = document.getElementById('dropZone');
const infoPanel = document.getElementById('infoPanel');
const fileCountEl = document.getElementById('fileCount');
const totalSizeEl = document.getElementById('totalSize');
const rootNameEl = document.getElementById('rootName');
const progressPanel = document.getElementById('progressPanel');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressLabel = document.getElementById('progressLabel');
const progressCurrent = document.getElementById('progressCurrent');
const progressSpeed = document.getElementById('progressSpeed');
const uploadBtn = document.getElementById('uploadBtn');
const cancelBtn = document.getElementById('cancelBtn');
const clearBtn = document.getElementById('clearBtn');
const refreshBtn = document.getElementById('refreshBtn');
const fileListEl = document.getElementById('fileList');
const logEl = document.getElementById('log');

let selectedFiles = [];
let currentXHR = null;
let uploadCancelled = false;

if (!folderInput || !dropZone || !uploadBtn || !cancelBtn || !clearBtn || !refreshBtn) {
  throw new Error('Не удалось инициализировать элементы страницы загрузки');
}
function formatSize(bytes) {
  if (bytes === 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}
function log(message, type = 'info') {
  const entry = document.createElement('div');
  // entry.className = log - entry ${ type };//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  entry.className = 'log-entry ' + type;
  const time = new Date().toLocaleTimeString();
  // entry.textContent = [${ time }] ${ message };//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  entry.textContent = `[${time}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}
folderInput.addEventListener('change', (e) => {
  handleFiles(Array.from(e.target.files));
});
// Drag & drop папок
['dragenter', 'dragover'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});
dropZone.addEventListener('drop', async (e) => {
  const items = e.dataTransfer.items;
  if (!items) return;
  const files = [];
  const promises = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) {
      promises.push(readEntry(entry, '', files));
    }
  }
  await Promise.all(promises);
  handleFiles(files);
});
function readEntry(entry, path, files) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        // Восстанавливаем относительный путь
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false
        });
        files.push(file);
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = [];
      const readEntries = () => {
        reader.readEntries(async (ents) => {
          if (ents.length === 0) {
            const subPromises = entries.map(e =>
              readEntry(e, path + entry.name + '/', files)
            );
            await Promise.all(subPromises);
            resolve();
          } else {
            entries.push(...ents);
            readEntries();
          }
        }, () => resolve());
      };
      readEntries();
    } else {
      resolve();
    }
  });
}
function handleFiles(files) {
  // Фильтруем только файлы (не папки)
  selectedFiles = files.filter(f => !(f.webkitRelativePath || '').endsWith('/'));
  if (selectedFiles.length === 0) {
    log('Папка пуста или не содержит файлов', 'error');
    return;
  }
  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  // Имя корневой папки
  const firstPath = selectedFiles[0].webkitRelativePath || selectedFiles[0].name;
  const rootName = firstPath.split('/')[0];
  fileCountEl.textContent = selectedFiles.length;
  totalSizeEl.textContent = formatSize(totalSize);
  rootNameEl.textContent = rootName;
  infoPanel.hidden = false;
  uploadBtn.disabled = false;
  //log(Выбрано ${ selectedFiles.length } файлов, размер: ${ formatSize(totalSize) }, 'info');
  log(`Выбрано ${selectedFiles.length} файлов, размер: ${formatSize(totalSize)}`, 'info');
}
uploadBtn.addEventListener('click', () => {
  if (selectedFiles.length === 0 || currentXHR) return;
  startUpload().catch((err) => log(`Ошибка загрузки: ${err.message}`, 'error'));
});
cancelBtn.addEventListener('click', () => {
  if (currentXHR) {
    uploadCancelled = true;
    currentXHR.abort();
    log('Загрузка отменяется...', 'error');
  }
});
clearBtn.addEventListener('click', () => {
  if (currentXHR) return;
  selectedFiles = [];
  folderInput.value = '';
  infoPanel.hidden = true;
  progressPanel.hidden = true;
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressCurrent.textContent = '0 / 0';
  progressSpeed.textContent = '—';
  progressLabel.textContent = 'Загрузка...';
  uploadBtn.disabled = true;
  cancelBtn.disabled = true;
  logEl.innerHTML = '';
});
refreshBtn.addEventListener('click', async () => {
  if (refreshBtn.disabled) return;
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Обновление...';
  try {
    await loadFileList();
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Обновить';
  }
});
async function startUpload() {
  uploadBtn.disabled = true;
  cancelBtn.disabled = false;
  clearBtn.disabled = true;
  progressPanel.hidden = false;
  const totalFiles = selectedFiles.length;
  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  let uploadedSize = 0;
  let uploadedCount = 0;
  const startTime = Date.now();
  uploadCancelled = false;
  //log(Начинаем загрузку ${ totalFiles } файлов..., 'info');
  log(`Начинаем загрузку ${totalFiles} файлов...`, 'info');
  // Загружаем файлы по одному, чтобы сохранять структуру через relativePath
  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const relativePath = file.webkitRelativePath || file.name;

    //---------------------------------------------------
    try {
      await uploadSingleFile(file, relativePath, (loaded) => {
        const currentTotal = uploadedSize + loaded;
        const percent = Math.round((currentTotal / totalSize) * 100);
        progressFill.style.width = percent + '%';
        progressPercent.textContent = percent + '%';
        progressCurrent.textContent = `${i + 1} / ${totalFiles}`;

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = currentTotal / elapsed;
        progressSpeed.textContent = formatSize(speed) + '/с';
      });

      uploadedSize += file.size;
      uploadedCount++;
      log(`✓ ${relativePath} (${formatSize(file.size)})`, 'success');
    } catch (err) {
      if (err.name === 'AbortError') {
        break;
      }
      log(`✗ ${relativePath}: ${err.message}`, 'error');
    }
    //---------------------------------------------------
  }
  const cancelled = uploadCancelled;
  progressLabel.textContent = cancelled ? 'Отменено' : 'Завершено';
  if (!cancelled) {
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
  }
  uploadBtn.disabled = false;
  cancelBtn.disabled = true;
  clearBtn.disabled = false;
  //log(Загрузка завершена: ${ uploadedCount } / ${ totalFiles } файлов, 'success');
  log(cancelled
    ? `Загрузка отменена: ${uploadedCount} / ${totalFiles} файлов`
    : `Загрузка завершена: ${uploadedCount} / ${totalFiles} файлов`, cancelled ? 'error' : 'success');
  await loadFileList();
}
function uploadSingleFile(file, relativePath, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    // Отправляем путь отдельным полем — multer обработает его первым
    formData.append('relativePath', relativePath);
    formData.append('files', file, file.name);
    //-------------------------------------------------
    const xhr = new XMLHttpRequest();
    currentXHR = xhr;

    xhr.open('POST', '/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded);
      }
    };

    xhr.onload = () => {
      currentXHR = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.ok) resolve(data);
          else reject(new Error(data.error || 'Ошибка сервера'));
        } catch (e) {
          resolve();
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      currentXHR = null;
      reject(new Error('Ошибка сети'));
    };

    xhr.onabort = () => {
      currentXHR = null;
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    };

    xhr.send(formData);
    //----------------------------------------------------------------
  });
}

async function loadFileList() {
  try {
    const res = await fetch('/list');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error('Ошибка получения списка');
    if (data.items.length === 0) {
      fileListEl.innerHTML = '<div class="empty-list">Пока ничего не загружено</div>';
      return true;
    }

    // Сортируем: папки сначала, потом файлы
    const sorted = [...data.items].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    fileListEl.innerHTML = sorted.map(item => {
      if (item.type === 'folder') {
        return `<div class="file-item folder"><span class="path">📁 ${item.name}</span></div>`;
      }
      return `<div class="file-item"><span class="path">📄 ${item.name}
      </span><span class="size">${formatSize(item.size)}</span></div>`;
    }).join('');
    return true;
  } catch (err) {
    log('Ошибка загрузки списка: ' + err.message, 'error');
    fileListEl.innerHTML = '<div class="empty-list">Не удалось получить список файлов</div>';
    return false;
  }
}

// Первоначальная загрузка списка
loadFileList();
