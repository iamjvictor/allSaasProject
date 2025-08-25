const { z } = require('zod');

const registerSchema = z.object({
  name: z.string({ 
    required_error: "O seu nome completo é obrigatório." 
  }).min(2, "O nome deve ter pelo menos 2 caracteres."),
  
  email: z.string({ 
    required_error: "O e-mail é obrigatório." 
  }).email({ message: "Formato de e-mail inválido." }),
  
  password: z.string({ 
    required_error: "A senha é obrigatória." 
  }).min(8, "A senha deve ter pelo menos 8 caracteres."),
  
  whatsappNumber: z
    .string({ required_error: "O número do WhatsApp é obrigatório." })
    .transform((phone) => phone.replace(/\D/g, ''))
    .pipe(z.string().min(10, "O número de WhatsApp é inválido.")),
    
  // --- CAMPO AGORA OBRIGATÓRIO ---
  businessName: z.string({ 
    required_error: "O nome do estabelecimento é obrigatório." 
  }).min(1, "O nome do estabelecimento não pode ser vazio."),
  
  // --- OBJETO E SEUS CAMPOS AGORA OBRIGATÓRIOS ---
  businessLocation: z.object({
    address: z.string({ required_error: "O endereço é obrigatório." }).min(1, "O endereço não pode ser vazio."),
    city: z.string({ required_error: "A cidade é obrigatória." }).min(1, "A cidade não pode ser vazia."),
    state: z.string({ required_error: "O estado é obrigatório." }).min(1, "O estado não pode ser vazio."),
    zipCode: z
        .string({ required_error: "O CEP é obrigatório." })
        .transform(cep => cep.replace(/\D/g, '')) // Limpa o CEP, deixando só os números
        .pipe(z.string().length(8, { message: "O CEP deve ter 8 dígitos." })), 
  }, { 
    required_error: "O endereço completo do estabelecimento é obrigatório." 
  }),
});

module.exports = {
  registerSchema,
};