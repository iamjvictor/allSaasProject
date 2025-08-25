// src/controllers/authController.js
const supabase = require('../clients/supabase-client.js');
const { registerSchema } = require('../validators/authValidator');


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
}

module.exports =  AuthController;