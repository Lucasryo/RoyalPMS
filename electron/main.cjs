const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const isDev = !app.isPackaged;

let serverProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: "Hotel Management System",
    autoHideMenuBar: true,
    backgroundColor: '#ffffff'
  });

  if (isDev) {
    // In dev, the server is started separately by concurrently
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    // Start local server in production
    try {
      const serverPath = path.join(__dirname, '../dist_server/server.cjs');
      serverProcess = fork(serverPath, [], {
        env: { 
          ...process.env, 
          NODE_ENV: 'production',
          ELECTRON_DATA_PATH: app.getPath('userData')
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      });

      if (serverProcess.stdout) {
        serverProcess.stdout.on('data', (data) => console.log(`Server: ${data}`));
      }
      if (serverProcess.stderr) {
        serverProcess.stderr.on('data', (data) => console.error(`Server Error: ${data}`));
      }

      serverProcess.on('error', (err) => {
        const { dialog } = require('electron');
        dialog.showErrorBox('Erro no Servidor', `Falha ao iniciar o servidor local: ${err.message}`);
      });

      serverProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          const { dialog } = require('electron');
          dialog.showErrorBox('Servidor Encerrado', `O servidor local fechou inesperadamente com o código ${code}`);
        }
      });
    } catch (e) {
      const { dialog } = require('electron');
      dialog.showErrorBox('Erro de Configuração', `Erro ao configurar o processo do servidor: ${e.message}`);
    }

    // Wait for server to start before loading
    setTimeout(() => {
      win.loadURL('http://localhost:3000');
    }, 2000);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Enable DevTools shortcut (Ctrl+Shift+I / Cmd+Option+I) even in production
  app.on('browser-window-created', (e, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        window.webContents.openDevTools();
      }
    });
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
