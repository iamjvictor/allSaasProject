// test-connection.js
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');

async function testConnection() {
    console.log("A iniciar teste de conexão isolado...");
    const sessionDir = path.join(__dirname, '.test_session');
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Imprime o QR code diretamente no terminal
        browser: Browsers.macOS('Desktop'),
        logger: pino({ level: 'trace' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log("✅ QR Code gerado! Por favor, escaneie.");
        }
        if (connection === 'open') {
            console.log("✅✅✅ CONEXÃO BEM-SUCEDIDA! ✅✅✅");
            sock.logout();
        }
        if (connection === 'close') {
            console.error("❌ Conexão fechada. Erro:", lastDisconnect?.error);
        }
    });
}

testConnection();