import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.resolve(__dirname, '../assets/logo.png');
function getLogoBuffer() {
  try {
    return fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;
  } catch {
    return null;
  }
}

class EmailService {
  constructor() {
    this.resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
    if (this.resend) {
      logger.info('📧 [RESEND] Outbound email service initialized successfully');
    } else {
      logger.warn(
        '⚠️ [RESEND] RESEND_API_KEY not configured. Outbound emails will be simulated to console',
      );
    }
  }

  /**
   * Get semantic copy for each OTP purpose
   */
  getPurposeDetails(purpose) {
    switch (purpose) {
      case 'LOGIN_2FA':
        return {
          subject: 'Mã OTP xác thực đăng nhập Sorak của bạn',
          title: 'Mã xác thực của bạn',
          actionText: 'đăng nhập vào tài khoản Sorak của bạn',
          verifyPurposeText: 'xác minh đăng nhập',
          warningText: 'Nếu không phải bạn, vui lòng đổi mật khẩu ngay lập tức.',
        };
      case 'ENABLE_2FA':
        return {
          subject: 'Mã OTP kích hoạt xác thực 2 bước của bạn',
          title: 'Mã xác thực của bạn',
          actionText: 'bật xác thực 2 bước (2FA) cho tài khoản Sorak của bạn',
          verifyPurposeText: 'xác nhận kích hoạt tính năng',
          warningText: 'Nếu không phải bạn thực hiện, vui lòng bỏ qua thư này.',
        };
      case 'CHANGE_EMAIL':
        return {
          subject: 'Mã OTP xác thực thay đổi địa chỉ email của bạn',
          title: 'Xác thực địa chỉ email mới',
          actionText: 'cập nhật địa chỉ email cho tài khoản Sorak của bạn',
          verifyPurposeText: 'xác minh và cập nhật email mới',
          warningText:
            'Nếu không phải bạn yêu cầu, vui lòng bỏ qua thư này hoặc kiểm tra bảo mật tài khoản.',
        };
      case 'FORGOT_PASSWORD':
      default:
        return {
          subject: 'Mã OTP đặt lại mật khẩu Sorak của bạn',
          title: 'Mã xác thực của bạn',
          actionText: 'đặt lại mật khẩu tài khoản Sorak của bạn',
          verifyPurposeText: 'tiến hành đổi mật khẩu mới',
          warningText: 'Nếu không phải bạn, vui lòng đổi mật khẩu ngay lập tức.',
        };
    }
  }

  /**
   * Clean, basic, human-designed verification email template
   * 0.00s Instant HTML Text with Retina Logo Icon:
   * - Text "Sorak | Trường Mầm Non Hòn Tre" renders instantly at 0 ms
   * - Light Mode: Pure Black (#000000)
   * - Dark Mode: Pure White (#FFFFFF)
   */
  buildOtpTemplate({ otp, userName, details }) {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${details.title}</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media (prefers-color-scheme: dark) {
      .brand-text, .brand-school { color: #ffffff !important; }
      .brand-divider { color: #64748b !important; }
      body, .email-body { background-color: #121212 !important; color: #e4e4e7 !important; }
      .email-card { background-color: #1f1f23 !important; border-color: #333338 !important; }
      .text-title { color: #f8fafc !important; }
      .text-body { color: #cbd5e1 !important; }
      .text-bold { color: #f8fafc !important; }
      .text-otp { color: #60a5fa !important; }
      .text-muted { color: #94a3b8 !important; }
      .card-divider { border-top-color: #333338 !important; }
      .text-subfooter { color: #71717a !important; }
    }
    [data-ogsc] .brand-text, [data-ogsc] .brand-school { color: #ffffff !important; }
    [data-ogsc] .brand-divider { color: #64748b !important; }
    [data-ogsc] body, [data-ogsc] .email-body { background-color: #121212 !important; color: #e4e4e7 !important; }
    [data-ogsc] .email-card { background-color: #1f1f23 !important; border-color: #333338 !important; }
    [data-ogsc] .text-title { color: #f8fafc !important; }
    [data-ogsc] .text-body { color: #cbd5e1 !important; }
    [data-ogsc] .text-bold { color: #f8fafc !important; }
    [data-ogsc] .text-otp { color: #60a5fa !important; }
    [data-ogsc] .text-muted { color: #94a3b8 !important; }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 48px 16px; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #374151;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <!-- Top Instant Brand Header (0.00s Native HTML Text + Retina Logo Icon) -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px auto;">
          <tr>
            <td valign="middle" style="padding-right: 8px; vertical-align: middle;">
              <img src="cid:logo" width="20" height="22" alt="Sorak" style="display: block; border: 0; outline: none; text-decoration: none; width: 20px; height: 22px;" />
            </td>
            <td valign="middle" class="brand-text" style="vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 18px; font-weight: 900; color: #000000; letter-spacing: -0.5px; line-height: 1; mso-line-height-rule: exactly;">
              Sorak
            </td>
            <td valign="middle" class="brand-divider" style="vertical-align: middle; padding: 0 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 300; color: #94a3b8; line-height: 1; mso-line-height-rule: exactly;">
              |
            </td>
            <td valign="middle" class="brand-school" style="vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 700; color: #000000; letter-spacing: -0.2px; line-height: 1; white-space: nowrap; mso-line-height-rule: exactly;">
              Trường Mầm Non Hòn Tre
            </td>
          </tr>
        </table>

        <!-- Clean Minimal Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-card" style="max-width: 480px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
          <tr>
            <td style="padding: 36px 32px; text-align: center;">
              <!-- Title -->
              <h2 class="text-title" style="margin: 0 0 20px 0; font-size: 18px; font-weight: 700; color: #111827; text-align: center;">
                ${details.title}
              </h2>

              <!-- Main Message with Bold OTP Code -->
              <p class="text-body" style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #374151; text-align: center;">
                Xin chào${userName ? ` <strong class="text-bold">${userName}</strong>` : ''}, hệ thống nhận được yêu cầu ${details.actionText}; nếu là bạn, vui lòng nhập mã sau: <strong class="text-otp" style="font-size: 16px; color: #111827; letter-spacing: 1.5px;">${otp}</strong> để ${details.verifyPurposeText}. ${details.warningText}
              </p>

              <!-- Expiration Notice -->
              <p class="text-muted" style="margin: 0 0 24px 0; font-size: 13px; color: #6b7280; text-align: center;">
                Mã này sẽ hết hạn trong 5 phút.
              </p>

              <!-- Subtle Dashed Divider -->
              <div class="card-divider" style="border-top: 1px dashed #e5e7eb; margin: 24px 0;"></div>

              <!-- Support Note -->
              <p class="text-muted" style="margin: 0; font-size: 13px; line-height: 1.5; color: #6b7280; text-align: center;">
                Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ ban quản trị nhà trường để được hỗ trợ.
              </p>
            </td>
          </tr>
        </table>

        <!-- Subtle Subtitle below card -->
        <div class="text-subfooter" style="max-width: 480px; margin-top: 20px; text-align: center; font-size: 11.5px; color: #9ca3af; line-height: 1.5;">
          Sorak – Giải pháp chuyển đổi số trong quy trình quản lý kế hoạch giáo dục tại Trường Mầm non Hòn Tre.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Dispatch basic, clean OTP email with unified brand header image to recipient
   * @param {{ to: string, otp: string, purpose: 'LOGIN_2FA' | 'ENABLE_2FA' | 'FORGOT_PASSWORD', userName?: string }} params
   */
  async sendOtpEmail({ to, otp, purpose, userName }) {
    const details = this.getPurposeDetails(purpose);
    const html = this.buildOtpTemplate({
      otp,
      userName,
      details,
    });

    if (!this.resend) {
      logger.info(
        { to, purpose, otp },
        '📧 [SIMULATED EMAIL] RESEND_API_KEY missing, OTP logged to console',
      );
      return { success: true, simulated: true };
    }

    try {
      const fromSender = env.emailFrom.includes('<')
        ? env.emailFrom
        : `Trường Mầm Non Hòn Tre x Sorak <${env.emailFrom}>`;

      const attachments = [];
      const logoBuffer = getLogoBuffer();
      if (logoBuffer) {
        attachments.push({
          filename: 'logo.png',
          content: logoBuffer,
          contentId: 'logo',
          content_id: 'logo',
        });
      }

      const { data, error } = await this.resend.emails.send({
        from: fromSender,
        to: [to],
        subject: details.subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (error) {
        logger.warn(
          { error, to, purpose, otp },
          '⚠️ [RESEND NOTICE] Could not deliver email (Check if recipient is allowed on free tier). Fallback OTP provided in log.',
        );
        return { success: false, error };
      }

      logger.info(
        { emailId: data.id, to, purpose, from: fromSender },
        '🚀 [RESEND SUCCESS] Outbound email sent successfully via Resend API',
      );
      return { success: true, id: data.id };
    } catch (err) {
      logger.error(
        { err, to, purpose, otp },
        '❌ [RESEND ERROR] Failed to send email via Resend API. Fallback OTP provided in log.',
      );
      return { success: false, error: err };
    }
  }
}

export const emailService = new EmailService();
