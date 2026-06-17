import {
  Body, Button, Container, Head, Heading, Html, Preview,
  Section, Text, Hr,
} from "@react-email/components";

interface ListingLiveEmailProps {
  startupName: string;
  slug: string;
  appUrl: string;
}

export default function ListingLiveEmail({ startupName, slug, appUrl }: ListingLiveEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>🎉 {startupName} is now live on CapitalReach!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>⚡ CapitalReach</Text>
          <Section style={{ textAlign: "center", padding: "20px 0 0" }}>
            <Text style={{ fontSize: "48px", margin: "0" }}>🚀</Text>
          </Section>
          <Heading style={h1}>Your listing is live!</Heading>
          <Text style={text}>
            Congratulations! <strong>{startupName}</strong> has been approved and is now publicly listed on CapitalReach.
            Investors can now discover your startup, view your pitch, and reach out directly.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button style={button} href={`${appUrl}/startups/${slug}`}>
              View Your Live Listing →
            </Button>
          </Section>
          <Text style={tipText}>
            💡 <strong>Pro tip:</strong> Share your CapitalReach profile on LinkedIn, Twitter, and in startup communities to drive traffic and boost your visibility score.
          </Text>
          <Hr style={hr} />
          <Section style={{ textAlign: "center" }}>
            <Button style={buttonSecondary} href={`${appUrl}/dashboard/startup`}>
              Go to Dashboard
            </Button>
          </Section>
          <Text style={footer}>CapitalReach · <a href={appUrl} style={{ color: "#9ca3af" }}>{appUrl}</a></Text>
        </Container>
      </Body>
    </Html>
  );
}

ListingLiveEmail.PreviewProps = {
  startupName: "Acme Corp",
  slug: "acme-corp-x4f2",
  appUrl: "https://capitalreach.com",
} as ListingLiveEmailProps;

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Inter', sans-serif" };
const container = { maxWidth: "520px", margin: "0 auto", padding: "40px 20px" };
const logo = { fontSize: "22px", fontWeight: "700", color: "#4f46e5", textAlign: "center" as const, margin: "0" };
const h1 = { color: "#111827", fontSize: "26px", fontWeight: "700", margin: "16px 0", textAlign: "center" as const };
const text = { color: "#4b5563", fontSize: "15px", lineHeight: "1.6", margin: "0 0 16px" };
const tipText = { backgroundColor: "#f0f4ff", borderRadius: "8px", padding: "14px 16px", color: "#374151", fontSize: "14px", lineHeight: "1.6", margin: "20px 0" };
const button = { backgroundColor: "#4f46e5", color: "#fff", padding: "13px 26px", borderRadius: "7px", fontWeight: "600", fontSize: "15px", textDecoration: "none" };
const buttonSecondary = { backgroundColor: "#fff", color: "#4f46e5", border: "2px solid #4f46e5", padding: "11px 24px", borderRadius: "7px", fontWeight: "600", fontSize: "14px", textDecoration: "none" };
const hr = { borderColor: "#e5e7eb", margin: "24px 0" };
const footer = { color: "#9ca3af", fontSize: "12px", textAlign: "center" as const, marginTop: "20px" };
