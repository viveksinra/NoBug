import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || 'noreply@bugdetector.io';

const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  if (!resend) {
    console.warn(
      '[Email] RESEND_API_KEY not set — skipping email send. Subject:',
      subject,
      'To:',
      to
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject,
    html,
  });

  if (error) {
    console.error('[Email] Failed to send email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail({
    to,
    subject: 'Reset your NoBug password',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">NoBug</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Password Reset</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">
                We received a request to reset your password. Click the button below to choose a new password.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#18181b;border-radius:6px;padding:12px 24px;">
                    <a href="${resetUrl}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#a1a1aa;">
                If you didn't request this, you can safely ignore this email. The link expires in 1 hour.
              </p>
              <p style="margin:24px 0 0;font-size:12px;color:#d4d4d8;border-top:1px solid #f4f4f5;padding-top:16px;">
                NoBug &mdash; AI-native bug tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  await sendEmail({
    to,
    subject: 'Verify your NoBug email address',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">NoBug</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Email Verification</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">
                Thanks for signing up! Please verify your email address by clicking the button below.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#18181b;border-radius:6px;padding:12px 24px;">
                    <a href="${verifyUrl}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#a1a1aa;">
                If you didn't create an account, you can safely ignore this email.
              </p>
              <p style="margin:24px 0 0;font-size:12px;color:#d4d4d8;border-top:1px solid #f4f4f5;padding-top:16px;">
                NoBug &mdash; AI-native bug tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

export async function sendInvitationEmail(
  to: string,
  inviterName: string,
  companyName: string,
  acceptUrl: string
) {
  await sendEmail({
    to,
    subject: `You've been invited to join ${companyName} on NoBug`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">NoBug</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Team Invitation</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">
                <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on NoBug.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">
                Click the button below to accept the invitation and join the team.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#18181b;border-radius:6px;padding:12px 24px;">
                    <a href="${acceptUrl}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#a1a1aa;">
                If you don't recognize this invitation, you can safely ignore this email. The link expires in 7 days.
              </p>
              <p style="margin:24px 0 0;font-size:12px;color:#d4d4d8;border-top:1px solid #f4f4f5;padding-top:16px;">
                NoBug &mdash; AI-native bug tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}
