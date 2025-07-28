const { ipcRenderer } = require('electron');

const keyInput = document.getElementById('license-key');
const activateBtn = document.getElementById('activate-btn');
const errorMessage = document.getElementById('error-message');

activateBtn.addEventListener('click', () => {
    const licenseKey = keyInput.value;
    if (licenseKey) {
        errorMessage.style.display = 'none';
        ipcRenderer.send('activate-license', licenseKey);
    } else {
        errorMessage.innerText = 'Пожалуйста, введите ключ.';
        errorMessage.style.display = 'block';
    }
});

ipcRenderer.on('activation-success', () => {
    // Окно закроется автоматически при перезапуске
    activateBtn.innerText = 'Успешно!';
    activateBtn.style.backgroundColor = '#42b72a';
});

ipcRenderer.on('activation-failure', (event, message) => {
    errorMessage.innerText = message;
    errorMessage.style.display = 'block';
});