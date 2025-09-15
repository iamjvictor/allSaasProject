const WhatsAppDeviceManager = require('../services/multi-device-manager');
const config = require('../config');
const usersRepository = require('../repository/usersRepository');

class DeviceController {
  constructor() {
    this.deviceManager = new WhatsAppDeviceManager();
  }

  async startSingleDevice(deviceId) {
    const deviceConfig = this.deviceManager.deviceConfigs.find(d => d.id === deviceId);
    if (!deviceConfig) {
      console.error(`❌ Dispositivo ${deviceId} não encontrado`);
      return;
    }

    console.log(`🚀 Iniciando ${deviceConfig.name}...`);
    console.log('💡 O user_id será definido automaticamente baseado no número do WhatsApp');
    await this.deviceManager.connectDevice(deviceConfig);
  }

  async startAllDevices() {
    console.log('🚀 Iniciando todos os dispositivos...');
    console.log('💡 Cada dispositivo usará um user_id único baseado no número do WhatsApp');
    await this.deviceManager.connectAllDevices();
  }

  getStatus() {
    return this.deviceManager.getDeviceStatus();
  }

  async sendMessage(deviceId, to, message) {
    return await this.deviceManager.sendMessageToDevice(deviceId, to, message);
  }

  listDevices() {
    console.log('📱 Dispositivos disponíveis:');
    this.deviceManager.deviceConfigs.forEach(device => {
      console.log(`  - ${device.id}: ${device.name}`);
    });
  }

  showDetailedStatus() {
    const status = this.getStatus();
    console.log('\n📊 Status Detalhado dos Dispositivos:');
    console.log('=' .repeat(60));
    
    status.forEach(device => {
      const statusIcon = device.connected ? '✅' : '❌';
      const userInfo = device.user_id ? `user_id: ${device.user_id}` : 'user_id: não definido';
      const numberInfo = device.whatsappNumber ? `Número: ${device.whatsappNumber}` : 'Número: não conectado';
      
      console.log(`${statusIcon} ${device.name} (ID: ${device.id})`);
      console.log(`   ${userInfo}`);
      console.log(`   ${numberInfo}`);
      console.log('');
    });
  }

  showDeviceInfo(deviceId) {
    const deviceInfo = this.deviceManager.getDeviceInfo(deviceId);
    if (deviceInfo) {
      console.log(`\n📱 Informações do Dispositivo: ${deviceId}`);
      console.log('=' .repeat(40));
      console.log(`Nome: ${deviceInfo.name}`);
      console.log(`Conectado: ${deviceInfo.connected ? 'Sim' : 'Não'}`);
      console.log(`User ID: ${deviceInfo.user_id || 'Não definido'}`);
      console.log(`Número WhatsApp: ${deviceInfo.whatsappNumber || 'Não conectado'}`);
      console.log(`Pasta Auth: ${deviceInfo.authPath}`);
    } else {
      console.log(`❌ Dispositivo ${deviceId} não encontrado`);
    }
  }

  async connectDeviceAndReturnQr(req, res) {
    try {
      const deviceConfig = req.body;
      // Adiciona o deviceConfig à lista de configs, se ainda não existir
      if (!this.deviceManager.deviceConfigs.find(d => d.id === deviceConfig.id)) {
        this.deviceManager.deviceConfigs.push(deviceConfig);
      }
      // Chama o manager e retorna a promise (QR code ou 'CONNECTED')
      const result = await this.deviceManager.connectDevice(deviceConfig, true);
      await usersRepository.addDDeviceIdToUser(deviceConfig.user_id, deviceConfig.id);
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

// Interface de linha de comando
async function main() {
  const controller = new DeviceController();
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📋 Uso:');
    console.log('  node device-controller.js list                    - Lista dispositivos');
    console.log('  node device-controller.js start <device-id>       - Inicia dispositivo específico');
    console.log('  node device-controller.js start-all               - Inicia todos os dispositivos');
    console.log('  node device-controller.js status                  - Mostra status dos dispositivos');
    console.log('  node device-controller.js info <device-id>        - Mostra informações detalhadas');
    console.log('  node device-controller.js send <device-id> <to> <message> - Envia mensagem');
    return;
  }

  
  const command = args[0];

  switch (command) {
    case 'list':
      controller.listDevices();
      break;
      
    case 'start':
      if (args[1]) {
        await controller.startSingleDevice(args[1]);
      } else {
        console.log('❌ Especifique o ID do dispositivo');
      }
      break;
      
    case 'start-all':
      await controller.startAllDevices();
      break;
      
    case 'status':
      controller.showDetailedStatus();
      break;
      
    case 'info':
      if (args[1]) {
        controller.showDeviceInfo(args[1]);
      } else {
        console.log('❌ Especifique o ID do dispositivo');
      }
      break;
      
    case 'send':
      if (args.length >= 4) {
        const deviceId = args[1];
        const to = args[2];
        const message = args[3];
        const success = await controller.sendMessage(deviceId, to, message);
        console.log(success ? '✅ Mensagem enviada' : '❌ Erro ao enviar mensagem');
      } else {
        console.log('❌ Uso: send <device-id> <to> <message>');
      }
      break;
      
    default:
      console.log(`❌ Comando desconhecido: ${command}`);
  }
  
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeviceController;