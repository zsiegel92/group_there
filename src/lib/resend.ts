import { Resend } from "resend";

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: "GROUPTHERE <no-reply@grouptherenow.com>",
    to,
    subject,
    html,
  });
  return { data, error };
}
