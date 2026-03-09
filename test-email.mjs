import nodemailer from 'nodemailer';
import dns from 'dns';

// 测试 DNS 解析
console.log('Testing DNS resolution...');
dns.lookup('smtp.qq.com', { family: 4 }, (err, address) => {
  if (err) {
    console.error('DNS lookup failed:', err);
  } else {
    console.log('Resolved smtp.qq.com to:', address);
  }
});

// 替换为你的配置
const config = {
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  user: 'YOUR_QQ@qq.com',      // 替换为你的 QQ 邮箱
  pass: 'YOUR_AUTH_CODE',       // 替换为授权码
  recipient: 'YOUR_EMAIL',      // 替换为收件邮箱
};

async function testEmail() {
  console.log('\nCreating transporter...');

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  console.log('Verifying connection...');
  try {
    await transporter.verify();
    console.log('Connection verified!');

    console.log('Sending test email...');
    const result = await transporter.sendMail({
      from: config.user,
      to: config.recipient,
      subject: 'Test Email',
      text: 'This is a test email from nodemailer.',
    });
    console.log('Email sent:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testEmail();
