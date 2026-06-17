import {
  Body, Button, Container, Head, Heading, Html, Preview,
  Section, Text, Hr,
} from "@react-email/components";

interface PaymentFailedEmailProps {
  name: string;
  attempt: 1 | 2 | 3;
  updateUrl: string;
}

const COPY = {
  1: {
    preview: "Action required: your CapitalReach payment failed",
    heading: "Payment failed",
    body: "We tried to charge your card but the payment didn't go through. Please update your payment method to keep your listing active.",
    urgency: "normal",
  },
  2: {
    preview: "⚠️ Reminder: your CapitalReach payment is still failing",
    heading: "Still having trouble collecting payment",
    body: "We tried again but your payment failed. Your listing may be suspended soon. Please update your card now to avoid interruption.",
    urgency: "warning",
  },
  3: {
    preview: "🚨 Final warning: CapitalReach account will be suspended in 24 hours",
    heading: "Account suspension in 24 hours",
    body: "This is your final notice. We were unable to collect payment after multiple attempts. Your account will be suspended in 24 hours. Update your payment method immediately.",
    urgency: "critical",
  },
};

export default function PaymentFailedEmail({ name, attempt, updateUrl }: PaymentFailedEmailProps) {
  const copy = COPY[attempt];
  const buttonBg = attempt === 3 ? "#dc2626" : "#4f46e5";

  return (
    <Html>
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>⚡ CapitalReach</Text>
          {attempt === 3 && (
            <Section style={alertBanner}>
              <Text style={alertText}>⚠️ URGENT — Account Suspension Warning</Text>
            </Section>
          )}
          <Heading style={h1}>{copy.heading}</Heading>
          <Text style={text}>Hi {name},</Text>
          <Text style={text}>{copy.body}</Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button style={{ ...button, backgroundColor: buttonBg }} href={updateUrl}>
              Update Payment Method →
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            CapitalReach · If you believe this is an error, please contact <a href="mailto:billing@capitalreach.com" style={{ color: "#4f46e5" }}>billing@capitalreach.com</a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

PaymentFailedEmail.PreviewProps = {
  name: "Jane Smith",
  attempt: 1,
  updateUrl: "https://billing.stripe.com/test",
} as PaymentFailedEmailProps;

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Inter', sans-serif" };
const container = { maxWidth: "520px", margin: "0 auto", padding: "40px 20px" };
const logo = { fontSize: "22px", fontWeight: "700", color: "#4f46e5", textAlign: "center" as const, margin: "0 0 20px" };
const alertBanner = { backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", margin: "0 0 20px" };
const alertText = { color: "#dc2626", fontWeight: "700", fontSize: "14px", margin: "0", textAlign: "center" as const };
const h1 = { color: "#111827", fontSize: "22px", fontWeight: "700", margin: "0 0 16px" };
const text = { color: "#4b5563", fontSize: "15px", lineHeight: "1.6", margin: "0 0 16px" };
const button = { color: "#fff", padding: "13px 26px", borderRadius: "7px", fontWeight: "600", fontSize: "15px", textDecoration: "none" };
const hr = { borderColor: "#e5e7eb", margin: "24px 0" };
const footer = { color: "#9ca3af", fontSize: "12px", textAlign: "center" as const };
