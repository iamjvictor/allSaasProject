# WhatsApp Webhook Multi-Dispositivo

Este é um webhook que conecta múltiplos dispositivos WhatsApp com sua API de IA usando a biblioteca Baileys. **Cada número conectado é independente e busca dados diferentes no banco de dados.**

## 🚀 Como usar

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na pasta `WebHook` com:

```env
# Configurações do servidor
PORT=3000
NODE_ENV=development

# Configurações da API Python
PYTHON_API_URL=https://apisaas.onrender.com/process_whatsapp_message

# Configurações de Log
LOG_LEVEL=info
```

### 3. Rodar o webhook

#### Opção A: Todos os dispositivos de uma vez
```bash
npm start
```

#### Opção B: Dispositivo específico
```bash
node device-controller.js start device-1
```

#### Opção C: Verificar dispositivos disponíveis
```bash
node device-controller.js list
```

#### Opção D: Ver exemplo de uso
```bash
node example-usage.js
```

### 4. Conectar WhatsApp

1. Execute o webhook
2. Escaneie os QR Codes que aparecerão no terminal (um para cada dispositivo)
3. Cada dispositivo será conectado independentemente
4. **O user_id será gerado automaticamente baseado no número do WhatsApp**

## 🔧 Funcionalidades

- ✅ **Múltiplos dispositivos**: Suporte a até 3 dispositivos simultâneos
- ✅ **Funcionamento independente**: Cada dispositivo opera de forma isolada
- ✅ **User ID dinâmico**: Cada número gera um user_id único automaticamente
- ✅ **Dados independentes**: Cada dispositivo busca dados diferentes no banco
- ✅ **Filtro de mensagens**: Processa apenas mensagens **recebidas** (não enviadas)
- ✅ **Integração com IA**: Envia mensagens para sua API Python
- ✅ **Resposta automática**: Responde automaticamente com a resposta da IA
- ✅ **Reconexão automática**: Reconecta automaticamente se a conexão cair
- ✅ **Logs detalhados**: Mostra o que está acontecendo em tempo real
- ✅ **Status em tempo real**: Monitora o status de todos os dispositivos

## 📱 Dispositivos configurados

| ID | Nome | user_id | Descrição |
|----|------|---------|-----------|
| `device-1` | Dispositivo 1 | **Dinâmico** | Gerado automaticamente |
| `device-2` | Dispositivo 2 | **Dinâmico** | Gerado automaticamente |
| `device-3` | Dispositivo 3 | **Dinâmico** | Gerado automaticamente |

## 🔍 Como funciona

### 1. **Geração do User ID**
Cada número do WhatsApp gera um user_id único:
- Número: `5522997892095` → user_id: `229789209`
- Número: `5511998765432` → user_id: `199876543`
- Número: `5533991234567` → user_id: `399123456`

### 2. **Processo de Conexão**
1. **Conexão**: Cada dispositivo se conecta ao WhatsApp via Baileys independentemente
2. **Identificação**: O número do WhatsApp é extraído automaticamente
3. **Geração de ID**: Um user_id único é gerado baseado no número
4. **Configuração**: O dispositivo é configurado com seu user_id específico

### 3. **Processamento de Mensagens**
1. **Recebimento**: Quando qualquer dispositivo recebe uma mensagem, ela é capturada
2. **Filtro**: Apenas mensagens recebidas são processadas (não enviadas)
3. **IA**: A mensagem é enviada para sua API Python com o user_id específico do dispositivo
4. **Resposta**: A resposta da IA é enviada de volta pelo mesmo dispositivo

## 🛠️ Comandos úteis

### Listar dispositivos
```bash
node device-controller.js list
```

### Iniciar dispositivo específico
```bash
node device-controller.js start device-1
```

### Verificar status detalhado
```bash
node device-controller.js status
```

### Ver informações de um dispositivo
```bash
node device-controller.js info device-1
```

### Ver exemplo de uso
```bash
node example-usage.js
```

### Enviar mensagem via dispositivo específico
```bash
node device-controller.js send device-1 5511999999999@s.whatsapp.net "Olá!"
```

## 📋 Estrutura do projeto

```
WebHook/
├── index.js                    # Arquivo principal (todos os dispositivos)
├── device-controller.js        # Controlador de dispositivos individuais
├── multi-device-manager.js     # Gerenciador de múltiplos dispositivos
├── example-usage.js            # Exemplo de uso do sistema
├── config.js                   # Configurações centralizadas
├── package.json                # Dependências do projeto
├── .env                        # Variáveis de ambiente (criar)
└── README.md                   # Este arquivo
```

## 🔄 Vantagens do sistema

1. **Escalabilidade**: Pode atender múltiplos clientes simultaneamente
2. **Isolamento**: Problemas em um dispositivo não afetam os outros
3. **Flexibilidade**: Cada dispositivo busca dados diferentes no banco
4. **Redundância**: Se um dispositivo cair, os outros continuam funcionando
5. **Organização**: Cada número tem seu próprio contexto e dados
6. **Automatização**: User_id é gerado automaticamente, sem configuração manual

## 📊 Exemplo de Status

```
📊 Status dos Dispositivos:
============================================================
✅ Dispositivo 1 (ID: device-1)
   user_id: 229789209
   Número: 5522997892095

✅ Dispositivo 2 (ID: device-2)
   user_id: 199876543
   Número: 5511998765432

❌ Dispositivo 3 (ID: device-3)
   user_id: não definido
   Número: não conectado
============================================================
```

## 🐛 Solução de problemas

### QR Code não aparece
- Verifique se o terminal tem espaço suficiente
- Tente redimensionar a janela do terminal
- Execute um dispositivo por vez se necessário

### Erro de conexão
- Verifique se a API Python está rodando
- Confirme se a URL da API está correta no `.env`

### Mensagens não são processadas
- Verifique os logs no terminal
- Confirme se a mensagem é recebida (não enviada)
- Verifique se o dispositivo está conectado

### Dispositivo não conecta
- Tente conectar um dispositivo por vez
- Verifique se não há conflito de sessões
- Delete a pasta `auth_info_baileys_X` se necessário

### User ID não é gerado
- Verifique se o dispositivo está conectado
- Confirme se o número do WhatsApp foi detectado
- Reinicie o dispositivo se necessário

## 📝 Notas importantes

- **Cada número do WhatsApp gera um user_id único**
- **Cada dispositivo busca dados diferentes no banco de dados**
- **Os dados de autenticação são salvos em pastas separadas**
- **O webhook processa apenas mensagens recebidas**
- **Mensagens enviadas por você são ignoradas**
- **A conexão é mantida automaticamente para todos os dispositivos**
- **Status é exibido a cada 30 segundos** 