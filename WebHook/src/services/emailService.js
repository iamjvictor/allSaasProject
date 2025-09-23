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

  async sendStripeErrorNotification(hotelOwnerEmail,onboardingLink, hotelOwnerName, errorDetails, leadWhatsappNumber = null) {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: hotelOwnerEmail,
        subject: '🚨 Erro no Sistema de Pagamentos - Ação Manual Necessária',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #dc3545; margin: 0;">⚠️ Erro no Sistema de Pagamentos</h2>
            </div>
            <div style="background-color: #fff; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px;">
              <p>Olá <strong>${hotelOwnerName}</strong>,</p>
              <p>Identificamos um problema com sua conta Stripe que está impedindo o processamento de pagamentos${leadWhatsappNumber ? ` para o cliente ${leadWhatsappNumber}` : ''}:</p>
              <p>Para resolver o problema, você precisa completar o onboarding do Stripe.</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
                <h3 style="color: #dc3545; margin-top: 0;">Detalhes do Erro:</h3>
                <p style="margin: 0; font-family: monospace; font-size: 14px;">${errorDetails}</p>
              </div>
              <h3>🔧 O que você precisa fazer:</h3>
              <ol>
                <li><strong>Termine o atendimento com o cliente ${leadWhatsappNumber ? ` ${leadWhatsappNumber}` : ''}</strong></li>
                <li><strong>Complete o onboarding do Stripe:</strong> Acesse seu painel administrativo.</li>
                <li><strong>Verifique as configurações:</strong> Certifique-se de que sua conta está ativa.</li>
                <li><strong>Teste novamente:</strong> Após completar o onboarding, tente fazer uma nova reserva.</li>
              </ol>
              <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #0066cc; margin-top: 0;">💡 Dica:</h4>
                <p style="margin: 0;">Este erro ocorre quando sua conta Stripe não possui as permissões necessárias para receber pagamentos. Complete o processo de verificação no Stripe para resolver.</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${onboardingLink}" target="_blank" style="background-color: #0d9488; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Concluir Configuração na Stripe
                </a>
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

  async sendSubscriptionCancellationNotification(hotelOwnerEmail, hotelOwnerName, cancelAtDate) {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: hotelOwnerEmail,
        subject: '📋 Assinatura Cancelada - Confirmação',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #6c757d; margin: 0;">📋 Assinatura Cancelada</h2>
            </div>
            
            <div style="background-color: #fff; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px;">
              <p>Olá <strong>${hotelOwnerName}</strong>,</p>
              
              <p>Sua assinatura foi cancelada com sucesso. Agradecemos por ter usado nossos serviços!</p>
              <p>A data de cancelamento é: ${cancelAtDate ? new Date(cancelAtDate).toLocaleDateString('pt-BR') : 'Não informada'}</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #495057; margin-top: 0;">📋 Detalhes do Cancelamento:</h3>
                <ul style="margin: 0;">
                  <li><strong>Data do Cancelamento:</strong> ${cancelAtDate ? new Date(cancelAtDate).toLocaleDateString('pt-BR') : 'Não informada'}</li>
                  <li><strong>Status:</strong> Cancelada</li>
                </ul>
              </div>
              
              <h3>📝 O que acontece agora:</h3>
              <ol>
                <li><strong>Acesso ao Sistema:</strong> Você ainda terá acesso até o final do período pago</li>
                <li><strong>Dados Preservados:</strong> Seus dados e configurações serão mantidos por 30 dias</li>
                <li><strong>Reativação:</strong> Você pode reativar sua assinatura a qualquer momento</li>
                <li><strong>Suporte:</strong> Nossa equipe continua disponível para ajudar</li>
              </ol>
              
              <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #0066cc; margin-top: 0;">💡 Quer reativar sua assinatura?</h4>
                <p style="margin: 0;">Entre em contato conosco ou acesse seu painel administrativo para reativar sua assinatura a qualquer momento.</p>
              </div>
              
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #856404; margin-top: 0;">⚠️ Importante:</h4>
                <p style="margin: 0;">Após o período final, sua conta será suspensa e você perderá acesso às funcionalidades premium.</p>
              </div>
              
              <p>Obrigado por ter confiado em nossos serviços!</p>
              
              <p>Atenciosamente,<br>Equipe de Suporte</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px;">
              <p>Este é um email automático. Por favor, não responda a esta mensagem.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ [EMAIL] Notificação de cancelamento de assinatura enviada para ${hotelOwnerEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ [EMAIL] Erro ao enviar notificação de cancelamento de assinatura para ${hotelOwnerEmail}:`, error);
      return { success: false, error: error.message };
    }
  }
  async sendSubscriptionDEletedNotification(hotelOwnerEmail, hotelOwnerName) {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: hotelOwnerEmail,
        subject: '📋 Assinatura Deletada - Confirmação',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p>Olá <strong>${hotelOwnerName}</strong>,</p>
              <h2 style="color: #6c757d; margin: 0;">📋 Assinatura Deletada</h2>
              <p>Sua assinatura foi deletada com sucesso. Agradecemos por ter usado nossos serviços!</p>
            </div>
          </div>
        `
      };
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ [EMAIL] Notificação de cancelamento de assinatura enviada para ${hotelOwnerEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ [EMAIL] Erro ao enviar notificação de cancelamento de assinatura para ${hotelOwnerEmail}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendPaymentOverdueNotification(hotelOwnerEmail, hotelOwnerName, overdueDetails) {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: hotelOwnerEmail,
        subject: '⚠️ Pagamento em Atraso - Ação Necessária',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
              <h2 style="color: #dc2626; margin: 0;">⚠️ Pagamento em Atraso</h2>
            </div>
            
            <div style="background-color: #fff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
              <p>Olá <strong>${hotelOwnerName}</strong>,</p>
              
              <p>Seu pagamento está em atraso. Para manter o acesso aos nossos serviços, você precisa atualizar seu método de pagamento.</p>
              
              <div style="background-color: #fef2f2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #dc2626; margin-top: 0;">📋 Detalhes do Atraso:</h3>
                <ul style="margin: 0;">
                  <li><strong>Data do Atraso:</strong> ${new Date(overdueDetails.overdueDate).toLocaleDateString('pt-BR')}</li>
                  <li><strong>ID do Cliente:</strong> ${overdueDetails.customerId}</li>
                  ${overdueDetails.currentPeriodEndsAt ? `<li><strong>Período Final:</strong> ${new Date(overdueDetails.currentPeriodEndsAt).toLocaleDateString('pt-BR')}</li>` : ''}
                </ul>
              </div>
              
              <h3>🚨 O que acontece agora:</h3>
              <ol>
                <li><strong>Acesso Limitado:</strong> Seu acesso aos serviços está temporariamente limitado</li>
                <li><strong>Atualização Necessária:</strong> Você precisa atualizar seu método de pagamento</li>
                <li><strong>Prazo:</strong> Temos algumas tentativas antes do cancelamento automático</li>
                <li><strong>Suporte:</strong> Nossa equipe está disponível para ajudar</li>
              </ol>
              
              <div style="background-color: #dbeafe; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #1d4ed8; margin-top: 0;">💡 Como resolver:</h4>
                <p style="margin: 0 0 15px 0;">Clique no botão abaixo para atualizar seu método de pagamento:</p>
                ${overdueDetails.portalUrl ? `
                  <a href="${overdueDetails.portalUrl}" 
                     style="display: inline-block; background-color: #1d4ed8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    🔗 Atualizar Método de Pagamento
                  </a>
                ` : `
                  <p style="margin: 0; color: #6b7280;">Acesse seu dashboard e clique em "Atualizar Pagamento" para resolver esta situação rapidamente.</p>
                `}
              </div>
              
              <div style="background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h4 style="color: #d97706; margin-top: 0;">⚠️ Importante:</h4>
                <p style="margin: 0;">Se não atualizar seu pagamento, sua assinatura será cancelada automaticamente e você perderá acesso aos serviços.</p>
              </div>
              
              <p>Resolva isso o quanto antes para evitar interrupções!</p>
              
              <p>Atenciosamente,<br>Equipe de Suporte</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
              <p>Este é um email automático. Por favor, não responda a esta mensagem.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ [EMAIL] Notificação de pagamento em atraso enviada para ${hotelOwnerEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ [EMAIL] Erro ao enviar notificação de pagamento em atraso para ${hotelOwnerEmail}:`, error);
      return { success: false, error: error.message };
    }
  }
  async sendCallHumanAgentEmail(hotelOwnerEmail, hotelOwnerName, leadWhatsappNumber) {
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: hotelOwnerEmail,
        subject: '📞 Atendimento Humano Necessário',
        html: 
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <p>Olá <strong>${hotelOwnerName}</strong>,</p>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #6c757d; margin: 0;">📞 Atendimento Humano Necessário</h2>
              <p>Um cliente está precisando de atendimento humano. Por favor, entre em contato com ele.</p>
              <p>WhatsApp: ${leadWhatsappNumber}</p>
            </div>
          </div>
        `
      };
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ [EMAIL] Notificação de atendimento humano enviada para ${hotelOwnerEmail}:`, result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ [EMAIL] Erro ao enviar notificação de atendimento humano para ${hotelOwnerEmail}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();