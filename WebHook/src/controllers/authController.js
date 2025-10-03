// src/controllers/authController.js
const supabase = require('../clients/supabase-client.js');
const { registerSchema } = require('../validators/authValidator');
const { google } = require('googleapis');
  // Importar o multi-device-manager dinamicamente
const multiDeviceManager = require('../services/multi-device-manager');
const userRepository = require('../repository/usersRepository'); 
const googleRepository = require('../repository/googleRepository.js');
const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET     
    );
const GoogleCalendarService = require('../services/googleCalendarService');

class AuthController {
   
  async register(req, res) {
    try {
      // 1. VALIDAÇÃO com Zod
      // O .parse() irá disparar um erro automaticamente se os dados forem inválidos.
      const validatedData = registerSchema.parse(req.body);

      // 2. CRIAÇÃO DO USUÁRIO na autenticação do Supabase
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: validatedData.email,
        password: validatedData.password,
        email_confirm: true,
      });

      if (authError) {
        // Trata erros específicos do Supabase, como email duplicado
        return res.status(409).json({ message: authError.message });
      }

        const newUser = authData.user;
        // 3. INSERÇÃO DOS DADOS DE PERFIL na tabela 'profiles'
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: newUser.id, // O mesmo ID do usuário de autenticação
          full_name: validatedData.name,
          business_name: validatedData.businessName,
          whatsapp_number: validatedData.whatsappNumber,
          address: validatedData.businessLocation?.address,
          city: validatedData.businessLocation?.city,
          state: validatedData.businessLocation?.state,
          zip_code: validatedData.businessLocation?.zipCode,
        });
      
      if (profileError) {
        // Se a criação do perfil falhar, idealmente deveríamos deletar o usuário criado
        // para evitar inconsistência. É uma etapa de robustez adicional.
        console.error("Erro ao criar perfil, mas usuário de auth foi criado:", profileError);
        return res.status(500).json({ message: "Erro ao salvar informações do perfil." });
      }

      res.status(201).json({ message: "Usuário e perfil criados com sucesso!", user: newUser });

    } catch (err) {
      if (err instanceof require('zod').ZodError) {
        // Se o erro for do Zod, retorna um erro de validação 400
        return res.status(400).json({ message: "Dados inválidos.", errors: err.flatten().fieldErrors });
      }
      // Outros erros inesperados
      console.error("Erro no controller de registro:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
  async googleAuthCallback(req, res) {
        // Pega o código e o 'state' (que é nosso JWT) dos parâmetros da URL
        const { code, state } = req.query; 

        // O 'state' agora é o nosso JWT!
        const jwt = state;

        if (!jwt) {
            return res.status(401).json({ message: "Identificação do usuário não encontrada no callback." });
        }
        
        // Autentica o usuário usando o JWT recebido pelo 'state'
        const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

        if (authError) {
            return res.status(401).json({ message: "Token de identificação inválido." });
        }

        // Verifica se o código de autorização do Google foi recebido
        if (!code) {
            return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=google_auth_failed`);
            
        }

        const userId = user.id;

        // AGORA SIM, ELE VAI ENTRAR NO TRY!
        try {
         
            // 1. Trocar o código por tokens
            // Usar a URL baseada no ambiente
            const redirectUri = process.env.NODE_ENV === 'production' 
                ? 'https://api.autobooks.com.br/api/auth/google/callback'
                : 'http://localhost:4000/api/auth/google/callback';
            
            console.log('🔍 [GOOGLE AUTH] Parâmetros da requisição:');
            console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
            console.log(`   - code: ${code}`);
            console.log(`   - client_id: ${process.env.GOOGLE_CLIENT_ID}`);
            console.log(`   - client_secret: ${process.env.GOOGLE_CLIENT_SECRET ? '***' : 'UNDEFINED'}`);
            console.log(`   - redirect_uri: ${redirectUri}`);
            console.log(`   - grant_type: authorization_code`);
            console.log(`   - GOOGLE_REDIRECT_URI env: ${process.env.GOOGLE_REDIRECT_URI}`);
            
            // Verificar se o código não foi usado antes
            if (!code || code.length < 10) {
                throw new Error('Código de autorização inválido ou vazio');
            }
            
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code',
                }),
            });

            console.log(`🔍 [GOOGLE AUTH] Status da resposta: ${response.status}`);
            const tokens = await response.json();
            console.log('🔍 [GOOGLE AUTH] Resposta do Google:', tokens);

            if (tokens.error) {
                // Adiciona um log mais detalhado do erro do Google
                console.error("Erro do Google ao trocar token:", tokens.error_description);
                console.error("Código do erro:", tokens.error);
                throw new Error(tokens.error_description || 'Erro ao obter tokens do Google.');
            }

            const { access_token, refresh_token, expires_in } = tokens;
           

            // Instancie seu repositório para usar os métodos
            // --- ETAPA 2: Buscar o Perfil do Google (A PARTE NOVA) ---
        // Com o access_token em mãos, pedimos ao Google as informações do usuário.
            const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            });

            if (!profileResponse.ok) {
                throw new Error('Falha ao buscar informações do perfil do Google.');
            }

            const googleProfile = await profileResponse.json();
            const googleEmail = googleProfile.email; // <- Pegamos o email aqui!
          

            // 2. Salvar os tokens no banco de dados
            await userRepository.saveGoogleTokens({
                userId,
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresIn: expires_in,
                googleEmail: googleEmail,
            });
            await GoogleCalendarService.watchCalendar(userId, googleEmail);

            // 3. Atualizar o status do usuário
            await userRepository.updateStatus(userId, 'activeAndConnected');

            // 4. Redirecionar para o dashboard com sucesso
            return res.redirect(`${process.env.FRONTEND_URL}/dashboard?connected=true`);

        } catch (error) {
            console.error('Falha no callback do Google Auth:', error);
            return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=google_auth_failed`);
        }
  }

  async checkGoogleIntegration(req, res) {

    const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

    try {
      console.log("Verificando integração com Google...");
      console.log('userid:', user.id);  
        const hasIntegration = await googleRepository.hasGoogleIntegration(user.id);
        console.log("Resultado da verificação:", hasIntegration);
        res.status(200).json({ hasGoogleIntegration: hasIntegration });
    } catch (err) {
        console.error("Erro no controller ao verificar integração:", err);
        res.status(500).json({ message: "Erro ao verificar status da integração." });
    }
  }

  async redirectToGoogleAuth(req, res) {
    // O 'req.token' vem do seu authMiddleware
     const jwt = req.headers.authorization?.split(' ')[1];

      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

   

    // Gera a URL, passando o JWT do seu usuário no parâmetro 'state'
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Pede o refresh_token
      scope: scopes,
      prompt: 'consent',      // Força a tela de consentimento a aparecer
      state: jwt,           // Passa o JWT do usuário para sabermos quem ele é no callback
    });

    // Redireciona o navegador do usuário para a página de permissão do Google
    res.redirect(url);
  }

  async disconnectGoogle(req, res) {
    try {
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });

      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

      const userId = user.id;
      console.log(`🔌 Iniciando desconexão do Google para usuário ${userId}`);

      // 1. Buscar dados da integração do Google
      const { data: googleIntegration, error: integrationError } = await supabase
        .from('google_integrations')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (integrationError || !googleIntegration) {
        console.log(`⚠️ Nenhuma integração Google encontrada para usuário ${userId}`);
        return res.status(404).json({ message: "Integração Google não encontrada." });
      }

      // 2. Parar o watch do calendário (se existir)
      if (googleIntegration.watch_resource_id) {
        try {
          console.log(`🛑 Parando watch do calendário: ${googleIntegration.watch_resource_id}`);
          await GoogleCalendarService.stopWatch(googleIntegration.watch_resource_id);
          console.log(`✅ Watch parado com sucesso`);
        } catch (watchError) {
          console.error(`❌ Erro ao parar watch:`, watchError);
          // Continua mesmo se der erro no watch
        }
      }
      const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

      if (profileError || !profile) {
        console.log(`⚠️ Nenhum perfil encontrado para usuário ${userId}`);
        return res.status(404).json({ message: "Perfil não encontrado." });
      }

      // 3. Desconectar dispositivo WhatsApp (se conectado)
      try {
        console.log(`📱 Desconectando dispositivo WhatsApp...`);
        const deviceId = `device-${profile.whatsapp_number?.replace(/\D/g, '')}`;
        
      
        await multiDeviceManager.disconnectDevice(deviceId);
        console.log(`✅ Dispositivo WhatsApp desconectado`);
      } catch (deviceError) {
        console.error(`❌ Erro ao desconectar dispositivo WhatsApp:`, deviceError);
        // Continua mesmo se der erro no dispositivo
      }

      // 4. Deletar integração do banco de dados
      const { error: deleteError } = await supabase
        .from('google_integrations')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error(`❌ Erro ao deletar integração:`, deleteError);
        return res.status(500).json({ message: "Erro ao remover integração do banco de dados." });
      }

      // 5. Deletar pasta de sessões do WhatsApp
      try {
        const fs = require('fs');
        const path = require('path');
        const sessionsPath = path.join(__dirname, '../../.sessions/${profile.whatsapp_number}');
        
        if (fs.existsSync(sessionsPath)) {
          console.log(`🗑️ Removendo pasta de sessões: ${sessionsPath}`);
          fs.rmSync(sessionsPath, { recursive: true, force: true });
          console.log(`✅ Pasta de sessões removida`);
        }
      } catch (fsError) {
        console.error(`❌ Erro ao remover pasta de sessões:`, fsError);
        // Continua mesmo se der erro na remoção da pasta
      }

      console.log(`✅ Desconexão do Google concluída para usuário ${userId}`);
      res.status(200).json({ message: "Google Agenda desconectado com sucesso." });

    } catch (error) {
      console.error('Erro ao desconectar Google:', error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
}

module.exports =  AuthController;