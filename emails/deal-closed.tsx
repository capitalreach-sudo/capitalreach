import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from "@react-email/components";

interface DealClosedEmailProps {
  recipientName: string;
  startupName: string;
  counterpartyName: string;
  amountRaised: number;
  successFee?: number;
  invoiceUrl?: string;
  isStartup: boolean;
}

export default function DealClosedEmail({
  recipientName,
  startupName,
  counterpartyName,
  amountRaised,
  successFee,
  invoiceUrl,
  isStartup,
}: DealClosedEmailProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://capitalreach.com";

  return (
    <Html>
      <Head />
      <Preview>🎉 Deal closed — {startupName} raised ${amountRaised.toLocaleString()}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>⚡ CapitalReach</Text>
          </Section>

          <Section style={celebration}>
            <Text style={emoji}>🎉</Text>
            <Heading style={h1}>Congratulations!</Heading>
          </Section>

          <Text style={text}>
            Hi {recipientName},<br /><br />
            A deal between <strong>{startupName}</strong> and{" "}
            <strong>{counterpartyName}</strong> has been marked as closed on CapitalReach.
          </Text>

          <Section style={statsBox}>
            <Text style={statLabel}>Amount Raised</Text>
            <Text style={statValue}>${amountRaised.toLocaleString()}</Text>
          </Section>

          {isStartup && successFee && (
            <>
              <Hr style={hr} />
              <Text style={text}>
                <strong>Success Fee Invoice</strong><br />
                As agreed in your CapitalReach terms, a 2% success fee of{" "}
                <strong>${successFee.toLocaleString()}</strong> has been invoiced.
                Payment is due within 14 days.
              </Text>
              {invoiceUrl && (
                <Section style={{ textAlign: "center" }}>
                  <Button style={buttonSecondary} href={invoiceUrl}>
                    View Invoice →
                  </Button>
                </Section>
              )}
            </>
          )}

          <Hr style={hr} />

          <Section style={{ textAlign: "center" }}>
            <Button style={button} href={`${appUrl}/dashboard`}>
              View Dashboard →
            </Button>
          </Section>

          <Text style={footer}>
            CapitalReach · <a href={`${appUrl}`} style={footerLink}>capitalreach.com</a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

DealClosedEmail.PreviewProps = {
  recipientName: "Jane Smith",
  startupName: "Acme Corp",
  counterpartyName: "Tiger Ventures",
  amountRaised: 500000,
  successFee: 10000,
  invoiceUrl: "https://invoice.stripe.com/test",
  isStartup: true,
} as DealClosedEmailProps;

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Inter', sans-serif" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "20px 0" };
const logoSection = { textAlign: "center" as const };
const logoText = { fontSize: "24px", fontWeight: "700", color: "#4f46e5", margin: "20px 0 0" };
const celebration = { textAlign: "center" as const };
const emoji = { fontSize: "48px", margin: "20px 0 0" };
const h1 = { color: "#1a1a2e", fontSize: "28px", fontWeight: "700", margin: "10px 0 20px", textAlign: "center" as const };
const text = { color: "#4b5563", fontSize: "16px", lineHeight: "1.6", margin: "0 0 20px" };
const statsBox = { backgroundColor: "#f0f4ff", borderRadius: "12px", padding: "20px", textAlign: "center" as const, margin: "20px 0" };
const statLabel = { color: "#6b7280", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: "0 0 4px" };
const statValue = { color: "#4f46e5", fontSize: "32px", fontWeight: "700", margin: "0" };
const hr = { borderColor: "#e5e7eb", margin: "24px 0" };
const button = { backgroundColor: "#4f46e5", color: "#ffffff", padding: "14px 28px", borderRadius: "8px", fontWeight: "600", fontSize: "16px", textDecoration: "none" };
const buttonSecondary = { backgroundColor: "#ffffff", color: "#4f46e5", border: "2px solid #4f46e5", padding: "12px 24px", borderRadius: "8px", fontWeight: "600", fontSize: "14px", textDecoration: "none" };
const footer = { color: "#9ca3af", fontSize: "12px", textAlign: "center" as const, marginTop: "24px" };
const footerLink = { color: "#9ca3af" };
