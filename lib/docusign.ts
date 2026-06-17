// DocuSign NDA flow
// Uses the DocuSign eSign Node.js SDK

const docusign = require("docusign-esign");

const DOCUSIGN_BASE_PATH =
  process.env.DOCUSIGN_BASE_URL ?? "https://demo.docusign.net/restapi";

async function getAccessToken(): Promise<string> {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(DOCUSIGN_BASE_PATH);

  const results = await apiClient.requestJWTApplicationToken(
    process.env.DOCUSIGN_INTEGRATION_KEY!,
    ["signature", "impersonation"],
    Buffer.from(process.env.DOCUSIGN_SECRET_KEY!, "base64"),
    3600
  );

  return results.body.access_token;
}

export async function sendNdaEnvelope({
  startupName,
  startupEmail,
  startupSignerName,
  investorEmail,
  investorName,
}: {
  startupName: string;
  startupEmail: string;
  startupSignerName: string;
  investorEmail: string;
  investorName: string;
}): Promise<string> {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  if (!integrationKey || integrationKey === "REPLACE_ME" || integrationKey === "placeholder-key") {
    console.warn("[DocuSign] Integration not configured — skipping NDA envelope send.");
    return "not-configured";
  }

  const accessToken = await getAccessToken();

  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(DOCUSIGN_BASE_PATH);
  apiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  // NDA document text (simplified — real implementation would use a PDF template)
  const ndaText = `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into between ${startupName} ("Company") and ${investorName} ("Recipient").

1. CONFIDENTIAL INFORMATION: Recipient agrees to hold in strict confidence all confidential information shared by Company in connection with a potential investment relationship.

2. NON-DISCLOSURE: Recipient shall not disclose any confidential information to third parties without prior written consent.

3. TERM: This Agreement shall remain in effect for 3 years from the date of signing.

4. GOVERNING LAW: This Agreement shall be governed by applicable law.

By signing below, both parties agree to the terms of this Agreement.`;

  const docBase64 = Buffer.from(ndaText).toString("base64");

  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.emailSubject = `NDA for ${startupName} — CapitalReach`;
  envelopeDefinition.status = "sent";

  const doc = new docusign.Document();
  doc.documentBase64 = docBase64;
  doc.name = `NDA_${startupName.replace(/\s+/g, "_")}.txt`;
  doc.fileExtension = "txt";
  doc.documentId = "1";

  const investorSigner = new docusign.Signer();
  investorSigner.email = investorEmail;
  investorSigner.name = investorName;
  investorSigner.recipientId = "1";
  investorSigner.routingOrder = "1";

  const startupSigner = new docusign.Signer();
  startupSigner.email = startupEmail;
  startupSigner.name = startupSignerName;
  startupSigner.recipientId = "2";
  startupSigner.routingOrder = "2";

  const investorSignHere = new docusign.SignHere();
  investorSignHere.anchorString = "By signing below";
  investorSignHere.anchorXOffset = "0";
  investorSignHere.anchorYOffset = "20";
  investorSignHere.anchorUnits = "pixels";
  investorSignHere.recipientId = "1";
  investorSignHere.documentId = "1";

  const startupSignHere = new docusign.SignHere();
  startupSignHere.anchorString = "By signing below";
  startupSignHere.anchorXOffset = "200";
  startupSignHere.anchorYOffset = "20";
  startupSignHere.anchorUnits = "pixels";
  startupSignHere.recipientId = "2";
  startupSignHere.documentId = "1";

  investorSigner.tabs = { signHereTabs: [investorSignHere] };
  startupSigner.tabs = { signHereTabs: [startupSignHere] };

  envelopeDefinition.documents = [doc];
  envelopeDefinition.recipients = {
    signers: [investorSigner, startupSigner],
  };

  const results = await envelopesApi.createEnvelope(
    process.env.DOCUSIGN_ACCOUNT_ID!,
    { envelopeDefinition }
  );

  return results.envelopeId;
}

export async function getEnvelopeStatus(envelopeId: string): Promise<string> {
  const accessToken = await getAccessToken();

  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(DOCUSIGN_BASE_PATH);
  apiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);
  const envelope = await envelopesApi.getEnvelope(
    process.env.DOCUSIGN_ACCOUNT_ID!,
    envelopeId
  );

  return envelope.status; // "sent", "delivered", "completed", "declined"
}
