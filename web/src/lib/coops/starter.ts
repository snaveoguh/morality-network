// Content for /coops/start. Plain guidance that routes people to Co-operatives
// UK's own advice and registration service; it is not legal advice and never
// quotes fees (they change — the page links to the current ones).

import type { Model } from "./types";

export const CUK = {
  start: "https://www.uk.coop/start-new-co-op",
  register: "https://www.uk.coop/start-new-co-op/register",
  modelRules: "https://uk.coop/resources/model-governing-documents",
  adviser: "https://www.uk.coop/start-new-co-op/find-adviser/co-operatives-uk",
  fcaRegister: "https://mutuals.fca.org.uk/",
};

export interface ModelOption {
  model: Exclude<Model, "undecided">;
  question: string;
  example: string;
  legalForm: string;
  formNote: string;
}

// "Who should own and control it?" is the one question that picks the model.
export const MODEL_OPTIONS: ModelOption[] = [
  {
    model: "worker",
    question: "The people who work in it",
    example: "A design studio, bakery, care service or software team owned by its staff.",
    legalForm: "Co-operative society",
    formNote:
      "Registered with the FCA. Small worker co-ops sometimes register as a company with co-operative articles instead; an adviser can say which suits you.",
  },
  {
    model: "consumer",
    question: "The people who buy from it or use it",
    example: "A food co-op, community energy scheme for its users, or a members' club.",
    legalForm: "Co-operative society",
    formNote: "Registered with the FCA. Members are its customers or users.",
  },
  {
    model: "producer",
    question: "The businesses or people who supply it",
    example: "Farmers, makers or freelancers selling or buying together.",
    legalForm: "Co-operative society",
    formNote: "Registered with the FCA. Members are the producers it serves.",
  },
  {
    model: "multi-stakeholder",
    question: "More than one of those groups together",
    example: "Workers and customers sharing control, as in some care, food and media co-ops.",
    legalForm: "Co-operative society",
    formNote:
      "Registered with the FCA. The rules set out each member class and how votes are shared between them.",
  },
  {
    model: "community-benefit",
    question: "The local community, for the benefit of people beyond its members",
    example: "A community pub, shop, land trust or energy scheme run for the area.",
    legalForm: "Community benefit society",
    formNote:
      "Registered with the FCA. It must exist for the benefit of the community, not only its members, and can lock its assets to that purpose.",
  },
  {
    model: "housing",
    question: "The people who live in it",
    example: "A tenant-run housing co-op that owns or manages homes.",
    legalForm: "Co-operative society",
    formNote: "Registered with the FCA, usually on housing model rules.",
  },
];

export const FUNDING_OPTIONS = [
  {
    key: "member-shares",
    label: "Members put in a share",
    note: "Each member buys a share, often a small fixed amount. Each member has one vote, however many shares they hold.",
  },
  {
    key: "community-shares",
    label: "Community shares",
    note:
      "Withdrawable shares sold to the public, open only to co-operative and community benefit societies. Ask about the Community Shares Standard Mark and any match funding before you launch an offer.",
  },
  {
    key: "trading",
    label: "Trading income",
    note: "Selling goods or services from the start.",
  },
  {
    key: "grants",
    label: "Grants or programme support",
    note: "Start-up support, including local co-op development programmes. Record what you receive on the tracker.",
  },
  {
    key: "loans",
    label: "Loans",
    note: "From members, a co-op or community lender, or a bank.",
  },
] as const;

export type FundingKey = (typeof FUNDING_OPTIONS)[number]["key"];

export interface ChecklistStage {
  stage: string;
  tasks: string[];
}

export function checklist(option: ModelOption | null, founders: number, funding: FundingKey[]): ChecklistStage[] {
  const form = option?.legalForm ?? "co-operative society or community benefit society";
  const forming = [
    founders >= 3
      ? `You have ${founders} founders. A society needs at least three members to register.`
      : "Find at least three founding members. A society needs three to register.",
    "Agree a one-paragraph purpose: what the co-op does and who it is for.",
    `Choose model rules for a ${form.toLowerCase()} from Co-operatives UK's model governing documents.`,
    "Decide what membership costs, who can join, and how members vote.",
    "Hold a founding meeting and minute the decisions (agenda below).",
  ];
  if (option?.model === "multi-stakeholder") {
    forming.push("Name each member class and agree how board seats and votes are split between them.");
  }
  if (option?.model === "community-benefit") {
    forming.push("Decide whether to include an asset lock, which keeps assets for community benefit if the society closes.");
  }

  const trading = [
    "Open a bank account in the society's name.",
    "Set up a register of members and shares. Societies must keep one.",
    "Register for tax with HMRC, and for VAT if you need to.",
    "Arrange insurance suited to what you do.",
  ];
  if (funding.includes("community-shares")) {
    trading.push(
      "Plan the community share offer: business plan, offer document and timeline. Speak to the Community Shares team at Co-operatives UK early.",
    );
  }

  return [
    {
      stage: "Idea",
      tasks: [
        "Write down the problem the co-op solves and who will use it.",
        "Talk to ten likely members or customers and note what they say.",
        "Sketch the money: what comes in, what goes out, in year one.",
      ],
    },
    { stage: "Forming", tasks: forming },
    {
      stage: "Registered",
      tasks: [
        "Register through Co-operatives UK's registration service, which sends your application to the FCA. It is cheaper and faster on model rules.",
        "Expect identity checks on the founders before the application is submitted.",
        "Check your entry on the FCA Mutuals Public Register once registered.",
      ],
    },
    { stage: "Trading", tasks: trading },
    {
      stage: "Reporting",
      tasks: [
        "File an annual return with accounts to the FCA every year.",
        "Hold an annual general meeting and report to members.",
        "Update your figures on the tracker: members, jobs and support received.",
      ],
    },
  ];
}

export const FOUNDING_AGENDA = [
  "Welcome, and agree who chairs and who takes the minutes.",
  "Purpose: agree the one-paragraph statement of what the co-op is for.",
  "Model and rules: agree the model, and adopt the chosen model rules.",
  "Membership: who can join, the share price, and how to apply.",
  "First board or committee: elect the founding directors.",
  "Registered office: agree the address.",
  "Money: agree the opening budget and who can sign for the bank account.",
  "Registration: agree who applies through Co-operatives UK.",
  "Next steps: owners and dates for each action.",
];

export const ADVISER_QUESTIONS = [
  "Is our chosen model right for what we want to do?",
  "Which model rules should we use, and what can we change?",
  "What support is available locally, including any co-op development programme?",
  "Should we raise money through community shares, and when?",
  "What do we need to have ready before we register?",
];
