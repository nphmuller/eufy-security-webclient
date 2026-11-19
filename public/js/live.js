/**
 * Minimal live viewer. Reuses the shared player without loading dashboard controls.
 */
const liveButton = document.getElementById('device-video-btn');
const liveVideo = document.getElementById('device-video-video');
const liveCamera = document.getElementById('camera-select');
const liveStatus = document.getElementById('live-status');
const livePlaceholder = document.getElementById('camera-name');
const liveDeviceKey = 'eufyWebClientLastDevice';
let liveSocket;
let liveReconnect;
let liveReady = false;

// UI hooks for the shared player.
function debugConsoleLog() {}
function uiDebugLog() {}
function uiLockDeviceList(streaming) {
    liveCamera.disabled = streaming;
}

function uiUpdateVideoButton(streaming) {
    liveButton.textContent = streaming ? 'Stop Live View' : 'Start Live View';
    liveButton.disabled = !streaming && (!liveReady || !liveCamera.value);
    liveVideo.hidden = !streaming;
    livePlaceholder.hidden = streaming;
    liveStatus.textContent = streaming ? 'Starting live view…' : liveReady ? 'Live view is off' : 'Connecting…';
}

function liveLoadDevices(state) {
    let saved = liveCamera.value;
    try { saved ||= localStorage.getItem(liveDeviceKey); } catch (e) { /* storage unavailable */ }
    liveCamera.replaceChildren();
    for (const [index, serial] of (state.cameras || []).entries()) {
        const option = document.createElement('option');
        option.value = serial;
        option.textContent = state.deviceNames?.[serial] || `Camera ${index + 1}`;
        liveCamera.appendChild(option);
    }
    if (Array.from(liveCamera.options).some(option => option.value === saved)) liveCamera.value = saved;
    document.getElementById('camera-choice').hidden = liveCamera.options.length < 2;
    livePlaceholder.textContent = liveCamera.selectedOptions[0]?.textContent || 'Live video is off';
    liveReady = state.login?.status === 'ok';
    uiUpdateVideoButton(isStreaming);
    if (!liveReady) liveStatus.textContent = 'Open Advanced to sign in to Eufy or complete verification.';
    else if (!liveCamera.value) liveStatus.textContent = 'No cameras found. Check device access in Advanced.';
}

function liveConnect() {
    liveSocket = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api');
    const socket = liveSocket;
    const requestDevices = () => socket.send(JSON.stringify({ command: 'start_listening' }));
    socket.addEventListener('open', requestDevices);
    socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data);
        if (message.messageId === 'start_listening' && message.success) {
            liveLoadDevices(message.result.state);
        }
        if (message.type !== 'event' || message.event.source !== 'system') return;
        const event = message.event;
        if (['login ok', 'login error', 'captcha request', 'verify code request'].includes(event.event)) {
            requestDevices();
        }
        if (isStreaming && event.serialNumber === liveCamera.value) {
            if (event.event === 'livestream start failed') videoOnStartFailed(event.message);
            if (event.event === 'stream_stopped_by_station') videoOnStartFailed('The camera stopped the stream. Try starting it again.');
        }
    });
    socket.addEventListener('close', () => {
        if (liveSocket !== socket) return;
        liveReady = false;
        videoStopStream();
        liveStatus.textContent = 'Disconnected. Reconnecting…';
        liveReconnect = setTimeout(liveConnect, 3000);
    });
}

liveButton.addEventListener('click', () => {
    if (isStreaming) {
        videoStopStream();
        videoHideError();
    } else if (liveReady && liveCamera.value) {
        videoStartStream(location.origin, liveCamera.value, false);
    }
});

liveCamera.addEventListener('change', () => {
    livePlaceholder.textContent = liveCamera.selectedOptions[0].textContent;
    videoHideError();
    try { localStorage.setItem(liveDeviceKey, liveCamera.value); } catch (e) { /* storage unavailable */ }
});

liveVideo.addEventListener('playing', () => {
    if (isStreaming) liveStatus.textContent = 'Live';
});

window.addEventListener('pagehide', () => {
    clearTimeout(liveReconnect);
    const socket = liveSocket;
    liveSocket = null;
    liveReady = false;
    videoStopStream();
    socket?.close();
});

window.addEventListener('pageshow', ({ persisted }) => {
    if (persisted) liveConnect();
});

liveConnect();
