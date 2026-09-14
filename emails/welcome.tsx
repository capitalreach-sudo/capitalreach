import {
  Body, Button, Container, Head, Heading, Hr, Html,
  Link, Preview, Section, Text,
} from "@react-email/components";
import { brand } from "@/lib/brand";

/**
 * Role-neutral by design, and it links to /dashboard rather than an onboarding
 * route: the role chosen at signup can be switched before the mail is opened,
 * and /dashboard routes by the role the account holds at that moment. Keep it
 * in step with sendWelcomeEmail in lib/resend.ts, which is the version sent.
 */
interface WelcomeEmailProps {
  name: string;
}

export default function WelcomeEmail({ name }: WelcomeEmailProps) {
  const appUrl = brand.url;
  const greetingName = name.trim();

  return (
    <Html>
      <Head />
      <Preview>Welcome to CapitalReach: your account is ready</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Text style={logoText}>⚡ CapitalReach</Text>
          </Section>

          <Heading style={h1}>
            Welcome to CapitalReach{greetingName ? `, ${greetingName}` : ""}
          </Heading>

          <Text style={text}>
            Your account is ready. Your dashboard always shows the next step for
            your account, whether that is finishing your setup or getting straight
            to work.
          </Text>

          <Section style={ctaSection}>
            <Button style={button} href={`${appUrl}/dashboard`}>
              Go to your dashboard
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={subtext}>
            <strong>What happens next:</strong><br />
            1. Open your dashboard<br />
            2. Finish any setup step it shows you<br />
            3. Pick up from there whenever you come back
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
