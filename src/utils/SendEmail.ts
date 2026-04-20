import nodemailer from 'nodemailer';
import AppError from './appError';

/**
 * Initiates the nodemailer transporter with the Gmail service and authentication details from environment variables.
 */
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * Sends an email to the specified address.
 * @param addr The email address of the destination.
 * @param subj The subject of the email.
 * @param txt The text content of the email.
 * @param html The HTML content of the email.
 * @returns A promise resolving to a boolean indicating whether the email was sent successfully.
 */
export async function sendEmail(
  addr: string,
  subj: string,
  txt: string,
  html: string,
) {
  const mailOptions = {
    from: `"Ranger Camp Manager" <${process.env.EMAIL_USER}>`,
    to: addr,
    subject: subj,
    text: txt,
    html: html,
  };
  const info = await transporter.sendMail(mailOptions);
  if(info.response.split(' ')[0] != "250") {
    throw new AppError("Couldn't send email to client!", 500);
  }
  return !!info.messageId;
}
