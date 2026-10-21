// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');
// const { mkdirp } = require('mkdirp');

import express from 'express'
import config from "config"
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { mkdirp } from 'mkdirp'

const app = express();
const __dirname = path.resolve()//!!!!!!!!!!!!!!!!!!!!!!!!

app.set("view engine", "ejs")
app.set("views", path.resolve(__dirname, "ejs"))
app.use(express.static(path.resolve(__dirname, 'ejs')))

const PORT = config.get("port") || 5000 // config.get

// Папка для загрузки — рядом с сервером
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
// Настройка multer: сохраняем структуру папок через webkitRelativePath
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // file.originalname содержит путь относительно корня выбранной папки
    // (передаётся с клиента через поле fieldName или через кастомный header)
    const relativePath = req.body && req.body.relativePath
      ? req.body.relativePath
      : file.originalname;
    const safeRelativePath = path.posix.normalize(String(relativePath).replaceAll('\\', '/'));
    if (safeRelativePath.startsWith('../') || safeRelativePath === '..' || path.isAbsolute(safeRelativePath)) {
      return cb(new Error('Недопустимый путь файла'));
    }
    //-----------------------------------------------
    const dir = path.dirname(safeRelativePath);
    const targetDir = path.join(UPLOAD_DIR, dir);
    if (!targetDir.startsWith(UPLOAD_DIR + path.sep) && targetDir !== UPLOAD_DIR) {
      return cb(new Error('Недопустимый путь файла'));
    }

    try {
      await mkdirp(targetDir);
      cb(null, targetDir);
    } catch (err) {
      cb(err);
    }
    //-----------------------------------------------
  },
  filename: (req, file, cb) => {
    // Используем только имя файла (без пути), т.к. папка уже создана
    const relativePath = req.body && req.body.relativePath
      ? req.body.relativePath
      : file.originalname;
    const fileName = path.basename(path.posix.normalize(String(relativePath).replaceAll('\\', '/')));
    cb(null, fileName);
  }
});

// Ограничение по размеру одного файла: 10 ГБ
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10 ГБ
    files: 100000
  }
});

app.use(express.json());
// Middleware для парсинга relativePath из multipart (идёт первым полем)
// Multer обрабатывает поля последовательно, поэтому используем массив fields
app.post('/upload', (req, res) => {
  // Принимаем: relativePath (text) + files (массив)
  const handler = upload.fields([
    { name: 'relativePath', maxCount: 1 },
    { name: 'files', maxCount: 100000 }
  ]);
  handler(req, res, (err) => {
    if (err) {
      console.error('Ошибка загрузки:', err);
      return res.status(500).json({
        ok: false,
        error: err.message || 'Ошибка при загрузке файлов'
      });
    }
    //-----------------------------------------------
    const uploadedFiles = req.files && req.files.files ? req.files.files : [];
    const totalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);

    res.json({
      ok: true,
      count: uploadedFiles.length,
      totalSize,
      files: uploadedFiles.map(f => ({
        name: f.originalname,
        size: f.size,
        path: f.path
      }))
    });
    //-----------------------------------------------

  });
});

// Список загруженных файлов/папок
app.get('/list', (req, res) => {
  const list = [];
  const walk = (dir, prefix = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      //const rel = prefix ? ${ prefix }/${entry.name} : entry.name;// !!!!!!!!!
      //const rel = prefix ? '${ prefix }' / '${entry.name}' : entry.name;// Я
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;//Qwen
      //const rel = "qwerty";
      if (entry.isDirectory()) {
        list.push({ type: 'folder', name: rel });
        walk(path.join(dir, entry.name), rel);
      } else {
        const stat = fs.statSync(path.join(dir, entry.name));
        list.push({ type: 'file', name: rel, size: stat.size });
      }
    }
  };
  try {
    walk(UPLOAD_DIR);
  } catch (e) {
    // пусто
  }
  res.json({ ok: true, items: list });
});
//************************************************************************* 
app.get('/', (req, res) => {
  res.render("index", { title: "Home", content: '1', active: " home" })
})
// app.get('/game', (req, res) => {
//   res.render("game", { title: "Game", content: '2', active: " game" })
// })
// app.get('/download/hello', (req, res) => {
//   // res.download(path.resolve(__dirname, 'soft', 'apk.html'))
//   res.download(path.resolve(__dirname, 'soft', 'Hello World.txt'))
// })
// app.get('/cookie-privacy-policy', (req, res) => {
//   res.render("cookie-privacy-policy",
//     { title: "Cookie Privacy Policy", content: '3', active: "cookie-privacy-policy" })
// })
// app.get('/game-privacy-policy', (req, res) => {
//   res.render("game-privacy-policy",
//     { title: "Game Privacy Policy", content: '4', active: "game-privacy-policy" })
// })
//==========================================
// app.get('/', (req, res) => {
//   res.sendFile(path.resolve(__dirname, "static", "index.html"))
// })
// app.get('/game', (req, res) => {
//   res.sendFile(path.resolve(__dirname, "static", "game.html"))
// })
// app.get('/cookie-privacy-policy', (req, res) => {
//   res.sendFile(path.resolve(__dirname, "static",
//     "cookie-privacy-policy.html"))
// })
//==========================================
let countConnect = 0;
let countRoomServers = 4;
// let versionGame = "0.0.1";

// Линукс сервер -----------------------------------------
app.get('/api/count', (req, res) => {
  try {
    if (req.query.pass == "") {
      return;
    }
    if (req.query.pass == config.get("UnityServerPass")
      && req.query.id == -1) {
      res.send(JSON.stringify([
        {
          countConnect: countConnect,
          ipServer: "127.0.0.1"// ipconfig 
        }// Ethernet adapter Ethernet: // 2-й средний
      ]))
      countConnect++
      return;
    }
    else if (req.query.pass == config.get("AdminPass")) {
      countConnect = req.query.id;
    }
    else {
      //console.log("/api = Error config.get")
    }
    res.send(JSON.stringify([
      {
        countConnect: countConnect,
        ipServer: "127.0.0.1"// ipconfig 
      }// Ethernet adapter Ethernet: // 2-й средний
    ]))
  }
  catch { }
})
//==========================================
// app.get('/api/versiongame', (req, res) => {
//   try {
//     if (req.query.pass != "" &&
//       req.query.pass == config.get("AdminPass")) {
//       versionGame = req.query.versionGame;
//     }
//     res.send(JSON.stringify([
//       {
//         versionGame: versionGame,// для клиентов - игроков
//       }
//     ]))
//   }
//   catch { }
// })
app.get('/api/serversip', (req, res) => {// Игроки -------
  try {
    if (req.query.pass != "" &&
      req.query.pass == config.get("AdminPass")) {
      // AdminPass меняет countRoomServers +-
      countRoomServers = req.query.countRoomServers;
    }
    res.send(JSON.stringify([
      {
        //ipServer: "192.168.56.1",
        //ipServer: "127.0.0.1", // для теста !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        ipServer: "45.147.31.238",//https://aeza.net/ для клиентов - игроков !!!!!!!!!!!!!!!!!!!!!!!
        countRoomServers: countRoomServers // 2
      }
    ]))
  }
  catch { }
})
app.get('/admin/upload', (req, res) => {
  try {
    if (req.query.hywe != "" && req.query.bkivaa != "") {
      if (req.query.hywe == config.get("SuperAdminPass1") &&
        req.query.bkivaa == config.get("SuperAdminPass2")) {
        return res.send(adminPage);
      }
    }
    return res.status(404).send('<h1>Not found</h1>');
  }
  catch { return res.status(404).send('<h1>Not found</h1>'); }
})
const adminPage = `<!DOCTYPE html>
<html lang="ru">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Загрузка папок — Site AI</title>
  <link rel="stylesheet" type="text/css" href="/css/style-ai.css">
</head>

<body>
  <a href="/">Home</a>
  <div class="container">
    <header>
      <h1>📁 Загрузка папок</h1>
      <p class="subtitle">Загрузите папку с файлами и вложенными папками. Структура и имена сохраняются. Поддерживаются
        файлы 1 ГБ+.</p>
    </header>

    <main>
      <section class="upload-section">
        <label for="folderInput" class="drop-zone" id="dropZone">
          <div class="drop-zone-content">
            <div class="icon">📂</div>
            <div class="title">Выберите папку или перетащите сюда</div>
            <div class="hint">Будут загружены все файлы и вложенные папки с сохранением структуры</div>
          </div>
          <input type="file" id="folderInput" webkitdirectory directory multiple hidden>
        </label>

        <div class="info-panel" id="infoPanel" hidden>
          <div class="info-row">
            <span>Выбрано файлов:</span>
            <strong id="fileCount">0</strong>
          </div>
          <div class="info-row">
            <span>Общий размер:</span>
            <strong id="totalSize">0 Б</strong>
          </div>
          <div class="info-row">
            <span>Корневая папка:</span>
            <strong id="rootName">—</strong>
          </div>
        </div>

        <div class="progress-panel" id="progressPanel" hidden>
          <div class="progress-header">
            <span id="progressLabel">Загрузка...</span>
            <span id="progressPercent">0%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
          </div>
          <div class="progress-details">
            <span id="progressCurrent">0 / 0</span>
            <span id="progressSpeed">—</span>
          </div>
        </div>

        <div class="actions">
          <button id="uploadBtn" class="btn btn-primary" disabled>Загрузить</button>
          <button id="cancelBtn" class="btn btn-secondary" disabled>Отмена</button>
          <button id="clearBtn" class="btn btn-ghost">Очистить</button>
        </div>

        <div class="log" id="log"></div>
      </section>

      <section class="list-section">
        <h2>Загруженные файлы</h2>
        <button id="refreshBtn" class="btn btn-ghost small">🔄 Обновить</button>
        <div id="fileList" class="file-list"></div>
      </section>
    </main>

  </div>

  <script src="../script.js"></script>
</body>

</html>`;
//************************************************************************* 
const server = app.listen(PORT, () => {
  console.log(`*** Start Server:${PORT} ***`);
  console.log(`___ UPLOAD_DIR: ${UPLOAD_DIR}`);
});

// Large uploads may take longer than the default five-minute request timeout.
// Загрузка больших файлов может занять больше времени, 
// чем предусмотрено стандартным пятиминутным тайм-аутом запроса.
server.requestTimeout = 0;
