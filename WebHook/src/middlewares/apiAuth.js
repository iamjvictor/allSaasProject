// src/middlewares/apiAuth.js

/**
 * Middleware para autenticar requisições de servidor para servidor (ex: da sua IA).
 * Ele verifica a presença de uma chave de API secreta no cabeçalho da requisição.
 */
const apiAuthMiddleware = (req, res, next) => {
  // 1. Pega a chave de API do cabeçalho da requisição.
  //    O padrão comum é usar 'x-api-key'.
  const apiKey = req.headers['x-api-key'];

  // 2. Verifica se a chave foi enviada e se ela corresponde à nossa chave secreta.
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    console.warn("Tentativa de acesso não autorizado à API da IA.");
    // Se as chaves não baterem, retorna um erro '401 Unauthorized' e para a execução.
    return res.status(401).json({ message: "Não autorizado." });
  }

  // 3. Se a chave estiver correta, a requisição pode continuar para o controller.
  console.log("Acesso via API Key validado com sucesso.");
  next();
};

module.exports = apiAuthMiddleware;