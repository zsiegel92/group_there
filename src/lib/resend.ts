import { Resend } from "resend";

type EmailParams =
  | {
      to: string;
      subject: string;
      html: string;
    }
  | {
      to: string;
      subject: string;
      text: string;
    }
  | {
      to: string;
      subject: string;
      html: string;
      text: string;
    };

export async function sendEmail(params: EmailParams) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: "GROUPTHERE <no-reply@grouptherenow.com>",
    ...params,
  });
  return { data, error };
}
