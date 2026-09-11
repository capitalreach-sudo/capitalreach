# CapitalReach: brief for counsel

**Prepared by an engineer, not by a lawyer. Nothing in this document is legal
advice, and nothing in it should be relied on as a statement of the law.** It is
a description of what the software actually does today, written by the person
who built it, so that a qualified German fintech lawyer can answer questions
about the real product rather than about a specification.

Where a statute or an article number appears below, its confidence is marked.
Anything marked UNCERTAIN is my recollection from general knowledge and has not
been checked against a current text. A confident wrong citation in a document
counsel relies on is worse than an open question, so the open questions are left
open.

Date of writing: 2026-09-11. Repository: the CapitalReach Next.js application.
File references are `path:line` and are accurate as of this date.

---

## 0. What the product is, in one paragraph

CapitalReach is a members-only platform where early-stage companies list
themselves and investors browse those listings. Nothing is public: a listing is
shown to members, a member declares a category for themselves before certain
material is shown, and a data room sits behind a confidentiality undertaking.
The platform does not hold or move anybody's money, does not execute anything,
does not recommend a company to an investor, and does not advise either side. It
records an introduction, gates the conversation behind a countersigned document,
and charges the **company** a success fee if the company later raises money from
an investor it was introduced to. There is no subscription requirement to be
introduced. Every consequence in the system that costs somebody money or
standing is a human decision taken by an administrator with the numbers on
screen; nothing suspends, invoices or records a verdict automatically.

The three questions that matter most, and that I cannot answer, are:

1. Does the fee mechanism in section 3 require a licence in Germany, and if so
   which one.
2. Which risk-warning regime governs, given that the answer to (1) is open.
3. Whether the terms, which are written against US securities law, are
   enforceable or even coherent for a German-established operator.

---

## 1. The `[LAWYER]` markers in the codebase

Nine markers are in the tree. Each sits at the exact point where the code does
something a lawyer has to settle. All nine are listed. The seventh is a pointer
in a file header rather than a question of its own, and is marked as such.

### 1.1 `app/disclaimer/page.tsx:93`

**Question.** The disclaimer states that CapitalReach is not a registered
investment advisor, broker-dealer or financial planner: is that negative
statement still accurate, and does it remain accurate under whichever German
licensing route is eventually chosen?

**What the product does today.** The sentence is rendered as written, on the
public `/disclaimer` page, in all fifteen languages. It is true today in the
narrow sense that the company holds no registration of any kind anywhere. The
markers note that the sentence changes the moment a registration route is
chosen, and until one is chosen the text is left alone.

**Exact text rendered** (`disclaimer.s1Text`):

> CapitalReach Ltd. ("CapitalReach") is not a registered investment advisor,
> broker-dealer, or financial planner. The information, materials, and tools
> available on the CapitalReach platform are provided for informational purposes
> only and do not constitute investment advice, financial advice, legal advice,
> or any other type of professional advice. Nothing on this platform should be
> construed as a recommendation to buy, sell, or hold any security or
> investment.

### 1.2 `app/disclaimer/page.tsx:115`

**Question.** Section 3 of the disclaimer restricts access to "accredited
investors" as defined by Rule 501 of Regulation D under the US Securities Act of
1933: is a US definition the right gate for a German-established operator, and
what is the consequence of asserting it while checking nothing?

**What the product does today.** The text is rendered as written. Nothing on the
platform verifies accreditation. Separately and independently, a member may
declare a category for themselves (`profiles.investor_status_declared`,
migration 126) from a list of three selectable options that are European rather
than US in origin: professional client, semi-professional investor, private
investor with experience. That declaration is recorded with a timestamp. It is
not reconciled with the Rule 501 assertion on the disclaimer page in any way.
The two live side by side and say different things.

**Exact text rendered** (`disclaimer.s3Text`):

> Access to certain investment opportunities on CapitalReach is restricted to
> "accredited investors" as defined under Rule 501 of Regulation D under the
> U.S. Securities Act of 1933, or equivalent classifications under applicable
> law in other jurisdictions. By representing yourself as an accredited investor
> on our platform, you confirm that you meet the applicable legal standard.
> CapitalReach reserves the right to request supporting documentation to verify
> accreditation status.

### 1.3 `app/terms/page.tsx:105`

**Question.** The Terms scope their audience by the same Rule 501 definition:
which regime actually applies to the audience, and does the current wording
create an obligation the platform does not discharge?

**What the product does today.** Rendered as written, in the Terms accepted at
signup. The Terms themselves say the platform does not verify accreditation and
pushes the compliance burden onto the member.

**Exact text rendered** (`terms.s1p2`):

> Investment-related information on CapitalReach is intended for use by
> sophisticated and accredited investors as defined under applicable securities
> laws (including Rule 501 of Regulation D under the U.S. Securities Act of
> 1933). CapitalReach does not verify investor accreditation status and it is
> your responsibility to ensure compliance with applicable laws in your
> jurisdiction.

### 1.4 `app/terms/page.tsx:120`

**Question.** The Terms disclaim broker-dealer and investment-adviser status:
does the fee mechanism described in section 3 of this brief make that disclaimer
false under German law, whatever it means under US law?

**What the product does today.** Rendered as written. The marker records that
this is a negative statement about licensing which is only true while the
platform holds no licence, and that changing it requires knowing which
registration route has been chosen.

**Exact text rendered** (`terms.s2p2`):

> CapitalReach is a technology platform only. We do not provide investment
> advice, act as a broker-dealer, investment adviser, or intermediary in any
> securities transaction. We do not recommend specific investments.

Note for counsel: the phrase "or intermediary in any securities transaction" is
the one that worries me most, because "intermediary" is the everyday English
word for what the product does. See section 3.

### 1.5 `app/terms/page.tsx:181`

**Question.** The investment disclaimer adds "crowdfunding portal under the JOBS
Act" to the list of things CapitalReach is not: is a JOBS Act disclaimer
meaningful here at all, and does the absence of any statement about ECSPR or
German licensing status leave the section misleading by omission?

**What the product does today.** Rendered in bold at the head of section 7 of
the Terms.

**Exact text rendered** (`terms.s7p1Bold`):

> CapitalReach is not a registered broker-dealer, investment adviser, or
> crowdfunding portal under the JOBS Act or any other securities regulation.

This is section 4 of this brief in full.

### 1.6 `lib/review/prohibited.ts:159`

**Question.** At what point does an individual listing stop being a private
placement to declared members and become a regulated public offer?

**What the product does today.** The listing review checklist contains a
prohibited-content item keyed `public_offer`, labelled "Wording that addresses
the general public rather than the members here". A human reviewer reads a
listing and decides. The reason text shown to the reviewer deliberately
describes what the listing **says** rather than asserting a legal conclusion
about it, and cites no section number in either Germany or the UK, because the
author was not certain of the right one. No automated test is applied. A
listing flagged on this item is held for a person to look at; nothing is
rejected by machine.

### 1.7 `lib/legal/investor-declaration.ts:20`

Not a question. This is the file header telling the reader that two of the
categories below carry their own markers, and that `needsLawyerReview` is set to
`true` on both so that a surface cannot render one without the fact being
visible in the data. Included for completeness.

### 1.8 `lib/legal/investor-declaration.ts:77`

**Question.** The "Professional client" category paraphrases the MiFID II
professional client test from general knowledge: what is the correct wording,
what are the current monetary thresholds, does the German implementation restate
or vary the European text, and what does a UK member fall under after onshoring?

**What the product does today.** The category is selectable. Its four criteria
are rendered to the member as recognition aids, each prefixed "Commonly
summarised as", with one line explicitly saying the thresholds are not stated
and need confirming, and one line warning that choosing the category means
giving up protections that apply to ordinary private investors. The chosen value
is written to `profiles.investor_status_declared` by the server; a trigger
rejects a client-key write. Nothing in the product tests the member against the
criteria, applies a threshold, or gates anything on the answer. The column
records that we asked and when.

### 1.9 `lib/legal/investor-declaration.ts:101`

**Question.** The "Semi-professional investor" category paraphrases the German
KAGB semi-professional category: what is the section, what are the current
figures, and is this category available at all to a platform that is not an AIF
manager?

**What the product does today.** Selectable, rendered on the same terms as 1.8.
The criteria shown say in terms that the figures need confirming and that "the
assessment this category refers to is not something this platform carries out".
My own understanding, recorded in the code and repeated here as UNCERTAIN, is
that the category turns on a minimum commitment, a written confirmation by the
investor, and an expertise assessment carried out by the manager, with a
separate and much higher commitment threshold that stands alone. Nothing in the
product performs the assessment the category appears to require.

**Question for counsel on 1.8 and 1.9 together:** should either category be
offered at all, and if so, who may present it and on what wording?

---

## 2. The licensing route: three candidates, set out neutrally

I am not recommending one. Each is described with what it would change about the
product **as it is actually built**, and whether non-professional private
investors could be served under it. The answers below are my engineering reading
of each route's consequences, not a legal opinion on whether the route is
available.

Relevant fact for all three: the operating entity is not yet registered. The
imprint page at `/imprint` renders a "not yet published" state until the entity
details are set as environment variables (`lib/brand.ts:45-57`), and it currently
does. The example values in that file are German (`"CapitalReach GmbH"`,
`"Amtsgericht Berlin, HRB 123456"`, `"DE123456789"`), while the footer and the
disclaimer name "CapitalReach Ltd.". Which entity actually contracts, and where
it is established, is an input to every question in this section and is not
settled in the code.

### Candidate A: tied agent under section 34f GewO (Finanzanlagenvermittler)

CONFIDENT that section 34f GewO is the German trade-law permit for a
Finanzanlagenvermittler, brokering financial investments. UNCERTAIN on the
sub-numbering: my recollection is that section 34f(1) sentence 1 splits into
numbered product categories, with fund units in one, securities in another, and
Vermögensanlagen within the meaning of the VermAnlG in a third, and that the
permit is issued by the competent municipal or chamber authority rather than by
BaFin. Counsel should confirm the numbering and the issuing authority.

**What it would change about the product as built.**

- It attaches to product categories. The instruments actually passing through
  the platform today are whatever the parties negotiate: `deals` records an
  `instrument` free-text field on the seal (`lib/deal-seal.ts:85`), and in
  practice that is SAFEs, convertible notes, direct equity in a GmbH or a UK
  limited, and occasionally something bespoke. Whether each of those falls
  inside a 34f category, and whether a GmbH share does at all, is an open
  question that changes what may be listed.
- It would likely require a suitability or appropriateness step that the product
  does not have. Today the only member-facing categorisation is a self-declaration
  with nothing behind it (`lib/legal/investor-declaration.ts`). No assessment is
  performed anywhere in the codebase.
- Ongoing obligations I would expect: professional indemnity cover, an annual
  audit report, record-keeping of advice or brokerage conversations, and a
  register entry. The platform already keeps deep records (see section 3), but
  they are built as evidence for a fee claim, not as a regulatory file, and
  nobody has mapped one onto the other.
- The disclaimers at 1.1, 1.4 and 1.5 would all become false the day a permit is
  issued and would have to be rewritten.

**Non-professional private investors.** My understanding is that this route is
the one most oriented toward retail distribution, and that the product-level
retail restrictions then come from the instrument side (VermAnlG single-investment
caps and the like) rather than from the intermediary's permit. UNCERTAIN on the
caps and on which instruments carry them. If that reading is right, the
platform's "private investor with experience" category would be servable, which
none of the other two routes make as straightforward.

### Candidate B: operating under a liability umbrella (Haftungsdach)

The arrangement where the platform acts as a contractually tied agent
(vertraglich gebundener Vermittler) of a licensed investment firm, which assumes
regulatory responsibility. CONFIDENT that the arrangement exists and is common.
UNCERTAIN on the current legal basis: I believe the tied-agent provision moved
out of section 2(10) KWG into the WpIG when the WpIG came into force in 2021,
and that it now sits around section 3 WpIG, but I am not confident of the
subsection and counsel must confirm it.

**What it would change about the product as built.**

- The licence question moves to the umbrella firm, and the platform's commercial
  freedom moves with it. In practice the umbrella approves which instruments may
  be brokered, which investor categories may be served, and what marketing may
  say. The listing review checklist in `lib/review/` is today entirely our own
  policy; under an umbrella it becomes the umbrella's policy, and the
  `public_offer` item at 1.6 stops being our judgement call.
- The fee would very likely have to be restructured. As built, the fee is an
  agreement directly between CapitalReach and the company
  (`lib/deal-seal.ts:88-160`), signed by CapitalReach's counterparties and
  collected by CapitalReach. Under an umbrella I would expect the brokerage
  remuneration to flow through the umbrella firm, which is a different contract,
  a different invoicing path, and a different set of rows in the database.
- The bilateral seal document would need the umbrella's name in it. The document
  is hashed at signature (`sealHash`, `lib/deal-seal.ts:162`), and every
  signature stamps `DEAL_SEAL_VERSION` and the hash in force at the time, so a
  wording change is a version bump and does not retroactively reinterpret
  existing seals. The mechanism for changing it exists and is clean.
- Nothing about the data model would have to change. The evidence trail is
  already stronger than a tied agent would typically be asked for.

**Non-professional private investors.** Depends entirely on the umbrella firm's
own permissions and on its risk appetite. Some umbrellas will not take retail
distribution of illiquid private-company instruments at any price. This is a
commercial question to put to candidate umbrellas early, because a negative
answer removes the route without any law being involved.

### Candidate C: ECSP authorisation (European crowdfunding service provider)

CONFIDENT that the regime is Regulation (EU) 2020/1503, directly applicable
since late 2021, with BaFin as the German competent authority and a German
accompanying act (Schwarmfinanzierung-Begleitgesetz) handling supervision and
sanctions. CONFIDENT that there is a per-project-owner offering cap of EUR 5
million over twelve months. UNCERTAIN on the specific article numbers below;
they are my recollection and each must be confirmed.

- Art 1(2)(c) UNCERTAIN: the EUR 5m cap.
- Art 19 UNCERTAIN: information to clients, including a prescribed risk warning.
- Art 21 UNCERTAIN: entry knowledge test and simulation of ability to bear loss,
  for non-sophisticated investors.
- Art 22 UNCERTAIN: a pre-contractual reflection period (I recall four calendar
  days) for non-sophisticated investors.
- Art 23 UNCERTAIN: the key investment information sheet (KIIS), drawn up by the
  project owner, with the platform checking completeness and clarity.

**What it would change about the product as built.** This is the route that
would change the product most.

- **Instrument scope.** As I understand it ECSPR covers transferable securities,
  admitted instruments for crowdfunding purposes, and loans. UNCERTAIN, but I
  believe a German GmbH share is **not** a transferable security, and if that is
  right then a large share of what actually gets raised on this platform falls
  outside ECSPR entirely. Counsel should treat this as the first question about
  this route, because a negative answer makes the rest academic.
- **The EUR 5m cap** would need enforcing per project owner across a rolling
  twelve months. Nothing in the schema tracks cumulative raise per company across
  rounds; `deals` and `round_closures` record individual closes.
- **A KIIS per offer.** The platform today has a listing with self-reported
  figures and a human completeness review. A KIIS is a prescribed document with
  prescribed sections, and the platform would have to check it. This is a
  substantial new build, not a copy change.
- **The knowledge test, loss simulation and reflection period** are three
  member-facing flows that do not exist. The reflection period in particular
  changes the shape of the deal flow: today an offer can be accepted and sealed
  in one sitting.
- **The introduction-and-tail model may not survive.** ECSPR is built around
  offers made **on** the platform. The whole point of clause 4 of the seal, "Where
  it closes makes no difference", is that the fee follows the introduction even
  when the round is documented by email or through a lawyer. Whether an
  authorised ECSP may charge on off-platform closes, and whether doing so is
  compatible with the conflicts-of-interest rules, is a question I cannot answer
  and which goes to the commercial heart of the business.
- **Conflicts of interest.** ECSPR restricts a platform from holding
  participations in projects on it and from accepting project owners who are
  shareholders or managers of the platform. Not a current issue, but it
  constrains future structure.

**Non-professional private investors.** Explicitly contemplated: the regime
distinguishes sophisticated from non-sophisticated investors and wraps the
non-sophisticated in the knowledge test, the loss simulation and the reflection
period. So the answer is yes, with the most machinery. UNCERTAIN whether an
individual investment cap applies to non-sophisticated investors and, if so,
whether it bites at a fixed figure or at a percentage of net worth with a warning
and an explicit consent above it.

### Summary of what each route asks of the code

| | 34f GewO | Haftungsdach | ECSP |
|---|---|---|---|
| Who holds the permission | CapitalReach | the umbrella firm | CapitalReach |
| Disclaimers at 1.1, 1.4, 1.5 | rewrite | rewrite | rewrite |
| Fee contract as built (`lib/deal-seal.ts`) | probably survives | probably restructured | probably restructured |
| Off-platform closes (seal clause 4) | open | umbrella's call | open, and doubtful |
| New member-facing flows to build | suitability or appropriateness | umbrella's requirements | knowledge test, loss simulation, reflection period, KIIS |
| Cumulative raise tracking | no | no | yes, EUR 5m per project owner |
| Non-professional private investors | probably, subject to product caps | umbrella's call | yes, with the most machinery |

---

## 3. Does the success fee constitute Anlagevermittlung?

This is the central question. What follows is the mechanism exactly as built,
read out of `lib/circumvention-text.ts` and `lib/deal-seal.ts`, so that counsel
answers about the real thing.

### 3.1 The two documents

There are two, and they do different jobs.

**The one-sided undertaking** (`lib/circumvention-text.ts`, version string
`CIRCUMVENTION_TERMS_VERSION = "2026-09-07"`). An investor accepts this by
clickwrap before first contact with a given company. It binds only the investor.
The acceptance is stored in `circumvention_acks` with the investor, the company,
the terms version, the IP address, the user agent and the timestamp.

**The bilateral fee agreement** (`lib/deal-seal.ts`, version string
`DEAL_SEAL_VERSION = "2026-09-11"`), titled in the document itself "DEAL RECORD
AND FEE AGREEMENT". Both parties sign the same rendered bytes. Each signature is
a row in `deal_seals` carrying the party, the signer's user id, the typed name,
the version, a sha256 over the exact document text, the IP address, the user
agent and the timestamp, with a uniqueness constraint of one signature per party
per deal. The deal is sealed when both rows exist.

The fee percentage and the tail length are single constants,
`SUCCESS_FEE_PERCENT = 2` and `NON_CIRCUMVENTION_MONTHS = 24`
(`lib/circumvention-text.ts:31,47`), imported everywhere they appear so the
number in a member's agreement cannot drift from the number in the product.

### 3.2 The seven features counsel should answer against

**1. The fee is charged to the company, never to the investor.** Stated twice,
in identical words, in both documents. Seal clause 3: "The fee is charged to the
Company. It is never charged to the Investor." The one-sided undertaking, clause
2, says the same. The footer on every page says it as well (section 5).

**2. The fee is due on capital actually received, not on any agreed figure.**
Seal clause 3: "It is due on the capital actually received, not on the amount in
clause 1, so a round that closes smaller carries a smaller fee and a round that
does not close carries none." Clause 1 of the same document expressly says the
terms recorded there "are not final investment documents and neither party is
bound to close on them" and that either party may renegotiate any of them.

**3. The obligation runs from a recorded introduction, for a fixed tail.** The
platform records first contact between an investor and a company as a row in
`introductions`, one per pair, first contact wins, with a date, the channel and
the terms version in force. Both documents render that date into the text and
state that it "is fixed at the moment of introduction and is not restated by any
later change to these terms." The tail is 24 months from that date, and the
documents render the concrete expiry date rather than a sum, so the member reads
a date and not an arithmetic problem.

**4. Both parties countersign, and the document is hashed.** The seal document is
rendered rather than stored, then hashed, so that a later edit to the wording
cannot be passed off as what somebody signed. Dates in it are ISO days because a
locale-formatted date in a legal record is ambiguous by construction. The
document closes: "Signed by both parties below. Each signature records the
signer's name, the time, the network address it came from, and the hash of this
exact document."

**5. Messaging is gated on the seal, not on the introduction.** The pair may not
exchange messages until both signatures exist (`lib/contact-policy.ts`). The
design note in `lib/deal-seal.ts:20-27` names the tension directly: what is
sealed is the relationship and the fee attaching to it, "an engagement letter,
not a term sheet", and the negotiation before the seal happens through
structured offers and counters rather than free text.

**6. There is no exclusivity and no restriction on either party.** Seal clause 9,
and clause 7 of the one-sided undertaking, in near-identical words: "Nothing here
restricts whom the Investor may invest in or whom the Company may raise from. It
fixes only what is owed to CapitalReach for an introduction it made."

**7. There are stated carve-outs.** Seal clause 7 and undertaking clause 6 both
exclude a relationship that demonstrably predates the recorded introduction date,
capital from a party the investor did not introduce and does not control, and a
round closing after the tail expires. The undertaking additionally invites the
investor to declare a predating relationship at acknowledgment time, with the
reason given in the file's own comment: a declaration made at introduction is
evidence, the same account offered after a fee is claimed is an argument.

### 3.3 What the platform does not do

Stated because the absence is as relevant to the characterisation as the
presence:

- It never holds, receives, transmits or touches investor funds. There is no
  payment rail between investor and company anywhere in the codebase. Stripe is
  present only for the platform's own subscription billing.
- It does not execute, subscribe, allot or settle anything.
- It does not advise. No route produces a recommendation of one company over
  another to a named investor.
- It does not verify the figures on a listing. The listing review checks
  completeness and identity, and the footer says so.
- It does not decide anything automatically. The fee is invoiced by a person.
  The reconciliation verdict, the register verdict and the circumvention strike
  are all written by an administrator with the figures in front of them
  (`lib/register-check.ts:12-20`), and the columns holding them are protected by
  database triggers so that a party to the deal cannot write their own verdict.

### 3.4 How the amount is verified, since it bears on the fee's nature

The fee is a percentage of a number, so the number matters. Three independent
accounts of it are recorded and compared:

1. What the pair declares. Two-sided, so neither states it alone, but a pair with
   a shared interest in a smaller fee can agree a smaller number together.
2. The signed instrument, uploaded by a party (`deals.instrument_doc_url`), with
   the figure read out of it server-side into
   `deals.instrument_doc_extracted_amount` so that a mismatch is not
   self-certified. `deals.reconciliation_status` records the human verdict.
3. What the company itself filed at its public register, recorded in
   `deals.register_filed_amount`, checked 90 days after close because filings lag.
   `deals.register_check_status` records the human verdict.

Seal clause 5 gives this a contractual hook: the company will declare what it
raised within 30 days of close, and on written request, once per round, will
produce ordinary evidence (allotment or subscription document, registry filing,
or a statement from its own counsel or accountant). A materially understated
figure carries the fee on the true amount plus the reasonable cost of
establishing it, and any discount or instalment arrangement falls away. The
clause expressly says a figure is not understated merely because the round closed
smaller than the recorded terms.

### 3.5 The questions

1. **Does this constitute Anlagevermittlung, or Anlageberatung, under German
   law?** UNCERTAIN on the provision: my recollection is that Anlagevermittlung
   was defined in KWG section 1(1a) and that the securities-side definitions moved
   into the WpIG in 2021, but I do not know which currently captures a platform of
   this shape. Please supply the provision as part of the answer.
2. **Does the fee being charged to the company rather than the investor change
   the characterisation?** In everyday terms the platform is paid by the issuer,
   not by the investor, which is the ordinary shape of placement remuneration.
3. **Is the arrangement better characterised in civil law as a Maklervertrag?**
   CONFIDENT that BGB section 652 distinguishes Nachweis (pointing out the
   opportunity) from Vermittlung (bringing about the contract). The product
   points out the opportunity, records the introduction, and then withdraws: it
   does not negotiate for either side, and the seal document expressly disclaims
   fixing what must happen at the end of the conversation. If it is a
   Nachweismaklervertrag, does that help or hurt the regulatory answer?
4. **Does the 24-month tail on off-platform closes change anything?** Seal clause
   4 charges the fee whether the round is documented on the platform, by email or
   through a lawyer. That is the clause that makes the model work commercially
   and the one I am least sure of.
5. **Does gating the conversation on a countersigned fee agreement push the
   platform from Nachweis toward Vermittlung**, on the basis that the platform
   controls whether the parties may speak at all?
6. **Is the fee enforceable against the company as drafted**, and in particular:
   is the seal a valid AGB against a company counterparty, is clause 5's
   cost-shifting and discount-forfeiture provision effective, and does the
   24-month tail survive scrutiny where the investor and the company had no prior
   relationship?
7. **What changes if the counterparty company is a sole founder acting as a
   consumer** rather than an established company?

---

## 4. The Terms are written against US securities law

### 4.1 What is there now

The Terms and the Disclaimer, in all fifteen language files, assert US law
throughout. The material provisions, quoted exactly:

`terms.s7p1Bold`, rendered in bold at the head of section 7:
> CapitalReach is not a registered broker-dealer, investment adviser, or
> crowdfunding portal under the JOBS Act or any other securities regulation.

`terms.s2p2`, in section 2:
> CapitalReach is a technology platform only. We do not provide investment
> advice, act as a broker-dealer, investment adviser, or intermediary in any
> securities transaction. We do not recommend specific investments.

`terms.s1p2` and `disclaimer.s3Text` both scope the audience by Rule 501 of
Regulation D (quoted in full at 1.3 and 1.2).

`terms.s16p1`, governing law and dispute resolution:
> These Terms are governed by the laws of the State of Delaware, United States,
> without regard to its conflict-of-law provisions. Any dispute arising from or
> relating to these Terms or the Service shall be resolved through binding
> arbitration in accordance with the JAMS Streamlined Arbitration Rules, except
> that either party may seek injunctive or other equitable relief in any court of
> competent jurisdiction.

`terms.s16p2`:
> You agree to resolve disputes with CapitalReach on an individual basis and
> waive any right to participate in a class action lawsuit or class-wide
> arbitration.

`privacy.s10Text`:
> CapitalReach is operated in the United States. If you access our Service from
> outside the US, your information may be transferred to, stored, and processed
> in the US and other countries where our service providers operate. By using our
> Service, you consent to these transfers. We ensure appropriate safeguards are
> in place for international transfers.

Against all of that, the same application ships an `/imprint` page whose subtitle
is "Provider identification under § 5 TMG", whose configuration examples are
German (`"CapitalReach GmbH"`, `"Amtsgericht Berlin, HRB 123456"`, VAT ID
`"DE123456789"`, `lib/brand.ts:45-57`), and which carries the EU ODR notice:

`imprint.euDispute`:
> Online dispute resolution: the European Commission provides a platform at
> ec.europa.eu/consumers/odr. We are neither obligated nor willing to participate
> in dispute resolution proceedings before a consumer arbitration board.

The imprint fields are unset in production, so the page currently renders
"Imprint pending" rather than any entity details.

### 4.2 What it fails to address

**It says nothing about the regime that probably governs.** There is no statement
of BaFin authorisation status, no statement about KWG, WpIG, GewO, VermAnlG or
ECSPR, and no statement about which member states the service is offered into.
The bold sentence at 1.5 disclaims a US registration nobody was going to assume
the company had, and is silent on the German one that actually matters.

**"or any other securities regulation" is doing work it cannot do.** As a
negative statement it is presently true (no licence exists anywhere). As
reassurance to a member it implies that no licence is required, which is exactly
the question that is open.

**The accreditation gate is asserted but never applied.** Terms section 1 scopes
the audience to Rule 501 accredited investors and in the same paragraph says
CapitalReach does not verify accreditation status. Meanwhile the product asks a
different question entirely (professional client / semi-professional / private
experienced) and stores the answer. Two incompatible categorisations, one
unchecked, one recorded and unused.

**Delaware law and JAMS arbitration against European members.** UNCERTAIN on the
detail, but I understand that for a consumer, Rome I preserves the mandatory
protections of the consumer's habitual residence regardless of a choice of law,
and that Brussels Ia gives a consumer a home forum that a pre-dispute clause
cannot take away. If either is right, section 16 is unenforceable against a
European consumer member and quite possibly counts as an unfair term in its own
right for being misleading about a right the member actually has. The class-action
waiver is a US construct with no obvious German counterpart.

**The entity is inconsistent and unpublished.** The footer and disclaimer say
"CapitalReach Ltd.". The imprint examples say "GmbH" and a Berlin register. The
privacy policy says the company is "operated in the United States". Three
different establishments in one application. Nothing renders in the imprint at
all today, which if the operator is German is itself a problem: CONFIDENT that
German law requires provider identification for a commercial online service, and
UNCERTAIN but I believe the TMG was largely repealed and replaced by the DDG
(Digitale-Dienste-Gesetz) in 2024, with the imprint duty now in DDG section 5,
which would make the page's own "§ 5 TMG" subtitle a stale citation. Please
confirm.

**No consumer-facing statutory content.** There is no withdrawal instruction
(Widerrufsbelehrung) for the paid subscription tiers, no mention of the German
cancellation-button requirement for online contracts, and the Terms reserve a
right to "suspend or terminate your access to the Service at any time, with or
without cause, and with or without notice" (`terms.s14p1`), which I would expect
to be problematic as an AGB.

**Questions for counsel.** (a) Should the US disclaimers be deleted, replaced, or
kept alongside a German statement, and what does the German statement say while
the licensing question at section 2 is open? (b) Is the Delaware and JAMS clause
severable, or does its presence taint the Terms more broadly? (c) Which entity
should be named, and in which jurisdiction, before anything else is redrafted?

---

## 5. Risk warnings

### 5.1 Which regime governs

This is conditional on section 2, and I cannot resolve it. The candidates as I
understand them:

- **If ECSP authorisation is the route**, the risk warning is prescribed by the
  regulation itself, alongside a key investment information sheet, an entry
  knowledge test and a reflection period for non-sophisticated investors.
  UNCERTAIN on the article numbers (I believe Art 19, 21, 22 and 23) and
  UNCERTAIN on whether the warning wording is prescribed verbatim or by content.
- **If the instruments are Vermögensanlagen under the VermAnlG**, I believe a
  Vermögensanlagen-Informationsblatt is required, together with a prescribed
  warning sentence on its face, and that the statutory sentence is close to "Der
  Erwerb dieser Vermögensanlage ist mit erheblichen Risiken verbunden und kann
  zum vollständigen Verlust des eingesetzten Vermögens führen." UNCERTAIN on
  both the section numbers (my recollection is sections 12 and 13) and on the
  exact current wording. The prescribed sentence must be taken from the statute,
  not from this brief.
- **If the Prospectus Regulation is engaged**, the question becomes whether an
  exemption applies to offers made only to declared members, which loops back to
  the `public_offer` marker at 1.6.
- **In any event**, if MiFID-derived conduct rules apply through whichever route
  is chosen, marketing communications must be fair, clear and not misleading, and
  identifiable as marketing. CONFIDENT on the substance of that standard,
  UNCERTAIN on the article.

**Question for counsel:** is there a risk-warning obligation that bites **today**,
under the unlicensed status quo, independent of which route is chosen? Unfair
competition law and general consumer law may impose one even where financial
regulation does not.

### 5.2 The current footer line, quoted exactly

Rendered on every page of the site from `components/shared/footer.tsx:173`, i18n
key `footer.legal`:

> Early-stage investments carry a high risk of total loss. Figures on listings
> are self-reported by founders. CapitalReach reviews submissions for
> completeness and identity; it does not audit or verify financial claims. Not
> investment advice. The 2% success fee is charged to the startup receiving the
> investment, only after a funding round closes. Investors are never charged.

Immediately beneath it, `footer.aiDisclosure`:

> AI-powered features use OpenAI models. Outputs are informational only and not
> investment advice.

And higher in the same footer, at `components/shared/footer.tsx:74`, a fee strip
reading `footer.feeStrip`:

> 2% success fee · only after close · founders only · never investors

### 5.3 Whether it meets the requirement

I cannot say whether it meets a requirement nobody has identified yet. What I can
set out are the properties counsel will want to assess it on.

**Presentation.** The line renders at 11px, in a light weight (DM Sans 300), in
the `--cr-ink-4` colour, which is the faintest text colour in the palette,
centred, in a box capped at 360px wide, at the bottom of the page below a
horizontal rule. It is not above the fold, is not near any call to action, and is
not acknowledged by the member. If any regime prescribes prominence, this fails
it on presentation alone regardless of content.

**Content.** The first sentence is a genuine total-loss warning. It does not
mention illiquidity, the absence of a secondary market, dilution, the absence of
any deposit-guarantee or investor-compensation scheme, or the need to diversify.
The per-category declaration text does carry an illiquidity and
no-compensation-scheme line
(`lib/legal/investor-declaration.ts:129`), but only inside the "private investor
with experience" option, only at the moment of declaring, and the footer does not.

**A marketing claim sits inside the warning.** "CapitalReach reviews submissions
for completeness and identity" is an affirmative statement about a service, in the
same sentence as a disclaimer about what is not checked. Whether a warning that
contains a sales point still reads as a warning is a judgement for counsel. The
last two sentences of the footer line are entirely commercial and are repeated
independently in the fee strip above it.

**Consistency.** The fee statements in the footer are accurate against the code
(section 3). The "2%" is rendered from `SUCCESS_FEE_PERCENT` and cannot drift.

**Questions for counsel.** (a) Is prescribed wording required, and if so which
sentence, in which language, at what prominence, and must it be acknowledged?
(b) Should the risk warning be separated from the fee marketing? (c) Does the
warning need to appear at the point of decision (viewing a listing, opening the
data room, making an offer, signing the seal) rather than in the page footer?

---

## 6. Liability limits and BGB section 309 Nr. 7

### 6.1 What the Terms say now

Three paragraphs, all in capitals as drafted, at `terms.s12p1` through
`terms.s12p3`:

> THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY
> KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW,
> CAPITALREACH DISCLAIMS ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF
> MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

> TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CAPITALREACH SHALL NOT BE
> LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
> DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR
> IN CONNECTION WITH THESE TERMS OR YOUR USE OF THE SERVICE, EVEN IF
> CAPITALREACH HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

> IN NO EVENT SHALL CAPITALREACH'S TOTAL LIABILITY TO YOU EXCEED THE GREATER OF
> (A) THE AMOUNTS PAID BY YOU TO CAPITALREACH IN THE 12 MONTHS PRECEDING THE
> CLAIM OR (B) $100 USD.

Plus an indemnity at `terms.s13p1` requiring the member to indemnify, defend and
hold harmless CapitalReach against claims arising from their use of the Service,
their content, their breach of the Terms, or their violation of third-party
rights.

### 6.2 The mandatory carve-outs, as I understand them

CONFIDENT on the substance of the following; counsel should confirm the wording
that actually goes into the clause.

**BGB section 309 Nr. 7(a)** prohibits, in standard terms, any exclusion or
limitation of liability for injury to life, body or health resulting from a
negligent breach of duty by the user of the terms or from an intentional or
negligent breach by their legal representative or vicarious agent.

**BGB section 309 Nr. 7(b)** prohibits any exclusion or limitation of liability
for other damage arising from a grossly negligent breach of duty by the user, or
from an intentional or grossly negligent breach by their legal representative or
vicarious agent.

**Cardinal duties.** Separately from section 309, and derived from section 307,
German case law as I understand it does not permit excluding liability for simple
negligence in breach of an essential contractual duty (a Kardinalpflicht, being a
duty whose performance makes proper performance of the contract possible at all
and on whose observance the counterparty regularly relies). For those, liability
may typically be capped at the foreseeable damage typical for the contract, but
not excluded.

**Section 310(1) BGB** means section 309 does not apply directly where the
counterparty is a business, which covers most members here. My understanding is
that its prohibitions nonetheless operate as an indicator through the general
section 307 fairness test in B2B, so the carve-outs are needed in both versions.

**Statutory liability that cannot be contracted away** in any event: the
Produkthaftungsgesetz, liability under an express guarantee
(Beschaffenheitsgarantie), and fraudulent concealment.

### 6.3 Where the current text fails, in my reading

- **No carve-outs at all.** None of the three paragraphs names life, body or
  health, gross negligence, intent, guarantees, or the ProdHaftG.
- **The salvatory wrappers may not save it.** "TO THE FULLEST EXTENT PERMITTED BY
  LAW" and "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW" are the drafting
  device relied on here. My understanding, UNCERTAIN, is that German courts treat
  a blanket reduction clause of that type as ineffective in AGB because it leaves
  the counterparty unable to see what they are actually entitled to, and that an
  ineffective clause is struck out entirely rather than read down. If that is
  right, the entire limitation falls away and statutory liability applies in
  full, which is the opposite of the intended effect.
- **The cap interacts badly with the fee.** The cap is the greater of twelve
  months of payments or USD 100. A member on no paid plan who is introduced,
  seals a deal and raises capital pays a 2% success fee: on a EUR 2m round that
  is EUR 40,000, and the cap against that member may still compute to USD 100,
  depending on whether the success fee counts as an amount "paid to CapitalReach"
  in the preceding twelve months. The clause does not say. Counsel should decide
  whether the fee is inside or outside the cap and say so in words.
- **The as-is warranty disclaimer** sits awkwardly against `footer.legal`, which
  affirmatively states that CapitalReach reviews submissions for completeness and
  identity. That is a performance representation made site-wide and disclaimed in
  the Terms.
- **The indemnity** is a broad one-way obligation on the member. Against a
  consumer I would expect it to be problematic; against a business member,
  counsel should assess it under section 307.
- **Currency and capitalisation.** The cap is in USD in a contract that would
  otherwise be German. The block-capitals style is a US convention with no German
  equivalent and, if anything, works against transparency.

**Question for counsel:** please supply the clause text. The i18n keys are
`terms.s12p1`, `terms.s12p2`, `terms.s12p3` and `terms.s13p1` in
`messages/*.json`, across fifteen locales, so a rewrite is a copy change in one
place per language and requires no code work.

---

## 7. Data protection

### 7.1 What is stored, where, and why

Every row below is real and in production. "Service role only" means the table
has row-level security enabled with no permissive policy, so no client key can
read or write it under any circumstances; it is reachable only from server code
that has already authenticated the caller.

| Data | Where | Why it exists | Who can read it |
|---|---|---|---|
| IP address, user agent, timestamp, terms version | `circumvention_acks` (migration 062) | Proof the investor accepted the non-circumvention terms before first contact | Written service-role only. RLS lets the investor read their own row, **and lets the founder of the startup read it too** |
| IP address, user agent, timestamp, signer name, signer user id, document sha256 | `deal_seals` (migration 120) | Proof both parties signed the fee agreement, for an invoice raised months later | Service role only |
| Founder's IP, timestamp, version, sha256 | `startups.founder_attestation_*` (migration 126) | Proof the founder affirmed their own figures and cap table | Not in the client column grant. Founder reads their own via `get_my_startup()` |
| Investor identity + IP + unique watermark + timestamp | `document_downloads` (migration 125) | Resolves a leaked file back to the one person who downloaded that copy | Service role only |
| IP, user agent | `login_events` | Account security, shown to the member as their own login history | Server route, member's own |
| IP | `terms_acceptances`, `nda_records`, `contract_signatures`, `round_closures`, `verification_evidence`, `reports` | Evidence stamps on the corresponding act | Server routes |
| Legal entity name, register type, register number | `startups` (migration 125) | Matching a closed round against what the company itself filed publicly | Admin review only. Deliberately excluded from the client column grant (see 7.3) |
| Circumvention strike count | `profiles.circumvention_strikes` (migration 125) | Counting, not enforcing. What a strike costs is a human decision | Guarded by trigger `profiles_strikes_server_only` against client writes |

Processors involved: Supabase (database, auth, storage), Vercel (hosting and
edge, which is where the `x-forwarded-for` chain originates), Stripe (the
platform's own subscription billing), OpenAI and Anthropic (listing analysis and
instrument amount extraction), and an email sender.

### 7.2 Article 6(1)(f) and the missing balancing test

Most of the IP stamping above cannot rest on Art 6(1)(b) contract necessity: the
platform can perform its contract with a member without recording the network
address the member signed from. It is recorded because a fee claimed against a
company eighteen months after an introduction needs a record that stands up, and
because a deck that surfaces at a competitor needs to resolve to a person. Both
are, I think, genuine business interests. **But Art 6(1)(f) requires a
documented balancing test weighing that interest against the data subject's
rights and reasonable expectations, and no such document exists anywhere in this
repository or, as far as I know, outside it.** That is the single largest
data-protection gap I am aware of and it is the reason this section exists.

Related gaps, each stated as a question rather than a conclusion:

- **Art 13(1)(d)** requires the legitimate interests pursued to be disclosed
  where Art 6(1)(f) is relied on. The privacy policy (`messages/*.json`, keys
  `privacy.*`) lists what is collected and how it is used but **names no legal
  basis anywhere**, and does not mention IP stamping, watermarking, the
  introduction record, the seal, or the register data at all.
- **Art 30** record of processing activities: does not exist.
- **Art 35** DPIA: the watermark ledger pairs an identified investor with an IP
  address for every copy of every confidential document served, which reads to me
  like systematic monitoring, but I am not qualified to judge whether the
  threshold is met.
- **Art 28** processor agreements: I do not know whether DPAs are in place with
  each processor listed above.
- **Art 44 and following** transfers: `privacy.s10Text` says the service is
  "operated in the United States" and that by using it the member "consents to
  these transfers". Consent-based transfer is a derogation, not the standard
  route, and the sentence also contradicts the German establishment implied by
  the imprint page.
- **Art 15** access: nothing in the product surfaces a member's own stored IP
  addresses back to them from `deal_seals` or `document_downloads`, because both
  are service-role only and the one founder-facing route deliberately projects
  the IP away. That is good for confidentiality and is a question for a subject
  access request.
- **Art 22** automated decision-making: not engaged, as far as I can tell, and
  deliberately so. Every consequence in the system is a person's decision. Worth
  recording as a positive.
- **Retention contradicts itself.** `privacy.s4Text` promises that on account
  deletion personal information is removed within 30 days, with a carve-out only
  for legal retention obligations such as tax records. But the non-circumvention
  undertaking tells the investor that the evidence records "are kept for the life
  of the undertaking", which is 24 months from introduction plus whatever
  limitation period applies to the fee claim. Those two statements cannot both be
  true. Counsel should decide which one is right and the other must be changed.
- **One deletion path is asymmetric.** `document_downloads.document_id` is
  `ON DELETE SET NULL`, so a founder removing a document cannot erase the record
  of who holds a copy. But `document_downloads.investor_id` is
  `ON DELETE CASCADE` against `investors`, so removing an investor entity does
  erase the ledger rows naming them. Whether that is the right balance between
  erasure rights and evidence retention is a question, not a bug.

### 7.3 The register columns, and why they are invisible by construction

`startups.legal_entity_name`, `startups.register_type` and
`startups.register_number` are collected so that a closed round can be matched
against the filing the company itself makes at its national register, which is
the one account of the round that neither party to the fee can edit.

They are never rendered to an investor, by anyone, ever. A legal entity name plus
a register number locates the founders, the registered address and the
shareholders in a public database in about a minute, and that is precisely the
circumvention route the entire fee model exists to close. The mechanism enforcing
this is structural rather than procedural: migration 109 revoked SELECT on
`startups` from both the anonymous and the authenticated database roles and
re-granted an explicit column list, so any column added afterwards is unreadable
by a client key until somebody names it in that grant. These three are
deliberately absent from it and must stay absent. The founder still reads their
own through a SECURITY DEFINER function that is exempt from column grants.

Counsel should note the data-protection consequence: for a single-founder GmbH,
the legal entity name and register number are effectively personal data about a
natural person, since they resolve to that person in a public register. They are
company data on their face and personal data in effect.

### 7.4 `document_downloads`, specifically

Called out separately because it is the most sensitive table in the schema. One
row per watermarked copy served. It pairs an investor's identity with an IP
address and a unique stamp burned into the served file, so that a document
turning up where it should not resolves to exactly one download and one person.
`watermark_id` carries a uniqueness constraint for that reason: a stamp reused
across downloads names a set of people, which traces nobody.

RLS is on with no policy. This is the only arrangement that satisfies both halves
of the requirement at once, and the reasoning is worth repeating to counsel
because it explains an apparent gap. A founder does legitimately need to see who
downloaded their own documents. But a policy grants **rows**, not columns, so a
founder-scoped SELECT policy would hand every founder the raw IP address of every
investor who ever opened one of their files. Instead the founder reads through a
server route (`app/api/documents/downloads/route.ts`) that joins to the documents
they own and projects the ledger down to who and when, dropping both the IP
address and the watermark id before anything reaches a browser. An investor never
reads the table at all. There is also no INSERT policy, deliberately, because an
IP address cannot be taken from a client: the row is written by the server that
served the file and stamped the copy.

`investor_id` on this table references `investors(id)`, the investor entity, not
`profiles(id)`, the user account.

### 7.5 The questions

1. Is Art 6(1)(f) the right basis for the IP stamping, the watermark ledger and
   the register data, and what does an adequate balancing test for each look
   like? This is the one thing I would most like to leave the meeting with.
2. Does the privacy policy need a full rewrite to name legal bases per purpose,
   or can the existing structure be amended?
3. Is a DPIA required for the watermark ledger?
4. Which retention statement is correct, the 30-day deletion promise or the
   life-of-the-undertaking promise in the investor's own agreement?
5. Should the founder be able to read the investor's IP address from
   `circumvention_acks`? The policy granting founders read access to those rows
   predates the watermark work and does not have the column-projection protection
   that `document_downloads` has. I flag it as a question rather than fixing it,
   because whether a founder is entitled to that evidence is a legal judgement
   and not mine to make.
6. Is the German or the US establishment the controller, and which supervisory
   authority is lead?

---

## Appendix: file map

Everything referenced above, so counsel's questions can be routed to the right
place without reading the codebase.

| Concern | File |
|---|---|
| Fee percentage and tail length as single constants | `lib/circumvention-text.ts` |
| The one-sided investor undertaking, full text | `lib/circumvention-text.ts`, function `circumventionTerms` |
| The bilateral fee agreement, full text | `lib/deal-seal.ts`, function `dealSealText` |
| When a pair may message | `lib/contact-policy.ts` |
| Register check scheduling and verdicts | `lib/register-check.ts` |
| Investor self-declaration categories | `lib/legal/investor-declaration.ts` |
| Listing prohibited-content review, incl. `public_offer` | `lib/review/prohibited.ts` |
| Entity details for the imprint | `lib/brand.ts` |
| Terms, Disclaimer, Privacy, Imprint copy, 15 locales | `messages/*.json` |
| Terms page rendering | `app/terms/page.tsx` |
| Disclaimer page rendering | `app/disclaimer/page.tsx` |
| Site-wide footer risk line | `components/shared/footer.tsx` |
| Founder-facing download ledger, IP projected away | `app/api/documents/downloads/route.ts` |
| Schema: acknowledgments | `supabase/migrations/062_final_spec.sql` |
| Schema: deal seals | `supabase/migrations/120_deal_seal.sql` |
| Schema: register data, strikes, download ledger | `supabase/migrations/125_register_and_watermarks.sql` |
| Schema: founder attestation, investor declaration | `supabase/migrations/126_review_ledger_and_reports.sql` |
