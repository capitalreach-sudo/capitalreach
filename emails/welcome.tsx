import {
  Body, Button, Container, Head, Heading, Hr, Html,
  Img, Link, Preview, Section, Text,
} from "@react-email/components";

interface WelcomeEmailProps {
  name: string;
  role: "startup" | "investor";
}

export default function WelcomeEmail({ name, role }: WelcomeEmailProps) {
  const isStartup = role === "startup";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://capitalreach.com";

  return (
    <Html>
      <Head />
      <Preview>Welcome to CapitalReach — {isStartup ? "get funded" : "discover startups"}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Text style={logoText}>⚡ CapitalReach</Text>
          </Section>

          <Heading style={h1}>Welcome to CapitalReach, {name}!</Heading>

          <Text style={text}>
            {isStartup
              ? "You've taken the first step toward connecting with investors who believe in your vision. Let's get your startup listed."
              : "You're now part of the CapitalReach investor network. Discover exceptional early-stage companies raising right now."}
          </Text>

          <Section style={ctaSection}>
            <Button
              style={button}
              href={`${appUrl}/onboarding/${role}`}
            >
              {isStartup ? "Complete Your Startup Profile →" : "Set Up Your Investor Profile →"}
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={subtext}>
            {isStartup ? (
              <>
                <strong>What happens next:</strong><br />
                1. Complete your profile (takes ~10 minutes)<br />
                2. Our team reviews your listing (1-2 business days)<br />
                3. Go live and start receiving investor interest
              </>
            ) : (
              <>
                <strong>What you can do:</strong><br />
                1. Browse 500+ vetted startups<br />
                2. Set your investment preferences<br />
                3. Connect directly with founders
              </>
            )}
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            CapitalReach · 123 Startup Lane · San Francisco, CA 94105<br />
            <Link href={`${appUrl}/unsubscribe`} style={footerLink}>Unsubscribe</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  name: "Jane Smith",
  role: "startup",
} as WelcomeEmailProps;

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Inter', sans-serif" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "20px 0" };
const logoSection = { textAlign: "center" as const, padding: "20px 0" };
const logoText = { fontSize: "24px", fontWeight: "700", color: "#4f46e5", margin: "0" };
const h1 = { color: "#1a1a2e", fontSize: "24px", fontWeight: "700", margin: "30px 0 20px", textAlign: "center" as const };
const text = { color: "#4b5563", fontSize: "16px", lineHeight: "1.6", margin: "0 0 20px" };
const ctaSection = { textAlign: "center" as const, margin: "30px 0" };
const button = { backgroundColor: "#4f46e5", color: "#ffffff", padding: "14px 28px", borderRadius: "8px", fontWeight: "600", fontSize: "16px", textDecoration: "none", display: "inline-block" };
const hr = { borderColor: "#e5e7eb", margin: "28px 0" };
const subtext = { color: "#6b7280", fontSize: "14px", lineHeight: "1.8" };
const footer = { color: "#9ca3af", fontSize: "12px", textAlign: "center" as const, lineHeight: "1.6" };
const footerLink = { color: "#9ca3af" };
