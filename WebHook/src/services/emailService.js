// src/services/EmailService.js

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Configura o transportador do Nodemailer
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10), // Garante que a porta é um número inteiro
      secure: process.env.SMTP_SECURE === 'true', // Converte a string "true"/"false" para booleano
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      // Opcional: Para debug, descomente as linhas abaixo
      // logger: true,
      // debug: true,
    });

    // Configura o remetente a partir das variáveis de ambiente
    this.fromAddress = `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`;
  }

  async sendStripeErrorNotification(hotelOwnerEmail, hotelOwnerName, errorDetails) {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: hotelOwnerEmail,
        subject: '🚨 Erro no Sistema de Pagamentos - Ação Necessária',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #dc3545; margin: 0;">⚠️ Erro no Sistema de Pagamentos</h2>
            </div>
            <div style="background-color: #fff; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px;">
              <p>Olá <strong>${hotelOwnerName}</strong>,</p>
              <p>Identificamos um problema com sua conta Stripe que está impedindo o processamento de pagamentos:</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
                <h3 style="color: #dc3545; margin-top: 0;">Detalhes do Erro:</h3>
                <p style="margin: 0; font-family: monospace; font-size: 14px;">${errorDetails}</p>
              </div>
              <h3>🔧 O que você precisa fazer:</h3>
              <ol>
                <li><strong>Complete o onboarding do Stripe:</strong> Acesse seu painel administrativo.</li>
                <li><strong>Verifique as configurações:</strong> Certifique-se de que sua conta está ativa.</li>
                <li><strong>Teste novamente:</strong> Após completar o onboarding, tente fazer uma nova reserva.</li>
              </ol>
              <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #0066cc; margin-top: 0;">💡 Dica:</h4>
                <p style="margin: 0;">Este erro ocorre quando sua conta Stripe não possui as permissões necessárias para receber pagamentos. Complete o processo de verificação no Stripe para resolver.</p>
              </div>
              <p>Se precisar de ajuda, entre em contato conosco.</p>
              <p>Atenciosamente,<br>Equipe de Suporte</p>
            </div>
            <div style="text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px;">
              <p>Este é um email automático. Por favor, não responda a esta mensagem.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ [EMAIL] Notificação de erro Stripe enviada para ${hotelOwnerEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ [EMAIL] Erro ao enviar notificação para ${hotelOwnerEmail}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendBookingErrorNotification(hotelOwnerEmail, hotelOwnerName, bookingDetails, errorDetails) {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: hotelOwnerEmail,
        subject: `🚨 Erro na Criação da Reserva #${bookingDetails.id} - Ação Necessária`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #dc3545; margin: 0;">⚠️ Erro na Criação de Reserva</h2>
            </div>
            <div style="background-color: #fff; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px;">
              <p>Olá <strong>${hotelOwnerName}</strong>,</p>
              <p>Uma tentativa de reserva falhou devido a um problema com seu sistema de pagamentos:</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #495057; margin-top: 0;">📋 Detalhes da Reserva:</h3>
                <ul style="margin: 0;">
                  <li><strong>Cliente:</strong> ${bookingDetails.leadName || 'Não informado'}</li>
                  <li><strong>WhatsApp:</strong> ${bookingDetails.leadWhatsapp || 'Não informado'}</li>
                  <li><strong>Check-in:</strong> ${bookingDetails.checkIn || 'Não informado'}</li>
                  <li><strong>Check-out:</strong> ${bookingDetails.checkOut || 'Não informado'}</li>
                  <li><strong>Quarto:</strong> ${bookingDetails.roomName || 'Não informado'}</li>
                  <li><strong>Valor:</strong> R$ ${bookingDetails.totalPrice || '0,00'}</li>
                </ul>
              </div>
              <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
                <h3 style="color: #dc3545; margin-top: 0;">Detalhes do Erro:</h3>
                <p style="margin: 0; font-family: monospace; font-size: 14px;">${errorDetails}</p>
              </div>
              <h3>🔧 O que você precisa fazer:</h3>
              <ol>
                <li><strong>Verifique sua conta Stripe:</strong> Acesse seu painel administrativo.</li>
                <li><strong>Complete o onboarding:</strong> Se necessário, finalize a configuração.</li>
                <li><strong>Tente novamente:</strong> Faça uma reserva de teste.</li>
                <li><strong>Entre em contato com o cliente:</strong> Informe sobre o problema e tente novamente.</li>
              </ol>
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #856404; margin-top: 0;">⚠️ Importante:</h4>
                <p style="margin: 0;">A reserva foi cancelada automaticamente para evitar inconsistências no sistema.</p>
              </div>
              <p>Se precisar de ajuda, entre em contato conosco.</p>
              <p>Atenciosamente,<br>Equipe de Suporte</p>
            </div>
            <div style="text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px;">
              <p>Este é um email automático. Por favor, não responda a esta mensagem.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ [EMAIL] Notificação de erro de reserva enviada para ${hotelOwnerEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ [EMAIL] Erro ao enviar notificação de reserva para ${hotelOwnerEmail}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();