import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { User, Order, Event, TicketInstance } from '@prisma/client';
import * as QRCode from 'qrcode';

interface OrderWithDetails extends Order {
  event?: Event;
  items?: Array<{
    ticket?: {
      title: string;
    };
    quantity: number;
    unitPrice: any;
    totalPrice: any;
  }>;
  ticketInstances?: TicketInstance[];
}

@Injectable()
export class EmailService {
  private sesClient: SESClient;
  private readonly logger = new Logger(EmailService.name);
  private fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.initializeSESClient();
  }

  private initializeSESClient() {
    const awsRegion = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const awsAccessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.fromEmail = this.configService.get<string>('EMAIL_FROM') || 'noreply@skryptaeventos.com';

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      this.logger.warn('AWS SES configuration is incomplete. Email features will be disabled.');
      return;
    }

    this.sesClient = new SESClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    this.logger.log(`AWS SES client initialized successfully in region: ${awsRegion}`);
  }

  private async sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
    if (!this.sesClient) {
      this.logger.warn('AWS SES client not configured. Skipping email.');
      return;
    }

    try {
      const command = new SendEmailCommand({
        Source: this.fromEmail,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
          },
        },
      });

      await this.sesClient.send(command);
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  async sendVerificationEmail(user: User, verificationToken: string): Promise<void> {
    const verificationUrl = `${this.configService.get<string>('APP_URL')}/auth/verify-email?token=${verificationToken}`;

    const htmlBody = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
                .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Bem-vindo ao SkryptaEventos!</h1>
                </div>
                <div class="content">
                  <p>Olá, <strong>${user.name}</strong>!</p>
                  <p>Obrigado por se cadastrar no SkryptaEventos. Para completar seu cadastro, por favor verifique seu email clicando no botão abaixo:</p>
                  <div style="text-align: center;">
                    <a href="${verificationUrl}" class="button">Verificar Email</a>
                  </div>
                  <p>Ou copie e cole o link abaixo no seu navegador:</p>
                  <p style="word-break: break-all; color: #666; font-size: 12px;">${verificationUrl}</p>
                  <p>Este link expirará em 24 horas.</p>
                </div>
                <div class="footer">
                  <p>Se você não se cadastrou no SkryptaEventos, ignore este email.</p>
                  <p>&copy; ${new Date().getFullYear()} SkryptaEventos. Todos os direitos reservados.</p>
                </div>
              </div>
            </body>
          </html>
        `;

    await this.sendEmail(user.email, 'Verifique seu email - SkryptaEventos', htmlBody);
  }

  async sendPasswordResetEmail(user: User, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('APP_URL')}/auth/reset-password?token=${resetToken}`;

    const htmlBody = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
                .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                .warning { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Redefinição de Senha</h1>
                </div>
                <div class="content">
                  <p>Olá, <strong>${user.name}</strong>!</p>
                  <p>Recebemos uma solicitação para redefinir a senha da sua conta no SkryptaEventos.</p>
                  <div style="text-align: center;">
                    <a href="${resetUrl}" class="button">Redefinir Senha</a>
                  </div>
                  <p>Ou copie e cole o link abaixo no seu navegador:</p>
                  <p style="word-break: break-all; color: #666; font-size: 12px;">${resetUrl}</p>
                  <div class="warning">
                    <strong>⚠️ Segurança:</strong> Este link expirará em 1 hora. Se você não solicitou a redefinição de senha, ignore este email e sua senha permanecerá inalterada.
                  </div>
                </div>
                <div class="footer">
                  <p>Por segurança, nunca compartilhe este link com ninguém.</p>
                  <p>&copy; ${new Date().getFullYear()} SkryptaEventos. Todos os direitos reservados.</p>
                </div>
              </div>
            </body>
          </html>
        `;

    await this.sendEmail(user.email, 'Redefinição de Senha - SkryptaEventos', htmlBody);
  }

  async sendOrderConfirmationEmail(user: User, order: OrderWithDetails): Promise<void> {

    const itemsHtml = order.items?.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.ticket?.title || 'Ingresso'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">R$ ${Number(item.unitPrice).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">R$ ${Number(item.totalPrice).toFixed(2)}</td>
      </tr>
    `).join('') || '';

    const htmlBody = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
                .order-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
                th { background: #f3f4f6; padding: 10px; text-align: left; }
                .total { font-size: 18px; font-weight: bold; color: #10B981; text-align: right; margin-top: 20px; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>✅ Pedido Confirmado!</h1>
                </div>
                <div class="content">
                  <p>Olá, <strong>${user.name}</strong>!</p>
                  <p>Seu pedido foi confirmado com sucesso!</p>

                  <div class="order-info">
                    <h3>Detalhes do Pedido</h3>
                    <p><strong>Número do Pedido:</strong> #${order.id.substring(0, 8)}</p>
                    <p><strong>Evento:</strong> ${order.event?.title || 'N/A'}</p>
                    <p><strong>Data do Pedido:</strong> ${new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                    <p><strong>Status:</strong> ${order.status === 'CONFIRMED' ? 'Confirmado' : order.status}</p>
                  </div>

                  <h3>Itens do Pedido</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Ingresso</th>
                        <th style="text-align: center;">Quantidade</th>
                        <th style="text-align: right;">Preço Unit.</th>
                        <th style="text-align: right;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHtml}
                    </tbody>
                  </table>

                  ${order.discount && Number(order.discount) > 0 ? `
                    <p style="text-align: right; color: #10B981;">
                      <strong>Desconto:</strong> - R$ ${Number(order.discount).toFixed(2)}
                    </p>
                  ` : ''}

                  ${order.serviceFee && Number(order.serviceFee) > 0 ? `
                    <p style="text-align: right;">
                      <strong>Taxa de Serviço:</strong> R$ ${Number(order.serviceFee).toFixed(2)}
                    </p>
                  ` : ''}

                  <p class="total">Total: R$ ${Number(order.total).toFixed(2)}</p>

                  ${order.ticketInstances && order.ticketInstances.length > 0 ? `
                    <div class="order-info">
                      <h3>🎫 Seus Ingressos</h3>
                      <p>Seus ingressos foram gerados! Você pode acessá-los na sua conta.</p>
                      <p>Quantidade de ingressos: <strong>${order.ticketInstances.length}</strong></p>
                    </div>
                  ` : ''}

                  <p>Obrigado por usar o SkryptaEventos!</p>
                </div>
                <div class="footer">
                  <p>Dúvidas? Entre em contato conosco.</p>
                  <p>&copy; ${new Date().getFullYear()} SkryptaEventos. Todos os direitos reservados.</p>
                </div>
              </div>
            </body>
          </html>
        `;

    await this.sendEmail(user.email, `Confirmação de Pedido #${order.id.substring(0, 8)} - SkryptaEventos`, htmlBody);
  }

  async sendTicketConfirmationEmail(user: User, order: OrderWithDetails, ticketInstances: any[]): Promise<void> {
    // Generate QR code images for all tickets as Buffer (for inline attachments)
    const ticketsWithQRCode = await Promise.all(
      ticketInstances.map(async (instance, index) => {
        try {
          // Generate QR code as PNG buffer
          const qrCodeBuffer = await QRCode.toBuffer(instance.qrCode, {
            errorCorrectionLevel: 'H',
            type: 'png',
            width: 300,
            margin: 2,
          });
          return {
            ...instance,
            qrCodeBuffer,
            qrCodeCid: `qrcode-${index}@skryptaeventos.com` // Content-ID for inline image
          };
        } catch (error) {
          this.logger.error(`Failed to generate QR code for ticket ${instance.id}:`, error);
          return { ...instance, qrCodeBuffer: null, qrCodeCid: null };
        }
      })
    );

    // Build tickets HTML list with QR code images referenced by CID
    const ticketsHtml = ticketsWithQRCode.map((instance, index) => `
      <div style="background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #10B981; text-align: center;">
        <h4 style="margin: 0 0 15px 0; color: #1F2937;">🎫 Ingresso ${index + 1} - ${instance.ticket?.title || 'Ingresso'}</h4>
        ${instance.qrCodeCid ? `
          <div style="background: #F9FAFB; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <img src="cid:${instance.qrCodeCid}" alt="QR Code Ingresso ${index + 1}" style="max-width: 250px; height: auto; display: block; margin: 0 auto;" />
          </div>
        ` : ''}
        <p style="margin: 10px 0; font-size: 12px; color: #6B7280;">
          <strong>Código:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 11px;">${instance.qrCode}</code>
        </p>
        <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #10B981; font-weight: bold;">${instance.status === 'ACTIVE' ? 'Ativo' : instance.status}</span></p>
        ${instance.isHalfPrice ? '<p style="margin: 8px 0; color: #F59E0B; font-weight: bold;">🎟️ Meia-entrada</p>' : ''}
      </div>
    `).join('');

    const htmlBody = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
                .success-box { background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; }
                .tickets-section { margin: 20px 0; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🎉 Seus Ingressos Estão Prontos!</h1>
                </div>
                <div class="content">
                  <p>Olá, <strong>${user.name}</strong>!</p>

                  <div class="success-box">
                    <strong>✅ Pagamento Confirmado!</strong><br>
                    Seus ingressos foram gerados com sucesso.
                  </div>

                  <h3>📋 Detalhes do Pedido</h3>
                  <p><strong>Pedido:</strong> #${order.id.substring(0, 8)}</p>
                  <p><strong>Evento:</strong> ${order.event?.title || 'N/A'}</p>
                  <p><strong>Valor Total:</strong> R$ ${Number(order.total).toFixed(2)}</p>

                  <div class="tickets-section">
                    <h3>🎫 Seus Ingressos (${ticketInstances.length})</h3>
                    ${ticketsHtml}
                  </div>

                  <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 15px; margin: 20px 0;">
                    <strong>💡 Como usar seus ingressos:</strong><br>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                      <li><strong>Apresente o QR Code</strong> na entrada do evento para fazer o check-in</li>
                      <li>Você pode <strong>mostrar este e-mail</strong> ou acessar seus ingressos na plataforma</li>
                      <li>Cada QR Code é <strong>único e intransferível</strong></li>
                      <li>Guarde bem este e-mail - você precisará dele no dia do evento!</li>
                    </ul>
                  </div>

                  <p style="text-align: center; margin-top: 30px;">
                    <strong>Aproveite o evento!</strong> 🎊
                  </p>
                </div>
                <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} SkryptaEventos. Todos os direitos reservados.</p>
                </div>
              </div>
            </body>
          </html>
        `;

    try {
      // Build MIME email with inline images
      const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const subject = `Seus Ingressos - ${order.event?.title || 'Evento'} - SkryptaEventos`;

      let rawEmail = '';
      rawEmail += `From: ${this.fromEmail}\r\n`;
      rawEmail += `To: ${user.email}\r\n`;
      rawEmail += `Subject: ${subject}\r\n`;
      rawEmail += `MIME-Version: 1.0\r\n`;
      rawEmail += `Content-Type: multipart/related; boundary="${boundary}"\r\n`;
      rawEmail += `\r\n`;

      // HTML body part
      rawEmail += `--${boundary}\r\n`;
      rawEmail += `Content-Type: text/html; charset=UTF-8\r\n`;
      rawEmail += `Content-Transfer-Encoding: quoted-printable\r\n`;
      rawEmail += `\r\n`;
      rawEmail += htmlBody;
      rawEmail += `\r\n`;

      // Add QR code images as inline attachments with proper headers
      for (const ticket of ticketsWithQRCode) {
        if (ticket.qrCodeBuffer && ticket.qrCodeCid) {
          rawEmail += `--${boundary}\r\n`;
          rawEmail += `Content-Type: image/png\r\n`;
          rawEmail += `Content-Transfer-Encoding: base64\r\n`;
          rawEmail += `Content-Disposition: inline\r\n`;
          rawEmail += `Content-ID: <${ticket.qrCodeCid}>\r\n`;
          rawEmail += `\r\n`;

          // Split base64 into 76-character lines (RFC 2045)
          const base64Data = ticket.qrCodeBuffer.toString('base64');
          const lines = base64Data.match(/.{1,76}/g) || [];
          rawEmail += lines.join('\r\n');
          rawEmail += `\r\n`;
        }
      }

      rawEmail += `--${boundary}--\r\n`;

      // Send raw email using SES
      const command = new SendRawEmailCommand({
        Source: this.fromEmail,
        Destinations: [user.email],
        RawMessage: {
          Data: Buffer.from(rawEmail),
        },
      });

      await this.sesClient.send(command);
      this.logger.log(`Ticket confirmation email with QR codes sent successfully to ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send ticket confirmation email to ${user.email}:`, error);
      // Don't throw - email is not critical for payment processing
    }
  }

  async sendPaymentWaitingEmail(user: User, order: OrderWithDetails, paymentMethod: string, paymentData?: any): Promise<void> {
    let paymentInstructions = '';

    // Add specific instructions based on payment method
    if (paymentMethod === 'PIX') {
      paymentInstructions = `
        <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 15px; margin: 20px 0;">
          <strong>📱 Instruções para Pagamento via PIX:</strong><br>
          <ol style="margin: 10px 0; padding-left: 20px;">
            <li>Abra o app do seu banco</li>
            <li>Escolha a opção "Pagar com PIX"</li>
            <li>Escaneie o QR Code ou copie o código PIX abaixo</li>
            <li>Confirme o pagamento</li>
          </ol>
          ${paymentData?.pixCode ? `
            <p style="margin-top: 15px;"><strong>Código PIX Copia e Cola:</strong></p>
            <div style="background: white; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px; font-family: monospace;">
              ${paymentData.pixCode}
            </div>
          ` : ''}
          <p style="margin-top: 10px; color: #DC2626; font-weight: bold;">⏰ Este QR Code expira em 24 horas</p>
        </div>
      `;
    } else if (paymentMethod === 'BOLETO') {
      paymentInstructions = `
        <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
          <strong>🏦 Instruções para Pagamento via Boleto:</strong><br>
          <ol style="margin: 10px 0; padding-left: 20px;">
            <li>Acesse o boleto através do link que você recebeu</li>
            <li>Pague no seu banco ou aplicativo de pagamentos</li>
            <li>O boleto pode levar até 2 dias úteis para ser compensado</li>
          </ol>
          ${paymentData?.bankSlipUrl ? `
            <div style="text-align: center; margin: 15px 0;">
              <a href="${paymentData.bankSlipUrl}" style="display: inline-block; background: #F59E0B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
                Visualizar Boleto
              </a>
            </div>
          ` : ''}
        </div>
      `;
    } else if (paymentMethod === 'CREDIT_CARD') {
      paymentInstructions = `
        <div style="background: #F3E8FF; border-left: 4px solid #9333EA; padding: 15px; margin: 20px 0;">
          <strong>💳 Pagamento com Cartão de Crédito:</strong><br>
          <p style="margin: 10px 0;">Seu pagamento está sendo processado. Você receberá uma confirmação em breve.</p>
        </div>
      `;
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .waiting-box { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏳ Aguardando Pagamento</h1>
            </div>
            <div class="content">
              <p>Olá, <strong>${user.name}</strong>!</p>

              <div class="waiting-box">
                <strong>⏰ Seu pedido está aguardando pagamento</strong><br>
                Complete o pagamento para garantir seus ingressos!
              </div>

              <p><strong>Pedido:</strong> #${order.id.substring(0, 8)}</p>
              <p><strong>Evento:</strong> ${order.event?.title || 'N/A'}</p>
              <p><strong>Valor:</strong> R$ ${Number(order.total).toFixed(2)}</p>
              <p><strong>Método de Pagamento:</strong> ${paymentMethod}</p>

              ${paymentInstructions}

              <p>Assim que o pagamento for confirmado, seus ingressos serão liberados automaticamente!</p>
            </div>
            <div class="footer">
              <p>Dúvidas? Entre em contato conosco.</p>
              <p>&copy; ${new Date().getFullYear()} SkryptaEventos. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.sendEmail(user.email, `Aguardando Pagamento - Pedido #${order.id.substring(0, 8)} - SkryptaEventos`, htmlBody);
    } catch (error) {
      this.logger.error(`Failed to send payment waiting email to ${user.email}:`, error);
      // Don't throw - email is not critical for payment processing
    }
  }
}
