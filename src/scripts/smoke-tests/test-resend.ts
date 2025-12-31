import { sendEmail } from "@/lib/resend";

async function main() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  if (!process.env.TEST_RECIPIENT_EMAIL_ADDRESS) {
    throw new Error("TEST_RECIPIENT_EMAIL_ADDRESS is not set");
  }
  const { data, error } = await sendEmail({
    to: process.env.TEST_RECIPIENT_EMAIL_ADDRESS,
    subject: "hello world",
    html: "<p>it works!</p>",
    text: "it works!",
  });
  console.log(data);
  console.log(error);
}

main();
