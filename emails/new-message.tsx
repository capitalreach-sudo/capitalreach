import {
  Body, Button, Container, Head, Heading, Html, Preview,
  Section, Text, Hr,
} from "@react-email/components";

interface NewMessageEmailProps {
  recipientName: string;
  senderName: string;
  startupName: string;
  messagePreview: string;
  dashboardUrl: string;
}

export default function NewMessageEmail({
  recipientName,
  senderName,
  startupName,
  messagePreview,
  dashboardUrl,
}: NewMessageEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>New message from {senderName} about {startupName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>⚡ CapitalReach</Text>
          <Heading style={h1}>New message from {senderName}</Heading>
          <Text style={text}>Hi {recipientName},</Text>
          <Text style={text}>
            You have a new message regarding <strong>{startupName}</strong>:
          </Text>
          <Section style={quote}><Text style={{ margin: 0, fontStyle: "italic" }}>{messagePreview}</Text></Section>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button style={button} href={dashboardUrl}>
              Reply Now →
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>CapitalReach · <a href="https://capitalreach.com" style={{ color: "#9ca3af" }}>capitalreach.com</a></Text>
        </Container>
      </Body>
    </Html>
  );
}

NewMessageEmail.PreviewProps = {
  recipientName: "Jane Smith",
  senderName: "John Investor",
  startupName: "Acme Corp",
  messagePreview: "Hi! I came across your profile on CapitalReach and I'm very interested in learning more about your Series A round. I've been investing in B2B SaaS for 8 years...",
  dashboardUrl: "https://capitalreach.com/dashboard/messages",
} as NewMessageEmailProps;

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Inter', sans-serif" };
const container = { maxWidth: "520px", margin: "0 auto", padding: "40px 20px" };
const logo = { fontSize: "22px", fontWeight: "700", color: "#4f46e5", textAlign: "center" as const, margin: "0 0 28px" };
const h1 = { color: "#111827", fontSize: "22px", fontWeight: "700", margin: "0 0 16px" };
const text = { color: "#4b5563", fontSize: "15px", lineHeight: "1.6", margin: "0 0 16px" };
const quote = { borderLeft: "3px solid #4f46e5", margin: "16px 0", paddingLeft: "16px", color: "#374151", fontStyle: "italic", fontSize: "15px", lineHeight: "1.6" };
const button = { backgroundColor: "#4f46e5", color: "#fff", padding: "13px 26px", borderRadius: "7px", fontWeight: "600", fontSize: "15px", textDecoration: "none" };
const hr = { borderColor: "#e5e7eb", margin: "24px 0" };
const footer = { color: "#9ca3af", fontSize: "12px", textAlign: "center" as const };
