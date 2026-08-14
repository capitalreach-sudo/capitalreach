/**
 * Blog articles as data. Three launch guides, each answering a question users
 * actually arrive with, in the platform's own voice: factual, specific, no
 * superlatives. English only by design — these are articles, not UI chrome;
 * the page furniture around them is translated like everything else.
 *
 * Facts in these posts mirror the product and the Terms (fee percentage,
 * dispute window, launch pricing). If either changes, these change in the
 * same commit — a blog that contradicts the Terms is worse than no blog.
 */
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO, shown and used for sorting
  minutes: number;
  sections: Array<{ heading?: string; paragraphs: string[] }>;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-the-success-fee-works",
    title: "How the 2% success fee works",
    description:
      "What CapitalReach charges, when, to whom — and what happens if you think an invoice is wrong.",
    date: "2026-08-14",
    minutes: 4,
    sections: [
      {
        paragraphs: [
          "CapitalReach charges startups a 2% success fee on capital raised through the platform, invoiced when a deal closes. There are no retainers, no listing fees outside of subscription plans, and investors are never charged transaction fees. During the launch period, subscriptions themselves are free for the first hundred members — the success fee is the part of the model that applies regardless.",
        ],
      },
      {
        heading: "When the fee applies",
        paragraphs: [
          "The fee applies to deals closed with investors you were connected to through the platform. \"Connected through the platform\" has a precise meaning in our Terms: an investor who viewed your listing while signed in, contacted you through the platform, or was introduced to you via a CapitalReach deal record — in each case within 24 months before the round closed.",
          "That definition includes deals finalized elsewhere. If you meet an investor here and complete the round over email and a notary appointment, the fee still applies. This is the non-circumvention clause in Section 6 of the Terms, and it is the entire business model: the platform is free until it works.",
        ],
      },
      {
        heading: "What you'll see before you're charged",
        paragraphs: [
          "Nothing about the fee should be a surprise. When you close a deal in the deal portal, the exact fee is computed live in the deal's own currency as you type the amount, before you confirm. The deal record keeps the figure, and the invoice matches it.",
        ],
      },
      {
        heading: "Disputing an invoice",
        paragraphs: [
          "If you believe a success fee was invoiced in error — for instance, you knew the investor before the platform existed — you can dispute it in writing within 30 days of the invoice date. We review the connection records (listing views, messages, deal records) and respond within 30 days. Fees under active dispute are not treated as overdue while we review.",
          "The connection records cut both ways: they are how we determine a fee applies, and they are what you can point at when it does not.",
        ],
      },
    ],
  },
  {
    slug: "data-room-investors-actually-read",
    title: "Preparing a data room investors actually read",
    description:
      "The documents that matter, the order that works, and how to share numbers without emailing spreadsheets into the void.",
    date: "2026-08-14",
    minutes: 5,
    sections: [
      {
        paragraphs: [
          "Most data rooms are built for the founder's peace of mind rather than the investor's decision. Investors at the early stage read a handful of documents in a predictable order, and everything beyond that handful is friction. This is the short version of what to include, and how the platform's own tooling helps.",
        ],
      },
      {
        heading: "The order investors actually read in",
        paragraphs: [
          "First the deck — it is the only document most investors open before deciding whether to spend more time. Ten to fifteen slides; the listing's one-pager covers the same ground for people who won't open a PDF at all.",
          "Second, the numbers: a simple monthly view of revenue (or users, pre-revenue), burn, and runway. On CapitalReach, recording monthly snapshots in Traction history draws this curve directly on your listing for investors on financial plans — a trend persuades where a single number cannot.",
          "Third, the cap table — who owns what, fully diluted, including the option pool. Surprises here kill deals late, which is the most expensive place to lose one.",
          "Everything else — contracts, IP assignments, employment agreements — matters at confirmatory diligence, after a term sheet. Uploading it early does no harm, but it is not what gets you the meeting.",
        ],
      },
      {
        heading: "Gating without friction",
        paragraphs: [
          "Not everything belongs in front of everyone. On CapitalReach you can mark individual documents as requiring a signed NDA; investors see that the document exists and what unlocking it takes, but the file itself is not delivered until the NDA is signed — enforced server-side, not just visually.",
          "Document analytics show you who opened what and when. An investor who opened your financials three times this week is telling you something no email would.",
        ],
      },
      {
        heading: "The one mistake to avoid",
        paragraphs: [
          "Stale numbers. A data room whose latest month is from two quarters ago reads as either neglect or concealment, and investors will assume whichever is worse. A monthly fifteen-minute update beats a quarterly evening of reconstruction.",
        ],
      },
    ],
  },
  {
    slug: "what-investors-check-first",
    title: "What investors check first on a listing",
    description:
      "The five things that decide whether an investor keeps reading — in the order they actually look.",
    date: "2026-08-14",
    minutes: 4,
    sections: [
      {
        paragraphs: [
          "Investors triage. Before anyone reads your problem statement, they have already decided from a handful of signals whether to spend the next three minutes. These are the signals, in roughly the order they get checked — and they are the same ones the platform's own listing-completeness score weights most heavily, which is not a coincidence.",
        ],
      },
      {
        heading: "1. Is there a deck?",
        paragraphs: [
          "A listing without a deck reads as a listing that is not really raising. It is the single heaviest item in the completeness score for the same reason it is the first thing an investor asks for by email.",
        ],
      },
      {
        heading: "2. Does the ask make sense?",
        paragraphs: [
          "Round size, stage, and equity offered get sanity-checked against each other in seconds. A pre-seed round asking for €10M, or 40% equity on offer, ends the read regardless of the product. If your round has a closing date, say so — a listing with a countdown reads as a process; one without reads as a hope.",
        ],
      },
      {
        heading: "3. Is there any traction signal at all?",
        paragraphs: [
          "Not necessarily revenue. Users, paying customers, a pilot — one honest number beats three adjectives. Pre-revenue is a stage, not a defect; a listing that says \"pre-revenue, 900 users, growing 15% monthly\" is stronger than one that hides the absence of MRR behind vague language.",
        ],
      },
      {
        heading: "4. Who is building it?",
        paragraphs: [
          "Founders with names, roles, and LinkedIn profiles. Investors back people, and an anonymous team section suggests either an unfinished listing or something being hidden — both readings cost you.",
        ],
      },
      {
        heading: "5. Is anyone else looking?",
        paragraphs: [
          "Saves, questions, and recent activity signal that other investors found it worth a bookmark. You cannot fake this one — but you can earn it by doing the first four properly, and by answering questions on your listing quickly. Response time is itself a signal: it predicts what you will be like to work with after the wire.",
          "One practical note: the platform lets you preview your listing exactly as a free-tier investor sees it — locks included. Look at yours that way before your next outreach. Whatever made you wince is what they see first.",
        ],
      },
    ],
  },
];

export function postBySlug(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}
