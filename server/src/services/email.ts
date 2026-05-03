import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpdm.aliyun.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'image@notify.moyuu.cc',
    pass: process.env.SMTP_PASS || '',
  },
})

const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'image@notify.moyuu.cc'

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: `"GPT Image Playground" <${fromAddress}>`,
    to,
    subject: '邮箱验证码 - GPT Image Playground',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px">
        <h2 style="color:#3b82f6;margin-bottom:16px">邮箱验证码</h2>
        <p style="color:#333;font-size:14px">您的验证码为：</p>
        <div style="background:#f0f9ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;text-align:center;margin:16px 0">
          <span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#1d4ed8">${code}</span>
        </div>
        <p style="color:#666;font-size:12px">验证码 10 分钟内有效，请勿泄露给他人。</p>
        <p style="color:#999;font-size:11px;margin-top:20px">—— GPT Image Playground</p>
      </div>
    `,
  })
}
