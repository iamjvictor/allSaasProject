// src/controllers/authController.js
const supabase = require('../clients/supabase-client.js');
const { registerSchema } = require('../validators/authValidator');
const { google } = require('googleapis');

const userRepository = require('../repository/usersRepository'); 
const googleRepository = require('../repository/googleRepository.js');
const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET     
    );


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
          console.log("code:",code);
            // 1. Trocar o código por tokens
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    redirect_uri: `http://localhost:4000/api/auth/google/callback`,
                    grant_type: 'authorization_code',
                }),
            });

            const tokens = await response.json();
            console.log("Tokens recebidos do Google:", tokens);

            if (tokens.error) {
                // Adiciona um log mais detalhado do erro do Google
                console.error("Erro do Google ao trocar token:", tokens.error_description);
                throw new Error(tokens.error_description || 'Erro ao obter tokens do Google.');
            }

            const { access_token, refresh_token, expires_in } = tokens;
            console.log("refresh_token:", refresh_token);

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

  /*async redirectToGoogleAuth(req, res) {
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
  }*/
}

module.exports =  AuthController;