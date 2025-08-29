// src/controllers/authController.js
const supabase = require('../clients/supabase-client.js');
const { registerSchema } = require('../validators/authValidator');

const userRepository = require('../repository/usersRepository'); 



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

            if (tokens.error) {
                // Adiciona um log mais detalhado do erro do Google
                console.error("Erro do Google ao trocar token:", tokens.error_description);
                throw new Error(tokens.error_description || 'Erro ao obter tokens do Google.');
            }

            const { access_token, refresh_token, expires_in } = tokens;

            // Instancie seu repositório para usar os métodos
          

            // 2. Salvar os tokens no banco de dados
            await userRepository.saveGoogleTokens({
                userId,
                accessToken: access_token,
                refreshToken: refresh_token,
                expiresIn: expires_in,
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
}

module.exports =  AuthController;